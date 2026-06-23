from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from sqlalchemy.orm import Session
from database import get_db
import models
import json
import io
import re
import openpyxl
from auth import get_current_user, require_admin, require_super_admin, hash_password

router = APIRouter(prefix="/api/users", tags=["users"])

VALID_ROLES = {"SuperAdmin", "Admin", "PIC", "EIC", "HO", "PSO", "Contractor", "Observer"}


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str
    mobile: Optional[str] = None
    project_ids: List[int] = []


class UserUpdate(BaseModel):
    name: str
    email: str
    password: Optional[str] = None
    role: str
    mobile: Optional[str] = None
    project_ids: List[int] = []


def _check_uniqueness(db: Session, role: str, name: str, email: str, exclude_id: int = None):
    """
    Contractor: (name, email) pair must be unique.
    All other roles: email alone must be unique.
    """
    q = db.query(models.User)
    if exclude_id:
        q = q.filter(models.User.id != exclude_id)

    if role == "Contractor":
        conflict = q.filter(
            models.User.name == name,
            models.User.email == email,
        ).first()
        if conflict:
            raise HTTPException(409, "A contractor with this company name and email already exists")
    else:
        conflict = q.filter(models.User.email == email).first()
        if conflict:
            raise HTTPException(409, "Email already in use")


def user_to_dict(user: models.User):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "mobile": user.mobile or "",
        "role": user.role,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "projects": [{"id": up.project_id, "name": up.project.name} for up in user.user_projects],
    }


EIC_ROLES = {"EIC"}

