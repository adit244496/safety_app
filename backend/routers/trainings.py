from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
import json
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import func, nullslast
from datetime import datetime
from database import get_db
import models
from auth import get_current_user
from routers.observations import get_allowed_project_ids

router = APIRouter(prefix="/api/trainings", tags=["trainings"])

# Roles allowed to create / edit trainings
WRITE_ROLES = ["SuperAdmin", "Admin", "HO", "PSO", "Observer"]

TRAINING_TYPES = ["Technical", "Refresher", "Post-Incident", "Corrective"]
ASSESSMENT_METHODS = ["Written Quiz", "Practical", "Verbal Review", "Attendance Only"]
PARTICIPANT_CATEGORIES = ["Employee", "Contractor"]
ASSESSMENT_STATUSES = ["Pending", "Passed", "Failed", "NA"]


class Participant(BaseModel):
    user_id: Optional[int] = None
    name: str
    role: Optional[str] = None
    category: Optional[str] = None            # Employee / Contractor
    assessment_status: Optional[str] = None   # Pending / Passed / Failed / NA
    department: Optional[str] = None
    score: Optional[str] = None
    remarks: Optional[str] = None


class TrainingCreate(BaseModel):
    training_topic: str
    training_date: Optional[str] = None
    time_from: Optional[str] = None
    time_to: Optional[str] = None
    trainer_user_id: Optional[int] = None
    trainer_name: Optional[str] = None
    trainer_title: Optional[str] = None
    project_id: Optional[int] = None
    project_ids: Optional[List[int]] = None
    department: Optional[str] = None
    training_type: Optional[str] = None
    training_content: Optional[str] = None
    assessment_method: Optional[str] = None
    assessment_applicable: Optional[bool] = False
    participant_category: Optional[str] = None
    participants: Optional[List[Participant]] = None


class TrainingUpdate(TrainingCreate):
    training_topic: Optional[str] = None   # allow partial updates


class AssessmentUpdate(BaseModel):
    user_ids: List[int]
    status: str


def _parse_participants(raw: Optional[str]) -> list:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except (ValueError, TypeError):
        return []


def _duration_minutes(time_from: Optional[str], time_to: Optional[str]) -> Optional[int]:
    if not time_from or not time_to:
        return None
    try:
        fh, fm = [int(x) for x in time_from.split(":")[:2]]
        th, tm = [int(x) for x in time_to.split(":")[:2]]
        mins = (th * 60 + tm) - (fh * 60 + fm)
        return mins if mins > 0 else None
    except (ValueError, AttributeError):
        return None


def _project_names(db: Session, ids: list) -> list:
    if not ids:
        return []
    rows = db.query(models.Project).filter(models.Project.id.in_(ids)).all()
    name_map = {p.id: p.name for p in rows}
    return [name_map[i] for i in ids if i in name_map]


