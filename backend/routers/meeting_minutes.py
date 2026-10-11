import os
import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import nullslast

from database import get_db
import models
import ai_service
from auth import get_current_user
from routers.observations import get_allowed_project_ids

router = APIRouter(prefix="/api/meeting-minutes", tags=["meeting-minutes"])

# Roles allowed to create / edit / delete meeting minutes.
# "PSO and CST/admin" — interpreted as PSO plus Admin/SuperAdmin.
WRITE_ROLES = ["SuperAdmin", "Admin", "PSO"]

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
MAX_PDF_BYTES = 25 * 1024 * 1024  # 25 MB


class MinutesCreate(BaseModel):
    title: str
    meeting_date: Optional[str] = None
    project_id: Optional[int] = None
    attendees: Optional[str] = None
    content: Optional[str] = None


class MinutesUpdate(BaseModel):
    title: Optional[str] = None
    meeting_date: Optional[str] = None
    project_id: Optional[int] = None
    attendees: Optional[str] = None
    content: Optional[str] = None


def _assert_can_write(user: models.User):
    if user.role not in WRITE_ROLES:
        raise HTTPException(403, "Only PSO and Admin users can manage meeting minutes")


def _assert_project_access(m: models.MeetingMinutes, user: models.User):
    allowed = get_allowed_project_ids(user)
    if allowed is not None and m.project_id is not None and m.project_id not in allowed:
        raise HTTPException(403, "Access denied to these meeting minutes")


def mom_to_dict(m: models.MeetingMinutes) -> dict:
    return {
        "id": m.id,
        "title": m.title,
        "meeting_date": m.meeting_date,
        "project_id": m.project_id,
        "project_name": m.project.name if m.project else None,
        "attendees": m.attendees,
        "entry_type": m.entry_type,
        "content": m.content,
        "file_path": m.file_path,
        "file_name": m.file_name,
        "ai_summary": m.ai_summary,
        "ai_summary_at": m.ai_summary_at.isoformat() if m.ai_summary_at else None,
        "ai_summary_by": m.ai_summary_by,
        "ai_summary_by_name": m.ai_summary_user.name if m.ai_summary_user else None,
        "created_by": m.created_by,
        "created_by_name": m.creator.name if m.creator else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }


def _extract_pdf_text(abs_path: str) -> str:
    """Extract text from a PDF for summarisation. Returns '' if nothing could be read."""
    try:
        from pypdf import PdfReader
    except ImportError:
        raise HTTPException(500, "PDF support is not installed on the server (pypdf missing).")
    try:
        reader = PdfReader(abs_path)
        parts = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                continue
        return "\n".join(parts).strip()
    except Exception:
        return ""


def _scoped_query(db: Session, user: models.User):
    q = db.query(models.MeetingMinutes)
    allowed = get_allowed_project_ids(user)
    if allowed is not None:
        q = q.filter(
            (models.MeetingMinutes.project_id.in_(allowed))
            | (models.MeetingMinutes.project_id.is_(None))
        )
    return q


