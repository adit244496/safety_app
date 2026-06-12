"""
Daily escalation email scheduler.

Runs inside the FastAPI process using APScheduler.
Every day at 08:00 it finds observations that:
  - have a target_date_actual set
  - are overdue (target_date_actual < today)
  - are NOT yet Closed / Draft
  - have an assigned contractor

It then sends an escalation email to the contractor (TO) with the project's
PIC, AIC, HO, and Observer users in CC.

Subsequent reminders include "Reminder #N" in the subject so recipients can
track how many escalations have been sent.
"""

import json
import logging
from datetime import date, datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

import models
from database import SessionLocal
from email_service import send_observation_email

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None

CC_ROLES = {"PIC", "AIC", "HO", "PSO", "Observer"}


def _build_escalation_html(obs: models.Observation, reminder_number: int) -> str:
    reminder_tag = f" — Reminder #{reminder_number}" if reminder_number > 1 else ""
    due = obs.target_date_actual or "N/A"
    days_overdue = (date.today() - date.fromisoformat(due)).days if obs.target_date_actual else "?"

    return f"""
<html><body style="font-family:Arial,sans-serif;color:#374151;max-width:600px;margin:auto">
  <div style="background:#4f46e5;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:white;margin:0">⚠️ Overdue Corrective Action{reminder_tag}</h2>
    <p style="color:#c7d2fe;margin:4px 0 0">Safety Observation System</p>
  </div>
  <div style="background:#fef2f2;border:1px solid #fecaca;padding:16px 24px;margin:0">
    <p style="margin:0;font-weight:600;color:#991b1b">
      Observation <strong>{obs.observation_id}</strong> is
      <strong>{days_overdue} day{'s' if days_overdue != 1 else ''} overdue</strong>
      (due: {due}).
    </p>
  </div>
  <div style="background:white;border:1px solid #e5e7eb;padding:16px 24px">
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#6b7280;width:160px">Project</td>
          <td style="padding:6px 0;font-weight:600">{obs.project.name if obs.project else '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Observation ID</td>
          <td style="padding:6px 0;font-family:monospace">{obs.observation_id}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Core Concern</td>
          <td style="padding:6px 0">{obs.core_concern.name if obs.core_concern else '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Risk Level</td>
          <td style="padding:6px 0"><strong style="color:{'#dc2626' if obs.risk_level=='High' else '#d97706' if obs.risk_level=='Medium' else '#059669'}">{obs.risk_level or '—'}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Status</td>
          <td style="padding:6px 0">{obs.status}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Target Due Date</td>
          <td style="padding:6px 0;color:#dc2626;font-weight:600">{due}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Days Overdue</td>
          <td style="padding:6px 0;color:#dc2626;font-weight:600">{days_overdue}</td></tr>
    </table>
  </div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:12px 24px">
    <p style="margin:0;font-size:13px;color:#6b7280">
      Please complete the corrective action immediately and update the status in the
      Safety Observation System. This is escalation reminder #{reminder_number}.
    </p>
  </div>
</body></html>
"""


def _run_escalation_check():
    db: Session = SessionLocal()
    try:
        smtp = db.query(models.SmtpSettings).first()
        if not smtp or not smtp.enabled:
            logger.info("Escalation check skipped — SMTP not enabled")
            return

        today_str = date.today().isoformat()
        overdue_obs = (
            db.query(models.Observation)
            .filter(
                models.Observation.target_date_actual.isnot(None),
                models.Observation.target_date_actual < today_str,
                models.Observation.status.notin_(["Closed", "Draft"]),
                models.Observation.contractor_user_id.isnot(None),
            )
            .all()
        )

        logger.info("Escalation check: %d overdue observation(s)", len(overdue_obs))

        for obs in overdue_obs:
            # Count previous escalations for reminder numbering
            prev_count = (
                db.query(models.EscalationLog)
                .filter(models.EscalationLog.observation_id == obs.id)
                .count()
            )
            reminder_number = prev_count + 1
            reminder_tag = f" — Reminder #{reminder_number}" if reminder_number > 1 else ""

            # TO: contractor
            to_emails = [obs.contractor.email] if obs.contractor and obs.contractor.email else []
            if not to_emails:
                continue

            # CC: PIC, AIC, HO, Observer roles on the same project
            cc_emails: list[str] = []
            project_users = (
                db.query(models.User)
                .join(models.UserProject, models.User.id == models.UserProject.user_id)
                .filter(
                    models.UserProject.project_id == obs.project_id,
                    models.User.role.in_(CC_ROLES),
                )
                .all()
            )
            for u in project_users:
                if u.email and u.email not in cc_emails and u.email not in to_emails:
                    cc_emails.append(u.email)

            subject = f"[Safety] Overdue Action: {obs.observation_id}{reminder_tag}"
            html = _build_escalation_html(obs, reminder_number)

            ok = send_observation_email(smtp, to_emails, cc_emails, subject, html)
            if ok:
                log = models.EscalationLog(
                    observation_id=obs.id,
                    obs_ref=obs.observation_id,
                    reminder_number=reminder_number,
                    sent_at=datetime.now(),
                    recipients_json=json.dumps({"to": to_emails, "cc": cc_emails}),
                )
                db.add(log)
                db.commit()
                logger.info(
                    "Escalation email #%d sent for %s → %s",
                    reminder_number, obs.observation_id, to_emails,
                )
    except Exception:
        logger.exception("Escalation scheduler error")
    finally:
        db.close()


def start_scheduler():
    global _scheduler
    _scheduler = BackgroundScheduler(daemon=True)
    # Run every day at 08:00 server time
    _scheduler.add_job(_run_escalation_check, CronTrigger(hour=8, minute=0))
    _scheduler.start()
    logger.info("Escalation scheduler started (daily at 08:00)")


def stop_scheduler():
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
