import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
import models
from auth import get_current_user, require_admin

router = APIRouter(prefix="/api/guidelines", tags=["guidelines"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTS = {".pdf"}
MAX_BYTES = 25 * 1024 * 1024   # 25 MB


def _to_dict(g: models.Guideline) -> dict:
    return {
        "id": g.id,
        "title": g.title,
        "description": g.description,
        "category": g.category,
        "file_path": g.file_path,
        "file_name": g.file_name,
        "url": f"/uploads/{g.file_path}",
        "uploaded_by": g.uploaded_by,
        "uploaded_by_name": g.uploader.name if g.uploader else None,
        "created_at": g.created_at.isoformat() if g.created_at else None,
    }


@router.get("/")
def list_guidelines(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    """All authenticated users can view guidelines."""
    rows = db.query(models.Guideline).order_by(models.Guideline.created_at.desc()).all()
    return [_to_dict(g) for g in rows]


@router.post("/", status_code=201)
async def upload_guideline(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    if not title or not title.strip():
        raise HTTPException(400, "Title is required")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, "Only PDF files are allowed")
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(400, "File too large (max 25 MB)")

    fname = f"guideline_{uuid.uuid4().hex}{ext}"
    with open(os.path.join(UPLOAD_DIR, fname), "wb") as fp:
        fp.write(content)

    g = models.Guideline(
        title=title.strip(),
        description=(description or "").strip() or None,
        category=(category or "").strip() or None,
        file_path=fname,
        file_name=file.filename or fname,
        uploaded_by=user.id,
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return _to_dict(g)


@router.delete("/{guideline_id}")
def delete_guideline(guideline_id: int, db: Session = Depends(get_db), _user: models.User = Depends(require_admin)):
    g = db.query(models.Guideline).filter(models.Guideline.id == guideline_id).first()
    if not g:
        raise HTTPException(404, "Guideline not found")
    try:
        os.remove(os.path.join(UPLOAD_DIR, g.file_path))
    except OSError:
        pass
    db.delete(g)
    db.commit()
    return {"success": True}
