from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
import models
from auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _serialize(n: models.Notification) -> dict:
    return {
        "id": n.id,
        "observation_id": n.observation_id,
        "obs_ref": n.obs_ref,
        "message": n.message,
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("/")
def get_notifications(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    notifs = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == user.id)
        .order_by(models.Notification.created_at.desc())
        .limit(30)
        .all()
    )
    unread = sum(1 for n in notifs if not n.is_read)
    return {"notifications": [_serialize(n) for n in notifs], "unread": unread}


@router.patch("/{notif_id}/read")
def mark_read(
    notif_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    n = (
        db.query(models.Notification)
        .filter(models.Notification.id == notif_id, models.Notification.user_id == user.id)
        .first()
    )
    if n:
        n.is_read = True
        db.commit()
    return {"ok": True}


@router.patch("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    db.query(models.Notification).filter(
        models.Notification.user_id == user.id,
        models.Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"ok": True}
