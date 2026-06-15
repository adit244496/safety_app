from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
import models
from auth import get_current_user, require_admin, require_super_admin

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectBody(BaseModel):
    name: str


@router.get("/")
def list_projects(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    if user.role in ("SuperAdmin", "Admin", "PIC", "EIC"):
        projects = db.query(models.Project).order_by(models.Project.name).all()
    else:
        project_ids = [up.project_id for up in user.user_projects]
        if not project_ids:
            # No specific assignments → full access (same as admin intent when no project selected)
            projects = db.query(models.Project).order_by(models.Project.name).all()
        else:
            projects = db.query(models.Project).filter(models.Project.id.in_(project_ids)).order_by(models.Project.name).all()
    return [{"id": p.id, "name": p.name, "created_at": p.created_at.isoformat() if p.created_at else None} for p in projects]


@router.get("/{project_id}/buildings")
def list_buildings(project_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    buildings = db.query(models.Building).filter(models.Building.project_id == project_id).order_by(models.Building.name).all()
    return [{"id": b.id, "name": b.name} for b in buildings]


@router.post("/", status_code=201)
def create_project(body: ProjectBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    try:
        p = models.Project(name=body.name.strip())
        db.add(p)
        db.commit()
        db.refresh(p)
        return {"id": p.id, "name": p.name}
    except Exception:
        db.rollback()
        raise HTTPException(409, "Project name already exists")


@router.put("/{project_id}")
def update_project(project_id: int, body: ProjectBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    p = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    p.name = body.name.strip()
    db.commit()
    return {"success": True}


@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    p = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    count = db.query(models.Observation).filter(models.Observation.project_id == project_id).count()
    if count > 0:
        raise HTTPException(400, f"Cannot delete project: it has {count} observation(s). Delete those observations first.")
    db.delete(p)
    db.commit()
    return {"success": True}
