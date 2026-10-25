from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
import json
import io
import os
import openpyxl
import threading
import logging
import ai_service
from difflib import get_close_matches
from types import SimpleNamespace
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, case, nullslast, and_, or_
from datetime import datetime, date, timedelta
from database import get_db, SessionLocal
import models
from auth import get_current_user, require_admin
from email_service import send_observation_email, build_observation_email

logger = logging.getLogger(__name__)

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
    seq = count + 1
    # Ensure uniqueness — walk forward if the ID is already taken (handles race conditions & deletions)
    while db.query(models.Observation).filter(
        models.Observation.observation_id == f"{prefix}-{date_str}-{str(seq).zfill(4)}"
    ).first() is not None:
        seq += 1
    return f"{prefix}-{date_str}-{str(seq).zfill(4)}"


def _assert_obs_access(obs: models.Observation, user: models.User, write_roles: Optional[List[str]] = None):
    """Raise 403 if user has no access to this observation's project, or lacks required role."""
    allowed = get_allowed_project_ids(user)
    if allowed is not None and obs.project_id not in allowed:
        raise HTTPException(403, "Access denied to this observation")
    if write_roles and user.role not in write_roles:
        raise HTTPException(403, "Your role cannot perform this action")


def get_allowed_project_ids(user: models.User) -> Optional[List[int]]:
    if user.role in ("SuperAdmin", "Admin"):
        return None
    # PIC, EIC, HO, PSO, Observer, Contractor — scoped to assigned projects
    project_ids = [up.project_id for up in user.user_projects]
    if not project_ids:
        return None  # no assignments = full access (admin intent: "all projects")
    return project_ids


# Statuses that are still "open" (not finally closed) — these flip to Overdue past target.
_OPEN_STATUSES = ("Open", "Under Review", "Partially Closed")


def _closed_date_iso(closed_at) -> Optional[str]:
    if not closed_at:
        return None
    return closed_at.date().isoformat() if isinstance(closed_at, datetime) else str(closed_at)[:10]


def effective_status(status: str, target_date_actual: Optional[str], closed_at, today: Optional[str] = None) -> str:
    """Derive the display status:
    - an open observation past its target date (and not closed) → "Overdue";
    - a closed observation that was closed after its target date → "Overdue & Closed".
    A manually-set "Overdue" stays "Overdue". Everything else keeps its stored status."""
    today = today or date.today().isoformat()
    if isinstance(today, date):
        today = today.isoformat()
    if status == "Overdue":
        return "Overdue"
    if status in _OPEN_STATUSES:
        if target_date_actual and not closed_at and target_date_actual < today:
            return "Overdue"
        return status
    if status == "Closed" and target_date_actual:
        cd = _closed_date_iso(closed_at)
        if cd and cd > target_date_actual:
            return "Overdue & Closed"
    return status


def _status_filter_condition(status: List[str]):
    """Translate an effective-status filter (incl. derived Overdue / Overdue & Closed) into SQL."""
    today = date.today().isoformat()
    O = models.Observation
    past_target = and_(O.closed_at.is_(None), O.target_date_actual.isnot(None), O.target_date_actual < today)
    closed_late = and_(O.status == "Closed", O.target_date_actual.isnot(None),
                       func.date(O.closed_at) > O.target_date_actual)
    conds = []
    for s in status:
        if s == "Overdue":
            conds.append(or_(O.status == "Overdue", and_(O.status.in_(_OPEN_STATUSES), past_target)))
        elif s == "Overdue & Closed":
            conds.append(closed_late)
        elif s in _OPEN_STATUSES:
            # Mirror effective_status exactly: an open-status row reads as "Overdue" only
            # when it is past target AND not closed; otherwise it keeps its open status
            # (incl. the edge case of an open status that already has a closure timestamp).
            conds.append(and_(O.status == s, or_(O.target_date_actual.is_(None),
                                                 O.target_date_actual >= today,
                                                 O.closed_at.isnot(None))))
        elif s == "Closed":
            conds.append(and_(O.status == "Closed",
                              or_(O.target_date_actual.is_(None), func.date(O.closed_at) <= O.target_date_actual)))
        else:
            conds.append(O.status == s)
    return or_(*conds)


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
        "contractor_user_ids": json.loads(obs.contractor_user_ids) if obs.contractor_user_ids else [],
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
        "target_date_actual": obs.target_date_actual,
        "eic_user_id": obs.eic_user_id,
        "eic_user_ids": json.loads(obs.eic_user_ids) if obs.eic_user_ids else [],
        "eic_user_name": obs.eic_user.name if obs.eic_user else None,
        "closed_at": obs.closed_at.isoformat() if obs.closed_at else None,
        "ai_summary": obs.ai_summary,
        "ai_summary_at": obs.ai_summary_at.isoformat() if obs.ai_summary_at else None,
        "ai_summary_by": obs.ai_summary_by,
        "ai_summary_by_name": obs.ai_summary_user.name if obs.ai_summary_user else None,
        "status": effective_status(obs.status, obs.target_date_actual, obs.closed_at),
        "stored_status": obs.status,
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
    contractor_user_ids: Optional[List[int]] = None   # all selected contractor user IDs
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
    target_date_actual: Optional[str] = None   # YYYY-MM-DD calendar date
    eic_user_id: Optional[int] = None
    eic_user_ids: Optional[List[int]] = None
    status: Optional[str] = None


class ObsUpdate(ObsCreate):
    status: Optional[str] = None


def _check_target_limit(db: Session, severity, probability, obs_date, target, status) -> None:
    """The target date may be earlier than, but never later than, observation date +
    the days allowed for the risk score (Admin → Risk & Target Date)."""
    if not target or not obs_date or severity is None or probability is None or status == "Positive Approach":
        return
    score = severity * probability
    rule = (
        db.query(models.TargetDayRule)
        .filter(models.TargetDayRule.min_score <= score, models.TargetDayRule.max_score >= score)
        .first()
    )
    if not rule:
        return
    try:
        latest = (date.fromisoformat(obs_date[:10]) + timedelta(days=rule.days)).isoformat()
    except ValueError:
        return
    if target[:10] > latest:
        raise HTTPException(
            400,
            f"Target date can't be later than {latest} — risk score {score} allows at most "
            f"{rule.days} day{'s' if rule.days != 1 else ''} from the observation date.",
        )


class CommentBody(BaseModel):
    comment: str


def _days_aging(target_str: Optional[str], closed_at, today: date) -> Optional[int]:
    """Return days between target date and closure (or today). Positive = overdue."""
    if not target_str:
        return None
    try:
        target = date.fromisoformat(target_str)
    except ValueError:
        return None
    if closed_at:
        end = closed_at.date() if isinstance(closed_at, datetime) else date.fromisoformat(str(closed_at)[:10])
    else:
        end = today
    return (end - target).days


def _aging_bucket(days: Optional[int]) -> str:
    if days is None:
        return "no_target"
    if days <= 0:
        return "on_time"
    if days <= 7:
        return "overdue_1_7"
    if days <= 30:
        return "overdue_8_30"
    return "overdue_30_plus"


def _aging_hit(aging: List[str], days: Optional[int], status: str) -> bool:
    """Ageing filter used by the observations list — supports the dashboard's granular
    buckets, "positive_approach", and the coarse values."""
    for f in aging:
        if f == "positive_approach":
            if status == "Positive Approach":
                return True
            continue
        if status == "Positive Approach":
            continue  # day-based buckets exclude praiseworthy (mirrors the donut)
        if f == "no_target":
            if days is None:
                return True
            continue
        if days is None:
            continue
        if f == "on_time" and days <= 0:
            return True
        if f == "overdue_1_7" and 1 <= days <= 7:
            return True
        if f == "overdue_8_30" and 8 <= days <= 30:
            return True
        if f == "overdue_30_plus" and days > 30:
            return True
        if f == "overdue" and days > 0:
            return True
        if f == "due_soon" and -7 <= days <= 0:
            return True
    return False


def _matches_aging_filter(days: Optional[int], aging_filter: List[str]) -> bool:
    if not aging_filter:
        return True
    for f in aging_filter:
        if f == "no_target" and days is None:
            return True
        if f == "overdue" and days is not None and days > 0:
            return True
        if f == "due_soon" and days is not None and -7 <= days <= 0:
            return True
        if f == "on_time" and days is not None and days <= -7:
            return True
    return False


