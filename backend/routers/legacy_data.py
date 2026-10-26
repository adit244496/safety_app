import json
import os
import tempfile
import time
import zlib
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
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
def get_legacy(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Shared legacy dataset — visible to every role except Contractor. Returns header=None
    when nothing has been uploaded yet (the dashboard then shows its bundled default)."""
    if user.role == "Contractor":
        raise HTTPException(403, "Legacy data is not available to contractors")
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


def _save(db: Session, user: models.User, header, rows) -> dict:
    rec = _get(db)
    if not rec:
        rec = models.LegacyData()
        db.add(rec)
    rec.data = json.dumps({"header": header, "rows": rows})
    rec.updated_by = user.id
    rec.updated_at = datetime.now()
    db.commit()
    return {"success": True, "rows": len(rows)}


@router.put("/")
def put_legacy(body: LegacyPayload, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    """Replace the shared legacy dataset (Admin/SuperAdmin only). Small datasets only —
    a reverse proxy usually caps request bodies (nginx: 1 MB), so the dashboard uses
    the chunked upload below."""
    return _save(db, user, body.header, body.rows)


# ── Chunked upload ────────────────────────────────────────────────────────────
# The dashboard gzips {header, rows} and sends it in pieces small enough for any proxy
# body limit. Pieces are staged on disk (shared by all workers); when the last one
# arrives the dataset is reassembled and swapped in at once, so nobody ever reads a
# half-uploaded dataset.
CHUNK_DIR = os.path.join(tempfile.gettempdir(), "safety_legacy_uploads")
MAX_CHUNK_BYTES = 900 * 1024              # stays under nginx's default 1 MB body limit
MAX_TOTAL_CHUNKS = 2000
MAX_JSON_BYTES = 300 * 1024 * 1024         # guard against decompression bombs
STALE_SECONDS = 24 * 3600


def _cleanup_stale() -> None:
    now = time.time()
    for name in os.listdir(CHUNK_DIR):
        path = os.path.join(CHUNK_DIR, name)
        try:
            if now - os.path.getmtime(path) > STALE_SECONDS:
                os.remove(path)
        except OSError:
            pass


@router.post("/chunk")
async def upload_chunk(
    request: Request,
    upload_id: str = Query(..., pattern=r"^[0-9a-f]{32}$"),
    index: int = Query(..., ge=0),
    total: int = Query(..., ge=1, le=MAX_TOTAL_CHUNKS),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """One gzip-compressed piece of the dataset. Returns done=True after the final piece
    has been assembled and saved."""
    if index >= total:
        raise HTTPException(400, "Chunk index out of range")
    body = await request.body()
    if len(body) > MAX_CHUNK_BYTES:
        raise HTTPException(413, "Chunk too large")
    os.makedirs(CHUNK_DIR, exist_ok=True)
    _cleanup_stale()
    with open(os.path.join(CHUNK_DIR, f"{upload_id}.{index}"), "wb") as fp:
        fp.write(body)

    parts = [os.path.join(CHUNK_DIR, f"{upload_id}.{i}") for i in range(total)]
    if not all(os.path.exists(p) for p in parts):
        return {"done": False, "received": index + 1, "total": total}

    try:
        compressed = b"".join(open(p, "rb").read() for p in parts)
        inflater = zlib.decompressobj(16 + zlib.MAX_WBITS)   # gzip framing
        raw = inflater.decompress(compressed, MAX_JSON_BYTES)
        if inflater.unconsumed_tail:
            raise HTTPException(413, "Legacy dataset is too large")
        payload = json.loads(raw.decode("utf-8"))
        header, rows = payload.get("header"), payload.get("rows")
        if not isinstance(rows, list) or (header is not None and not isinstance(header, list)):
            raise HTTPException(400, "Invalid legacy dataset")
    except HTTPException:
        raise
    except (zlib.error, ValueError, UnicodeDecodeError):
        raise HTTPException(400, "Could not read the uploaded dataset")
    finally:
        for p in parts:
            try:
                os.remove(p)
            except OSError:
                pass

    result = _save(db, user, header, rows)
    return {"done": True, **result}
