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
    # If no TO recipients, promote CC to TO so the email still goes out
    if not to_emails and cc_emails:
        to_emails = cc_emails
        cc_emails = []
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
        logger.info("Email sent | to=%s cc=%s | subject=%s", to_emails, cc_emails, subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email: %s", exc)
        return False


def build_observation_email(obs: dict) -> tuple[str, str]:
    obs_id       = obs.get("observation_id", "")
    project      = obs.get("project_name", "") or ""
    obs_date     = obs.get("obs_date", "") or ""
    obs_time     = obs.get("obs_time", "") or ""
    building     = obs.get("building_name", "") or ""
    floor        = obs.get("floor_name", "") or ""
    location     = obs.get("exact_location", "") or ""
    observer     = obs.get("observer_name", "") or "—"
    created_by   = obs.get("created_by_name", "") or "—"

    # People lists (passed as lists from _send_obs_email)
    contractor_names = obs.get("contractor_names", []) or []
    eic_names        = obs.get("eic_names", []) or []
    to_rectify       = obs.get("to_be_rectified_by", "") or "—"

    core_concern     = obs.get("core_concern_name", "") or "—"
    specific_concern = obs.get("specific_concern_name") or obs.get("specific_concern_text", "") or "—"
    possible_outcome = obs.get("possible_outcome", "") or "—"

    severity     = obs.get("severity")
    probability  = obs.get("probability")
    risk_factor  = obs.get("risk_factor")
    risk_level   = obs.get("risk_level", "") or "NIL"

    root_cause_cat  = obs.get("root_cause_category_name", "") or "—"
    root_cause_spec = obs.get("root_cause_specific_name", "") or "—"
    violation       = obs.get("violation_name", "") or "—"

    target_date        = obs.get("target_date_name", "") or "—"
    target_date_actual = obs.get("target_date_actual", "") or ""
    status             = obs.get("status", "Open")

    # ── Derived display values ────────────────────────────────────────────────
    datetime_str = " | ".join(p for p in [obs_date, obs_time] if p) or "—"
    loc_parts    = [p for p in [building, floor, location] if p]
    loc_str      = " / ".join(loc_parts) if loc_parts else "—"

    contractors_str = ", ".join(contractor_names) if contractor_names else "—"
    eic_str         = ", ".join(eic_names) if eic_names else "—"

    sev_display  = f"{severity} / 5" if severity else "—"
    prob_display = f"{probability} / 5" if probability else "—"
    factor_display = str(risk_factor) if risk_factor else "—"

    target_display = target_date
    if target_date_actual:
        target_display = f"{target_date} &nbsp;<span style='color:#6b7280;font-size:12px;'>({target_date_actual})</span>"

    risk_color = {
        "High":   "#dc2626",
        "Medium": "#d97706",
        "Low":    "#16a34a",
        "NIL":    "#6b7280",
    }.get(risk_level, "#6b7280")

    status_color = {
        "Open":        "#dc2626",
        "In Progress": "#d97706",
        "Closed":      "#16a34a",
    }.get(status, "#6b7280")

    event = obs.get("event", "new")  # "new" | "update" | "status_change"
    if event == "status_change":
        subject = f"[Safety] {status} - {obs_id} | {project}"
        header_title = "Observation Status Updated"
    elif event == "update":
        subject = f"[Safety] Updated - {obs_id} | {project}"
        header_title = "Observation Updated"
    else:
        subject = f"[Safety] {risk_level} Risk - {obs_id} | {project}"
        header_title = "Safety Observation Notification"

    # ── Reusable row helpers ─────────────────────────────────────────────────
    def row(label: str, value: str, shade: bool = False) -> str:
        bg = "background:#f9fafb;" if shade else ""
        return (
            f'<tr>'
            f'<td style="padding:9px 14px;color:#6b7280;font-size:13px;width:38%;{bg}vertical-align:top;">{label}</td>'
            f'<td style="padding:9px 14px;font-size:13px;font-weight:500;color:#111827;{bg}vertical-align:top;">{value}</td>'
            f'</tr>'
        )

    def section_header(title: str) -> str:
        return (
            f'<tr><td colspan="2" style="padding:14px 14px 6px;font-size:11px;font-weight:700;'
            f'color:#4b5563;text-transform:uppercase;letter-spacing:0.8px;'
            f'border-top:1px solid #e5e7eb;">{title}</td></tr>'
        )

    # ── Build table rows ─────────────────────────────────────────────────────
    incident_rows = (
        section_header("Incident Details") +
        row("Project",     project,       shade=True) +
        row("Date & Time", datetime_str) +
        row("Location",    loc_str,       shade=True) +
        row("Reported By", observer) +
        row("Created By",  created_by,    shade=True)
    )

    observation_rows = (
        section_header("Observation") +
        row("Core Concern",     core_concern,     shade=True) +
        row("Specific Concern", specific_concern) +
        row("Possible Outcome", possible_outcome, shade=True)
    )

    risk_rows = (
        section_header("Risk Assessment") +
        row("Severity",     sev_display,    shade=True) +
        row("Probability",  prob_display) +
        row("Risk Factor",  factor_display, shade=True) +
        f'<tr><td style="padding:9px 14px;color:#6b7280;font-size:13px;width:38%;vertical-align:top;">Risk Level</td>'
        f'<td style="padding:9px 14px;vertical-align:top;">'
        f'<span style="background:{risk_color};color:#fff;padding:3px 12px;border-radius:4px;'
        f'font-size:12px;font-weight:700;letter-spacing:0.3px;">{risk_level}</span></td></tr>'
    )

    cause_rows = (
        section_header("Root Cause & Compliance") +
        row("Root Cause Category", root_cause_cat,  shade=True) +
        row("Root Cause Specific",  root_cause_spec) +
        row("Violation",            violation,       shade=True)
    )

    action_rows = (
        section_header("Action Required") +
        row("Contractor(s)",      contractors_str,  shade=True) +
        row("To Be Rectified By", to_rectify) +
        row("EIC",                eic_str,          shade=True) +
        row("Target Date",        target_display) +
        f'<tr><td style="padding:9px 14px;color:#6b7280;font-size:13px;width:38%;background:#f9fafb;vertical-align:top;">Status</td>'
        f'<td style="padding:9px 14px;background:#f9fafb;vertical-align:top;">'
        f'<span style="background:{status_color};color:#fff;padding:3px 12px;border-radius:4px;'
        f'font-size:12px;font-weight:700;">{status}</span></td></tr>'
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:650px;margin:32px auto 48px;background:#ffffff;border-radius:10px;
              overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:28px 32px 24px;">
      <p style="margin:0 0 6px;color:#93c5fd;font-size:12px;font-weight:600;
                text-transform:uppercase;letter-spacing:0.8px;">{header_title}</p>
      <h1 style="margin:0 0 10px;color:#ffffff;font-size:22px;font-weight:700;line-height:1.2;">{obs_id}</h1>
      <p style="margin:0;color:#bfdbfe;font-size:14px;">{project}</p>
      <div style="margin-top:14px;">
        <span style="background:{risk_color};color:#fff;padding:4px 14px;border-radius:20px;
                     font-size:12px;font-weight:700;letter-spacing:0.4px;">{risk_level} RISK</span>
        &nbsp;
        <span style="background:{status_color};color:#fff;padding:4px 14px;border-radius:20px;
                     font-size:12px;font-weight:700;letter-spacing:0.4px;">{status.upper()}</span>
      </div>
    </div>

    <!-- Body table -->
    <table style="width:100%;border-collapse:collapse;">
      {incident_rows}
      {observation_rows}
      {risk_rows}
      {cause_rows}
      {action_rows}
    </table>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
        This is an automated notification from the <strong>Safety Observation System</strong>.
        Please do not reply to this email.
      </p>
    </div>

  </div>
</body>
</html>"""

    return subject, html
