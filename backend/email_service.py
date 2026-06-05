import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List

logger = logging.getLogger(__name__)


def send_observation_email(
    smtp_settings,
    to_emails: List[str],
    cc_emails: List[str],
    subject: str,
    body_html: str,
) -> bool:
    if not smtp_settings or not smtp_settings.enabled:
        return False
    to_emails = [e for e in to_emails if e]
    cc_emails = [e for e in cc_emails if e]
    if not to_emails:
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{smtp_settings.from_name} <{smtp_settings.from_email}>"
    msg["To"] = ", ".join(to_emails)
    if cc_emails:
        msg["Cc"] = ", ".join(cc_emails)
    msg.attach(MIMEText(body_html, "html"))

    all_recipients = to_emails + cc_emails
    try:
        if smtp_settings.smtp_use_tls:
            server = smtplib.SMTP(smtp_settings.smtp_host, smtp_settings.smtp_port, timeout=15)
            server.ehlo()
            server.starttls()
            server.ehlo()
        else:
            server = smtplib.SMTP_SSL(smtp_settings.smtp_host, smtp_settings.smtp_port, timeout=15)
        if smtp_settings.smtp_username:
            server.login(smtp_settings.smtp_username, smtp_settings.smtp_password)
        server.sendmail(smtp_settings.from_email, all_recipients, msg.as_string())
        server.quit()
        logger.info("Observation email sent to %s cc %s", to_emails, cc_emails)
        return True
    except Exception as exc:
        logger.error("Failed to send observation email: %s", exc)
        return False


def build_observation_email(obs: dict) -> tuple[str, str]:
    obs_id = obs.get("observation_id", "")
    project = obs.get("project_name", "")
    obs_date = obs.get("obs_date", "")
    building = obs.get("building_name", "") or ""
    floor = obs.get("floor_name", "") or ""
    location = obs.get("exact_location", "") or ""
    observer = obs.get("observer_name", "") or ""
    contractor = obs.get("contractor_name", "") or ""
    core_concern = obs.get("core_concern_name", "") or ""
    specific_concern = obs.get("specific_concern_name") or obs.get("specific_concern_text", "") or ""
    risk_level = obs.get("risk_level", "") or ""
    target_date = obs.get("target_date_name", "") or ""
    status = obs.get("status", "Open")

    subject = f"[Safety] New Observation {obs_id} – {project}"

    risk_color = {"High": "#dc2626", "Medium": "#d97706", "Low": "#16a34a"}.get(risk_level, "#6b7280")

    loc_parts = [p for p in [building, floor, location] if p]
    loc_str = " / ".join(loc_parts) if loc_parts else "—"

    html = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08);">
    <div style="background:#1e3a5f;padding:28px 32px;">
      <h2 style="color:#fff;margin:0 0 4px;font-size:20px;">Safety Observation Notification</h2>
      <p style="color:#93c5fd;margin:0;font-size:14px;">Observation ID: <strong>{obs_id}</strong></p>
    </div>
    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:10px 12px;color:#6b7280;width:38%;background:#f9fafb;border-radius:4px;">Project</td><td style="padding:10px 12px;font-weight:600;">{project}</td></tr>
        <tr><td style="padding:10px 12px;color:#6b7280;">Observation Date</td><td style="padding:10px 12px;">{obs_date}</td></tr>
        <tr><td style="padding:10px 12px;color:#6b7280;background:#f9fafb;">Location</td><td style="padding:10px 12px;background:#f9fafb;">{loc_str}</td></tr>
        <tr><td style="padding:10px 12px;color:#6b7280;">Observer</td><td style="padding:10px 12px;">{observer}</td></tr>
        <tr><td style="padding:10px 12px;color:#6b7280;background:#f9fafb;">Contractor</td><td style="padding:10px 12px;background:#f9fafb;">{contractor}</td></tr>
        <tr><td style="padding:10px 12px;color:#6b7280;">Core Concern</td><td style="padding:10px 12px;">{core_concern}</td></tr>
        <tr><td style="padding:10px 12px;color:#6b7280;background:#f9fafb;">Specific Concern</td><td style="padding:10px 12px;background:#f9fafb;">{specific_concern}</td></tr>
        <tr><td style="padding:10px 12px;color:#6b7280;">Risk Level</td><td style="padding:10px 12px;"><span style="background:{risk_color};color:#fff;padding:2px 10px;border-radius:4px;font-size:12px;font-weight:600;">{risk_level}</span></td></tr>
        <tr><td style="padding:10px 12px;color:#6b7280;background:#f9fafb;">Target Date</td><td style="padding:10px 12px;background:#f9fafb;">{target_date}</td></tr>
        <tr><td style="padding:10px 12px;color:#6b7280;">Status</td><td style="padding:10px 12px;">{status}</td></tr>
      </table>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">This is an automated notification from the Safety Observation System. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>"""
    return subject, html
