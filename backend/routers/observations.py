from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, case
from datetime import datetime
from database import get_db
import models
from auth import get_current_user, require_admin
from email_service import send_observation_email, build_observation_email

router = APIRouter(prefix="/api/observations", tags=["observations"])


def calc_risk(severity: int, probability: int):
    factor = severity * probability
    level = "Low" if factor <= 4 else "Medium" if factor <= 12 else "High"
    return factor, level


def generate_obs_id(db: Session, project_id: int) -> str:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    prefix = "".join(c for c in (project.name if project else "OBS") if c.isalnum()).upper()[:4]
    count = db.query(models.Observation).filter(models.Observation.project_id == project_id).count()
    date_str = datetime.now().strftime("%Y%m%d")
    return f"{prefix}-{date_str}-{str(count + 1).zfill(4)}"


def get_allowed_project_ids(user: models.User) -> Optional[List[int]]:
    if user.role in ("Admin", "PC"):
        return None
    return [up.project_id for up in user.user_projects]


def obs_to_dict(obs: models.Observation, db: Session) -> dict:
    images = db.query(models.ObservationImage).filter(models.ObservationImage.observation_id == obs.id).all()
    comments = db.query(models.ObservationComment).filter(models.ObservationComment.observation_id == obs.id).all()
    return {
        "id": obs.id,
        "observation_id": obs.observation_id,
        "project_id": obs.project_id,
        "project_name": obs.project.name if obs.project else None,
        "building_id": obs.building_id,
        "building_name": obs.building.name if obs.building else None,
        "floor_id": obs.floor_id,
        "floor_name": obs.floor.name if obs.floor else None,
        "exact_location": obs.exact_location,
        "obs_time": obs.obs_time,
        "obs_date": obs.obs_date,
        "contractor_user_id": obs.contractor_user_id,
        "contractor_name": obs.contractor.name if obs.contractor else None,
        "to_be_rectified_by": obs.to_be_rectified_by,
        "observer_name": obs.observer_name,
        "core_concern_id": obs.core_concern_id,
        "core_concern_name": obs.core_concern.name if obs.core_concern else None,
        "specific_concern_id": obs.specific_concern_id,
        "specific_concern_name": obs.specific_concern.name if obs.specific_concern else None,
        "specific_concern_text": obs.specific_concern_text,
        "possible_outcome": obs.possible_outcome,
        "severity": obs.severity,
        "probability": obs.probability,
        "risk_factor": obs.risk_factor,
        "risk_level": obs.risk_level,
        "root_cause_category_id": obs.root_cause_category_id,
        "root_cause_category_name": obs.root_cause_category.name if obs.root_cause_category else None,
        "root_cause_specific_id": obs.root_cause_specific_id,
        "root_cause_specific_name": obs.root_cause_specific.name if obs.root_cause_specific else None,
        "violation_id": obs.violation_id,
        "violation_name": obs.violation.name if obs.violation else None,
        "target_date_id": obs.target_date_id,
        "target_date_name": obs.target_date.name if obs.target_date else None,
        "status": obs.status,
        "created_by": obs.created_by,
        "created_by_name": obs.creator.name if obs.creator else None,
        "created_at": obs.created_at.isoformat() if obs.created_at else None,
        "updated_at": obs.updated_at.isoformat() if obs.updated_at else None,
        "images": [
            {"id": img.id, "file_path": img.file_path, "file_name": img.file_name,
             "image_type": img.image_type,
             "uploaded_by": img.uploaded_by,
             "uploader_name": img.uploader.name if img.uploader else None,
             "uploader_role": img.uploader.role if img.uploader else None,
             "created_at": img.created_at.isoformat() if img.created_at else None}
            for img in images
        ],
        "creator_role": obs.creator.role if obs.creator else None,
        "comments": [
            {"id": c.id, "comment": c.comment, "user_id": c.user_id,
             "user_name": c.user.name if c.user else None,
             "user_role": c.user.role if c.user else None,
             "created_at": c.created_at.isoformat() if c.created_at else None}
            for c in comments
        ],
    }


class ObsCreate(BaseModel):
    project_id: int
    building_id: Optional[int] = None
    floor_id: Optional[int] = None
    exact_location: Optional[str] = None
    obs_time: Optional[str] = None
    obs_date: Optional[str] = None
    contractor_user_id: Optional[int] = None
    to_be_rectified_by: Optional[str] = None
    observer_name: Optional[str] = None
    core_concern_id: Optional[int] = None
    specific_concern_id: Optional[int] = None
    specific_concern_text: Optional[str] = None
    possible_outcome: Optional[str] = None
    severity: Optional[int] = None
    probability: Optional[int] = None
    root_cause_category_id: Optional[int] = None
    root_cause_specific_id: Optional[int] = None
    violation_id: Optional[int] = None
    target_date_id: Optional[int] = None


