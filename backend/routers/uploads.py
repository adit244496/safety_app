import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from typing import List, Optional
from sqlalchemy.orm import Session
from database import get_db
import models
from auth import get_current_user
from datetime import datetime

router = APIRouter(prefix="/api", tags=["uploads"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif"}


@router.post("/observations/{obs_id}/images", status_code=201)
async def upload_images(
    obs_id: int,
    files: List[UploadFile] = File(...),
    image_type: Optional[str] = Form("initial"),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    obs = db.query(models.Observation).filter(models.Observation.id == obs_id).first()
    if not obs:
        raise HTTPException(404, "Observation not found")

    saved = []
    for f in files:
        ext = os.path.splitext(f.filename or "")[1].lower()
        if ext not in ALLOWED_EXTS:
            continue
        fname = f"{uuid.uuid4().hex}{ext}"
        fpath = os.path.join(UPLOAD_DIR, fname)
        content = await f.read()
        with open(fpath, "wb") as fp:
            fp.write(content)

        img = models.ObservationImage(
            observation_id=obs_id,
            file_path=fname,
            file_name=f.filename or fname,
            uploaded_by=user.id,
            image_type=image_type or "initial",
        )
        db.add(img)
        db.flush()
        saved.append({"id": img.id, "file_path": fname, "file_name": f.filename, "image_type": image_type})

    obs.updated_at = datetime.now()
    db.commit()
    return saved


@router.delete("/images/{image_id}")
def delete_image(image_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    img = db.query(models.ObservationImage).filter(models.ObservationImage.id == image_id).first()
    if not img:
        raise HTTPException(404)
    if user.role not in ("Admin", "PC") and img.uploaded_by != user.id:
        raise HTTPException(403)
    try:
        os.remove(os.path.join(UPLOAD_DIR, img.file_path))
    except OSError:
        pass
    db.delete(img)
    db.commit()
    return {"success": True}