@router.get("/")
def list_minutes(
    project_id: List[int] = Query(default=[]),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    q = _scoped_query(db, user)
    if project_id:
        q = q.filter(models.MeetingMinutes.project_id.in_(project_id))
    if search:
        like = f"%{search}%"
        q = q.filter(
            (models.MeetingMinutes.title.ilike(like))
            | (models.MeetingMinutes.attendees.ilike(like))
            | (models.MeetingMinutes.content.ilike(like))
        )
    rows = q.order_by(
        nullslast(models.MeetingMinutes.meeting_date.desc()),
        models.MeetingMinutes.created_at.desc(),
    ).all()
    return {"minutes": [mom_to_dict(m) for m in rows]}


@router.get("/{mom_id}")
def get_minutes(mom_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    m = db.query(models.MeetingMinutes).filter(models.MeetingMinutes.id == mom_id).first()
    if not m:
        raise HTTPException(404, "Meeting minutes not found")
    _assert_project_access(m, user)
    return mom_to_dict(m)


@router.post("/", status_code=201)
def create_text_minutes(body: MinutesCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _assert_can_write(user)
    if not body.title or not body.title.strip():
        raise HTTPException(400, "Title is required")
    if not body.content or not body.content.strip():
        raise HTTPException(400, "Minutes content is required")
    m = models.MeetingMinutes(
        title=body.title.strip(),
        meeting_date=body.meeting_date,
        project_id=body.project_id,
        attendees=body.attendees,
        entry_type="text",
        content=body.content.strip(),
        created_by=user.id,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return mom_to_dict(m)


@router.post("/upload", status_code=201)
async def upload_pdf_minutes(
    title: str = Form(...),
    meeting_date: Optional[str] = Form(None),
    project_id: Optional[int] = Form(None),
    attendees: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _assert_can_write(user)
    if not title or not title.strip():
        raise HTTPException(400, "Title is required")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext != ".pdf":
        raise HTTPException(400, "Only PDF files are allowed")
    content = await file.read()
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(400, "PDF is too large (max 25 MB)")

    fname = f"{uuid.uuid4().hex}.pdf"
    with open(os.path.join(UPLOAD_DIR, fname), "wb") as fp:
        fp.write(content)

    m = models.MeetingMinutes(
        title=title.strip(),
        meeting_date=meeting_date,
        project_id=project_id,
        attendees=attendees,
        entry_type="pdf",
        file_path=fname,
        file_name=file.filename or fname,
        created_by=user.id,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return mom_to_dict(m)


@router.put("/{mom_id}")
def update_minutes(mom_id: int, body: MinutesUpdate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    m = db.query(models.MeetingMinutes).filter(models.MeetingMinutes.id == mom_id).first()
    if not m:
        raise HTTPException(404, "Meeting minutes not found")
    _assert_can_write(user)
    _assert_project_access(m, user)

    data = body.model_dump(exclude_unset=True)
    if "title" in data:
        if not data["title"] or not data["title"].strip():
            raise HTTPException(400, "Title cannot be empty")
        data["title"] = data["title"].strip()
    for field, val in data.items():
        setattr(m, field, val)
    m.updated_at = datetime.now()
    db.commit()
    db.refresh(m)
    return mom_to_dict(m)


@router.post("/{mom_id}/ai-summary")
def generate_ai_summary(mom_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    m = db.query(models.MeetingMinutes).filter(models.MeetingMinutes.id == mom_id).first()
    if not m:
        raise HTTPException(404, "Meeting minutes not found")
    _assert_project_access(m, user)
    if not ai_service.is_configured(db):
        raise HTTPException(503, "AI summary is not configured. Add an Anthropic API key in Admin → AI Summary.")

    # Gather the source text: extracted PDF text, or the typed content.
    if m.entry_type == "pdf" and m.file_path:
        source = _extract_pdf_text(os.path.join(UPLOAD_DIR, m.file_path))
        if not source:
            raise HTTPException(
                422,
                "Could not read any text from this PDF (it may be scanned images). "
                "A text-based PDF is needed for an AI summary.",
            )
    else:
        source = m.content or ""
        if not source.strip():
            raise HTTPException(422, "There is no text to summarise.")

    try:
        summary = ai_service.summarize_minutes(source, db)
    except Exception:
        raise HTTPException(502, "Failed to generate the AI summary. Please try again.")

    m.ai_summary = summary
    m.ai_summary_at = datetime.now()
    m.ai_summary_by = user.id
    db.commit()
    db.refresh(m)
    return {
        "ai_summary": m.ai_summary,
        "ai_summary_at": m.ai_summary_at.isoformat() if m.ai_summary_at else None,
        "ai_summary_by": m.ai_summary_by,
        "ai_summary_by_name": user.name,
    }


@router.delete("/{mom_id}")
def delete_minutes(mom_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    m = db.query(models.MeetingMinutes).filter(models.MeetingMinutes.id == mom_id).first()
    if not m:
        raise HTTPException(404, "Meeting minutes not found")
    is_super_admin = user.role == "SuperAdmin"
    is_owner_writer = m.created_by == user.id and user.role in WRITE_ROLES
    if not (is_super_admin or is_owner_writer or user.role == "Admin"):
        raise HTTPException(403, "Only an Admin, SuperAdmin or the creator can delete these minutes")
    if m.file_path:
        try:
            os.remove(os.path.join(UPLOAD_DIR, m.file_path))
        except OSError:
            pass
    db.delete(m)
    db.commit()
    return {"success": True}
