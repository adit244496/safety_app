"""AI summary generation for safety observations, using the Anthropic Claude API."""
import os
import base64
import logging

import models

logger = logging.getLogger(__name__)

# Selectable models exposed in the admin UI (label → model id). Kept small on
# purpose: Haiku for low cost / high volume, Sonnet for higher quality.
ALLOWED_MODELS = {
    "claude-haiku-4-5-20251001": "Claude Haiku 4.5 (fast, low cost)",
    "claude-sonnet-5": "Claude Sonnet 5 (higher quality)",
}
DEFAULT_MODEL = "claude-haiku-4-5-20251001"

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


def _resolve_config(db=None):
    """Resolve (api_key, model) from the admin DB settings, falling back to env vars.

    A key/model saved in the admin UI takes precedence over the environment.
    """
    # 1. Admin UI settings win when enabled and a key is present.
    if db is not None:
        try:
            s = db.query(models.AiSettings).first()
            if s and s.enabled and s.api_key:
                model = s.model if s.model in ALLOWED_MODELS else DEFAULT_MODEL
                return s.api_key, model
        except Exception as exc:  # table may not exist yet / db error — fall back to env
            logger.warning("Could not read AiSettings: %s", exc)

    # 2. Fall back to environment configuration.
    env_model = os.getenv("AI_SUMMARY_MODEL")
    model = env_model if env_model in ALLOWED_MODELS else DEFAULT_MODEL
    return os.getenv("ANTHROPIC_API_KEY", ""), model


def is_configured(db=None) -> bool:
    api_key, _ = _resolve_config(db)
    return bool(api_key)


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

    api_key, model = _resolve_config(db)
    if not api_key:
        raise RuntimeError("No Anthropic API key configured")

    content = _image_blocks(obs, db)
    content.append({
        "type": "text",
        "text": _observation_text(obs_data) + "\n\nWrite the summary now.",
    })

    client = anthropic.Anthropic(api_key=api_key)
    resp = client.messages.create(
        model=model,
        max_tokens=700,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
    )
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    if not text:
        raise RuntimeError("Empty AI summary response")
    return text


# ── Meeting minutes (MoM) summarisation ─────────────────────────────────────
MINUTES_SYSTEM_PROMPT = (
    "You are an assistant that summarises Minutes of Meeting (MoM) for a construction company's "
    "Safety, Health & Environment (SHE) team. Produce a CRISP and CONCISE summary of the minutes "
    "provided. Keep it short and scannable. Use this plain-text structure with no markdown headers "
    "and no bold:\n"
    "A one or two sentence overview first.\n"
    "Then, if present, a short list of key discussion points, decisions, and action items as lines "
    "starting with '- '. For action items include the owner and any due date when stated.\n"
    "Only use information present in the minutes — never invent attendees, dates, decisions or owners. "
    "If the text is unclear or empty, say so briefly."
)

# Keep token usage bounded — summarise at most this many characters of source text.
MINUTES_MAX_CHARS = 24000


def summarize_minutes(source_text: str, db) -> str:
    """Generate a crisp, concise summary of meeting-minutes text. Raises on failure."""
    import anthropic

    api_key, model = _resolve_config(db)
    if not api_key:
        raise RuntimeError("No Anthropic API key configured")

    text = (source_text or "").strip()
    if not text:
        raise RuntimeError("No text to summarise")
    if len(text) > MINUTES_MAX_CHARS:
        text = text[:MINUTES_MAX_CHARS] + "\n\n[...truncated...]"

    client = anthropic.Anthropic(api_key=api_key)
    resp = client.messages.create(
        model=model,
        max_tokens=800,
        system=MINUTES_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": [
            {"type": "text", "text": "Meeting minutes:\n\n" + text + "\n\nWrite the crisp summary now."}
        ]}],
    )
    out = "".join(b.text for b in resp.content if b.type == "text").strip()
    if not out:
        raise RuntimeError("Empty AI summary response")
    return out
