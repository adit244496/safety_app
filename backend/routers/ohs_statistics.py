import json
from datetime import datetime
from typing import Optional, List, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

import re
from database import get_db
import models
from auth import get_current_user, require_admin
from routers.observations import get_allowed_project_ids

router = APIRouter(prefix="/api/ohs-statistics", tags=["ohs-statistics"])

# Roles allowed to create / edit monthly OH&S statistics.
WRITE_ROLES = ["SuperAdmin", "Admin", "HO", "PSO"]
OHS_SECTIONS = ("section_a", "general_summary", "activities")


def _slugify(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", (label or "").lower()).strip("_")
    return (s or "item")[:40]


def _form_item_dict(it: models.OhsFormItem) -> dict:
    return {"id": it.id, "section": it.section, "item_key": it.item_key,
            "label": it.label, "sort_order": it.sort_order, "active": bool(it.active)}


@router.get("/form-config")
def form_config(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    """Active OH&S form rows grouped by section (for the form & report)."""
    rows = (db.query(models.OhsFormItem).filter(models.OhsFormItem.active == True)  # noqa: E712
            .order_by(models.OhsFormItem.sort_order, models.OhsFormItem.id).all())
    out = {s: [] for s in OHS_SECTIONS}
    for it in rows:
        out.setdefault(it.section, []).append({"item_key": it.item_key, "label": it.label})
    return out


@router.get("/form-items")
def list_form_items(db: Session = Depends(get_db), _=Depends(require_admin)):
    rows = db.query(models.OhsFormItem).order_by(models.OhsFormItem.section, models.OhsFormItem.sort_order, models.OhsFormItem.id).all()
    return [_form_item_dict(it) for it in rows]


class FormItemBody(BaseModel):
    section: str
    label: str


class FormItemUpdate(BaseModel):
    label: Optional[str] = None
    active: Optional[bool] = None


class ReorderBody(BaseModel):
    ids: List[int]


@router.post("/form-items", status_code=201)
def create_form_item(body: FormItemBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    if body.section not in OHS_SECTIONS:
        raise HTTPException(400, "Invalid section")
    if not body.label.strip():
        raise HTTPException(400, "Label is required")
    base = _slugify(body.label)
    key = base
    n = 1
    existing = {k[0] for k in db.query(models.OhsFormItem.item_key).all()}
    while key in existing:
        n += 1
        key = f"{base}_{n}"
    max_order = db.query(models.OhsFormItem).filter(models.OhsFormItem.section == body.section).count()
    it = models.OhsFormItem(section=body.section, item_key=key, label=body.label.strip(), sort_order=max_order, active=True)
    db.add(it)
    db.commit()
    db.refresh(it)
    return _form_item_dict(it)


@router.put("/form-items/{item_id}")
def update_form_item(item_id: int, body: FormItemUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    it = db.query(models.OhsFormItem).filter(models.OhsFormItem.id == item_id).first()
    if not it:
        raise HTTPException(404, "Item not found")
    if body.label is not None:
        if not body.label.strip():
            raise HTTPException(400, "Label cannot be empty")
        it.label = body.label.strip()
    if body.active is not None:
        it.active = body.active
    db.commit()
    db.refresh(it)
    return _form_item_dict(it)


@router.put("/form-items/reorder")
def reorder_form_items(body: ReorderBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    for order, iid in enumerate(body.ids):
        it = db.query(models.OhsFormItem).filter(models.OhsFormItem.id == iid).first()
        if it:
            it.sort_order = order
    db.commit()
    return {"success": True}


@router.delete("/form-items/{item_id}")
def delete_form_item(item_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    it = db.query(models.OhsFormItem).filter(models.OhsFormItem.id == item_id).first()
    if not it:
        raise HTTPException(404, "Item not found")
    db.delete(it)
    db.commit()
    return {"success": True}


class OhsPayload(BaseModel):
    project_id: int
    month: int
    year: int
    company: Optional[str] = None
    expected_duration: Optional[str] = None
    current_age: Optional[str] = None
    contractors_present: Optional[str] = None
    section_a: Optional[Any] = None          # dict keyed by item_key (legacy: list)
    lti: Optional[List[Any]] = None
    general_summary: Optional[Any] = None    # dict keyed by item_key (legacy: list)
    activities: Optional[Any] = None         # dict keyed by item_key (legacy: list)
    violations: Optional[List[Any]] = None
    safety_coordinator: Optional[str] = None
    site_incharge: Optional[str] = None


def _loads(raw: Optional[str], default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return default


def ohs_to_dict(m: models.OhsStatistics) -> dict:
    return {
        "id": m.id,
        "project_id": m.project_id,
        "project_name": m.project.name if m.project else None,
        "month": m.month,
        "year": m.year,
        "company": m.company,
        "expected_duration": m.expected_duration,
        "current_age": m.current_age,
        "contractors_present": m.contractors_present,
        "section_a": _loads(m.section_a, []),
        "lti": _loads(m.lti, []),
        "general_summary": _loads(m.general_summary, []),
        "activities": _loads(m.activities, []),
        "violations": _loads(m.violations, []),
        "safety_coordinator": m.safety_coordinator,
        "site_incharge": m.site_incharge,
        "updated_by": m.updated_by,
        "updated_by_name": m.updater.name if m.updater else None,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }


def _assert_project_access(user: models.User, project_id: int):
    allowed = get_allowed_project_ids(user)
    if allowed is not None and project_id not in allowed:
        raise HTTPException(403, "Access denied to this project")


def _num(v) -> float:
    """Lenient numeric parse: '1,200' / ' 48 ' → float; blanks/text → 0."""
    try:
        return float(str(v).replace(",", "").strip())
    except (ValueError, TypeError):
        return 0.0


def _accumulate_for_month(raw, bucket: dict):
    """Add each row's 'for_month' into bucket keyed by item_key.
    Supports the new dict format and legacy index-based lists."""
    data = _loads(raw, {})
    if isinstance(data, dict):
        for key, item in data.items():
            if isinstance(item, dict):
                bucket[key] = bucket.get(key, 0.0) + _num(item.get("for_month"))
    elif isinstance(data, list):
        for i, item in enumerate(data):
            if isinstance(item, dict):
                bucket[str(i)] = bucket.get(str(i), 0.0) + _num(item.get("for_month"))


@router.get("/totals")
def get_totals(
    project_id: List[int] = Query(default=[]),
    year: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),   # YYYY-MM-DD — months overlapping the range count
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Sum of every 'For the month' value across all saved OH&S records (project-to-date),
    for the dashboard activity cards. Optionally scoped to projects / a year / a date range
    (a month is included when it overlaps the range)."""
    allowed = get_allowed_project_ids(user)
    q = db.query(models.OhsStatistics)
    if allowed is not None:
        if not allowed:
            return {"general_summary": [], "activities": [], "records": 0}
        q = q.filter(models.OhsStatistics.project_id.in_(allowed))
    if project_id:
        q = q.filter(models.OhsStatistics.project_id.in_(project_id))
    if year:
        q = q.filter(models.OhsStatistics.year == year)
    rows = q.all()
    if date_from or date_to:
        lo = date_from[:7] if date_from else "0000-00"
        hi = date_to[:7] if date_to else "9999-99"
        rows = [r for r in rows if lo <= f"{r.year:04d}-{r.month:02d}" <= hi]

    gen: dict = {}
    act: dict = {}

    for r in rows:
        _accumulate_for_month(r.general_summary, gen)
        _accumulate_for_month(r.activities, act)

    return {
        "general_summary": {k: round(v, 2) for k, v in gen.items()},
        "activities": {k: round(v, 2) for k, v in act.items()},
        "records": len(rows),
    }


def _for_month_map(raw) -> dict:
    out: dict = {}
    _accumulate_for_month(raw, out)
    return out


@router.get("/series")
def get_series(
    project_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Month-by-month figures for the OH&S dashboard (compare month / quarter / year,
    current month vs cumulative). One entry per saved month, summed across the selected
    projects (all accessible projects when none are given)."""
    allowed = get_allowed_project_ids(user)
    q = db.query(models.OhsStatistics)
    if allowed is not None:
        if not allowed:
            return []
        q = q.filter(models.OhsStatistics.project_id.in_(allowed))
    if project_id:
        q = q.filter(models.OhsStatistics.project_id.in_(project_id))

    months: dict = {}
    for r in q.all():
        m = months.setdefault((r.year, r.month), {
            "year": r.year, "month": r.month, "general_summary": {}, "activities": {},
            "man_hours": 0.0, "avg_persons": 0.0, "lti": 0, "man_days_lost": 0.0, "violations": 0,
        })
        for section in ("general_summary", "activities"):
            for k, v in _for_month_map(getattr(r, section)).items():
                m[section][k] = m[section].get(k, 0.0) + v
        sec_a = _loads(r.section_a, {})
        for row in (sec_a.values() if isinstance(sec_a, dict) else sec_a):
            if isinstance(row, dict):
                m["man_hours"] += _num(row.get("man_hours"))
                m["avg_persons"] += _num(row.get("avg_persons"))   # manpower across projects adds up
        lti = [x for x in _loads(r.lti, []) if isinstance(x, dict) and any(str(v).strip() for v in x.values())]
        m["lti"] += len(lti)
        m["man_days_lost"] += sum(_num(x.get("man_days_lost")) for x in lti)
        m["violations"] += len([x for x in _loads(r.violations, []) if isinstance(x, dict) and any(str(v).strip() for v in x.values())])
    return [months[k] for k in sorted(months)]


@router.get("/cumulative")
def get_cumulative(
    project_id: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Sum of each 'For the month' value across all SAVED periods strictly BEFORE the
    given period (project-to-date). The client adds the current month's live value to
    produce the inclusive cumulative figure shown in the form & report."""
    _assert_project_access(user, project_id)
    rows = (
        db.query(models.OhsStatistics)
        .filter(models.OhsStatistics.project_id == project_id)
        .all()
    )
    gen: dict = {}
    act: dict = {}
    for r in rows:
        if r.year < year or (r.year == year and r.month < month):
            _accumulate_for_month(r.general_summary, gen)
            _accumulate_for_month(r.activities, act)

    return {
        "general_summary": {k: round(v, 4) for k, v in gen.items()},
        "activities": {k: round(v, 4) for k, v in act.items()},
    }


@router.get("/periods")
def list_periods(
    project_id: int = Query(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Months/years that already have a saved record for this project (newest first)."""
    _assert_project_access(user, project_id)
    rows = (
        db.query(models.OhsStatistics)
        .filter(models.OhsStatistics.project_id == project_id)
        .order_by(models.OhsStatistics.year.desc(), models.OhsStatistics.month.desc())
        .all()
    )
    return [{"month": r.month, "year": r.year, "updated_at": r.updated_at.isoformat() if r.updated_at else None} for r in rows]


@router.get("/")
def get_statistics(
    project_id: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _assert_project_access(user, project_id)
    m = (
        db.query(models.OhsStatistics)
        .filter(
            models.OhsStatistics.project_id == project_id,
            models.OhsStatistics.month == month,
            models.OhsStatistics.year == year,
        )
        .first()
    )
    if not m:
        return None
    return ohs_to_dict(m)


@router.put("/")
def upsert_statistics(body: OhsPayload, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    if user.role not in WRITE_ROLES:
        raise HTTPException(403, "Your role cannot edit OH&S statistics")
    if not (1 <= body.month <= 12):
        raise HTTPException(400, "Month must be between 1 and 12")
    _assert_project_access(user, body.project_id)

    m = (
        db.query(models.OhsStatistics)
        .filter(
            models.OhsStatistics.project_id == body.project_id,
            models.OhsStatistics.month == body.month,
            models.OhsStatistics.year == body.year,
        )
        .first()
    )
    if not m:
        m = models.OhsStatistics(
            project_id=body.project_id, month=body.month, year=body.year, created_by=user.id
        )
        db.add(m)

    m.company = body.company
    m.expected_duration = body.expected_duration
    m.current_age = body.current_age
    m.contractors_present = body.contractors_present
    m.section_a = json.dumps(body.section_a) if body.section_a is not None else None
    m.lti = json.dumps(body.lti) if body.lti is not None else None
    m.general_summary = json.dumps(body.general_summary) if body.general_summary is not None else None
    m.activities = json.dumps(body.activities) if body.activities is not None else None
    m.violations = json.dumps(body.violations) if body.violations is not None else None
    m.safety_coordinator = body.safety_coordinator
    m.site_incharge = body.site_incharge
    m.updated_by = user.id
    m.updated_at = datetime.now()

    db.commit()
    db.refresh(m)
    return ohs_to_dict(m)