@router.get("/stats/summary")
def stats(
    project_id: List[int] = Query(default=[]),
    building_id: Optional[int] = Query(None),
    contractor_user_id: List[int] = Query(default=[]),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    core_concern_id: List[int] = Query(default=[]),
    risk_level: List[str] = Query(default=[]),
    status: List[str] = Query(default=[]),
    aging: List[str] = Query(default=[]),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    allowed = get_allowed_project_ids(user)
    today = date.today()

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
        if status:
            q = q.filter(_status_filter_condition(status))
        return q

    # Resolve aging filter → set of eligible observation IDs
    aging_ids: Optional[set] = None
    if aging:
        rows = (
            apply_filters(db.query(models.Observation.id, models.Observation.target_date_actual, models.Observation.closed_at))
            .filter(models.Observation.status != 'Draft')
            .all()
        )
        aging_ids = {r[0] for r in rows if _matches_aging_filter(_days_aging(r[1], r[2], today), aging)}

    def apply_all(q):
        q = apply_filters(q)
        if aging_ids is not None:
            q = q.filter(models.Observation.id.in_(aging_ids))
        return q

    q = apply_all(db.query(models.Observation)).filter(models.Observation.status != 'Draft')
    total = q.count()

    # Aging breakdown (always computed from base filters, ignoring aging filter for the donut itself)
    aging_rows = (
        apply_filters(db.query(models.Observation.target_date_actual, models.Observation.closed_at, models.Observation.status))
        .filter(models.Observation.status != 'Draft')
        .all()
    )
    aging_buckets: dict = {"positive_approach": 0, "no_target": 0, "on_time": 0, "overdue_1_7": 0, "overdue_8_30": 0, "overdue_30_plus": 0}
    for target_str, closed_at, _row_status in aging_rows:
        if _row_status == 'Positive Approach':
            aging_buckets["positive_approach"] += 1
        else:
            bucket = _aging_bucket(_days_aging(target_str, closed_at, today))
            aging_buckets[bucket] = aging_buckets.get(bucket, 0) + 1

    # By status — counted on the EFFECTIVE status (derives Overdue / Overdue & Closed)
    status_rows = apply_all(
        db.query(models.Observation.status, models.Observation.target_date_actual, models.Observation.closed_at)
    ).filter(models.Observation.status != 'Draft').all()
    _today_iso = today.isoformat() if hasattr(today, "isoformat") else str(today)
    _eff_counts: dict = {}
    for _st, _tgt, _cl in status_rows:
        _es = effective_status(_st, _tgt, _cl, _today_iso)
        _eff_counts[_es] = _eff_counts.get(_es, 0) + 1
    by_status = sorted(_eff_counts.items(), key=lambda kv: -kv[1])

    by_risk = apply_all(
        db.query(models.Observation.risk_level, func.count().label("count"))
    ).filter(models.Observation.status != 'Draft').group_by(models.Observation.risk_level).all()

    recent = q.order_by(models.Observation.created_at.desc()).limit(4).all()

    # Monthly trend — use obs_date (YYYY-MM-DD string); substr gives YYYY-MM reliably
    month_expr = func.substr(models.Observation.obs_date, 1, 7)
    by_month = (
        apply_all(db.query(month_expr.label("month"), func.count().label("count")))
        .filter(models.Observation.status != 'Draft')
        .filter(models.Observation.obs_date.isnot(None))
        .filter(models.Observation.obs_date != "")
        .group_by(month_expr)
        .order_by(month_expr)
        .all()
    )

    # Monthly trend broken down by EFFECTIVE status, so a past-target open item shows
    # as "Overdue" (not "Open") — matching the KPI cards and By-Status donut. Effective
    # "Overdue & Closed" folds into "Closed" (the trend has no separate closed-late series).
    by_month_status_rows = (
        apply_all(
            db.query(
                month_expr.label("month"),
                models.Observation.status,
                models.Observation.target_date_actual,
                models.Observation.closed_at,
            )
        )
        .filter(models.Observation.status != 'Draft')
        .filter(models.Observation.obs_date.isnot(None))
        .filter(models.Observation.obs_date != "")
        .order_by(month_expr)
        .all()
    )
    month_status_map: dict = {}
    for m, _st, _tgt, _cl in by_month_status_rows:
        if not m:
            continue
        es = effective_status(_st, _tgt, _cl, _today_iso)
        if es == "Overdue & Closed":
            es = "Closed"
        if m not in month_status_map:
            month_status_map[m] = {"month": m, "Open": 0, "Overdue": 0, "Under Review": 0, "Partially Closed": 0, "Closed": 0, "Positive Approach": 0, "Unresolved & Closed": 0}
        if es in month_status_map[m]:
            month_status_map[m][es] = month_status_map[m].get(es, 0) + 1

    by_month_status = sorted(month_status_map.values(), key=lambda x: x["month"])

    return {
        "total": total,
        "byStatus": [{"status": s, "count": c} for s, c in by_status],
        "byRisk": [{"risk_level": r, "count": c} for r, c in by_risk if r],
        "byMonth": [{"month": m, "count": c} for m, c in by_month if m],
        "byMonthStatus": by_month_status,
        "byAging": aging_buckets,
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
        func.substr(models.Observation.obs_date, 1, 4).label("year"),
        func.substr(models.Observation.obs_date, 6, 2).label("month"),
        func.sum(case((models.Observation.risk_level == "Low", 1), else_=0)).label("low"),
        func.sum(case((models.Observation.risk_level == "Medium", 1), else_=0)).label("medium"),
        func.sum(case((models.Observation.risk_level == "High", 1), else_=0)).label("high"),
        func.count().label("total"),
    ).join(models.CoreConcern, models.Observation.core_concern_id == models.CoreConcern.id)
    if conditions:
        category_month_rows = category_month_rows.filter(*conditions)
    category_month_rows = category_month_rows.group_by(
        models.CoreConcern.name,
        func.substr(models.Observation.obs_date, 1, 4),
        func.substr(models.Observation.obs_date, 6, 2),
    ).order_by(
        func.substr(models.Observation.obs_date, 1, 4),
        func.substr(models.Observation.obs_date, 6, 2),
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
    observer_rows = observer_rows.group_by(
        func.coalesce(models.Observation.observer_name, models.User.name)
    ).order_by(func.count().desc()).limit(10).all()

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
    contractor_user_id: List[int] = Query(default=[]),
    risk_level: List[str] = Query(default=[]),
    core_concern_id: List[int] = Query(default=[]),
    specific_concern_id: List[int] = Query(default=[]),
    building_id: List[int] = Query(default=[]),
    floor_id: List[int] = Query(default=[]),
    eic_user_id: List[int] = Query(default=[]),
    possible_outcome: List[str] = Query(default=[]),
    violation_id: List[int] = Query(default=[]),
    root_cause_category_id: List[int] = Query(default=[]),
    root_cause_specific_id: List[int] = Query(default=[]),
    aging: List[str] = Query(default=[]),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=10000),
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
        q = q.filter(_status_filter_condition(status))
    if contractor_user_id:
        q = q.filter(models.Observation.contractor_user_id.in_(contractor_user_id))
    if risk_level:
        q = q.filter(models.Observation.risk_level.in_(risk_level))
    if core_concern_id:
        q = q.filter(models.Observation.core_concern_id.in_(core_concern_id))
    if specific_concern_id:
        q = q.filter(models.Observation.specific_concern_id.in_(specific_concern_id))
    if building_id:
        q = q.filter(models.Observation.building_id.in_(building_id))
    if floor_id:
        q = q.filter(models.Observation.floor_id.in_(floor_id))
    if eic_user_id:
        q = q.filter(models.Observation.eic_user_id.in_(eic_user_id))
    if possible_outcome:
        q = q.filter(models.Observation.possible_outcome.in_(possible_outcome))
    if violation_id:
        q = q.filter(models.Observation.violation_id.in_(violation_id))
    if root_cause_category_id:
        q = q.filter(models.Observation.root_cause_category_id.in_(root_cause_category_id))
    if root_cause_specific_id:
        q = q.filter(models.Observation.root_cause_specific_id.in_(root_cause_specific_id))
    if date_from:
        q = q.filter(models.Observation.obs_date >= date_from)
    if date_to:
        q = q.filter(models.Observation.obs_date <= date_to)

    # Drafts are private — visible to creator or admins
    if user.role not in ("SuperAdmin", "Admin"):
        q = q.filter(
            (models.Observation.status != 'Draft') | (models.Observation.created_by == user.id)
        )

    # Aging filter — supports the dashboard's granular buckets, "positive_approach",
    # and the coarse values; computed in Python from target date + closure vs today.
    if aging:
        today = date.today()
        rows = q.with_entities(
            models.Observation.id, models.Observation.target_date_actual,
            models.Observation.closed_at, models.Observation.status,
        ).all()
        eligible = [r[0] for r in rows if _aging_hit(aging, _days_aging(r[1], r[2], today), r[3])]
        q = q.filter(models.Observation.id.in_(eligible))

    total = q.count()
    obs_list = q.order_by(
        nullslast(models.Observation.created_at.desc()),
        models.Observation.obs_date.desc(),
    ).offset((page - 1) * limit).limit(limit).all()

    return {
        "observations": [obs_to_dict(o, db) for o in obs_list],
        "total": total,
        "pages": (total + limit - 1) // limit,
    }


# Facet dimensions: query-param name → how to read that value from a row.
# Contractor / EIC use the primary assignee, matching the list filter above.
_FACET_FIELDS = {
    "project_id":             lambda r: r.project_id,
    "status":                 lambda r: r.eff_status,
    "contractor_user_id":     lambda r: r.contractor_user_id,
    "risk_level":             lambda r: r.risk_level,
    "core_concern_id":        lambda r: r.core_concern_id,
    "specific_concern_id":    lambda r: r.specific_concern_id,
    "building_id":            lambda r: r.building_id,
    "floor_id":               lambda r: r.floor_id,
    "eic_user_id":            lambda r: r.eic_user_id,
    "possible_outcome":       lambda r: r.possible_outcome,
    "violation_id":           lambda r: r.violation_id,
    "root_cause_category_id": lambda r: r.root_cause_category_id,
    "root_cause_specific_id": lambda r: r.root_cause_specific_id,
}


@router.get("/facets")
def observation_facets(
    project_id: List[int] = Query(default=[]),
    status: List[str] = Query(default=[]),
    contractor_user_id: List[int] = Query(default=[]),
    risk_level: List[str] = Query(default=[]),
    core_concern_id: List[int] = Query(default=[]),
    specific_concern_id: List[int] = Query(default=[]),
    building_id: List[int] = Query(default=[]),
    floor_id: List[int] = Query(default=[]),
    eic_user_id: List[int] = Query(default=[]),
    possible_outcome: List[str] = Query(default=[]),
    violation_id: List[int] = Query(default=[]),
    root_cause_category_id: List[int] = Query(default=[]),
    root_cause_specific_id: List[int] = Query(default=[]),
    aging: List[str] = Query(default=[]),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    exclude_drafts: bool = Query(False),   # report/dashboard never include drafts
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Cascading filters: for every filter dimension, the values that occur in observations
    matching all the *other* selected filters (so a dimension never narrows itself and
    multi-select within it still works). Same access/draft/date/ageing rules as the list."""
    O = models.Observation
    allowed = get_allowed_project_ids(user)
    if allowed is not None and not allowed:
        return {k: [] for k in _FACET_FIELDS}
    q = db.query(
        O.id, O.project_id, O.status, O.target_date_actual, O.closed_at, O.contractor_user_id,
        O.risk_level, O.core_concern_id, O.specific_concern_id, O.building_id, O.floor_id,
        O.eic_user_id, O.possible_outcome, O.violation_id, O.root_cause_category_id,
        O.root_cause_specific_id,
    )
    if allowed is not None:
        q = q.filter(O.project_id.in_(allowed))
    if date_from:
        q = q.filter(O.obs_date >= date_from)
    if date_to:
        q = q.filter(O.obs_date <= date_to)
    if exclude_drafts:
        q = q.filter(O.status != 'Draft')
    elif user.role not in ("SuperAdmin", "Admin"):
        q = q.filter((O.status != 'Draft') | (O.created_by == user.id))

    today = date.today()
    today_iso = today.isoformat()
    rows = []
    for r in q.all():
        if aging and not _aging_hit(aging, _days_aging(r.target_date_actual, r.closed_at, today), r.status):
            continue
        rows.append(SimpleNamespace(
            **r._asdict(),
            eff_status=effective_status(r.status, r.target_date_actual, r.closed_at, today_iso),
        ))

    selected = {
        "project_id": project_id, "status": status, "contractor_user_id": contractor_user_id,
        "risk_level": risk_level, "core_concern_id": core_concern_id,
        "specific_concern_id": specific_concern_id, "building_id": building_id, "floor_id": floor_id,
        "eic_user_id": eic_user_id, "possible_outcome": possible_outcome, "violation_id": violation_id,
        "root_cause_category_id": root_cause_category_id, "root_cause_specific_id": root_cause_specific_id,
    }
    active = {k: set(v) for k, v in selected.items() if v}

    def matches(r, skip: str) -> bool:
        return all(_FACET_FIELDS[k](r) in vals for k, vals in active.items() if k != skip)

    out = {}
    for key, get in _FACET_FIELDS.items():
        vals = {get(r) for r in rows if matches(r, key)}
        vals.discard(None)
        vals.discard("")
        out[key] = sorted(vals, key=str)
    return out


@router.get("/status-options")
def status_options(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Distinct effective statuses that actually have observations (within the user's scope),
    so the filter only offers values that exist."""
    allowed = get_allowed_project_ids(user)
    q = db.query(
        models.Observation.status, models.Observation.target_date_actual,
        models.Observation.closed_at, models.Observation.created_by,
    )
    if allowed is not None:
        if not allowed:
            return []
        q = q.filter(models.Observation.project_id.in_(allowed))
    if user.role not in ("SuperAdmin", "Admin"):
        q = q.filter((models.Observation.status != 'Draft') | (models.Observation.created_by == user.id))

    today = date.today().isoformat()
    present = {effective_status(st, tgt, cl, today) for st, tgt, cl, _cb in q.all()}
    order = ['Draft', 'Open', 'Overdue', 'Under Review', 'Partially Closed',
             'Closed', 'Overdue & Closed', 'Positive Approach', 'Unresolved & Closed']
    return [s for s in order if s in present] + sorted(present - set(order))


@router.get("/stats/she-report")
def she_report_stats(
    project_id: List[int] = Query(default=[]),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Comprehensive SHE performance data for the 7-page report PDF."""
    from collections import defaultdict

    allowed = get_allowed_project_ids(user)
    today = date.today()

    conditions = [models.Observation.status != "Draft"]
    if allowed is not None:
        conditions.append(models.Observation.project_id.in_(allowed))
    if project_id:
        conditions.append(models.Observation.project_id.in_(project_id))
    if date_from:
        conditions.append(models.Observation.obs_date >= date_from)
    if date_to:
        conditions.append(models.Observation.obs_date <= date_to)

    obs_list = db.query(models.Observation).filter(*conditions).all()

    # ── Per-project rectification stats ──────────────────────────────────
    proj_stats: dict = defaultdict(lambda: {
        "project_name": "", "raised": 0, "rectified": 0, "not_rectified": 0,
        "timely": 0, "delayed": 0, "total_delay_days": 0,
    })

    for obs in obs_list:
        pname = obs.project.name if obs.project else "Unknown"
        ps = proj_stats[obs.project_id or 0]
        ps["project_name"] = pname
        ps["raised"] += 1
        if obs.status == "Closed":
            ps["rectified"] += 1
            if obs.closed_at and obs.target_date_actual:
                try:
                    target = date.fromisoformat(obs.target_date_actual)
                    closed_d = obs.closed_at.date() if hasattr(obs.closed_at, "date") else obs.closed_at
                    delay = (closed_d - target).days
                    if delay <= 0:
                        ps["timely"] += 1
                    else:
                        ps["delayed"] += 1
                        ps["total_delay_days"] += delay
                except (ValueError, AttributeError):
                    ps["timely"] += 1
            else:
                ps["timely"] += 1
        else:
            ps["not_rectified"] += 1
            if obs.target_date_actual:
                try:
                    target = date.fromisoformat(obs.target_date_actual)
                    if today > target:
                        ps["total_delay_days"] += (today - target).days
                except ValueError:
                    pass

    project_rectification = sorted([
        {
            "project_name": ps["project_name"],
            "raised": ps["raised"],
            "rectified": ps["rectified"],
            "not_rectified": ps["not_rectified"],
            "timely": ps["timely"],
            "delayed": ps["delayed"],
            "total_delay_days": ps["total_delay_days"],
            "avg_delay": round(ps["total_delay_days"] / ps["raised"], 2) if ps["raised"] else 0,
        }
        for ps in proj_stats.values()
    ], key=lambda x: -x["raised"])

    # ── Consequence distribution (possible_outcome field) ─────────────────
    consequence_counts: dict = defaultdict(int)
    for obs in obs_list:
        if obs.possible_outcome:
            consequence_counts[obs.possible_outcome.strip()] += 1
    total_cons = sum(consequence_counts.values()) or 1
    consequence_distribution = sorted([
        {"name": k, "count": v, "pct": round(v / total_cons * 100)}
        for k, v in consequence_counts.items()
    ], key=lambda x: -x["count"])

    # ── Root cause distribution ───────────────────────────────────────────
    root_cause_counts: dict = defaultdict(int)
    for obs in obs_list:
        if obs.root_cause_category:
            root_cause_counts[obs.root_cause_category.name] += 1
    total_rc = sum(root_cause_counts.values()) or 1
    root_cause_distribution = sorted([
        {"name": k, "count": v, "pct": round(v / total_rc * 100)}
        for k, v in root_cause_counts.items()
    ], key=lambda x: -x["count"])

    # ── Violation area distribution (core concern) ────────────────────────
    violation_area_counts: dict = defaultdict(int)
    for obs in obs_list:
        if obs.core_concern:
            violation_area_counts[obs.core_concern.name] += 1
    total_va = sum(violation_area_counts.values()) or 1
    violation_area_distribution = sorted([
        {"name": k, "count": v, "pct": round(v / total_va * 100)}
        for k, v in violation_area_counts.items()
    ], key=lambda x: -x["count"])

    # ── Per-project risk analysis ─────────────────────────────────────────
    proj_risk: dict = defaultdict(lambda: {"project_name": "", "total": 0, "high": 0, "medium": 0, "low": 0})
    for obs in obs_list:
        pname = obs.project.name if obs.project else "Unknown"
        pr = proj_risk[obs.project_id or 0]
        pr["project_name"] = pname
        pr["total"] += 1
        if obs.risk_level == "High":
            pr["high"] += 1
        elif obs.risk_level == "Medium":
            pr["medium"] += 1
        elif obs.risk_level == "Low":
            pr["low"] += 1

    project_risk_analysis = sorted(proj_risk.values(), key=lambda x: -x["total"])

    total_raised = sum(p["raised"] for p in project_rectification)
    total_delay = sum(p["total_delay_days"] for p in project_rectification)

    return {
        "projectRectification": project_rectification,
        "consequenceDistribution": consequence_distribution,
        "rootCauseDistribution": root_cause_distribution,
        "violationAreaDistribution": violation_area_distribution,
        "projectRiskAnalysis": project_risk_analysis,
        "avgDelayOverall": round(total_delay / total_raised, 2) if total_raised else 0,
        "totalObservations": len(obs_list),
    }


# ── MIS SHE Performance Report ──────────────────────────────────────────────
def _mis_num(v) -> float:
    try:
        return float(str(v).replace(",", "").strip())
    except (ValueError, TypeError):
        return 0.0


def _ym_in_range(y: int, m: int, date_from: Optional[str], date_to: Optional[str]) -> bool:
    if date_from and (y, m) < (int(date_from[:4]), int(date_from[5:7])):
        return False
    if date_to and (y, m) > (int(date_to[:4]), int(date_to[5:7])):
        return False
    return True


def _mis_quarter_label(date_from: Optional[str]) -> str:
    if not date_from:
        return ""
    y, m = int(date_from[:4]), int(date_from[5:7])
    if m >= 4:
        q = (m - 4) // 3 + 1
        fy = y
    else:
        q = 4
        fy = y - 1
    roman = ["I", "II", "III", "IV"][q - 1]
    return f"Q{roman}, {fy}-{str(fy + 1)[2:]}"


def _mis_data(db: Session, user: models.User, date_from: Optional[str],
              date_to: Optional[str], project_id: List[int]) -> dict:
    from collections import defaultdict
    allowed = get_allowed_project_ids(user)
    today = date.today()

    conds = [models.Observation.status != "Draft"]
    if allowed is not None:
        conds.append(models.Observation.project_id.in_(allowed))
    if project_id:
        conds.append(models.Observation.project_id.in_(project_id))
    if date_from:
        conds.append(models.Observation.obs_date >= date_from)
    if date_to:
        conds.append(models.Observation.obs_date <= date_to)
    obs_list = db.query(models.Observation).filter(*conds).all()

    # Project scope (names) for SHE score & manpower
    pq = db.query(models.Project)
    if allowed is not None:
        pq = pq.filter(models.Project.id.in_(allowed))
    if project_id:
        pq = pq.filter(models.Project.id.in_(project_id))
    scope_projects = pq.all()
    scope_names = {p.name for p in scope_projects}
    scope_ids = [p.id for p in scope_projects]

    # ── Per-project rectification / delay / noteworthy ──
    ps: dict = defaultdict(lambda: {"project_name": "", "raised": 0, "rectified": 0, "not_rectified": 0,
                                    "timely": 0, "delayed": 0, "total_delay_days": 0, "noteworthy": 0,
                                    "high": 0, "medium": 0, "low": 0})
    status_counts: dict = defaultdict(int)
    for o in obs_list:
        p = ps[o.project_id or 0]
        p["project_name"] = o.project.name if o.project else "Unknown"
        p["raised"] += 1
        if o.status == "Positive Approach":
            p["noteworthy"] += 1
        if o.risk_level in ("High", "Medium", "Low"):
            p[o.risk_level.lower()] += 1
        status_counts[effective_status(o.status, o.target_date_actual, o.closed_at, today.isoformat())] += 1
        if o.status == "Closed":
            p["rectified"] += 1
            if o.closed_at and o.target_date_actual:
                try:
                    delay = ((o.closed_at.date() if hasattr(o.closed_at, "date") else o.closed_at)
                             - date.fromisoformat(o.target_date_actual)).days
                    if delay > 0:
                        p["delayed"] += 1
                        p["total_delay_days"] += delay
                    else:
                        p["timely"] += 1
                except (ValueError, AttributeError):
                    p["timely"] += 1
            else:
                p["timely"] += 1
        else:
            p["not_rectified"] += 1
            if o.target_date_actual:
                try:
                    tgt = date.fromisoformat(o.target_date_actual)
                    if today > tgt:
                        p["total_delay_days"] += (today - tgt).days
                except ValueError:
                    pass

    # ── Distributions ──
    def _dist(attr_fn):
        c: dict = defaultdict(int)
        for o in obs_list:
            v = attr_fn(o)
            if v:
                c[v.strip() if isinstance(v, str) else v] += 1
        tot = sum(c.values()) or 1
        return sorted([{"name": k, "count": v, "pct": round(v / tot * 100)} for k, v in c.items()],
                      key=lambda x: -x["count"])

    violation_area = _dist(lambda o: o.core_concern.name if o.core_concern else None)
    consequence = _dist(lambda o: o.possible_outcome)
    root_cause = _dist(lambda o: o.root_cause_category.name if o.root_cause_category else None)

    # ── SHE score (EASE) for the period ──
    ease = (db.query(models.EaseScoreEntry.project_name, models.EaseScoreEntry.period_year,
                     models.EaseScoreEntry.period_month, models.EaseScoreEntry.overall_score)
            .filter(models.EaseScoreEntry.overall_score.isnot(None)).all())
    seen = set()
    she_proj: dict = defaultdict(list)
    for pn, y, m, ov in ease:
        if pn not in scope_names or not _ym_in_range(y, m, date_from, date_to):
            continue
        if (pn, y, m) in seen:
            continue
        seen.add((pn, y, m))
        she_proj[pn].append(ov)
    she_by_project = sorted([{"project_name": pn, "score": round(sum(v) / len(v) * 100, 1)}
                             for pn, v in she_proj.items()], key=lambda x: -x["score"])
    she_overall = (round(sum(sum(v) / len(v) for v in she_proj.values()) / len(she_proj) * 100, 1)
                   if she_proj else None)

    # ── Manpower (from Monthly OH&S Statistics) ──
    mp_rows = db.query(models.OhsStatistics).filter(
        models.OhsStatistics.project_id.in_(scope_ids) if scope_ids else models.OhsStatistics.id.is_(None)
    ).all()
    mp: dict = defaultdict(lambda: {"project_name": "", "man_hours": 0.0, "persons_sum": 0.0, "months": 0})
    name_by_id = {p.id: p.name for p in scope_projects}
    for r in mp_rows:
        if not _ym_in_range(r.year, r.month, date_from, date_to):
            continue
        sa = []
        try:
            sa = json.loads(r.section_a) if r.section_a else []
        except (ValueError, TypeError):
            sa = []
        sa_vals = list(sa.values()) if isinstance(sa, dict) else sa   # dict (by key) or legacy list
        mh = sum(_mis_num(x.get("man_hours")) for x in sa_vals if isinstance(x, dict))
        pers = sum(_mis_num(x.get("avg_persons")) for x in sa_vals if isinstance(x, dict))
        e = mp[r.project_id]
        e["project_name"] = name_by_id.get(r.project_id, "Unknown")
        e["man_hours"] += mh
        e["persons_sum"] += pers
        e["months"] += 1
    total_mh = sum(e["man_hours"] for e in mp.values()) or 0
    manpower = sorted([
        {"project_name": e["project_name"], "man_hours": round(e["man_hours"]),
         "avg_persons": round(e["persons_sum"] / e["months"]) if e["months"] else 0,
         "pct": round(e["man_hours"] / total_mh * 100, 1) if total_mh else 0}
        for e in mp.values()], key=lambda x: -x["man_hours"])

    # ── Assemble per-project rows (+ indices) ──
    mh_by_name = {m["project_name"]: m["man_hours"] for m in manpower}
    projects_rows = []
    for v in sorted(ps.values(), key=lambda x: -x["raised"]):
        mh = mh_by_name.get(v["project_name"], 0)
        projects_rows.append({
            **v,
            "avg_delay": round(v["total_delay_days"] / v["raised"], 2) if v["raised"] else 0,
            # Observation rate = observations per 1,00,000 man-hours; delay rate = % of rectifications delayed
            "observation_rate": round(v["raised"] / mh * 100000, 2) if mh else None,
            "delay_rate": round(v["delayed"] / v["rectified"] * 100, 1) if v["rectified"] else 0,
        })

    total_raised = sum(p["raised"] for p in projects_rows)
    total_rectified = sum(p["rectified"] for p in projects_rows)
    total_delayed = sum(p["delayed"] for p in projects_rows)
    total_timely = sum(p["timely"] for p in projects_rows)
    total_delay_days = sum(p["total_delay_days"] for p in projects_rows)

    return {
        "meta": {
            "quarter": _mis_quarter_label(date_from),
            "date_from": date_from, "date_to": date_to,
            "generated_on": today.isoformat(),
            "project_scope": "All Projects" if not project_id else
                             (name_by_id.get(project_id[0], "") if len(project_id) == 1 else f"{len(project_id)} projects"),
        },
        "sheScore": {"overall": she_overall, "byProject": she_by_project},
        "summary": {
            "total": total_raised, "rectified": total_rectified, "not_rectified": total_raised - total_rectified,
            "timely": total_timely, "delayed": total_delayed,
            "avg_delay": round(total_delay_days / total_raised, 2) if total_raised else 0,
            "byStatus": sorted(status_counts.items(), key=lambda kv: -kv[1]),
        },
        "projects": projects_rows,
        "violationArea": violation_area,
        "consequence": consequence,
        "rootCause": root_cause,
        "manpower": manpower,
    }


@router.get("/mis-report")
def mis_report(
    project_id: List[int] = Query(default=[]),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    return _mis_data(db, user, date_from, date_to, project_id)


@router.get("/mis-report.docx")
def mis_report_docx(
    project_id: List[int] = Query(default=[]),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    import io as _io
    from fastapi.responses import StreamingResponse
    try:
        from docx import Document
        from docx.shared import Pt, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH
    except ImportError:
        raise HTTPException(500, "Word export is not available on the server (python-docx missing).")

    d = _mis_data(db, user, date_from, date_to, project_id)
    m = d["meta"]
    doc = Document()

    def fmt(v):
        return "—" if v is None else str(v)

    title = doc.add_heading(f"Project SHE Performance Report, {m['quarter']}", level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = sub.add_run(f"Ambuja Neotia  •  Safety, Health & Environment\n"
                    f"Scope: {m['project_scope']}   |   Period: {fmt(m['date_from'])} to {fmt(m['date_to'])}"
                    f"   |   Report date: {m['generated_on']}")
    r.font.size = Pt(9); r.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    def table(headers, rows, widths=None):
        t = doc.add_table(rows=1, cols=len(headers))
        t.style = "Light Grid Accent 1"
        for i, h in enumerate(headers):
            c = t.rows[0].cells[i]
            c.text = h
            for p in c.paragraphs:
                for rr in p.runs:
                    rr.font.bold = True; rr.font.size = Pt(9)
        for row in rows:
            cells = t.add_row().cells
            for i, val in enumerate(row):
                cells[i].text = fmt(val)
                for p in cells[i].paragraphs:
                    for rr in p.runs:
                        rr.font.size = Pt(9)
        doc.add_paragraph()

    def heading(txt):
        h = doc.add_heading(txt, level=1)
        for rr in h.runs:
            rr.font.color.rgb = RGBColor(0x43, 0x38, 0xCA)

    # 1. SHE Scores
    heading("1. SHE Scores of the Organisation & Projects")
    doc.add_paragraph(f"Overall Ambuja Neotia SHE Score for {m['quarter']}: "
                      f"{fmt(d['sheScore']['overall'])}{'%' if d['sheScore']['overall'] is not None else ''}")
    if d["sheScore"]["byProject"]:
        table(["Project", "SHE Score (%)"], [[p["project_name"], p["score"]] for p in d["sheScore"]["byProject"]])
    else:
        doc.add_paragraph("No SHE (EASE) scores recorded for this period.")

    # 2. Observation summary
    s = d["summary"]
    heading("2. SHE Observation Summary")
    table(["Metric", "Value"], [
        ["Total observations raised", s["total"]],
        ["Rectified (closed)", s["rectified"]],
        ["Not rectified (open)", s["not_rectified"]],
        ["Timely rectifications", s["timely"]],
        ["Delayed rectifications", s["delayed"]],
        ["Average delay days / observation", s["avg_delay"]],
    ])
    if s["byStatus"]:
        table(["Status", "Count"], [[k, v] for k, v in s["byStatus"]])

    # 3. Project-wise observations & rectifications
    heading("3. Observations & Rectifications (Project-wise)")
    table(["Project", "Raised", "Rectified", "Not Rect.", "Timely", "Delayed", "Avg Delay"],
          [[p["project_name"], p["raised"], p["rectified"], p["not_rectified"],
            p["timely"], p["delayed"], p["avg_delay"]] for p in d["projects"]] or [["—"] * 7])

    # 4. Analysis
    heading("4. Analysis of SHE Observations")
    doc.add_paragraph("By Area of Concern").runs[0].bold = True
    table(["Area / Core Concern", "Count", "%"], [[x["name"], x["count"], x["pct"]] for x in d["violationArea"]] or [["—", 0, 0]])
    doc.add_paragraph("Predicted Consequence").runs[0].bold = True
    table(["Consequence", "Count", "%"], [[x["name"], x["count"], x["pct"]] for x in d["consequence"]] or [["—", 0, 0]])
    doc.add_paragraph("Root Cause").runs[0].bold = True
    table(["Root Cause", "Count", "%"], [[x["name"], x["count"], x["pct"]] for x in d["rootCause"]] or [["—", 0, 0]])

    # 5. Risk analysis
    heading("5. Risk Analysis (Project-wise)")
    table(["Project", "High", "Medium", "Low", "Total"],
          [[p["project_name"], p["high"], p["medium"], p["low"], p["raised"]] for p in d["projects"]] or [["—"] * 5])

    # 6. Noteworthy
    heading("6. Noteworthy (Praiseworthy) Observations")
    table(["Project", "Noteworthy"], [[p["project_name"], p["noteworthy"]] for p in d["projects"]] or [["—", 0]])

    # 7. Observation indices
    heading("7. Observation Indices")
    doc.add_paragraph("Observation Rate = observations per 1,00,000 man-hours · Delay Rate = % of rectifications delayed.")
    table(["Project", "Observation Rate", "Delay Rate (%)"],
          [[p["project_name"], fmt(p["observation_rate"]), p["delay_rate"]] for p in d["projects"]] or [["—", "—", 0]])

    # 8. Manpower
    heading("8. Man-hours & Manpower")
    table(["Project", "Man-hours", "Avg Persons/Day", "% Share"],
          [[p["project_name"], p["man_hours"], p["avg_persons"], p["pct"]] for p in d["manpower"]]
          or [["No OH&S statistics entered for this period", "—", "—", "—"]])

    note = doc.add_paragraph()
    nr = note.add_run("A higher 'Delay in Rectification' means a project stays with risks for more days. "
                      "Increase the observation rate and reduce severity through timely rectification.")
    nr.font.italic = True; nr.font.size = Pt(8); nr.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
    doc.add_paragraph("-End of Report-").alignment = WD_ALIGN_PARAGRAPH.CENTER

    buf = _io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    fname = f"SHE_Performance_Report_{m['quarter'].replace(', ', '_').replace(' ', '')}.docx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/report")
def get_report_data(
    project_id: List[int] = Query(default=[]),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: List[str] = Query(default=[]),
    contractor_user_id: List[int] = Query(default=[]),
    risk_level: List[str] = Query(default=[]),
    building_id: List[int] = Query(default=[]),
    floor_id: List[int] = Query(default=[]),
    eic_user_id: List[int] = Query(default=[]),
    possible_outcome: List[str] = Query(default=[]),
    violation_id: List[int] = Query(default=[]),
    root_cause_category_id: List[int] = Query(default=[]),
    root_cause_specific_id: List[int] = Query(default=[]),
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
    q = q.filter(models.Observation.status != 'Draft')
    if status:
        q = q.filter(_status_filter_condition(status))
    if contractor_user_id:
        q = q.filter(models.Observation.contractor_user_id.in_(contractor_user_id))
    if risk_level:
        q = q.filter(models.Observation.risk_level.in_(risk_level))
    if building_id:
        q = q.filter(models.Observation.building_id.in_(building_id))
    if floor_id:
        q = q.filter(models.Observation.floor_id.in_(floor_id))
    if eic_user_id:
        q = q.filter(models.Observation.eic_user_id.in_(eic_user_id))
    if possible_outcome:
        q = q.filter(models.Observation.possible_outcome.in_(possible_outcome))
    if violation_id:
        q = q.filter(models.Observation.violation_id.in_(violation_id))
    if root_cause_category_id:
        q = q.filter(models.Observation.root_cause_category_id.in_(root_cause_category_id))
    if root_cause_specific_id:
        q = q.filter(models.Observation.root_cause_specific_id.in_(root_cause_specific_id))
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
    _assert_obs_access(obs, user)
    return obs_to_dict(obs, db)


@router.post("/{obs_id}/ai-summary")
def generate_ai_summary(obs_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """(Re)generate the AI summary for an observation. The result is cached on the observation
    (with who generated it and when) until someone regenerates it."""
    obs = (
        db.query(models.Observation).filter(models.Observation.id == int(obs_id)).first()
        if obs_id.isdigit()
        else db.query(models.Observation).filter(models.Observation.observation_id == obs_id).first()
    )
    if not obs:
        raise HTTPException(404, "Observation not found")
    _assert_obs_access(obs, user)

    if not ai_service.is_enabled(db):
        raise HTTPException(503, "AI summaries are turned off. Enable them in Admin → AI Summary.")
    if not ai_service.is_configured(db):
        raise HTTPException(503, "AI summary is not configured. Add an API key in Admin → AI Summary.")

    try:
        summary = ai_service.generate_summary(obs, obs_to_dict(obs, db), db)
    except Exception as exc:
        logger.error("AI summary generation failed for %s: %s", obs.observation_id, exc)
        raise HTTPException(502, "Failed to generate the AI summary. Please try again.")

    obs.ai_summary = summary
    obs.ai_summary_at = datetime.now()
    obs.ai_summary_by = user.id
    db.commit()
    db.refresh(obs)
    return {
        "ai_summary": obs.ai_summary,
        "ai_summary_at": obs.ai_summary_at.isoformat() if obs.ai_summary_at else None,
        "ai_summary_by": obs.ai_summary_by,
        "ai_summary_by_name": user.name,
    }


@router.post("/", status_code=201)
def create_observation(body: ObsCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    if user.role == "Contractor":
        raise HTTPException(status_code=403, detail="Your role cannot create observations")
    _check_target_limit(db, body.severity, body.probability, body.obs_date, body.target_date_actual, body.status)
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
        contractor_user_ids=json.dumps(body.contractor_user_ids) if body.contractor_user_ids else None,
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
        target_date_actual=body.target_date_actual,
        eic_user_id=body.eic_user_ids[0] if body.eic_user_ids else body.eic_user_id,
        eic_user_ids=json.dumps(body.eic_user_ids) if body.eic_user_ids else None,
        status=body.status or "Open",
        created_by=user.id,
    )
    db.add(obs)
    db.commit()
    db.refresh(obs)

    # In-app notification and email — skipped for drafts
    if obs.status == 'Draft':
        return {"id": obs.id, "observation_id": obs.observation_id, "risk_factor": factor, "risk_level": level}

    # In-app notifications to all assigned contractors
    notif_ids = body.contractor_user_ids or ([body.contractor_user_id] if body.contractor_user_id else [])
    project_name = obs.project.name if obs.project else ""
    for uid in notif_ids:
        db.add(models.Notification(
            user_id=uid,
            observation_id=obs.id,
            obs_ref=obs.observation_id,
            message=f"New observation {obs.observation_id} assigned to you on project '{project_name}'.",
            is_read=False,
        ))
        db.commit()

    # Email notification
    threading.Thread(target=_fire_email_async, args=(obs.id,), daemon=True).start()

    return {"id": obs.id, "observation_id": obs.observation_id, "risk_factor": factor, "risk_level": level}


def _send_obs_email(obs: models.Observation, db: Session, event: str = "new"):
    if obs.status == 'Draft':
        logger.info("Email skipped for %s: observation is a Draft", obs.observation_id)
        return
    smtp = db.query(models.SmtpSettings).first()
    if not smtp:
        logger.warning("Email skipped for %s: no SMTP settings row in DB", obs.observation_id)
        return
    if not smtp.enabled:
        logger.warning("Email skipped for %s: SMTP is disabled (enabled=False)", obs.observation_id)
        return

    # TO: all assigned contractors
    to_emails: List[str] = []
    contractor_names: List[str] = []
    contractor_ids = json.loads(obs.contractor_user_ids) if obs.contractor_user_ids else (
        [obs.contractor_user_id] if obs.contractor_user_id else []
    )
    for cid in contractor_ids:
        u = db.query(models.User).filter(models.User.id == cid).first()
        if u:
            if u.email and u.email not in to_emails:
                to_emails.append(u.email)
            if u.name and u.name not in contractor_names:
                contractor_names.append(u.name)

    # Observation-specific EIC users
    eic_names: List[str] = []
    eic_ids = json.loads(obs.eic_user_ids) if obs.eic_user_ids else (
        [obs.eic_user_id] if obs.eic_user_id else []
    )
    eic_cc: List[str] = []
    for eid in eic_ids:
        u = db.query(models.User).filter(models.User.id == eid).first()
        if u:
            if u.email and u.email not in to_emails and u.email not in eic_cc:
                eic_cc.append(u.email)
            if u.name and u.name not in eic_names:
                eic_names.append(u.name)

    # CC: project-scoped PIC/EIC/HO/PSO/Observer + Admin/SuperAdmin (project-filtered or global)
    CC_PROJECT_ROLES = {"PIC", "EIC", "HO", "PSO", "Observer"}
    cc_emails: List[str] = list(eic_cc)
    project_users = (
        db.query(models.User)
        .join(models.UserProject, models.UserProject.user_id == models.User.id)
        .filter(
            models.UserProject.project_id == obs.project_id,
            models.User.role.in_(CC_PROJECT_ROLES),
        )
        .all()
    )
    # Admin/SuperAdmin: include if they have no project assignments (All Projects)
    # or if they are assigned to this specific project
    all_admins = db.query(models.User).filter(models.User.role.in_(["Admin", "SuperAdmin"])).all()
    admin_project_ids_map = {}
    for u in all_admins:
        admin_project_ids_map[u.id] = {up.project_id for up in u.user_projects}
    admin_users = [
        u for u in all_admins
        if not admin_project_ids_map[u.id]  # empty = All Projects
        or obs.project_id in admin_project_ids_map[u.id]
    ]
    for u in project_users + admin_users:
        if u.email and u.email not in cc_emails and u.email not in to_emails:
            cc_emails.append(u.email)

    if not to_emails and not cc_emails:
        logger.warning("Email skipped for %s: no recipients found (no contractors/EICs/project users)", obs.observation_id)
        return

    obs_data = {
        "observation_id": obs.observation_id,
        "project_name": obs.project.name if obs.project else "",
        "obs_date": obs.obs_date or "",
        "obs_time": obs.obs_time or "",
        "building_name": obs.building.name if obs.building else "",
        "floor_name": obs.floor.name if obs.floor else "",
        "exact_location": obs.exact_location or "",
        "observer_name": obs.observer_name or "",
        "created_by_name": obs.creator.name if obs.creator else "",
        "contractor_names": contractor_names,
        "eic_names": eic_names,
        "to_be_rectified_by": obs.to_be_rectified_by or "",
        "core_concern_name": obs.core_concern.name if obs.core_concern else "",
        "specific_concern_name": obs.specific_concern.name if obs.specific_concern else "",
        "specific_concern_text": obs.specific_concern_text or "",
        "possible_outcome": obs.possible_outcome or "",
        "severity": obs.severity,
        "probability": obs.probability,
        "risk_factor": obs.risk_factor,
        "risk_level": obs.risk_level or "",
        "root_cause_category_name": obs.root_cause_category.name if obs.root_cause_category else "",
        "root_cause_specific_name": obs.root_cause_specific.name if obs.root_cause_specific else "",
        "violation_name": obs.violation.name if obs.violation else "",
        "target_date_name": obs.target_date.name if obs.target_date else "",
        "target_date_actual": obs.target_date_actual or "",
        "status": obs.status,
        "event": event,
    }
    subject, html = build_observation_email(obs_data)
    send_observation_email(smtp, to_emails, cc_emails, subject, html)


def _fire_email_async(obs_id: int, event: str = "new"):
    """Send observation email in a background thread so it doesn't block the HTTP response."""
    db = SessionLocal()
    try:
        obs = db.query(models.Observation).filter(models.Observation.id == obs_id).first()
        if obs:
            _send_obs_email(obs, db, event=event)
    except Exception as exc:
        logger.error("Async email failed for observation %s: %s", obs_id, exc)
    finally:
        db.close()


@router.put("/{obs_id}")
def update_observation(obs_id: int, body: ObsUpdate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    obs = db.query(models.Observation).filter(models.Observation.id == obs_id).first()
    if not obs:
        raise HTTPException(404, "Observation not found")
    _assert_obs_access(obs, user, write_roles=['SuperAdmin', 'Admin', 'HO', 'PSO', 'Observer'])

    was_draft = obs.status == 'Draft'
    prev_status = obs.status
    factor, level = calc_risk(body.severity or obs.severity or 1, body.probability or obs.probability or 1)

    body_dict = body.model_dump(exclude_unset=True)
    # Enforce the target-date limit only when the date or its inputs change, so older
    # records with a longer target can still be edited for other fields.
    merged = {k: body_dict.get(k, getattr(obs, k))
              for k in ("severity", "probability", "obs_date", "target_date_actual", "status")}
    if any(merged[k] != getattr(obs, k) for k in ("severity", "probability", "obs_date", "target_date_actual")):
        _check_target_limit(db, merged["severity"], merged["probability"], merged["obs_date"],
                            merged["target_date_actual"], merged["status"])
    # Serialize list fields → JSON string before setting on model
    if 'contractor_user_ids' in body_dict:
        ids = body_dict.pop('contractor_user_ids')
        obs.contractor_user_ids = json.dumps(ids) if ids else None
    if 'eic_user_ids' in body_dict:
        eids = body_dict.pop('eic_user_ids')
        obs.eic_user_ids = json.dumps(eids) if eids else None
        obs.eic_user_id = eids[0] if eids else body_dict.pop('eic_user_id', obs.eic_user_id)
    for field, val in body_dict.items():
        setattr(obs, field, val)

    obs.risk_factor = factor
    obs.risk_level = level
    obs.updated_at = datetime.now()
    if prev_status != 'Closed' and obs.status == 'Closed' and obs.closed_at is None:
        obs.closed_at = datetime.now()
    elif prev_status == 'Closed' and obs.status != 'Closed':
        obs.closed_at = None   # reopened via the edit form
    db.commit()
    db.refresh(obs)

    # Send notifications when a draft is being submitted (converted to non-Draft)
    if was_draft and obs.status != 'Draft':
        all_cids = json.loads(obs.contractor_user_ids) if obs.contractor_user_ids else (
            [obs.contractor_user_id] if obs.contractor_user_id else []
        )
        if all_cids:
            project_name = obs.project.name if obs.project else ""
            for cid in all_cids:
                db.add(models.Notification(
                    user_id=cid, observation_id=obs.id, obs_ref=obs.observation_id,
                    message=f"New observation {obs.observation_id} assigned to you on project '{project_name}'.",
                    is_read=False,
                ))
            db.commit()
        threading.Thread(target=_fire_email_async, args=(obs.id,), daemon=True).start()
    # Closure via the edit form: notify when the observation transitions into Closed
    elif prev_status != 'Closed' and obs.status == 'Closed':
        threading.Thread(target=_fire_email_async, args=(obs.id, "closed"), daemon=True).start()

    return {"success": True, "risk_factor": factor, "risk_level": level}


class StatusBody(BaseModel):
    status: str


@router.patch("/{obs_id}/status")
def update_status(obs_id: int, body: StatusBody, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    obs = db.query(models.Observation).filter(models.Observation.id == obs_id).first()
    if not obs:
        raise HTTPException(404, "Observation not found")
    _assert_obs_access(obs, user, write_roles=['SuperAdmin', 'Admin', 'HO', 'PSO', 'Observer', 'Contractor'])
    prev_status = obs.status
    # Only staff may reopen — a contractor can't undo a closure.
    reopening = prev_status == 'Closed' and body.status != 'Closed'
    if reopening and user.role == 'Contractor':
        raise HTTPException(403, "Only the SHE team can reopen a closed observation")
    obs.status = body.status
    obs.updated_at = datetime.now()
    if prev_status != 'Closed' and body.status == 'Closed' and obs.closed_at is None:
        obs.closed_at = datetime.now()
    if reopening:
        # Clear the closure so Overdue / KPIs treat it as open again.
        obs.closed_at = None
        cids = json.loads(obs.contractor_user_ids) if obs.contractor_user_ids else (
            [obs.contractor_user_id] if obs.contractor_user_id else []
        )
        for cid in cids:
            db.add(models.Notification(
                user_id=cid, observation_id=obs.id, obs_ref=obs.observation_id,
                message=f"Observation {obs.observation_id} was reopened by {user.name} — rectification is still required.",
                is_read=False,
            ))
    db.commit()

    if prev_status != body.status and body.status != 'Draft':
        event = "closed" if (prev_status != "Closed" and body.status == "Closed") else "status_change"
        threading.Thread(target=_fire_email_async, args=(obs.id, event), daemon=True).start()

    return {"success": True, "status": body.status}


@router.post("/{obs_id}/comments", status_code=201)
def add_comment(obs_id: int, body: CommentBody, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    obs = db.query(models.Observation).filter(models.Observation.id == obs_id).first()
    if not obs:
        raise HTTPException(404)
    _assert_obs_access(obs, user)  # all authenticated users with project access may comment
    c = models.ObservationComment(observation_id=obs_id, user_id=user.id, comment=body.comment)
    db.add(c)
    obs.updated_at = datetime.now()
    db.commit()
    db.refresh(c)
    return {"id": c.id}


@router.delete("/{obs_id}")
def delete_observation(obs_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    obs = db.query(models.Observation).filter(models.Observation.id == obs_id).first()
    if not obs:
        raise HTTPException(404)
    is_super_admin = user.role == "SuperAdmin"
    is_own_draft = obs.status == "Draft" and obs.created_by == user.id
    if not is_super_admin and not is_own_draft:
        raise HTTPException(403, "Only SuperAdmin can delete observations, or the creator can delete their own draft")
    db.delete(obs)
    db.commit()
    return {"success": True}


# ── Bulk import ──────────────────────────────────────────────────────────────

def _clean(val) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    return None if s.lower() in ('none', 'nil', '', 'n/a') else s


def _fmt_date(val) -> Optional[str]:
    if val is None:
        return None
    if hasattr(val, 'strftime'):
        return val.strftime('%Y-%m-%d')
    s = str(val).strip()
    if not s or s.lower() in ('none', 'nil'):
        return None
    for fmt in ('%d-%m-%Y', '%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.strptime(s, fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return None


def _fmt_time(val) -> Optional[str]:
    if val is None:
        return None
    if hasattr(val, 'strftime'):
        return val.strftime('%H:%M')
    s = str(val).strip()
    return s[:5] if s and s.lower() != 'none' else None


def _safe_int(val) -> Optional[int]:
    try:
        v = int(float(str(val)))
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def _find_project(db: Session, name: str) -> models.Project:
    """Case-insensitive exact match → fuzzy fallback (≥0.7) → auto-create."""
    project = db.query(models.Project).filter(
        models.Project.name.ilike(name)
    ).first()
    if project:
        return project
    all_projects = db.query(models.Project).all()
    name_map = {p.name.lower(): p for p in all_projects}
    matches = get_close_matches(name.lower(), name_map.keys(), n=1, cutoff=0.7)
    if matches:
        return name_map[matches[0]]
    new_project = models.Project(name=name.strip().upper())
    db.add(new_project)
    db.flush()
    return new_project


def _resolve_or_create_building(db: Session, name: str, project_id: int) -> models.Building:
    obj = db.query(models.Building).filter(
        models.Building.project_id == project_id,
        models.Building.name.ilike(name),
    ).first()
    if not obj:
        obj = models.Building(name=name, project_id=project_id)
        db.add(obj)
        db.flush()
    return obj


def _resolve_floor(db: Session, name: str, building_id: int):
    """Match an existing floor only — imports must NOT create new floors, otherwise the
    floor list gets polluted with free-text values from the observation sheets."""
    if not name or not building_id:
        return None
    return db.query(models.Floor).filter(
        models.Floor.building_id == building_id,
        models.Floor.name.ilike(name),
    ).first()


@router.post("/bulk-import")
async def bulk_import_observations(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    contents = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
    except Exception:
        raise HTTPException(400, "Invalid Excel file")

    if 'Observations' not in wb.sheetnames:
        raise HTTPException(400, "Sheet named 'Observations' not found")

    ws = wb['Observations']
    rows = list(ws.iter_rows(values_only=True))

    # Find the actual header row (contains "Observation ID" in col 0)
    header_idx = None
    for i, row in enumerate(rows):
        if row and str(row[0]).strip() == 'Observation ID':
            header_idx = i
            break
    if header_idx is None:
        raise HTTPException(400, "Could not find 'Observation ID' header row")

    created, skipped, errors = [], [], []

    for row in rows[header_idx + 1:]:
        if not row or not row[0]:
            continue
        obs_id = str(row[0]).strip()
        if not obs_id:
            continue

        # Skip duplicates
        if db.query(models.Observation).filter(models.Observation.observation_id == obs_id).first():
            skipped.append(f"{obs_id} — already exists")
            continue

        try:
            obs_date        = _fmt_date(row[1])
            obs_time        = _fmt_time(row[2])
            project_name    = _clean(row[3])
            building_name   = _clean(row[4])
            floor_name      = _clean(row[5])
            exact_location  = _clean(row[6])
            observer_name   = _clean(row[7])
            contractor_name = _clean(row[8])
            rectified_by    = _clean(row[9])
            core_concern_name      = _clean(row[11])
            specific_concern_name  = _clean(row[12])
            specific_concern_text  = _clean(row[13])
            possible_outcome       = _clean(row[14])
            severity         = _safe_int(row[15])
            probability      = _safe_int(row[16])
            risk_level_raw   = _clean(row[18])
            root_cat_name    = _clean(row[19])
            root_spec_name   = _clean(row[20])
            violation_name   = _clean(row[21])
            closing_date     = _fmt_date(row[22])
            status           = _clean(row[23]) or 'Open'

            # Project (required)
            if not project_name:
                errors.append(f"{obs_id}: missing project name")
                continue
            project = _find_project(db, project_name)

            # Building — auto-created if absent. Floor — matched only, never created:
            # unmatched floor text is folded into the location so no info is lost.
            building = _resolve_or_create_building(db, building_name, project.id) if building_name else None
            floor    = _resolve_floor(db, floor_name, building.id) if (floor_name and building) else None
            if floor_name and not floor:
                exact_location = " - ".join(p for p in [floor_name, exact_location] if p)

            # Contractor user — prefer project-scoped match
            contractor_user = None
            if contractor_name:
                contractor_user = (
                    db.query(models.User)
                    .join(models.UserProject, models.UserProject.user_id == models.User.id)
                    .filter(
                        models.User.role == 'Contractor',
                        models.User.name.ilike(contractor_name),
                        models.UserProject.project_id == project.id,
                    ).first()
                )
                if not contractor_user:
                    contractor_user = db.query(models.User).filter(
                        models.User.role == 'Contractor',
                        models.User.name.ilike(contractor_name),
                    ).first()

            # Core concern → specific concern
            core_concern = None
            if core_concern_name:
                core_concern = db.query(models.CoreConcern).filter(
                    models.CoreConcern.name.ilike(core_concern_name)
                ).first()

            specific_concern = None
            if specific_concern_name and core_concern:
                specific_concern = db.query(models.SpecificConcern).filter(
                    models.SpecificConcern.core_concern_id == core_concern.id,
                    models.SpecificConcern.name.ilike(specific_concern_name),
                ).first()

            # Root cause
            root_cat = None
            if root_cat_name:
                root_cat = db.query(models.RootCauseCategory).filter(
                    models.RootCauseCategory.name.ilike(root_cat_name)
                ).first()

            root_spec = None
            if root_spec_name and root_cat:
                root_spec = db.query(models.RootCauseSpecific).filter(
                    models.RootCauseSpecific.root_cause_category_id == root_cat.id,
                    models.RootCauseSpecific.name.ilike(root_spec_name),
                ).first()

            # Violation
            violation = None
            if violation_name:
                violation = db.query(models.Violation).filter(
                    models.Violation.name.ilike(violation_name)
                ).first()

            # Risk
            risk_factor = (severity * probability) if (severity and probability) else None
            risk_level  = None if (not risk_level_raw or risk_level_raw.upper() == 'NIL') else risk_level_raw

            # closed_at
            closed_at = None
            if status == 'Closed' and closing_date:
                try:
                    closed_at = datetime.strptime(closing_date, '%Y-%m-%d')
                except ValueError:
                    pass

            obs = models.Observation(
                observation_id=obs_id,
                project_id=project.id,
                building_id=building.id if building else None,
                floor_id=floor.id if floor else None,
                exact_location=exact_location,
                obs_date=obs_date,
                obs_time=obs_time,
                contractor_user_id=contractor_user.id if contractor_user else None,
                contractor_user_ids=json.dumps([contractor_user.id]) if contractor_user else None,
                to_be_rectified_by=rectified_by,
                observer_name=observer_name,
                core_concern_id=core_concern.id if core_concern else None,
                specific_concern_id=specific_concern.id if specific_concern else None,
                specific_concern_text=specific_concern_text,
                possible_outcome=possible_outcome,
                severity=severity,
                probability=probability,
                risk_factor=risk_factor,
                risk_level=risk_level,
                root_cause_category_id=root_cat.id if root_cat else None,
                root_cause_specific_id=root_spec.id if root_spec else None,
                violation_id=violation.id if violation else None,
                target_date_actual=closing_date,
                status=status,
                closed_at=closed_at,
                created_by=current_user.id,
            )
            db.add(obs)
            created.append(f"{obs_id} → {project.name}")

        except Exception as exc:
            db.rollback()
            errors.append(f"{obs_id}: {exc}")

    db.commit()
    return {
        "created_count": len(created),
        "skipped_count": len(skipped),
        "error_count": len(errors),
        "created": created,
        "skipped": skipped,
        "errors": errors,
    }
