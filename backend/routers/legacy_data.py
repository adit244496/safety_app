import json
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from auth import get_current_user, require_admin

router = APIRouter(prefix="/api/legacy-data", tags=["legacy-data"])


class LegacyPayload(BaseModel):
    header: Optional[List[Any]] = None
    rows: List[Any] = []


def _get(db: Session) -> Optional[models.LegacyData]:
    return db.query(models.LegacyData).first()


@router.get("/")
def get_legacy(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    """Shared legacy dataset for everyone with access. Returns header=None when nothing
    has been uploaded yet (the dashboard then shows its bundled default)."""
    rec = _get(db)
    if not rec or not rec.data:
        return {"header": None, "rows": [], "updated_at": None, "updated_by_name": None}
    try:
        payload = json.loads(rec.data)
    except (ValueError, TypeError):
        payload = {"header": None, "rows": []}
    return {
        "header": payload.get("header"),
        "rows": payload.get("rows", []),
        "updated_at": rec.updated_at.isoformat() if rec.updated_at else None,
        "updated_by_name": rec.updater.name if rec.updater else None,
    }


@router.put("/")
def put_legacy(body: LegacyPayload, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    """Replace the shared legacy dataset (Admin/SuperAdmin only)."""
    rec = _get(db)
    if not rec:
        rec = models.LegacyData()
        db.add(rec)
    rec.data = json.dumps({"header": body.header, "rows": body.rows})
    rec.updated_by = user.id
    rec.updated_at = datetime.now()
    db.commit()
    return {"success": True, "rows": len(body.rows)}
