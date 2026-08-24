"""AI summary generation for safety observations, using the Anthropic Claude API."""
import os
import base64
import logging

import models

logger = logging.getLogger(__name__)

# Default to Claude Opus 5 (most capable). Override with AI_SUMMARY_MODEL to use a
# cheaper model (e.g. claude-sonnet-5 or claude-haiku-4-5) for high volume / lower cost.
AI_MODEL = os.getenv("AI_SUMMARY_MODEL", "claude-opus-5")
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
MAX_IMAGES = 3

_MEDIA_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp",
}

SYSTEM_PROMPT = (
    "You are a Safety, Health & Environment (SHE) officer assistant for a construction company. "
    "Given a site safety observation's structured data and any attached photos, write a clear, concise "
    "summary (about 3-5 sentences, plain text — no markdown headings or bullet symbols). "
    "State what was observed, the hazard and its potential consequence, the assessed risk level, and the "
    "key corrective action or precaution required. If photos are provided, incorporate what they show. "
    "Be factual and professional; do not invent details that are not supported by the data or images."
)


def is_configured() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def _observation_text(d: dict) -> str:
    def val(x):
        return x if (x is not None and str(x).strip() != "") else "—"

    lines = [
        "Safety Observation details:",
        f"- Observation ID: {val(d.get('observation_id'))}",
        f"- Project: {val(d.get('project_name'))}",
        f"- Location: {', '.join([p for p in [d.get('building_name'), d.get('floor_name'), d.get('exact_location')] if p]) or '—'}",
        f"- Date/Time: {val(d.get('obs_date'))} {val(d.get('obs_time'))}",
        f"- Status: {val(d.get('status'))}",
        f"- Core concern: {val(d.get('core_concern_name'))}",
        f"- Specific concern: {val(d.get('specific_concern_name') or d.get('specific_concern_text'))}",
        f"- Possible outcome: {val(d.get('possible_outcome'))}",
        f"- Severity: {val(d.get('severity'))}/5, Probability: {val(d.get('probability'))}/5, "
        f"Risk factor: {val(d.get('risk_factor'))} ({val(d.get('risk_level'))})",
        f"- Root cause: {val(d.get('root_cause_category_name'))} / {val(d.get('root_cause_specific_name'))}",
        f"- Violation: {val(d.get('violation_name'))}",
        f"- Contractor: {val(d.get('contractor_name'))}",
        f"- To be rectified by: {val(d.get('to_be_rectified_by'))}",
        f"- Target date: {val(d.get('target_date_actual'))}",
        f"- Observer: {val(d.get('observer_name') or d.get('created_by_name'))}",
    ]
    comments = d.get("comments") or []
    if comments:
        joined = " | ".join(f"{c.get('user_name', '')}: {c.get('comment', '')}" for c in comments[:5])
        lines.append(f"- Recent comments: {joined}")
    return "\n".join(lines)


def _image_blocks(obs, db) -> list:
    blocks = []
    images = (
        db.query(models.ObservationImage)
        .filter(models.ObservationImage.observation_id == obs.id)
        .order_by(models.ObservationImage.created_at)
        .limit(MAX_IMAGES)
        .all()
    )
    for img in images:
        ext = os.path.splitext(img.file_path or "")[1].lower()
        mt = _MEDIA_TYPES.get(ext)
        path = os.path.join(UPLOAD_DIR, img.file_path)
        if not mt or not os.path.exists(path):
            continue
        try:
            with open(path, "rb") as f:
                data = base64.standard_b64encode(f.read()).decode("utf-8")
            blocks.append({
                "type": "image",
                "source": {"type": "base64", "media_type": mt, "data": data},
            })
        except OSError as exc:
            logger.warning("Could not read image %s for AI summary: %s", img.file_path, exc)
    return blocks


def generate_summary(obs, obs_data: dict, db) -> str:
    """Generate an AI summary for an observation. Raises on failure."""
    import anthropic

    content = _image_blocks(obs, db)
    content.append({
        "type": "text",
        "text": _observation_text(obs_data) + "\n\nWrite the summary now.",
    })

    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment
    resp = client.messages.create(
        model=AI_MODEL,
        max_tokens=700,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
    )
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    if not text:
        raise RuntimeError("Empty AI summary response")
    return text
