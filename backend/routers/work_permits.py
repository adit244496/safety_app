from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Any
import json
import threading
import logging
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime
from database import get_db, SessionLocal
import models
from auth import get_current_user
from routers.observations import get_allowed_project_ids
from email_service import send_observation_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/work-permits", tags=["work-permits"])

CREATE_ROLES = {"Contractor", "SuperAdmin"}   # contractors submit permits; SuperAdmin may also create
APPROVER_ROLES = {"PIC", "PSO", "EIC"}
ADMIN_ROLES = {"SuperAdmin", "Admin"}

CLOSURE_OPTIONS = [
    "Work satisfactorily completed",
    "Work not finished this shift",
    "CHWP area and equipment released in proper condition for normal use",
    "CHWP conditions not met - CHWP cancelled. Job withheld",
]


# ── Schemas ──────────────────────────────────────────────────────────────────
class PermitBody(BaseModel):
    project_id: Optional[int] = None
    other_permits: Optional[str] = None
    receiver_name: Optional[str] = None
    receiver_designation: Optional[str] = None
    receiver_roles: Optional[List[str]] = None
    receiver_user_ids: Optional[List[int]] = None
    issued_date: Optional[str] = None
    work_location: Optional[str] = None
    area: Optional[str] = None
    starts_at: Optional[str] = None
    expires_at: Optional[str] = None
    work_description: Optional[str] = None
    pre_job_discussion: Optional[bool] = False
    hazard_categories: Optional[List[str]] = None
    precautions: Optional[Any] = None
    pic_user_id: Optional[int] = None
    pso_user_id: Optional[int] = None
    eic_user_id: Optional[int] = None
    submit: Optional[bool] = False   # True = submit for approval, False = save draft


class DeclineBody(BaseModel):
    reason: Optional[str] = None


class CancelBody(BaseModel):
    reason: Optional[str] = None


class ClosureRequestBody(BaseModel):
    closure_type: str
    note: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────────────────