def training_to_dict(t: models.Training, db: Optional[Session] = None) -> dict:
    participants = _parse_participants(t.participants)
    passed = sum(1 for p in participants if str(p.get("assessment_status", "")).strip().lower() == "passed")
    failed = sum(1 for p in participants if str(p.get("assessment_status", "")).strip().lower() == "failed")
    pending = sum(1 for p in participants if str(p.get("assessment_status", "")).strip().lower() == "pending")

    project_ids = []
    if t.project_ids:
        try:
            project_ids = json.loads(t.project_ids) or []
        except (ValueError, TypeError):
            project_ids = []
    if not project_ids and t.project_id:
        project_ids = [t.project_id]
    project_names = _project_names(db, project_ids) if db is not None else (
        [t.project.name] if t.project else []
    )

    return {
        "id": t.id,
        "training_topic": t.training_topic,
        "training_date": t.training_date,
        "time_from": t.time_from,
        "time_to": t.time_to,
        "duration_minutes": _duration_minutes(t.time_from, t.time_to),
        "trainer_user_id": t.trainer_user_id,
        "trainer_name": (t.trainer.name if t.trainer else None) or t.trainer_name,
        "trainer_title": t.trainer_title,
        "trainer_external": bool(t.trainer_name and not t.trainer_user_id),
        "project_id": t.project_id,
        "project_ids": project_ids,
        "project_name": project_names[0] if project_names else None,
        "project_names": project_names,
        "department": t.department,
        "training_type": t.training_type,
        "training_content": t.training_content,
        "assessment_method": t.assessment_method,
        "assessment_applicable": bool(t.assessment_applicable),
        "participant_category": t.participant_category,
        "participants": participants,
        "participant_count": t.participant_count or len(participants),
        "passed_count": passed,
        "failed_count": failed,
        "pending_count": pending,
        "created_by": t.created_by,
        "created_by_name": t.creator.name if t.creator else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _scoped_query(db: Session, user: models.User):
    """Base query scoped to the user's accessible projects.
    Trainings without a project (project_id is NULL) are visible to everyone."""
    q = db.query(models.Training)
    allowed = get_allowed_project_ids(user)
    if allowed is not None:
        q = q.filter(
            (models.Training.project_id.in_(allowed)) | (models.Training.project_id.is_(None))
        )
    return q


@router.get("/trainers")
def list_trainers(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    """All users, for the trainer dropdown on the training form."""
    users = db.query(models.User).order_by(models.User.name).all()
    return [{"id": u.id, "name": u.name, "role": u.role} for u in users]


@router.get("/options")
def training_options(_user: models.User = Depends(get_current_user)):
    return {
        "training_types": TRAINING_TYPES,
        "assessment_methods": ASSESSMENT_METHODS,
        "participant_categories": PARTICIPANT_CATEGORIES,
    }


@router.get("/departments")
def list_departments(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Distinct, non-empty departments (scoped to the user's accessible trainings)."""
    rows = (
        _scoped_query(db, user)
        .filter(models.Training.department.isnot(None))
        .filter(models.Training.department != "")
        .with_entities(models.Training.department)
        .distinct()
        .all()
    )
    return sorted({r[0].strip() for r in rows if r[0] and r[0].strip()})


@router.get("/stats")
def training_stats(
    project_id: List[int] = Query(default=[]),
    training_type: List[str] = Query(default=[]),
    department: List[str] = Query(default=[]),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    q = _scoped_query(db, user)
    if project_id:
        q = q.filter(models.Training.project_id.in_(project_id))
    if training_type:
        q = q.filter(models.Training.training_type.in_(training_type))
    if department:
        q = q.filter(models.Training.department.in_(department))
    if date_from:
        q = q.filter(models.Training.training_date >= date_from)
    if date_to:
        q = q.filter(models.Training.training_date <= date_to)

    trainings = q.all()

    total_sessions = len(trainings)
    total_participants = 0
    total_minutes = 0
    total_passed = 0
    total_assessed = 0
    assessment_sessions = 0
    status_counts: dict = {"Passed": 0, "Failed": 0, "Pending": 0, "NA": 0}
    by_type: dict = defaultdict(int)
    by_project: dict = defaultdict(int)
    by_category: dict = defaultdict(int)
    by_method: dict = defaultdict(int)
    by_month: dict = defaultdict(lambda: {"sessions": 0, "participants": 0})

    for t in trainings:
        parts = _parse_participants(t.participants)
        pc = t.participant_count or len(parts)
        total_participants += pc
        mins = _duration_minutes(t.time_from, t.time_to)
        if mins:
            total_minutes += mins
        if t.assessment_applicable:
            assessment_sessions += 1
        for p in parts:
            st = str(p.get("assessment_status", "")).strip()
            if st in status_counts:
                status_counts[st] += 1
            elif st == "":
                status_counts["NA"] += 1
            res = st.lower()
            if res in ("passed", "failed"):
                total_assessed += 1
                if res == "passed":
                    total_passed += 1
            cat = p.get("category")
            if cat:
                by_category[cat] += 1
        if t.training_type:
            by_type[t.training_type] += 1
        pname = t.project.name if t.project else "Unassigned"
        by_project[pname] += 1
        if t.assessment_method:
            by_method[t.assessment_method] += 1
        if t.training_date and len(t.training_date) >= 7:
            m = t.training_date[:7]
            by_month[m]["sessions"] += 1
            by_month[m]["participants"] += pc

    return {
        "totalSessions": total_sessions,
        "totalParticipants": total_participants,
        "totalHours": round(total_minutes / 60, 1),
        "passRate": round(total_passed / total_assessed * 100) if total_assessed else None,
        "assessmentSessions": assessment_sessions,
        "assessedCount": total_assessed,
        "assessmentStatus": status_counts,
        "byType": [{"name": k, "count": v} for k, v in sorted(by_type.items(), key=lambda x: -x[1])],
        "byProject": [{"name": k, "count": v} for k, v in sorted(by_project.items(), key=lambda x: -x[1])],
        "byCategory": [{"name": k, "count": v} for k, v in by_category.items()],
        "byMethod": [{"name": k, "count": v} for k, v in sorted(by_method.items(), key=lambda x: -x[1])],
        "byMonth": [
            {"month": k, "sessions": v["sessions"], "participants": v["participants"]}
            for k, v in sorted(by_month.items())
        ],
    }


@router.get("/")
def list_trainings(
    project_id: List[int] = Query(default=[]),
    training_type: List[str] = Query(default=[]),
    participant_category: List[str] = Query(default=[]),
    department: List[str] = Query(default=[]),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=10000),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    q = _scoped_query(db, user)
    if project_id:
        q = q.filter(models.Training.project_id.in_(project_id))
    if training_type:
        q = q.filter(models.Training.training_type.in_(training_type))
    if participant_category:
        q = q.filter(models.Training.participant_category.in_(participant_category))
    if department:
        q = q.filter(models.Training.department.in_(department))
    if date_from:
        q = q.filter(models.Training.training_date >= date_from)
    if date_to:
        q = q.filter(models.Training.training_date <= date_to)
    if search:
        like = f"%{search}%"
        q = q.filter(
            (models.Training.training_topic.ilike(like))
            | (models.Training.trainer_name.ilike(like))
            | (models.Training.department.ilike(like))
        )

    total = q.count()
    rows = (
        q.order_by(nullslast(models.Training.training_date.desc()), models.Training.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return {
        "trainings": [training_to_dict(t, db) for t in rows],
        "total": total,
        "pages": (total + limit - 1) // limit,
    }


@router.get("/participants")
def list_participants(
    project_id: List[int] = Query(default=[]),
    category: Optional[str] = Query(None),   # Employee / Contractor
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    """Users available as training participants, scoped to the selected project(s).
    category='Contractor' → contractor users; category='Employee' → all non-contractor users."""
    q = db.query(models.User)
    if category == "Contractor":
        q = q.filter(models.User.role == "Contractor")
    elif category == "Employee":
        q = q.filter(models.User.role != "Contractor")
    if project_id:
        assigned = (
            db.query(models.UserProject.user_id)
            .filter(models.UserProject.project_id.in_(project_id))
            .distinct()
        )
        q = q.filter(models.User.id.in_(assigned))
    if search:
        q = q.filter(models.User.name.ilike(f"%{search}%"))
    return [
        {"id": u.id, "name": u.name, "role": u.role, "email": u.email, "mobile": u.mobile}
        for u in q.order_by(models.User.name).all()
    ]


@router.get("/{training_id}")
def get_training(training_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    t = db.query(models.Training).filter(models.Training.id == training_id).first()
    if not t:
        raise HTTPException(404, "Training not found")
    allowed = get_allowed_project_ids(user)
    if allowed is not None and t.project_id is not None and t.project_id not in allowed:
        raise HTTPException(403, "Access denied to this training")
    return training_to_dict(t, db)


def _prepare_participants(body_participants, assessment_applicable: bool) -> list:
    """Normalise participant dicts and default the assessment status."""
    parts = []
    for p in (body_participants or []):
        d = p.model_dump()
        status = (d.get("assessment_status") or "").strip()
        if not status:
            status = "Pending" if assessment_applicable else "NA"
        d["assessment_status"] = status
        parts.append(d)
    return parts


@router.post("/", status_code=201)
def create_training(body: TrainingCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    if user.role not in WRITE_ROLES:
        raise HTTPException(403, "Your role cannot create trainings")
    if not body.training_topic or not body.training_topic.strip():
        raise HTTPException(400, "Training topic is required")

    project_ids = body.project_ids or ([body.project_id] if body.project_id else [])
    primary_pid = project_ids[0] if project_ids else None
    parts = _prepare_participants(body.participants, bool(body.assessment_applicable))

    t = models.Training(
        training_topic=body.training_topic.strip(),
        training_date=body.training_date,
        time_from=body.time_from,
        time_to=body.time_to,
        trainer_user_id=body.trainer_user_id,
        trainer_name=body.trainer_name,
        trainer_title=body.trainer_title,
        project_id=primary_pid,
        project_ids=json.dumps(project_ids) if project_ids else None,
        department=body.department,
        training_type=body.training_type,
        training_content=body.training_content,
        assessment_method=body.assessment_method,
        assessment_applicable=bool(body.assessment_applicable),
        participant_category=body.participant_category,
        participants=json.dumps(parts) if parts else None,
        participant_count=len(parts),
        created_by=user.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return training_to_dict(t, db)


@router.put("/{training_id}")
def update_training(training_id: int, body: TrainingUpdate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    t = db.query(models.Training).filter(models.Training.id == training_id).first()
    if not t:
        raise HTTPException(404, "Training not found")
    if user.role not in WRITE_ROLES:
        raise HTTPException(403, "Your role cannot edit trainings")
    allowed = get_allowed_project_ids(user)
    if allowed is not None and t.project_id is not None and t.project_id not in allowed:
        raise HTTPException(403, "Access denied to this training")

    data = body.model_dump(exclude_unset=True)

    # Projects: keep project_id (primary) and project_ids (JSON) in sync
    if "project_ids" in data or "project_id" in data:
        pids = data.pop("project_ids", None)
        single = data.pop("project_id", None)
        if pids is None and single is not None:
            pids = [single] if single else []
        pids = pids or []
        t.project_ids = json.dumps(pids) if pids else None
        t.project_id = pids[0] if pids else None

    if "participants" in data:
        applicable = data.get("assessment_applicable", t.assessment_applicable)
        parts = _prepare_participants(body.participants, bool(applicable))
        t.participants = json.dumps(parts) if parts else None
        t.participant_count = len(parts)
        data.pop("participants")

    if "training_topic" in data and data["training_topic"]:
        data["training_topic"] = data["training_topic"].strip()
    for field, val in data.items():
        setattr(t, field, val)
    t.updated_at = datetime.now()
    db.commit()
    db.refresh(t)
    return training_to_dict(t, db)


@router.patch("/{training_id}/assessments")
def update_assessments(training_id: int, body: AssessmentUpdate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Bulk-update the assessment status for a set of participants in a training."""
    if body.status not in ASSESSMENT_STATUSES:
        raise HTTPException(400, f"Invalid status. Allowed: {', '.join(ASSESSMENT_STATUSES)}")
    t = db.query(models.Training).filter(models.Training.id == training_id).first()
    if not t:
        raise HTTPException(404, "Training not found")
    if user.role not in WRITE_ROLES:
        raise HTTPException(403, "Your role cannot update assessments")
    allowed = get_allowed_project_ids(user)
    if allowed is not None and t.project_id is not None and t.project_id not in allowed:
        raise HTTPException(403, "Access denied to this training")

    parts = _parse_participants(t.participants)
    id_set = set(body.user_ids)
    changed = 0
    for p in parts:
        if p.get("user_id") in id_set:
            p["assessment_status"] = body.status
            changed += 1
    t.participants = json.dumps(parts)
    t.updated_at = datetime.now()
    db.commit()
    db.refresh(t)
    result = training_to_dict(t, db)
    result["updated_count"] = changed
    return result


@router.delete("/{training_id}")
def delete_training(training_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    t = db.query(models.Training).filter(models.Training.id == training_id).first()
    if not t:
        raise HTTPException(404, "Training not found")
    is_super_admin = user.role == "SuperAdmin"
    is_owner_writer = t.created_by == user.id and user.role in WRITE_ROLES
    if not (is_super_admin or is_owner_writer):
        raise HTTPException(403, "Only a SuperAdmin or the creator can delete this training")
    db.delete(t)
    db.commit()
    return {"success": True}