class ObsUpdate(ObsCreate):
    status: Optional[str] = None


class CommentBody(BaseModel):
    comment: str


@router.get("/stats/summary")
def stats(
    project_id: List[int] = Query(default=[]),
    building_id: Optional[int] = Query(None),
    contractor_user_id: List[int] = Query(default=[]),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    core_concern_id: List[int] = Query(default=[]),
    risk_level: List[str] = Query(default=[]),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    allowed = get_allowed_project_ids(user)

    def apply_filters(q):
        if allowed is not None:
            q = q.filter(models.Observation.project_id.in_(allowed))
        if project_id:
            q = q.filter(models.Observation.project_id.in_(project_id))
        if building_id:
            q = q.filter(models.Observation.building_id == building_id)
        if contractor_user_id:
            q = q.filter(models.Observation.contractor_user_id.in_(contractor_user_id))
        if date_from:
            q = q.filter(models.Observation.obs_date >= date_from)
        if date_to:
            q = q.filter(models.Observation.obs_date <= date_to)
        if core_concern_id:
            q = q.filter(models.Observation.core_concern_id.in_(core_concern_id))
        if risk_level:
            q = q.filter(models.Observation.risk_level.in_(risk_level))
        return q

    q = apply_filters(db.query(models.Observation))
    total = q.count()

    by_status = apply_filters(
        db.query(models.Observation.status, func.count().label("count"))
    ).group_by(models.Observation.status).all()

    by_risk = apply_filters(
        db.query(models.Observation.risk_level, func.count().label("count"))
    ).group_by(models.Observation.risk_level).all()

    recent = q.order_by(models.Observation.created_at.desc()).limit(4).all()

    # Monthly trend — use obs_date (YYYY-MM-DD string); substr gives YYYY-MM reliably
    month_expr = func.substr(models.Observation.obs_date, 1, 7)
    by_month = (
        apply_filters(db.query(month_expr.label("month"), func.count().label("count")))
        .filter(models.Observation.obs_date.isnot(None))
        .filter(models.Observation.obs_date != "")
        .group_by(month_expr)
        .order_by(month_expr)
        .all()
    )

    # Monthly trend broken down by status
    by_month_status_rows = (
        apply_filters(
            db.query(
                month_expr.label("month"),
                models.Observation.status,
                func.count().label("count"),
            )
        )
        .filter(models.Observation.obs_date.isnot(None))
        .filter(models.Observation.obs_date != "")
        .group_by(month_expr, models.Observation.status)
        .order_by(month_expr)
        .all()
    )
    # Pivot into { month, Open, Pending, Under Review, Closed }
    month_status_map: dict = {}
    for m, s, c in by_month_status_rows:
        if not m:
            continue
        if m not in month_status_map:
            month_status_map[m] = {"month": m, "Open": 0, "Pending": 0, "Under Review": 0, "Closed": 0}
        if s in month_status_map[m]:
            month_status_map[m][s] = c
    by_month_status = sorted(month_status_map.values(), key=lambda x: x["month"])

    return {
        "total": total,
        "byStatus": [{"status": s, "count": c} for s, c in by_status],
        "byRisk": [{"risk_level": r, "count": c} for r, c in by_risk if r],
        "byMonth": [{"month": m, "count": c} for m, c in by_month if m],
        "byMonthStatus": by_month_status,
        "recent": [
            {
                "observation_id": o.observation_id,
                "status": o.status,
                "risk_level": o.risk_level,
                "obs_date": o.obs_date,
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "project_name": o.project.name if o.project else None,
                "core_concern_name": o.core_concern.name if o.core_concern else None,
            }
            for o in recent
        ],
    }


def to_fy_quarter(year_str, month_str) -> str:
    if not year_str or not month_str:
        return ""
    year = int(year_str)
    month = int(month_str)
    if month >= 4:
        fy_start = year
        if month <= 6:
            q = "Q-1"
        elif month <= 9:
            q = "Q-2"
        else:
            q = "Q-3"
    else:
        fy_start = year - 1
        q = "Q-4"
    fy_end = fy_start + 1
    return f"{q} ({str(fy_start)[-2:]}-{str(fy_end)[-2:]})"


@router.get("/stats/summary-details")
def stats_details(
    project_id: List[int] = Query(default=[]),
    building_id: Optional[int] = Query(None),
    contractor_user_id: List[int] = Query(default=[]),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    allowed = get_allowed_project_ids(user)
    conditions = []
    if allowed is not None:
        conditions.append(models.Observation.project_id.in_(allowed))
    if project_id:
        conditions.append(models.Observation.project_id.in_(project_id))
    if building_id:
        conditions.append(models.Observation.building_id == building_id)
    if contractor_user_id:
        conditions.append(models.Observation.contractor_user_id.in_(contractor_user_id))
    if date_from:
        conditions.append(models.Observation.obs_date >= date_from)
    if date_to:
        conditions.append(models.Observation.obs_date <= date_to)

    project_summary_rows = db.query(
        models.Project.id.label("project_id"),
        models.Project.name.label("project_name"),
        func.count().label("total"),
        func.sum(case((models.Observation.status == "Closed", 1), else_=0)).label("closed"),
        func.sum(case((models.Observation.risk_level == "High", 1), else_=0)).label("high_risk"),
        func.sum(case((models.Observation.risk_level == "Medium", 1), else_=0)).label("medium_risk"),
        func.sum(case((models.Observation.risk_level == "Low", 1), else_=0)).label("low_risk"),
    ).join(models.Project, models.Observation.project_id == models.Project.id)
    if conditions:
        project_summary_rows = project_summary_rows.filter(*conditions)
    project_summary_rows = project_summary_rows.group_by(models.Project.id, models.Project.name).order_by(func.count().desc()).all()

    ContractorUser = models.User
    contractor_summary_rows = db.query(
        models.Observation.contractor_user_id.label("contractor_id"),
        ContractorUser.name.label("contractor_name"),
        func.count().label("total"),
        func.sum(case((models.Observation.status == "Closed", 1), else_=0)).label("closed"),
        func.sum(case((models.Observation.risk_level == "High", 1), else_=0)).label("high_risk"),
        func.sum(case((models.Observation.risk_level == "Medium", 1), else_=0)).label("medium_risk"),
        func.sum(case((models.Observation.risk_level == "Low", 1), else_=0)).label("low_risk"),
    ).join(ContractorUser, models.Observation.contractor_user_id == ContractorUser.id
    ).filter(models.Observation.contractor_user_id != None)
    if conditions:
        contractor_summary_rows = contractor_summary_rows.filter(*conditions)
    contractor_summary_rows = contractor_summary_rows.group_by(
        models.Observation.contractor_user_id,
        ContractorUser.name,
    ).order_by(func.count().desc()).all()

    from collections import defaultdict

    category_month_rows = db.query(
        models.CoreConcern.name.label("category"),
        func.strftime("%Y", models.Observation.obs_date).label("year"),
        func.strftime("%m", models.Observation.obs_date).label("month"),
        func.sum(case((models.Observation.risk_level == "Low", 1), else_=0)).label("low"),
        func.sum(case((models.Observation.risk_level == "Medium", 1), else_=0)).label("medium"),
        func.sum(case((models.Observation.risk_level == "High", 1), else_=0)).label("high"),
        func.count().label("total"),
    ).join(models.CoreConcern, models.Observation.core_concern_id == models.CoreConcern.id)
    if conditions:
        category_month_rows = category_month_rows.filter(*conditions)
    category_month_rows = category_month_rows.group_by(
        models.CoreConcern.name,
        func.strftime("%Y", models.Observation.obs_date),
        func.strftime("%m", models.Observation.obs_date),
    ).order_by(
        func.strftime("%Y", models.Observation.obs_date),
        func.strftime("%m", models.Observation.obs_date),
        models.CoreConcern.name,
    ).all()

    # Aggregate by Indian FY quarter
    agg: dict = defaultdict(lambda: {"low": 0, "medium": 0, "high": 0, "total": 0})
    for row in category_month_rows:
        key = (row.category, to_fy_quarter(row.year, row.month))
        agg[key]["low"] += row.low or 0
        agg[key]["medium"] += row.medium or 0
        agg[key]["high"] += row.high or 0
        agg[key]["total"] += row.total or 0

    category_scores = [
        {
            "category": cat,
            "quarter": quarter,
            "low": d["low"],
            "medium": d["medium"],
            "high": d["high"],
            "total": d["total"],
            "score": round(((d["low"] + d["medium"]) / d["total"]) * 100) if d["total"] else 0,
        }
        for (cat, quarter), d in agg.items()
    ]

    observer_rows = db.query(
        func.coalesce(models.Observation.observer_name, models.User.name).label("observer_name"),
        func.count().label("count"),
    ).join(models.User, models.Observation.created_by == models.User.id)
    if conditions:
        observer_rows = observer_rows.filter(*conditions)
    observer_rows = observer_rows.group_by("observer_name").order_by(func.count().desc()).limit(10).all()

    def build_summary(rows, label_fields):
        return [
            {
                **{field: getattr(row, field) for field in label_fields},
                "total": row.total,
                "closed": row.closed,
                "high_risk": row.high_risk,
                "medium_risk": row.medium_risk,
                "low_risk": row.low_risk,
                "compliance_score": round(((row.low_risk or 0) + (row.medium_risk or 0)) / (row.total or 1) * 100),
            }
            for row in rows
        ]

    return {
        "projectSummary": build_summary(project_summary_rows, ["project_id", "project_name"]),
        "contractorSummary": build_summary(contractor_summary_rows, ["contractor_id", "contractor_name"]),
        "categoryQuarterScores": category_scores,
        "topObservers": [
            {"observer_name": row.observer_name or "Unknown", "count": row.count}
            for row in observer_rows
        ],
        "formula": "score = round((low + medium) / total * 100)",
    }


@router.get("/")
def list_observations(
    project_id: List[int] = Query(default=[]),
    status: List[str] = Query(default=[]),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    allowed = get_allowed_project_ids(user)
    q = db.query(models.Observation)
    if allowed is not None:
        if not allowed:
            return {"observations": [], "total": 0, "pages": 0}
        q = q.filter(models.Observation.project_id.in_(allowed))
    if project_id:
        q = q.filter(models.Observation.project_id.in_(project_id))
    if status:
        q = q.filter(models.Observation.status.in_(status))

    # Drafts are private — only visible to the creator
    q = q.filter(
        (models.Observation.status != 'Draft') | (models.Observation.created_by == user.id)
    )

    total = q.count()
    obs_list = q.order_by(models.Observation.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "observations": [obs_to_dict(o, db) for o in obs_list],
        "total": total,
        "pages": (total + limit - 1) // limit,
    }


@router.get("/report")
def get_report_data(
    project_id: List[int] = Query(default=[]),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: List[str] = Query(default=[]),
    contractor_user_id: List[int] = Query(default=[]),
    risk_level: List[str] = Query(default=[]),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    allowed = get_allowed_project_ids(user)
    q = db.query(models.Observation)
    if allowed is not None:
        q = q.filter(models.Observation.project_id.in_(allowed))
    if project_id:
        q = q.filter(models.Observation.project_id.in_(project_id))
    if date_from:
        q = q.filter(models.Observation.obs_date >= date_from)
    if date_to:
        q = q.filter(models.Observation.obs_date <= date_to)
    if status:
        q = q.filter(models.Observation.status.in_(status))
    if contractor_user_id:
        q = q.filter(models.Observation.contractor_user_id.in_(contractor_user_id))
    if risk_level:
        q = q.filter(models.Observation.risk_level.in_(risk_level))
    obs_list = (
        q.order_by(models.Observation.obs_date.asc(), models.Observation.observation_id.asc())
        .limit(200)
        .all()
    )
    return [obs_to_dict(o, db) for o in obs_list]


@router.get("/{obs_id}")
def get_observation(obs_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    # obs_id can be numeric id or observation_id string
    if obs_id.isdigit():
        obs = db.query(models.Observation).filter(models.Observation.id == int(obs_id)).first()
    else:
        obs = db.query(models.Observation).filter(models.Observation.observation_id == obs_id).first()
    if not obs:
        raise HTTPException(404, "Observation not found")
    if obs.status == 'Draft' and obs.created_by != user.id:
        raise HTTPException(404, "Observation not found")
    return obs_to_dict(obs, db)


@router.post("/", status_code=201)
def create_observation(body: ObsCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    factor, level = calc_risk(body.severity or 1, body.probability or 1)
    obs_id = generate_obs_id(db, body.project_id)

    obs = models.Observation(
        observation_id=obs_id,
        project_id=body.project_id,
        building_id=body.building_id,
        floor_id=body.floor_id,
        exact_location=body.exact_location,
        obs_time=body.obs_time,
        obs_date=body.obs_date,
        contractor_user_id=body.contractor_user_id,
        to_be_rectified_by=body.to_be_rectified_by,
        observer_name=body.observer_name,
        core_concern_id=body.core_concern_id,
        specific_concern_id=body.specific_concern_id,
        specific_concern_text=body.specific_concern_text,
        possible_outcome=body.possible_outcome,
        severity=body.severity,
        probability=body.probability,
        risk_factor=factor,
        risk_level=level,
        root_cause_category_id=body.root_cause_category_id,
        root_cause_specific_id=body.root_cause_specific_id,
        violation_id=body.violation_id,
        target_date_id=body.target_date_id,
        status="Open",
        created_by=user.id,
    )
    db.add(obs)
    db.commit()
    db.refresh(obs)

    # In-app notification to assigned contractor
    if body.contractor_user_id:
        project_name = obs.project.name if obs.project else ""
        notif = models.Notification(
            user_id=body.contractor_user_id,
            observation_id=obs.id,
            obs_ref=obs.observation_id,
            message=f"New observation {obs.observation_id} assigned to you on project '{project_name}'.",
            is_read=False,
        )
        db.add(notif)
        db.commit()

    # Email notification
    _send_obs_email(obs, db)

    return {"id": obs.id, "observation_id": obs.observation_id, "risk_factor": factor, "risk_level": level}


def _send_obs_email(obs: models.Observation, db: Session):
    smtp = db.query(models.SmtpSettings).first()
    if not smtp or not smtp.enabled:
        return

    # TO: contractor
    to_emails: List[str] = []
    if obs.contractor:
        to_emails.append(obs.contractor.email)

    # CC: all HO users on this project + all Admin users
    cc_emails: List[str] = []
    ho_users = (
        db.query(models.User)
        .join(models.UserProject, models.UserProject.user_id == models.User.id)
        .filter(models.UserProject.project_id == obs.project_id, models.User.role == "HO")
        .all()
    )
    admin_users = db.query(models.User).filter(models.User.role == "Admin").all()
    for u in ho_users + admin_users:
        if u.email and u.email not in cc_emails and u.email not in to_emails:
            cc_emails.append(u.email)

    if not to_emails and not cc_emails:
        return

    obs_data = {
        "observation_id": obs.observation_id,
        "project_name": obs.project.name if obs.project else "",
        "obs_date": obs.obs_date or "",
        "building_name": obs.building.name if obs.building else "",
        "floor_name": obs.floor.name if obs.floor else "",
        "exact_location": obs.exact_location or "",
        "observer_name": obs.observer_name or "",
        "contractor_name": obs.contractor.name if obs.contractor else "",
        "core_concern_name": obs.core_concern.name if obs.core_concern else "",
        "specific_concern_name": obs.specific_concern.name if obs.specific_concern else "",
        "specific_concern_text": obs.specific_concern_text or "",
        "risk_level": obs.risk_level or "",
        "target_date_name": obs.target_date.name if obs.target_date else "",
        "status": obs.status,
    }
    subject, html = build_observation_email(obs_data)
    send_observation_email(smtp, to_emails, cc_emails, subject, html)


@router.put("/{obs_id}")
def update_observation(obs_id: int, body: ObsUpdate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    obs = db.query(models.Observation).filter(models.Observation.id == obs_id).first()
    if not obs:
        raise HTTPException(404, "Observation not found")

    factor, level = calc_risk(body.severity or obs.severity or 1, body.probability or obs.probability or 1)

    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(obs, field, val)

    obs.risk_factor = factor
    obs.risk_level = level
    obs.updated_at = datetime.now()
    db.commit()
    return {"success": True, "risk_factor": factor, "risk_level": level}


class StatusBody(BaseModel):
    status: str


@router.patch("/{obs_id}/status")
def update_status(obs_id: int, body: StatusBody, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    obs = db.query(models.Observation).filter(models.Observation.id == obs_id).first()
    if not obs:
        raise HTTPException(404, "Observation not found")
    obs.status = body.status
    obs.updated_at = datetime.now()
    db.commit()
    return {"success": True, "status": body.status}


@router.post("/{obs_id}/comments", status_code=201)
def add_comment(obs_id: int, body: CommentBody, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    obs = db.query(models.Observation).filter(models.Observation.id == obs_id).first()
    if not obs:
        raise HTTPException(404)
    c = models.ObservationComment(observation_id=obs_id, user_id=user.id, comment=body.comment)
    db.add(c)
    obs.updated_at = datetime.now()
    db.commit()
    db.refresh(c)
    return {"id": c.id}


@router.delete("/{obs_id}")
def delete_observation(obs_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    obs = db.query(models.Observation).filter(models.Observation.id == obs_id).first()
    if not obs:
        raise HTTPException(404)
    db.delete(obs)
    db.commit()
    return {"success": True}
