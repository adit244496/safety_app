from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
import models
from auth import verify_password, create_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email.lower().strip()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    projects = [
        {"id": up.project_id, "name": up.project.name}
        for up in user.user_projects
    ]
    token = create_token(user.id, user.role)
    return {
        "token": token,
        "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role, "projects": projects},
    }


@router.get("/me")
def me(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    projects = [{"id": up.project_id, "name": up.project.name} for up in user.user_projects]
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role, "projects": projects}
