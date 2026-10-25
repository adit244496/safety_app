import os
import uuid
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
import models
from auth import get_current_user, require_admin

# Shown as "Library" in the UI; the API path and table keep the original "guidelines" name.
router = APIRouter(prefix="/api/guidelines", tags=["guidelines"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTS = {".pdf"}
MAX_BYTES = 25 * 1024 * 1024   # 25 MB


def _to_dict(g: models.Guideline) -> dict:
    is_link = bool(g.link_url)
    return {
        "id": g.id,
        "title": g.title,
        "description": g.description,
        "category": g.category,
        "kind": "link" if is_link else "file",
        "file_path": g.file_path or None,
        "file_name": g.file_name or None,
        "link_url": g.link_url,
        "url": g.link_url if is_link else f"/uploads/{g.file_path}",
        "uploaded_by": g.uploaded_by,
        "uploaded_by_name": g.uploader.name if g.uploader else None,
        "created_at": g.created_at.isoformat() if g.created_at else None,
    }


def _clean_link(raw: str) -> str:
    link = raw.strip()
    if not urlparse(link).scheme:
        link = "https://" + link   # allow "www.example.com"
    parsed = urlparse(link)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or "." not in parsed.netloc:
        raise HTTPException(400, "Enter a valid web link (http:// or https://)")
    return link


@router.get("/")
def list_guidelines(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    """All authenticated users can view library items."""
    rows = db.query(models.Guideline).order_by(models.Guideline.created_at.desc()).all()
    return [_to_dict(g) for g in rows]


@router.post("/", status_code=201)
async def upload_guideline(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    link_url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """Add a library item: either a PDF `file` or a web `link_url`."""
    if not title or not title.strip():
        raise HTTPException(400, "Title is required")
    has_file = file is not None and bool(file.filename)
    has_link = bool(link_url and link_url.strip())
    if has_file == has_link:
        raise HTTPException(400, "Provide either a PDF file or a link")

    if has_link:
        fname, original, link = "", "", _clean_link(link_url)
    else:
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ALLOWED_EXTS:
            raise HTTPException(400, "Only PDF files are allowed")
        content = await file.read()
        if len(content) > MAX_BYTES:
            raise HTTPException(400, "File too large (max 25 MB)")
        fname = f"guideline_{uuid.uuid4().hex}{ext}"
        with open(os.path.join(UPLOAD_DIR, fname), "wb") as fp:
            fp.write(content)
        original, link = file.filename or fname, None

    g = models.Guideline(
        title=title.strip(),
        description=(description or "").strip() or None,
        category=(category or "").strip() or None,
        file_path=fname,
        file_name=original,
        link_url=link,
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
        raise HTTPException(404, "Library item not found")
    if g.file_path:
        try:
            os.remove(os.path.join(UPLOAD_DIR, g.file_path))
        except OSError:
            pass
    db.delete(g)
    db.commit()
    return {"success": True}
