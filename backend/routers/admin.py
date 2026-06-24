from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
import models, re, smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from auth import get_current_user, require_admin, require_super_admin
from email_service import send_observation_email

router = APIRouter(prefix="/api/admin", tags=["admin"])


class NameBody(BaseModel):
    name: str


class CCBody(BaseModel):
    name: str
    category_id: Optional[int] = None


class SCBody(BaseModel):
    name: str
    core_concern_id: int


class RCSBody(BaseModel):
    name: str
    root_cause_category_id: int


class BuildingBody(BaseModel):
    name: str
    project_id: Optional[int] = None
    total_floors: Optional[int] = None


class FloorBody(BaseModel):
    name: str
    building_id: Optional[int] = None  # optional — link to building later


class ObserverBody(BaseModel):
    name: str
    project_id: int
    contact: Optional[str] = None


# ── Categories ──────────────────────────────────────────────────────────────
@router.get("/categories")
def get_categories(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(models.Category).order_by(models.Category.sort_order, models.Category.name).all()
    return [{"id": r.id, "name": r.name, "sort_order": r.sort_order} for r in rows]

@router.post("/categories", status_code=201)
def create_category(body: NameBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = models.Category(name=body.name.strip())
    db.add(r); db.commit(); db.refresh(r)
    return {"id": r.id, "name": r.name}

@router.put("/categories/{id}")
def update_category(id: int, body: NameBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(models.Category).filter(models.Category.id == id).first()
    if not r: raise HTTPException(404)
    r.name = body.name.strip(); db.commit()
    return {"success": True}

@router.delete("/categories/{id}")
def delete_category(id: int, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    r = db.query(models.Category).filter(models.Category.id == id).first()
    if not r: raise HTTPException(404)
    db.delete(r); db.commit()
    return {"success": True}


# ── Core Concerns ────────────────────────────────────────────────────────────
@router.get("/core-concerns")
def get_core_concerns(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(models.CoreConcern).order_by(models.CoreConcern.sort_order, models.CoreConcern.name).all()
    return [{"id": r.id, "name": r.name, "category_id": r.category_id,
             "category_name": r.category.name if r.category else None} for r in rows]

@router.post("/core-concerns", status_code=201)
def create_core_concern(body: CCBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = models.CoreConcern(name=body.name.strip(), category_id=body.category_id)
    db.add(r); db.commit(); db.refresh(r)
    return {"id": r.id, "name": r.name, "category_id": r.category_id}

@router.put("/core-concerns/{id}")
def update_core_concern(id: int, body: CCBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(models.CoreConcern).filter(models.CoreConcern.id == id).first()
    if not r: raise HTTPException(404)
    r.name = body.name.strip(); r.category_id = body.category_id; db.commit()
    return {"success": True}

@router.delete("/core-concerns/{id}")
def delete_core_concern(id: int, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    r = db.query(models.CoreConcern).filter(models.CoreConcern.id == id).first()
    if not r: raise HTTPException(404)
    sc_ids = [sc.id for sc in r.specific_concerns]
    if sc_ids:
        db.query(models.Observation).filter(models.Observation.specific_concern_id.in_(sc_ids)).update(
            {"specific_concern_id": None}, synchronize_session=False)
    db.query(models.Observation).filter(models.Observation.core_concern_id == id).update(
        {"core_concern_id": None}, synchronize_session=False)
    db.delete(r); db.commit()
    return {"success": True}


# ── Specific Concerns ────────────────────────────────────────────────────────
@router.get("/specific-concerns")
def get_specific_concerns(core_concern_id: Optional[int] = Query(None), db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = db.query(models.SpecificConcern)
    if core_concern_id:
        q = q.filter(models.SpecificConcern.core_concern_id == core_concern_id)
    rows = q.order_by(models.SpecificConcern.name).all()
    return [{"id": r.id, "name": r.name, "core_concern_id": r.core_concern_id,
             "core_concern_name": r.core_concern.name if r.core_concern else None} for r in rows]

@router.post("/specific-concerns", status_code=201)
def create_specific_concern(body: SCBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = models.SpecificConcern(name=body.name.strip(), core_concern_id=body.core_concern_id)
    db.add(r); db.commit(); db.refresh(r)
    return {"id": r.id, "name": r.name}

@router.put("/specific-concerns/{id}")
def update_specific_concern(id: int, body: SCBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(models.SpecificConcern).filter(models.SpecificConcern.id == id).first()
    if not r: raise HTTPException(404)
    r.name = body.name.strip(); r.core_concern_id = body.core_concern_id; db.commit()
    return {"success": True}

@router.delete("/specific-concerns/{id}")
def delete_specific_concern(id: int, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    r = db.query(models.SpecificConcern).filter(models.SpecificConcern.id == id).first()
    if not r: raise HTTPException(404)
    db.query(models.Observation).filter(models.Observation.specific_concern_id == id).update(
        {"specific_concern_id": None}, synchronize_session=False)
    db.delete(r); db.commit()
    return {"success": True}


# ── Violations ───────────────────────────────────────────────────────────────
@router.get("/violations")
def get_violations(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [{"id": r.id, "name": r.name} for r in db.query(models.Violation).order_by(models.Violation.name).all()]

@router.post("/violations", status_code=201)
def create_violation(body: NameBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = models.Violation(name=body.name.strip()); db.add(r); db.commit(); db.refresh(r)
    return {"id": r.id, "name": r.name}

@router.put("/violations/{id}")
def update_violation(id: int, body: NameBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(models.Violation).filter(models.Violation.id == id).first()
    if not r: raise HTTPException(404)
    r.name = body.name.strip(); db.commit()
    return {"success": True}

@router.delete("/violations/{id}")
def delete_violation(id: int, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    r = db.query(models.Violation).filter(models.Violation.id == id).first()
    if not r: raise HTTPException(404)
    db.query(models.Observation).filter(models.Observation.violation_id == id).update(
        {"violation_id": None}, synchronize_session=False)
    db.delete(r); db.commit()
    return {"success": True}


# ── Root Cause Categories ────────────────────────────────────────────────────
@router.get("/root-cause-categories")
def get_rcc(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [{"id": r.id, "name": r.name} for r in db.query(models.RootCauseCategory).order_by(models.RootCauseCategory.name).all()]

@router.post("/root-cause-categories", status_code=201)
def create_rcc(body: NameBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = models.RootCauseCategory(name=body.name.strip()); db.add(r); db.commit(); db.refresh(r)
    return {"id": r.id, "name": r.name}

@router.put("/root-cause-categories/{id}")
def update_rcc(id: int, body: NameBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(models.RootCauseCategory).filter(models.RootCauseCategory.id == id).first()
    if not r: raise HTTPException(404)
    r.name = body.name.strip(); db.commit()
    return {"success": True}

@router.delete("/root-cause-categories/{id}")
def delete_rcc(id: int, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    r = db.query(models.RootCauseCategory).filter(models.RootCauseCategory.id == id).first()
    if not r: raise HTTPException(404)
    rcs_ids = [s.id for s in r.specifics]
    if rcs_ids:
        db.query(models.Observation).filter(models.Observation.root_cause_specific_id.in_(rcs_ids)).update(
            {"root_cause_specific_id": None}, synchronize_session=False)
    db.query(models.Observation).filter(models.Observation.root_cause_category_id == id).update(
        {"root_cause_category_id": None}, synchronize_session=False)
    db.delete(r); db.commit()
    return {"success": True}


# ── Root Cause Specifics ─────────────────────────────────────────────────────
@router.get("/root-cause-specifics")
def get_rcs(root_cause_category_id: Optional[int] = Query(None), db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = db.query(models.RootCauseSpecific)
    if root_cause_category_id:
        q = q.filter(models.RootCauseSpecific.root_cause_category_id == root_cause_category_id)
    rows = q.order_by(models.RootCauseSpecific.name).all()
    return [{"id": r.id, "name": r.name, "root_cause_category_id": r.root_cause_category_id,
             "category_name": r.category.name if r.category else None} for r in rows]

@router.post("/root-cause-specifics", status_code=201)
def create_rcs(body: RCSBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = models.RootCauseSpecific(name=body.name.strip(), root_cause_category_id=body.root_cause_category_id)
    db.add(r); db.commit(); db.refresh(r)
    return {"id": r.id, "name": r.name}

@router.put("/root-cause-specifics/{id}")
def update_rcs(id: int, body: RCSBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(models.RootCauseSpecific).filter(models.RootCauseSpecific.id == id).first()
    if not r: raise HTTPException(404)
    r.name = body.name.strip(); r.root_cause_category_id = body.root_cause_category_id; db.commit()
    return {"success": True}

@router.delete("/root-cause-specifics/{id}")
def delete_rcs(id: int, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    r = db.query(models.RootCauseSpecific).filter(models.RootCauseSpecific.id == id).first()
    if not r: raise HTTPException(404)
    db.query(models.Observation).filter(models.Observation.root_cause_specific_id == id).update(
        {"root_cause_specific_id": None}, synchronize_session=False)
    db.delete(r); db.commit()
    return {"success": True}


# ── Possible Outcomes ────────────────────────────────────────────────────────
@router.get("/possible-outcomes")
def get_outcomes(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [{"id": r.id, "name": r.name} for r in db.query(models.PossibleOutcome).order_by(models.PossibleOutcome.name).all()]

@router.post("/possible-outcomes", status_code=201)
def create_outcome(body: NameBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = models.PossibleOutcome(name=body.name.strip()); db.add(r); db.commit(); db.refresh(r)
    return {"id": r.id, "name": r.name}

@router.put("/possible-outcomes/{id}")
def update_outcome(id: int, body: NameBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(models.PossibleOutcome).filter(models.PossibleOutcome.id == id).first()
    if not r: raise HTTPException(404)
    r.name = body.name.strip(); db.commit()
    return {"success": True}

@router.delete("/possible-outcomes/{id}")
def delete_outcome(id: int, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    r = db.query(models.PossibleOutcome).filter(models.PossibleOutcome.id == id).first()
    if not r: raise HTTPException(404)
    db.delete(r); db.commit()
    return {"success": True}


# ── Target Dates ─────────────────────────────────────────────────────────────
@router.get("/target-dates")
def get_target_dates(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [{"id": r.id, "name": r.name} for r in db.query(models.TargetDate).order_by(models.TargetDate.sort_order).all()]

@router.post("/target-dates", status_code=201)
def create_target_date(body: NameBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = models.TargetDate(name=body.name.strip()); db.add(r); db.commit(); db.refresh(r)
    return {"id": r.id, "name": r.name}

@router.put("/target-dates/{id}")
def update_target_date(id: int, body: NameBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(models.TargetDate).filter(models.TargetDate.id == id).first()
    if not r: raise HTTPException(404)
    r.name = body.name.strip(); db.commit()
    return {"success": True}

@router.delete("/target-dates/{id}")
def delete_target_date(id: int, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    r = db.query(models.TargetDate).filter(models.TargetDate.id == id).first()
    if not r: raise HTTPException(404)
    db.query(models.Observation).filter(models.Observation.target_date_id == id).update(
        {"target_date_id": None}, synchronize_session=False)
    db.delete(r); db.commit()
    return {"success": True}


# ── Buildings ────────────────────────────────────────────────────────────────
@router.get("/buildings")
def get_buildings(project_id: Optional[int] = Query(None), db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = db.query(models.Building)
    if project_id:
        q = q.filter(models.Building.project_id == project_id)
    rows = q.order_by(models.Building.name).all()
    def _max_floor_num(floors):
        nums = [int(m.group(1)) for f in floors
                for m in [re.match(r'^floor\s+(\d+)$', f.name.strip().lower())] if m]
        return max(nums) if nums else 0

    return [{"id": r.id, "name": r.name, "project_id": r.project_id,
             "project_name": r.project.name if r.project else None,
             "floor_count": _max_floor_num(r.floors)} for r in rows]

@router.post("/buildings", status_code=201)
def create_building(body: BuildingBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = models.Building(name=body.name.strip(), project_id=body.project_id)
    db.add(r); db.flush()
    if body.total_floors and body.total_floors > 0:
        for i in range(1, body.total_floors + 1):
            db.add(models.Floor(name=f"Floor {i}", building_id=r.id))
    db.commit(); db.refresh(r)
    return {"id": r.id, "name": r.name, "project_id": r.project_id}

@router.put("/buildings/{id}")
def update_building(id: int, body: BuildingBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(models.Building).filter(models.Building.id == id).first()
    if not r: raise HTTPException(404)
    r.name = body.name.strip(); r.project_id = body.project_id

    if body.total_floors is not None and body.total_floors >= 0:
        new_total = body.total_floors
        all_floors = db.query(models.Floor).filter(models.Floor.building_id == id).all()

        # Map: floor number → Floor row (only for "Floor N" pattern)
        numbered = {}
        for f in all_floors:
            m = re.match(r'^floor\s+(\d+)$', f.name.strip().lower())
            if m:
                numbered[int(m.group(1))] = f

        # Add any missing Floor 1 … Floor N
        for i in range(1, new_total + 1):
            if i not in numbered:
                db.add(models.Floor(name=f"Floor {i}", building_id=id))

        # Remove Floor X where X > new_total, only if unreferenced
        for num in sorted(numbered.keys(), reverse=True):
            if num > new_total:
                floor = numbered[num]
                has_obs = db.query(models.Observation).filter(models.Observation.floor_id == floor.id).first()
                if not has_obs:
                    db.delete(floor)

        # Remove ordinal floors (e.g. "3rd") whose number falls within 1..new_total
        # (superseded by the canonical "Floor N" that now exists)
        for f in all_floors:
            m = re.match(r'^(\d+)(st|nd|rd|th)$', f.name.strip().lower())
            if m:
                num = int(m.group(1))
                if 1 <= num <= new_total:
                    has_obs = db.query(models.Observation).filter(models.Observation.floor_id == f.id).first()
                    if not has_obs:
                        db.delete(f)

    db.commit()
    return {"success": True}

@router.delete("/buildings/{id}")
def delete_building(id: int, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    r = db.query(models.Building).filter(models.Building.id == id).first()
    if not r: raise HTTPException(404)
    floor_ids = [f.id for f in r.floors]
    if floor_ids:
        db.query(models.Observation).filter(models.Observation.floor_id.in_(floor_ids)).update(
            {"floor_id": None}, synchronize_session=False)
    db.query(models.Observation).filter(models.Observation.building_id == id).update(
        {"building_id": None}, synchronize_session=False)
    db.delete(r); db.commit()
    return {"success": True}


# ── Floors ───────────────────────────────────────────────────────────────────
@router.get("/floors")
def get_floors(building_id: Optional[int] = Query(None), db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = db.query(models.Floor)
    if building_id:
        q = q.filter(models.Floor.building_id == building_id)
    rows = q.order_by(models.Floor.name).all()
    return [{"id": r.id, "name": r.name, "building_id": r.building_id,
             "building_name": r.building.name if r.building else None} for r in rows]

@router.post("/floors", status_code=201)
def create_floor(body: FloorBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = models.Floor(name=body.name.strip(), building_id=body.building_id)
    db.add(r); db.commit(); db.refresh(r)
    return {"id": r.id, "name": r.name, "building_id": r.building_id}

@router.put("/floors/{id}")
def update_floor(id: int, body: FloorBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(models.Floor).filter(models.Floor.id == id).first()
    if not r: raise HTTPException(404)
    r.name = body.name.strip(); r.building_id = body.building_id; db.commit()
    return {"success": True}

@router.delete("/floors/{id}")
def delete_floor(id: int, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    r = db.query(models.Floor).filter(models.Floor.id == id).first()
    if not r: raise HTTPException(404)
    db.query(models.Observation).filter(models.Observation.floor_id == id).update(
        {"floor_id": None}, synchronize_session=False)
    db.delete(r); db.commit()
    return {"success": True}


# ── Observers ────────────────────────────────────────────────────────────────
@router.get("/observers")
def get_observers(project_id: Optional[int] = Query(None), db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = db.query(models.Observer)
    if project_id:
        q = q.filter(models.Observer.project_id == project_id)
    rows = q.order_by(models.Observer.name).all()
    return [{"id": r.id, "name": r.name, "contact": r.contact, "project_id": r.project_id,
             "project_name": r.project.name if r.project else None} for r in rows]

@router.post("/observers", status_code=201)
def create_observer(body: ObserverBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = models.Observer(name=body.name.strip(), project_id=body.project_id, contact=body.contact)
    db.add(r); db.commit(); db.refresh(r)
    return {"id": r.id, "name": r.name}

@router.put("/observers/{id}")
def update_observer(id: int, body: ObserverBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(models.Observer).filter(models.Observer.id == id).first()
    if not r: raise HTTPException(404)
    r.name = body.name.strip(); r.project_id = body.project_id; r.contact = body.contact; db.commit()
    return {"success": True}

@router.delete("/observers/{id}")
def delete_observer(id: int, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    r = db.query(models.Observer).filter(models.Observer.id == id).first()
    if not r: raise HTTPException(404)
    db.delete(r); db.commit()
    return {"success": True}


# ── SMTP Settings ────────────────────────────────────────────────────────────

class SmtpBody(BaseModel):
    smtp_host: str
    smtp_port: int = 587
    smtp_username: str
    smtp_password: str
    smtp_use_tls: bool = True
    from_email: str
    from_name: str = "Safety Observation System"
    enabled: bool = False


def _get_or_create_smtp(db: Session) -> models.SmtpSettings:
    settings = db.query(models.SmtpSettings).first()
    if not settings:
        settings = models.SmtpSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/smtp-settings")
def get_smtp_settings(db: Session = Depends(get_db), _=Depends(require_admin)):
    s = _get_or_create_smtp(db)
    return {
        "smtp_host": s.smtp_host,
        "smtp_port": s.smtp_port,
        "smtp_username": s.smtp_username,
        "smtp_password": "",  # never expose password
        "smtp_use_tls": s.smtp_use_tls,
        "from_email": s.from_email,
        "from_name": s.from_name,
        "enabled": s.enabled,
    }


@router.put("/smtp-settings")
def update_smtp_settings(body: SmtpBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    s = _get_or_create_smtp(db)
    s.smtp_host = body.smtp_host.strip()
    s.smtp_port = body.smtp_port
    s.smtp_username = body.smtp_username.strip()
    if body.smtp_password:  # only update if a new password is provided
        s.smtp_password = body.smtp_password
    s.smtp_use_tls = body.smtp_use_tls
    s.from_email = body.from_email.strip()
    s.from_name = body.from_name.strip()
    s.enabled = body.enabled
    db.commit()
    return {"success": True}


# ── Severity Labels ──────────────────────────────────────────────────────────
class RiskLabelBody(BaseModel):
    label: str

@router.get("/severity-labels")
def get_severity_labels(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(models.SeverityLabel).order_by(models.SeverityLabel.level).all()
    return [{"id": r.id, "level": r.level, "label": r.label} for r in rows]

@router.put("/severity-labels/{level}")
def upsert_severity_label(level: int, body: RiskLabelBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    if level < 1 or level > 5:
        raise HTTPException(400, "Level must be 1–5")
    row = db.query(models.SeverityLabel).filter(models.SeverityLabel.level == level).first()
    if row:
        row.label = body.label.strip()
    else:
        row = models.SeverityLabel(level=level, label=body.label.strip())
        db.add(row)
    db.commit(); db.refresh(row)
    return {"id": row.id, "level": row.level, "label": row.label}


# ── Probability Labels ────────────────────────────────────────────────────────
@router.get("/probability-labels")
def get_probability_labels(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(models.ProbabilityLabel).order_by(models.ProbabilityLabel.level).all()
    return [{"id": r.id, "level": r.level, "label": r.label} for r in rows]

@router.put("/probability-labels/{level}")
def upsert_probability_label(level: int, body: RiskLabelBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    if level < 1 or level > 5:
        raise HTTPException(400, "Level must be 1–5")
    row = db.query(models.ProbabilityLabel).filter(models.ProbabilityLabel.level == level).first()
    if row:
        row.label = body.label.strip()
    else:
        row = models.ProbabilityLabel(level=level, label=body.label.strip())
        db.add(row)
    db.commit(); db.refresh(row)
    return {"id": row.id, "level": row.level, "label": row.label}


@router.post("/smtp-settings/test")
def test_smtp(db: Session = Depends(get_db), current=Depends(require_admin)):
    s = _get_or_create_smtp(db)
    if not s.smtp_host or not s.smtp_username:
        raise HTTPException(400, "SMTP settings incomplete — save host and username first.")
    if not s.smtp_password:
        raise HTTPException(400, "No password saved — re-enter and save your password, then test again.")

    try:
        if s.smtp_use_tls:
            server = smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15)
            server.ehlo()
            server.starttls()
            server.ehlo()
        else:
            server = smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, timeout=15)
        server.login(s.smtp_username, s.smtp_password)

        msg = MIMEMultipart("alternative")
        msg["Subject"] = "[Safety] SMTP Test Email"
        msg["From"] = f"{s.from_name} <{s.from_email}>"
        msg["To"] = current.email
        msg.attach(MIMEText(
            "<p>This is a test email from the Safety Observation System.</p>",
            "html"
        ))
        server.sendmail(s.from_email, [current.email], msg.as_string())
        server.quit()
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(
            400,
            "Authentication failed — wrong username or password. "
            "For Gmail, generate an App Password (Account → Security → 2FA → App Passwords)."
        )
    except (smtplib.SMTPConnectError, OSError, TimeoutError):
        raise HTTPException(400, f"Cannot connect to {s.smtp_host}:{s.smtp_port} — verify host and port.")
    except smtplib.SMTPException as exc:
        raise HTTPException(400, f"SMTP error: {exc}")
    except Exception as exc:
        raise HTTPException(400, str(exc))

    return {"success": True, "sent_to": current.email}
