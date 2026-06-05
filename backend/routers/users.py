from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from sqlalchemy.orm import Session
from database import get_db
import models
from auth import get_current_user, require_admin, hash_password

router = APIRouter(prefix="/api/users", tags=["users"])

VALID_ROLES = {"Admin", "PC", "HO", "Contractor", "Observer"}


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str
    project_ids: List[int] = []


class UserUpdate(BaseModel):
    name: str
    email: str
    password: Optional[str] = None
    role: str
    project_ids: List[int] = []


def user_to_dict(user: models.User):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "projects": [{"id": up.project_id, "name": up.project.name} for up in user.user_projects],
    }


@router.get("/")
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    users = db.query(models.User).order_by(models.User.name).all()
    return [user_to_dict(u) for u in users]


@router.post("/", status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    if body.role not in VALID_ROLES:
        raise HTTPException(400, "Invalid role")
    if db.query(models.User).filter(models.User.email == body.email.lower().strip()).first():
        raise HTTPException(409, "Email already in use")

    user = models.User(
        name=body.name.strip(),
        email=body.email.lower().strip(),
        password_hash=hash_password(body.password),
        role=body.role,
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

    user.name = body.name.strip()
    user.email = body.email.lower().strip()
    user.role = body.role
    if body.password:
        user.password_hash = hash_password(body.password)

    db.query(models.UserProject).filter(models.UserProject.user_id == user_id).delete()
    for pid in body.project_ids:
        db.add(models.UserProject(user_id=user_id, project_id=pid))
    db.commit()
    db.refresh(user)
    return user_to_dict(user)


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current=Depends(require_admin)):
    if user_id == current.id:
        raise HTTPException(400, "Cannot delete yourself")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
    return {"success": True}
