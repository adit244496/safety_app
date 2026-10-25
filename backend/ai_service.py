"""AI summary generation for safety observations — supports Anthropic (Claude) and OpenAI."""
import os
import base64
import logging

import models

logger = logging.getLogger(__name__)

# Anthropic models exposed in the admin UI (label → model id).
ALLOWED_MODELS = {
    "claude-haiku-4-5-20251001": "Claude Haiku 4.5 (fast, low cost)",
    "claude-sonnet-5": "Claude Sonnet 5 (higher quality)",
}
DEFAULT_MODEL = "claude-haiku-4-5-20251001"

# OpenAI models exposed in the admin UI.
OPENAI_MODELS = {
    "gpt-4o-mini": "GPT-4o mini (fast, low cost)",
    "gpt-4o": "GPT-4o (higher quality)",
}
OPENAI_DEFAULT_MODEL = "gpt-4o-mini"

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
    """Resolve (provider, api_key, model) from the admin DB settings, falling back to env vars.
    The admin-saved provider/key/model wins when AI summaries are enabled."""
    if db is not None:
        try:
            s = db.query(models.AiSettings).first()
            # Resolve the saved provider/key/model regardless of the `enabled` toggle —
            # `enabled` only gates whether summaries are generated (see is_enabled),
            # so admins can save & test a key before turning the feature on.
            if s:
                provider = (s.provider or "anthropic").lower()
                if provider == "openai" and s.openai_api_key:
                    model = s.openai_model if s.openai_model in OPENAI_MODELS else OPENAI_DEFAULT_MODEL
                    return "openai", s.openai_api_key, model
                if provider == "anthropic" and s.api_key:
                    model = s.model if s.model in ALLOWED_MODELS else DEFAULT_MODEL
                    return "anthropic", s.api_key, model
        except Exception as exc:  # table may not exist yet / db error — fall back to env
            logger.warning("Could not read AiSettings: %s", exc)

    # Environment fallback
    if os.getenv("AI_PROVIDER", "").lower() == "openai" and os.getenv("OPENAI_API_KEY"):
        env_model = os.getenv("AI_SUMMARY_MODEL")
        model = env_model if env_model in OPENAI_MODELS else OPENAI_DEFAULT_MODEL
        return "openai", os.getenv("OPENAI_API_KEY"), model
    env_model = os.getenv("AI_SUMMARY_MODEL")
    model = env_model if env_model in ALLOWED_MODELS else DEFAULT_MODEL
    return "anthropic", os.getenv("ANTHROPIC_API_KEY", ""), model


def is_configured(db=None) -> bool:
    """A usable key is resolvable (regardless of the on/off toggle)."""
    _provider, api_key, _model = _resolve_config(db)
    return bool(api_key)


def is_enabled(db=None) -> bool:
    """The admin has turned AI summaries on (the toggle). Summary generation
    requires this AND a configured key."""
    if db is not None:
        try:
            s = db.query(models.AiSettings).first()
            if s is not None:
                return bool(s.enabled)
        except Exception as exc:
            logger.warning("Could not read AiSettings: %s", exc)
    # Env fallback: enabled implicitly when a provider key is set in the environment.
    return bool(os.getenv("OPENAI_API_KEY") or os.getenv("ANTHROPIC_API_KEY"))


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


def _image_raw(obs, db) -> list:
    """Return a list of (media_type, base64_data) for the observation's photos."""
    out = []
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
                out.append((mt, base64.standard_b64encode(f.read()).decode("utf-8")))
        except OSError as exc:
            logger.warning("Could not read image %s for AI summary: %s", img.file_path, exc)
    return out


def _complete(provider: str, api_key: str, model: str, system: str, text: str,
              images: list, max_tokens: int) -> str:
    """Provider-agnostic completion. images = list of (media_type, base64)."""
    if provider == "openai":
        from openai import OpenAI
        content = [{"type": "text", "text": text}]
        for mt, data in images:
            content.append({"type": "image_url", "image_url": {"url": f"data:{mt};base64,{data}"}})
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": content}],
        )
        return (resp.choices[0].message.content or "").strip()

    # default: Anthropic
    import anthropic
    content = [{"type": "image", "source": {"type": "base64", "media_type": mt, "data": data}}
               for mt, data in images]
    content.append({"type": "text", "text": text})
    client = anthropic.Anthropic(api_key=api_key)
    resp = client.messages.create(
        model=model, max_tokens=max_tokens, system=system,
        messages=[{"role": "user", "content": content}],
    )
    return "".join(b.text for b in resp.content if b.type == "text").strip()


def generate_summary(obs, obs_data: dict, db) -> str:
    """Generate an AI summary for an observation. Raises on failure."""
    provider, api_key, model = _resolve_config(db)
    if not api_key:
        raise RuntimeError("No AI API key configured")
    text = _observation_text(obs_data) + "\n\nWrite the summary now."
    out = _complete(provider, api_key, model, SYSTEM_PROMPT, text, _image_raw(obs, db), 700)
    if not out:
        raise RuntimeError("Empty AI summary response")
    return out


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


def summarize_minutes(source_text: str, db, images: list = None) -> str:
    """Generate a crisp, concise summary of meeting minutes. `images` (list of
    (media_type, base64)) carries scanned pages when there is no text. Raises on failure."""
    provider, api_key, model = _resolve_config(db)
    if not api_key:
        raise RuntimeError("No AI API key configured")
    images = images or []
    text = (source_text or "").strip()
    if not text and not images:
        raise RuntimeError("No text to summarise")
    if len(text) > MINUTES_MAX_CHARS:
        text = text[:MINUTES_MAX_CHARS] + "\n\n[...truncated...]"
    if images:
        prompt = ("The meeting minutes are provided as scanned page images (in order). "
                  "Read them carefully, including any handwriting or tables.")
        if text:
            prompt += "\n\nText extracted from the document:\n\n" + text
    else:
        prompt = "Meeting minutes:\n\n" + text
    out = _complete(provider, api_key, model, MINUTES_SYSTEM_PROMPT,
                    prompt + "\n\nWrite the crisp summary now.", images, 800)
    if not out:
        raise RuntimeError("Empty AI summary response")
    return out