@router.get("/eic")
def list_eic_users(
    project_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    """Return EIC users assigned to the given project(s)."""
    q = db.query(models.User).filter(models.User.role.in_(EIC_ROLES))
    if project_id:
        assigned_to_project = (
            db.query(models.UserProject.user_id)
            .filter(models.UserProject.project_id.in_(project_id))
            .distinct()
        )
        q = q.filter(models.User.id.in_(assigned_to_project))
    return [
        {"id": u.id, "name": u.name, "role": u.role}
        for u in q.order_by(models.User.name).all()
    ]


@router.get("/contractors")
def list_contractors(
    project_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    q = db.query(models.User).filter(models.User.role == "Contractor")
    if project_id:
        # Include contractors explicitly assigned to the project OR with no assignments (= all-project access)
        assigned_to_project = (
            db.query(models.UserProject.user_id)
            .filter(models.UserProject.project_id.in_(project_id))
            .distinct()
        )
        has_any_assignment = (
            db.query(models.UserProject.user_id)
            .distinct()
        )
        q = q.filter(
            models.User.id.in_(assigned_to_project) |
            ~models.User.id.in_(has_any_assignment)
        )
    return [user_to_dict(u) for u in q.order_by(models.User.name).all()]


def _clean_mobile(raw) -> Optional[str]:
    if raw is None:
        return None
    s = str(raw).strip().replace('\xa0', '').replace('\n', '')
    if not s or s.lower() == 'none':
        return None
    first = re.split(r'[/,]', s)[0].strip()
    digits = re.sub(r'\D', '', first)
    if not digits:
        return None
    # Handle float representation like "9800002162.0"
    if digits.endswith('0') and len(digits) == 11:
        digits = digits[:10]
    return digits[-10:] if len(digits) >= 10 else digits


@router.post("/bulk-upload", status_code=200)
async def bulk_upload_users(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    contents = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
    except Exception:
        raise HTTPException(400, "Invalid Excel file")

    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(400, "Excel file is empty")

    # Find header row containing 'Project'
    header_idx = None
    for i, row in enumerate(rows):
        if row and str(row[0]).strip().lower() == 'project':
            header_idx = i
            break
    if header_idx is None:
        raise HTTPException(400, "Could not find header row with 'Project' column")

    DEFAULT_PASSWORD = "123456"
    created, skipped, errors = [], [], []

    for row in rows[header_idx + 1:]:
        if not any(row):
            continue
        project_name = str(row[0]).strip() if row[0] else None
        contractor_name = str(row[1]).strip() if row[1] else None
        mobile_raw = row[2]
        email_raw = str(row[3]).strip() if len(row) > 3 and row[3] else None

        if not email_raw or not contractor_name or not project_name:
            continue

        # Multiple emails separated by comma — create one user per unique email
        raw_emails = [e.strip().lower() for e in email_raw.split(',') if e.strip()]

        for email in raw_emails:
            if '@' not in email or '.' not in email.split('@')[-1]:
                errors.append(f"{contractor_name}: invalid email '{email}'")
                continue

            existing = db.query(models.User).filter(
                models.User.name == contractor_name,
                models.User.email == email,
            ).first()

            project = db.query(models.Project).filter(
                models.Project.name.ilike(project_name)
            ).first()

            if existing:
                # User already exists — just add the project assignment if missing
                if project:
                    already_assigned = db.query(models.UserProject).filter(
                        models.UserProject.user_id == existing.id,
                        models.UserProject.project_id == project.id,
                    ).first()
                    if not already_assigned:
                        db.add(models.UserProject(user_id=existing.id, project_id=project.id))
                        created.append(f"{contractor_name} ({email}) → {project.name} (added project)")
                    else:
                        skipped.append(f"{contractor_name} ({email}) already in {project.name}")
                else:
                    skipped.append(f"{contractor_name} ({email}) exists, project '{project_name}' not found")
                continue

            mobile = _clean_mobile(mobile_raw)
            user = models.User(
                name=contractor_name,
                email=email,
                password_hash=hash_password(DEFAULT_PASSWORD),
                role="Contractor",
                mobile=mobile,
            )
            db.add(user)
            db.flush()

            if project:
                db.add(models.UserProject(user_id=user.id, project_id=project.id))
                created.append(f"{contractor_name} ({email}) → {project.name}")
            else:
                created.append(f"{contractor_name} ({email}) [project '{project_name}' not found]")

    db.commit()
    return {
        "created_count": len(created),
        "skipped_count": len(skipped),
        "error_count": len(errors),
        "created": created,
        "skipped": skipped,
        "errors": errors,
    }


@router.get("/")
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    users = db.query(models.User).order_by(models.User.name).all()
    return [user_to_dict(u) for u in users]


@router.post("/", status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    if body.role not in VALID_ROLES:
        raise HTTPException(400, "Invalid role")
    _check_uniqueness(db, body.role, body.name.strip(), body.email.lower().strip())

    user = models.User(
        name=body.name.strip(),
        email=body.email.lower().strip(),
        password_hash=hash_password(body.password),
        role=body.role,
        mobile=body.mobile.strip() if body.mobile else None,
    )
    db.add(user)
    db.flush()

    for pid in body.project_ids:
        db.add(models.UserProject(user_id=user.id, project_id=pid))
    db.commit()
    db.refresh(user)
    return user_to_dict(user)


@router.put("/{user_id}")
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if body.role not in VALID_ROLES:
        raise HTTPException(400, "Invalid role")
    _check_uniqueness(db, body.role, body.name.strip(), body.email.lower().strip(), exclude_id=user_id)

    user.name = body.name.strip()
    user.email = body.email.lower().strip()
    user.role = body.role
    user.mobile = body.mobile.strip() if body.mobile else None
    if body.password:
        user.password_hash = hash_password(body.password)

    db.query(models.UserProject).filter(models.UserProject.user_id == user_id).delete()
    for pid in body.project_ids:
        db.add(models.UserProject(user_id=user_id, project_id=pid))
    db.commit()
    db.refresh(user)
    return user_to_dict(user)


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current=Depends(require_super_admin)):
    if user_id == current.id:
        raise HTTPException(400, "Cannot delete yourself")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    created_count = db.query(models.Observation).filter(models.Observation.created_by == user_id).count()
    if created_count > 0:
        raise HTTPException(
            400,
            f"Cannot delete user: they created {created_count} observation(s). Delete those observations first."
        )

    # Null out contractor references on observations
    contractor_obs = db.query(models.Observation).filter(models.Observation.contractor_user_id == user_id).all()
    for obs in contractor_obs:
        obs.contractor_user_id = None
        if obs.contractor_user_ids:
            ids = [i for i in json.loads(obs.contractor_user_ids) if i != user_id]
            obs.contractor_user_ids = json.dumps(ids) if ids else None

    # Null out other nullable user references
    db.query(models.ObservationImage).filter(models.ObservationImage.uploaded_by == user_id).update({"uploaded_by": None})
    db.query(models.ObservationComment).filter(models.ObservationComment.user_id == user_id).update({"user_id": None})

    # Remove project assignments
    db.query(models.UserProject).filter(models.UserProject.user_id == user_id).delete()

    db.delete(user)
    db.commit()
    return {"success": True}