def _load(raw, default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return default


def generate_permit_no(db: Session, project_id: Optional[int]) -> str:
    project = db.query(models.Project).filter(models.Project.id == project_id).first() if project_id else None
    prefix = "".join(c for c in (project.name if project else "CHWP") if c.isalnum()).upper()[:4] or "CHWP"
    date_str = datetime.now().strftime("%Y%m%d")
    count = db.query(models.WorkPermit).count()
    seq = count + 1
    while db.query(models.WorkPermit).filter(
        models.WorkPermit.permit_no == f"CHWP-{prefix}-{date_str}-{str(seq).zfill(4)}"
    ).first() is not None:
        seq += 1
    return f"CHWP-{prefix}-{date_str}-{str(seq).zfill(4)}"


def _append_history(p: models.WorkPermit, action: str, user: models.User, note: str = ""):
    hist = _load(p.history, [])
    hist.append({
        "action": action,
        "by": user.id,
        "name": user.name,
        "role": user.role,
        "at": datetime.now().isoformat(timespec="seconds"),
        "note": note or "",
    })
    p.history = json.dumps(hist)


def _u(user: Optional[models.User]) -> Optional[dict]:
    if not user:
        return None
    return {"id": user.id, "name": user.name, "role": user.role, "email": user.email}


def permit_to_dict(p: models.WorkPermit) -> dict:
    return {
        "id": p.id,
        "permit_no": p.permit_no,
        "project_id": p.project_id,
        "project_name": p.project.name if p.project else None,
        "other_permits": p.other_permits,
        "receiver_name": p.receiver_name,
        "receiver_designation": p.receiver_designation,
        "receiver_roles": _load(p.receiver_roles, []),
        "receiver_user_ids": _load(p.receiver_user_ids, []),
        "issued_date": p.issued_date,
        "work_location": p.work_location,
        "area": p.area,
        "starts_at": p.starts_at,
        "expires_at": p.expires_at,
        "work_description": p.work_description,
        "pre_job_discussion": bool(p.pre_job_discussion),
        "hazard_categories": _load(p.hazard_categories, []),
        "precautions": _load(p.precautions, {}),
        "pic_user_id": p.pic_user_id,
        "pso_user_id": p.pso_user_id,
        "eic_user_id": p.eic_user_id,
        "pic_user": _u(p.pic_user),
        "pso_user": _u(p.pso_user),
        "eic_user": _u(p.eic_user),
        "status": p.status,
        "approved_by": p.approved_by,
        "approver_name": p.approver.name if p.approver else None,
        "approver_role": p.approver_role,
        "approved_at": p.approved_at.isoformat() if p.approved_at else None,
        "decline_reason": p.decline_reason,
        "closure_type": p.closure_type,
        "closure_note": p.closure_note,
        "closure_requested_at": p.closure_requested_at.isoformat() if p.closure_requested_at else None,
        "closed_at": p.closed_at.isoformat() if p.closed_at else None,
        "cancel_reason": p.cancel_reason,
        "cancelled_at": p.cancelled_at.isoformat() if p.cancelled_at else None,
        "history": _load(p.history, []),
        "created_by": p.created_by,
        "created_by_name": p.creator.name if p.creator else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _is_assigned_approver(p: models.WorkPermit, user: models.User) -> bool:
    return user.id in [x for x in (p.pic_user_id, p.pso_user_id, p.eic_user_id) if x]


def _can_approve(p: models.WorkPermit, user: models.User) -> bool:
    return _is_assigned_approver(p, user) or user.role in ADMIN_ROLES


def _apply_body(p: models.WorkPermit, body: PermitBody, db: Session):
    p.project_id = body.project_id
    p.other_permits = body.other_permits
    uids = body.receiver_user_ids or []
    p.receiver_user_ids = json.dumps(uids) if uids else None
    # Receiver(s) are chosen among the assigned PIC/PSO/EIC — derive display name and
    # designation (their roles) from the selected user records.
    if uids:
        users = db.query(models.User).filter(models.User.id.in_(uids)).all()
        order = {uid: i for i, uid in enumerate(uids)}
        users.sort(key=lambda u: order.get(u.id, 0))
        p.receiver_name = ", ".join(u.name for u in users) or None
        derived_roles = list(dict.fromkeys(u.role for u in users))
        p.receiver_roles = json.dumps(derived_roles) if derived_roles else None
        p.receiver_designation = ", ".join(derived_roles) or None
    else:
        p.receiver_name = body.receiver_name
        roles = body.receiver_roles or []
        p.receiver_roles = json.dumps(roles) if roles else None
        p.receiver_designation = (", ".join(roles) if roles else body.receiver_designation) or None
    p.issued_date = body.issued_date
    p.work_location = body.work_location
    p.area = body.area
    p.starts_at = body.starts_at
    p.expires_at = body.expires_at
    p.work_description = body.work_description
    p.pre_job_discussion = bool(body.pre_job_discussion)
    p.hazard_categories = json.dumps(body.hazard_categories or [])
    p.precautions = json.dumps(body.precautions or {})
    p.pic_user_id = body.pic_user_id
    p.pso_user_id = body.pso_user_id
    p.eic_user_id = body.eic_user_id


# ── Email ────────────────────────────────────────────────────────────────────
def _permit_people(p: models.WorkPermit, db: Session):
    def usr(uid):
        return db.query(models.User).filter(models.User.id == uid).first() if uid else None
    return {
        "creator": usr(p.created_by),
        "pic": p.pic_user, "pso": p.pso_user, "eic": p.eic_user,
    }


def _build_permit_email(p: models.WorkPermit, event: str, actor_name: str = "") -> tuple:
    titles = {
        "submitted": ("Permit Awaiting Your Approval", "#2563eb"),
        "approved": ("Permit Approved", "#16a34a"),
        "declined": ("Permit Declined", "#dc2626"),
        "cancelled": ("Permit Cancelled", "#dc2626"),
        "closure_requested": ("Permit Closure Requested", "#d97706"),
        "closed": ("Permit Closed", "#6b7280"),
    }
    header, color = titles.get(event, ("Work Permit Notification", "#2563eb"))
    subject = f"[CHWP] {header} — {p.permit_no}"

    def row(label, value):
        return (f'<tr><td style="padding:8px 14px;color:#6b7280;font-size:13px;width:38%;">{label}</td>'
                f'<td style="padding:8px 14px;font-size:13px;font-weight:500;color:#111827;">{value or "—"}</td></tr>')

    extra = ""
    if event == "declined" and p.decline_reason:
        extra = row("Reason", p.decline_reason)
    if event == "cancelled" and p.cancel_reason:
        extra = row("Reason", p.cancel_reason)
    if event in ("closure_requested", "closed") and p.closure_type:
        extra = row("Closure", p.closure_type) + (row("Note", p.closure_note) if p.closure_note else "")
    if event in ("approved", "declined", "closed") and actor_name:
        extra += row("Action by", actor_name)

    html = f"""<!DOCTYPE html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;">
<div style="max-width:620px;margin:28px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <div style="background:{color};padding:24px 30px;">
    <p style="margin:0 0 6px;color:#e5edff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;">{header}</p>
    <h1 style="margin:0;color:#fff;font-size:20px;">{p.permit_no}</h1>
  </div>
  <table style="width:100%;border-collapse:collapse;">
    {row("Project", p.project.name if p.project else "")}
    {row("Work Location", p.work_location)}
    {row("Area", p.area)}
    {row("Description", p.work_description)}
    {row("Starts / Expires", f"{p.starts_at or '—'} → {p.expires_at or '—'}")}
    {row("Status", p.status)}
    {extra}
  </table>
  <div style="padding:14px 30px;background:#f9fafb;border-top:1px solid #e5e7eb;">
    <p style="margin:0;color:#9ca3af;font-size:12px;">Automated notification from the Safety App — Construction Hazardous Work Permit system.</p>
  </div>
</div></body></html>"""
    return subject, html


def _fire_permit_email(permit_id: int, event: str, actor_name: str = ""):
    db = SessionLocal()
    try:
        p = db.query(models.WorkPermit).filter(models.WorkPermit.id == permit_id).first()
        if not p:
            return
        smtp = db.query(models.SmtpSettings).first()
        if not smtp or not smtp.enabled:
            logger.info("Permit email skipped (SMTP disabled) for %s", p.permit_no)
            return
        people = _permit_people(p, db)
        creator = people["creator"]
        approvers = [people["pic"], people["pso"], people["eic"]]
        approver_emails = [u.email for u in approvers if u and u.email]
        creator_email = [creator.email] if creator and creator.email else []

        # "Issued To" folks — the receiver(s), chosen among the PIC/PSO/EIC
        receiver_ids = _load(p.receiver_user_ids, [])
        issued_to_users = db.query(models.User).filter(models.User.id.in_(receiver_ids)).all() if receiver_ids else []
        issued_to_emails = [u.email for u in issued_to_users if u and u.email]

        if event in ("submitted", "closure_requested"):
            # Notify only the Issued-To folks (fall back to all approvers if none set), cc the contractor
            to = issued_to_emails or approver_emails
            cc = creator_email
        elif event in ("approved", "closed", "cancelled"):
            to, cc = creator_email + approver_emails, []
        elif event == "declined":
            to, cc = creator_email, []
        else:
            to, cc = creator_email + approver_emails, []

        # de-dup
        to = list(dict.fromkeys([e for e in to if e]))
        cc = [e for e in dict.fromkeys(cc) if e and e not in to]
        if not to and not cc:
            return
        subject, html = _build_permit_email(p, event, actor_name)
        send_observation_email(smtp, to, cc, subject, html)
    except Exception as exc:
        logger.error("Permit email failed for %s: %s", permit_id, exc)
    finally:
        db.close()


def _notify(permit_id: int, event: str, actor_name: str = ""):
    threading.Thread(target=_fire_permit_email, args=(permit_id, event, actor_name), daemon=True).start()


def _inapp(db: Session, user_ids: list, permit: models.WorkPermit, message: str):
    for uid in user_ids:
        if not uid:
            continue
        db.add(models.Notification(user_id=uid, obs_ref=permit.permit_no, message=message, is_read=False))


# ── Lookups ──────────────────────────────────────────────────────────────────
@router.get("/approvers")
def list_approvers(
    role: str = Query(...),
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    """Users of a given approver role (PIC/PSO/EIC), scoped to a project when provided
    (includes users with no project assignment = all-projects access)."""
    if role not in APPROVER_ROLES:
        raise HTTPException(400, "Invalid approver role")
    q = db.query(models.User).filter(models.User.role == role)
    if project_id:
        assigned = db.query(models.UserProject.user_id).filter(models.UserProject.project_id == project_id).distinct()
        all_projects = (
            db.query(models.User.id)
            .filter(models.User.role == role,
                    ~models.User.id.in_(db.query(models.UserProject.user_id).distinct()))
        )
        q = q.filter(models.User.id.in_(assigned) | models.User.id.in_(all_projects))
    return [{"id": u.id, "name": u.name, "role": u.role, "email": u.email} for u in q.order_by(models.User.name).all()]


@router.get("/users")
def list_permit_users(
    role: List[str] = Query(default=[]),
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    """Users matching the given role(s), scoped to a project (includes users with
    no project assignment = all-projects access). Used for the permit 'Issued To' picker."""
    q = db.query(models.User)
    if role:
        q = q.filter(models.User.role.in_(role))
    if project_id:
        assigned = db.query(models.UserProject.user_id).filter(models.UserProject.project_id == project_id).distinct()
        unassigned = db.query(models.User.id).filter(~models.User.id.in_(db.query(models.UserProject.user_id).distinct()))
        q = q.filter(models.User.id.in_(assigned) | models.User.id.in_(unassigned))
    return [{"id": u.id, "name": u.name, "role": u.role, "email": u.email} for u in q.order_by(models.User.name).all()]


@router.get("/options")
def permit_options(_user: models.User = Depends(get_current_user)):
    return {"closure_options": CLOSURE_OPTIONS}


@router.get("/config")
def permit_config(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    """Admin-managed work types + precautions that drive the permit form."""
    q = db.query(models.PermitWorkType)
    if not include_inactive:
        q = q.filter(models.PermitWorkType.active == True)  # noqa: E712
    work_types = q.order_by(models.PermitWorkType.sort_order, models.PermitWorkType.id).all()
    return [
        {
            "id": wt.id, "code": wt.code, "name": wt.name, "description": wt.description,
            "has_gas_table": bool(wt.has_gas_table), "sort_order": wt.sort_order, "active": bool(wt.active),
            "precautions": [
                {"id": pr.id, "item_key": pr.item_key, "section": pr.section,
                 "label": pr.label, "input_type": pr.input_type, "sort_order": pr.sort_order}
                for pr in sorted(wt.precautions, key=lambda x: (x.sort_order, x.id))
            ],
        }
        for wt in work_types
    ]


# ── List / Get ───────────────────────────────────────────────────────────────
@router.get("/")
def list_permits(
    status: List[str] = Query(default=[]),
    project_id: List[int] = Query(default=[]),
    scope: Optional[str] = Query(None),   # 'mine' | 'to_approve'
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    q = db.query(models.WorkPermit)
    allowed = get_allowed_project_ids(user)

    if user.role not in ADMIN_ROLES:
        # non-admins: permits they created, are assigned to approve, or within their projects
        conds = [
            models.WorkPermit.created_by == user.id,
            models.WorkPermit.pic_user_id == user.id,
            models.WorkPermit.pso_user_id == user.id,
            models.WorkPermit.eic_user_id == user.id,
        ]
        if allowed:
            conds.append(models.WorkPermit.project_id.in_(allowed))
        q = q.filter(or_(*conds))
    elif allowed is not None:
        q = q.filter(models.WorkPermit.project_id.in_(allowed))

    if scope == "mine":
        q = q.filter(models.WorkPermit.created_by == user.id)
    elif scope == "to_approve":
        q = q.filter(or_(
            models.WorkPermit.pic_user_id == user.id,
            models.WorkPermit.pso_user_id == user.id,
            models.WorkPermit.eic_user_id == user.id,
        ))
    if status:
        q = q.filter(models.WorkPermit.status.in_(status))
    if project_id:
        q = q.filter(models.WorkPermit.project_id.in_(project_id))
    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            models.WorkPermit.permit_no.ilike(like),
            models.WorkPermit.work_location.ilike(like),
            models.WorkPermit.work_description.ilike(like),
            models.WorkPermit.receiver_name.ilike(like),
        ))

    rows = q.order_by(models.WorkPermit.created_at.desc()).all()
    return [permit_to_dict(p) for p in rows]


@router.get("/{permit_id}")
def get_permit(permit_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    p = db.query(models.WorkPermit).filter(models.WorkPermit.id == permit_id).first()
    if not p:
        raise HTTPException(404, "Permit not found")
    allowed = get_allowed_project_ids(user)
    if user.role not in ADMIN_ROLES:
        is_related = p.created_by == user.id or _is_assigned_approver(p, user)
        in_project = allowed is not None and p.project_id in allowed
        if not (is_related or (allowed is None) or in_project):
            raise HTTPException(403, "Access denied to this permit")
    return permit_to_dict(p)


# ── Create / Update ──────────────────────────────────────────────────────────
@router.post("/", status_code=201)
def create_permit(body: PermitBody, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    if user.role not in CREATE_ROLES:
        raise HTTPException(403, "Only contractors (or a SuperAdmin) can create work permits")

    p = models.WorkPermit(permit_no=generate_permit_no(db, body.project_id), created_by=user.id, status="Draft")
    _apply_body(p, body, db)
    if body.submit:
        if not (p.pic_user_id and p.pso_user_id and p.eic_user_id):
            raise HTTPException(400, "Assign PIC, PSO and EIC before submitting for approval")
        p.status = "Pending Approval"
        _append_history(p, "submitted", user)
    else:
        _append_history(p, "created", user)
    db.add(p)
    db.commit()
    db.refresh(p)

    if p.status == "Pending Approval":
        _inapp(db, [p.pic_user_id, p.pso_user_id, p.eic_user_id], p, f"Work permit {p.permit_no} awaiting your approval.")
        db.commit()
        _notify(p.id, "submitted")
    return permit_to_dict(p)


@router.put("/{permit_id}")
def update_permit(permit_id: int, body: PermitBody, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    p = db.query(models.WorkPermit).filter(models.WorkPermit.id == permit_id).first()
    if not p:
        raise HTTPException(404, "Permit not found")
    if p.created_by != user.id and user.role not in ADMIN_ROLES:
        raise HTTPException(403, "Only the creator can edit this permit")
    if p.status not in ("Draft", "Declined"):
        raise HTTPException(400, f"A permit in '{p.status}' state cannot be edited")

    _apply_body(p, body, db)
    if body.submit:
        if not (p.pic_user_id and p.pso_user_id and p.eic_user_id):
            raise HTTPException(400, "Assign PIC, PSO and EIC before submitting for approval")
        p.status = "Pending Approval"
        p.decline_reason = None
        _append_history(p, "submitted", user)
    p.updated_at = datetime.now()
    db.commit()
    db.refresh(p)

    if body.submit:
        _inapp(db, [p.pic_user_id, p.pso_user_id, p.eic_user_id], p, f"Work permit {p.permit_no} awaiting your approval.")
        db.commit()
        _notify(p.id, "submitted")
    return permit_to_dict(p)


# ── Workflow actions ─────────────────────────────────────────────────────────
@router.post("/{permit_id}/approve")
def approve_permit(permit_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    p = db.query(models.WorkPermit).filter(models.WorkPermit.id == permit_id).first()
    if not p:
        raise HTTPException(404, "Permit not found")
    if p.status != "Pending Approval":
        raise HTTPException(400, f"Permit is '{p.status}', not awaiting approval")
    if not _can_approve(p, user):
        raise HTTPException(403, "Only an assigned PIC / PSO / EIC can approve this permit")
    p.status = "Approved"
    p.approved_by = user.id
    p.approver_role = user.role
    p.approved_at = datetime.now()
    _append_history(p, "approved", user)
    _inapp(db, [p.created_by], p, f"Work permit {p.permit_no} was approved by {user.name} ({user.role}).")
    db.commit()
    _notify(p.id, "approved", user.name)
    return permit_to_dict(p)


@router.post("/{permit_id}/decline")
def decline_permit(permit_id: int, body: DeclineBody, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    p = db.query(models.WorkPermit).filter(models.WorkPermit.id == permit_id).first()
    if not p:
        raise HTTPException(404, "Permit not found")
    if p.status != "Pending Approval":
        raise HTTPException(400, f"Permit is '{p.status}', not awaiting approval")
    if not _can_approve(p, user):
        raise HTTPException(403, "Only an assigned PIC / PSO / EIC can decline this permit")
    p.status = "Declined"
    p.decline_reason = body.reason
    _append_history(p, "declined", user, body.reason or "")
    _inapp(db, [p.created_by], p, f"Work permit {p.permit_no} was declined by {user.name}.")
    db.commit()
    _notify(p.id, "declined", user.name)
    return permit_to_dict(p)


@router.post("/{permit_id}/cancel")
def cancel_permit(permit_id: int, body: CancelBody, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    p = db.query(models.WorkPermit).filter(models.WorkPermit.id == permit_id).first()
    if not p:
        raise HTTPException(404, "Permit not found")
    if p.status in ("Closed", "Cancelled"):
        raise HTTPException(400, f"Permit is already {p.status}")
    if not (p.created_by == user.id or _can_approve(p, user)):
        raise HTTPException(403, "You cannot cancel this permit")
    p.status = "Cancelled"
    p.cancel_reason = body.reason
    p.cancelled_by = user.id
    p.cancelled_at = datetime.now()
    _append_history(p, "cancelled", user, body.reason or "")
    _inapp(db, [p.created_by, p.pic_user_id, p.pso_user_id, p.eic_user_id], p, f"Work permit {p.permit_no} was cancelled by {user.name}.")
    db.commit()
    _notify(p.id, "cancelled", user.name)
    return permit_to_dict(p)


@router.post("/{permit_id}/request-closure")
def request_closure(permit_id: int, body: ClosureRequestBody, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    p = db.query(models.WorkPermit).filter(models.WorkPermit.id == permit_id).first()
    if not p:
        raise HTTPException(404, "Permit not found")
    if p.status != "Approved":
        raise HTTPException(400, "Only an approved permit can be closed")
    if not (p.created_by == user.id or user.role in ADMIN_ROLES):
        raise HTTPException(403, "Only the contractor can request closure")
    if body.closure_type not in CLOSURE_OPTIONS:
        raise HTTPException(400, "Invalid closure option")
    p.status = "Closure Requested"
    p.closure_type = body.closure_type
    p.closure_note = body.note
    p.closure_requested_by = user.id
    p.closure_requested_at = datetime.now()
    _append_history(p, "closure_requested", user, body.closure_type)
    _inapp(db, [p.pic_user_id, p.pso_user_id, p.eic_user_id], p, f"Closure requested for work permit {p.permit_no}.")
    db.commit()
    _notify(p.id, "closure_requested", user.name)
    return permit_to_dict(p)


@router.post("/{permit_id}/approve-closure")
def approve_closure(permit_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    p = db.query(models.WorkPermit).filter(models.WorkPermit.id == permit_id).first()
    if not p:
        raise HTTPException(404, "Permit not found")
    if p.status != "Closure Requested":
        raise HTTPException(400, "No closure request pending for this permit")
    if not _can_approve(p, user):
        raise HTTPException(403, "Only an assigned PIC / PSO / EIC can approve closure")
    p.status = "Closed"
    p.closure_approved_by = user.id
    p.closed_at = datetime.now()
    _append_history(p, "closed", user)
    _inapp(db, [p.created_by, p.pic_user_id, p.pso_user_id, p.eic_user_id], p, f"Work permit {p.permit_no} was closed.")
    db.commit()
    _notify(p.id, "closed", user.name)
    return permit_to_dict(p)


@router.delete("/{permit_id}")
def delete_permit(permit_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    p = db.query(models.WorkPermit).filter(models.WorkPermit.id == permit_id).first()
    if not p:
        raise HTTPException(404, "Permit not found")
    is_own_draft = p.created_by == user.id and p.status in ("Draft", "Declined")
    if not (user.role == "SuperAdmin" or is_own_draft):
        raise HTTPException(403, "Only a SuperAdmin, or the creator (draft/declined only), can delete a permit")
    db.delete(p)
    db.commit()
    return {"success": True}
