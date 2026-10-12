from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from database import Base


class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.now)
    buildings = relationship("Building", back_populates="project", cascade="all, delete")
    observers = relationship("Observer", back_populates="project", cascade="all, delete")
    user_projects = relationship("UserProject", back_populates="project", cascade="all, delete")


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # Admin, PIC, EIC, HO, PSO, Contractor, Observer
    mobile = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    user_projects = relationship("UserProject", back_populates="user", cascade="all, delete")


class UserProject(Base):
    __tablename__ = "user_projects"
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    user = relationship("User", back_populates="user_projects")
    project = relationship("Project", back_populates="user_projects")


class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    sort_order = Column(Integer, default=0)
    core_concerns = relationship("CoreConcern", back_populates="category")


class CoreConcern(Base):
    __tablename__ = "core_concerns"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    sort_order = Column(Integer, default=0)
    category = relationship("Category", back_populates="core_concerns")
    specific_concerns = relationship("SpecificConcern", back_populates="core_concern", cascade="all, delete")


class SpecificConcern(Base):
    __tablename__ = "specific_concerns"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    core_concern_id = Column(Integer, ForeignKey("core_concerns.id", ondelete="CASCADE"))
    core_concern = relationship("CoreConcern", back_populates="specific_concerns")


class PossibleOutcome(Base):
    __tablename__ = "possible_outcomes"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)


class TargetDate(Base):
    __tablename__ = "target_dates"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    sort_order = Column(Integer, default=0)


class Violation(Base):
    __tablename__ = "violations"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)


class RootCauseCategory(Base):
    __tablename__ = "root_cause_categories"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    specifics = relationship("RootCauseSpecific", back_populates="category", cascade="all, delete")


class RootCauseSpecific(Base):
    __tablename__ = "root_cause_specifics"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    root_cause_category_id = Column(Integer, ForeignKey("root_cause_categories.id", ondelete="CASCADE"))
    category = relationship("RootCauseCategory", back_populates="specifics")


class Building(Base):
    __tablename__ = "buildings"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"))
    project = relationship("Project", back_populates="buildings")
    floors = relationship("Floor", back_populates="building", cascade="all, delete")


class Floor(Base):
    __tablename__ = "floors"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    building_id = Column(Integer, ForeignKey("buildings.id", ondelete="CASCADE"))
    building = relationship("Building", back_populates="floors")


class Observer(Base):
    __tablename__ = "observers"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    contact = Column(String, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"))
    project = relationship("Project", back_populates="observers")


class Observation(Base):
    __tablename__ = "observations"
    id = Column(Integer, primary_key=True)
    observation_id = Column(String, nullable=False, unique=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    building_id = Column(Integer, ForeignKey("buildings.id"), nullable=True)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=True)
    exact_location = Column(String, nullable=True)
    obs_time = Column(String, nullable=True)
    obs_date = Column(String, nullable=True)
    contractor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)   # primary (first selected)
    contractor_user_ids = Column(Text, nullable=True)   # JSON array of all selected contractor user IDs
    to_be_rectified_by = Column(String, nullable=True)
    observer_name = Column(String, nullable=True)
    core_concern_id = Column(Integer, ForeignKey("core_concerns.id"), nullable=True)
    specific_concern_id = Column(Integer, ForeignKey("specific_concerns.id"), nullable=True)
    specific_concern_text = Column(String, nullable=True)
    possible_outcome = Column(Text, nullable=True)
    severity = Column(Integer, nullable=True)
    probability = Column(Integer, nullable=True)
    risk_factor = Column(Integer, nullable=True)
    risk_level = Column(String, nullable=True)
    root_cause_category_id = Column(Integer, ForeignKey("root_cause_categories.id"), nullable=True)
    root_cause_specific_id = Column(Integer, ForeignKey("root_cause_specifics.id"), nullable=True)
    violation_id = Column(Integer, ForeignKey("violations.id"), nullable=True)
    target_date_id = Column(Integer, ForeignKey("target_dates.id"), nullable=True)
    target_date_actual = Column(String, nullable=True)   # YYYY-MM-DD — actual calendar due date
    eic_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)   # primary (first selected)
    eic_user_ids = Column(Text, nullable=True)                             # JSON array of all selected EIC user IDs
    status = Column(String, nullable=False, default="Open")
    closed_at = Column(DateTime, nullable=True)           # set when status transitions to Closed
    ai_summary = Column(Text, nullable=True)              # cached AI-generated summary
    ai_summary_at = Column(DateTime, nullable=True)       # when the summary was generated
    ai_summary_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # who generated it
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    project = relationship("Project")
    building = relationship("Building")
    floor = relationship("Floor")
    core_concern = relationship("CoreConcern")
    specific_concern = relationship("SpecificConcern")
    root_cause_category = relationship("RootCauseCategory")
    root_cause_specific = relationship("RootCauseSpecific")
    violation = relationship("Violation")
    target_date = relationship("TargetDate")
    creator = relationship("User", foreign_keys=[created_by])
    contractor = relationship("User", foreign_keys=[contractor_user_id])
    eic_user = relationship("User", foreign_keys=[eic_user_id])
    ai_summary_user = relationship("User", foreign_keys=[ai_summary_by])
    images = relationship("ObservationImage", back_populates="observation", cascade="all, delete")
    comments = relationship("ObservationComment", back_populates="observation", cascade="all, delete")


class ObservationImage(Base):
    __tablename__ = "observation_images"
    id = Column(Integer, primary_key=True)
    observation_id = Column(Integer, ForeignKey("observations.id", ondelete="CASCADE"))
    file_path = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    image_type = Column(String, default="initial")
    created_at = Column(DateTime, default=datetime.now)
    observation = relationship("Observation", back_populates="images")
    uploader = relationship("User")


class ObservationComment(Base):
    __tablename__ = "observation_comments"
    id = Column(Integer, primary_key=True)
    observation_id = Column(Integer, ForeignKey("observations.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id"))
    comment = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    observation = relationship("Observation", back_populates="comments")
    user = relationship("User")


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    observation_id = Column(Integer, ForeignKey("observations.id", ondelete="CASCADE"), nullable=True)
    obs_ref = Column(String, nullable=True)      # human-readable obs ID
    message = Column(String, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)
    user = relationship("User")


class EaseTopic(Base):
    __tablename__ = "ease_topics"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    sort_order = Column(Integer, default=0)
    elements = relationship(
        "EaseEvaluationElement", back_populates="topic",
        cascade="all, delete", order_by="EaseEvaluationElement.sort_order",
    )


class EaseEvaluationElement(Base):
    __tablename__ = "ease_evaluation_elements"
    id = Column(Integer, primary_key=True)
    topic_id = Column(Integer, ForeignKey("ease_topics.id", ondelete="CASCADE"))
    question = Column(Text, nullable=False)
    assessment_value = Column(Integer, nullable=False, default=3)
    sort_order = Column(Integer, default=0)
    topic = relationship("EaseTopic", back_populates="elements")


class EaseScoreEntry(Base):
    __tablename__ = "ease_score_entries"
    id = Column(Integer, primary_key=True)
    project_name = Column(String, nullable=False)
    period_month = Column(Integer, nullable=False)
    period_year = Column(Integer, nullable=False)
    date_from = Column(String, nullable=True)
    date_to = Column(String, nullable=True)
    category = Column(String, nullable=False)
    score = Column(Float, nullable=True)
    gradation = Column(String, nullable=True)
    overall_score = Column(Float, nullable=True)
    ease_category = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class SmtpSettings(Base):
    __tablename__ = "smtp_settings"
    id = Column(Integer, primary_key=True)
    smtp_host = Column(String, nullable=False, default="")
    smtp_port = Column(Integer, nullable=False, default=587)
    smtp_username = Column(String, nullable=False, default="")
    smtp_password = Column(String, nullable=False, default="")
    smtp_use_tls = Column(Boolean, default=True)
    from_email = Column(String, nullable=False, default="")
    from_name = Column(String, nullable=False, default="Safety Observation System")
    enabled = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class AiSettings(Base):
    __tablename__ = "ai_settings"
    id = Column(Integer, primary_key=True)
    provider = Column(String, nullable=False, default="anthropic")   # 'anthropic' | 'openai'
    api_key = Column(String, nullable=False, default="")             # Anthropic key
    model = Column(String, nullable=False, default="claude-haiku-4-5-20251001")
    openai_api_key = Column(String, nullable=True, default="")       # OpenAI key
    openai_model = Column(String, nullable=True, default="gpt-4o-mini")
    enabled = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class EaseElementResponse(Base):
    __tablename__ = "ease_element_responses"
    id = Column(Integer, primary_key=True)
    project_name = Column(String, nullable=False)
    period_year = Column(Integer, nullable=False)
    period_month = Column(Integer, nullable=False)
    element_id = Column(Integer, ForeignKey("ease_evaluation_elements.id", ondelete="CASCADE"))
    response = Column(String, nullable=True)  # 'Yes', 'Tending Yes', 'Tending No', 'No', 'NA'
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    element = relationship("EaseEvaluationElement")


class SeverityLabel(Base):
    """Admin-managed labels for each severity level (1–5)."""
    __tablename__ = "severity_labels"
    id = Column(Integer, primary_key=True)
    level = Column(Integer, nullable=False, unique=True)   # 1, 2, 3, 4, 5
    label = Column(String, nullable=False)


class ProbabilityLabel(Base):
    """Admin-managed labels for each probability level (1–5)."""
    __tablename__ = "probability_labels"
    id = Column(Integer, primary_key=True)
    level = Column(Integer, nullable=False, unique=True)   # 1, 2, 3, 4, 5
    label = Column(String, nullable=False)


class Training(Base):
    """Safety / SHE training session record with participant & assessment details."""
    __tablename__ = "trainings"
    id = Column(Integer, primary_key=True)
    training_topic = Column(String, nullable=False)
    training_date = Column(String, nullable=True)      # YYYY-MM-DD
    time_from = Column(String, nullable=True)           # HH:MM (24h)
    time_to = Column(String, nullable=True)             # HH:MM (24h)
    trainer_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    trainer_name = Column(String, nullable=True)        # free-text fallback / display name
    trainer_title = Column(String, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)   # primary (first selected)
    project_ids = Column(Text, nullable=True)           # JSON list of all selected project IDs
    department = Column(String, nullable=True)
    category = Column(String, nullable=True)            # admin-managed training category
    training_type = Column(String, nullable=True)       # Technical / Refresher / Post-Incident / Corrective
    training_content = Column(Text, nullable=True)
    assessment_method = Column(String, nullable=True)   # Written Quiz / Practical / Verbal Review / Attendance Only
    assessment_applicable = Column(Boolean, default=False)  # was an assessment conducted?
    participant_category = Column(String, nullable=True)  # legacy — category is now per-participant
    participants = Column(Text, nullable=True)          # JSON list: [{user_id, name, role, category, assessment_status, score, remarks}]
    participant_count = Column(Integer, default=0)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    project = relationship("Project")
    trainer = relationship("User", foreign_keys=[trainer_user_id])
    creator = relationship("User", foreign_keys=[created_by])


class TrainingCategory(Base):
    """Admin-managed list of training categories."""
    __tablename__ = "training_categories"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    sort_order = Column(Integer, default=0)


class Guideline(Base):
    """Safety guideline PDF uploaded by admins, visible to all users."""
    __tablename__ = "guidelines"
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=True)
    file_path = Column(String, nullable=False)     # stored filename in uploads dir
    file_name = Column(String, nullable=False)     # original filename
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.now)
    uploader = relationship("User")


class WorkPermit(Base):
    """Construction Hazardous Work Permit (CHWP) — contractor-submitted, approved by PIC/PSO/EIC."""
    __tablename__ = "work_permits"
    id = Column(Integer, primary_key=True)
    permit_no = Column(String, nullable=False, unique=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    other_permits = Column(String, nullable=True)

    # Receiver (the contractor receiving the permit)
    receiver_name = Column(String, nullable=True)         # display: joined receiver user names
    receiver_designation = Column(String, nullable=True)  # display: joined receiver roles
    receiver_roles = Column(Text, nullable=True)          # JSON list of selected roles
    receiver_user_ids = Column(Text, nullable=True)       # JSON list of selected receiver user ids
    issued_date = Column(String, nullable=True)          # YYYY-MM-DD

    work_location = Column(String, nullable=True)         # equipment / location
    area = Column(String, nullable=True)                  # building name (from admin)
    floor = Column(String, nullable=True)                 # floor name (from admin)
    starts_at = Column(String, nullable=True)             # datetime-local string
    expires_at = Column(String, nullable=True)
    work_description = Column(Text, nullable=True)
    pre_job_discussion = Column(Boolean, default=False)

    hazard_categories = Column(Text, nullable=True)       # JSON list e.g. ["c2","c4"]
    precautions = Column(Text, nullable=True)             # JSON object keyed by category id

    # Assigned approvers
    pic_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    pso_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    eic_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Workflow
    status = Column(String, nullable=False, default="Draft")
    # Draft | Pending Approval | Approved | Declined | Closure Requested | Closed | Cancelled
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approver_role = Column(String, nullable=True)
    decline_reason = Column(Text, nullable=True)

    closure_type = Column(String, nullable=True)          # one of the 4 closure options
    closure_note = Column(Text, nullable=True)
    closure_requested_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    closure_requested_at = Column(DateTime, nullable=True)
    closure_approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    closed_at = Column(DateTime, nullable=True)

    cancel_reason = Column(Text, nullable=True)
    cancelled_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    cancelled_at = Column(DateTime, nullable=True)

    # Work extension (up to 4h beyond the base window, max 12h total) — requested by
    # contractor, approved by EIC.
    extension_status = Column(String, nullable=True)       # 'Requested' | 'Approved' | 'Declined'
    extension_hours = Column(Float, nullable=True)
    extension_new_expiry = Column(String, nullable=True)
    extension_reason = Column(Text, nullable=True)
    extension_requested_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    extension_requested_at = Column(DateTime, nullable=True)
    extension_approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    extension_approved_at = Column(DateTime, nullable=True)

    history = Column(Text, nullable=True)                 # JSON list of {action, by, name, role, at, note}
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    project = relationship("Project")
    pic_user = relationship("User", foreign_keys=[pic_user_id])
    pso_user = relationship("User", foreign_keys=[pso_user_id])
    eic_user = relationship("User", foreign_keys=[eic_user_id])
    approver = relationship("User", foreign_keys=[approved_by])
    creator = relationship("User", foreign_keys=[created_by])


class PermitWorkType(Base):
    """Admin-managed hazardous work type (CHWP category)."""
    __tablename__ = "permit_work_types"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, nullable=False)   # stable slug used in stored permits
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    has_gas_table = Column(Boolean, default=False)       # show atmospheric gas-test table
    sort_order = Column(Integer, default=0)
    active = Column(Boolean, default=True)
    precautions = relationship(
        "PermitPrecaution", back_populates="work_type",
        cascade="all, delete", order_by="PermitPrecaution.sort_order",
    )


class PermitPrecaution(Base):
    """A single precaution / equipment item under a work type, with an input widget type."""
    __tablename__ = "permit_precautions"
    id = Column(Integer, primary_key=True)
    work_type_id = Column(Integer, ForeignKey("permit_work_types.id", ondelete="CASCADE"))
    item_key = Column(String, nullable=False)            # stable slug within the work type
    section = Column(String, nullable=True)              # grouping heading
    label = Column(Text, nullable=False)
    input_type = Column(String, default="checkbox")      # 'checkbox' | 'toggle' | 'text'
    sort_order = Column(Integer, default=0)
    work_type = relationship("PermitWorkType", back_populates="precautions")


class EscalationLog(Base):
    """Tracks escalation emails sent for overdue observations."""
    __tablename__ = "escalation_logs"
    id = Column(Integer, primary_key=True)
    observation_id = Column(Integer, ForeignKey("observations.id", ondelete="CASCADE"), nullable=False)
    obs_ref = Column(String, nullable=True)        # human-readable observation_id
    reminder_number = Column(Integer, nullable=False, default=1)
    sent_at = Column(DateTime, default=datetime.now)
    recipients_json = Column(Text, nullable=True)  # JSON list of email addresses
    observation = relationship("Observation")


class MeetingMinutes(Base):
    """Minutes of Meeting (MoM) — either typed directly in the app or uploaded as a PDF."""
    __tablename__ = "meeting_minutes"
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    meeting_date = Column(String, nullable=True)          # stored as ISO date string, like observations
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    attendees = Column(Text, nullable=True)               # free-text list of attendees
    entry_type = Column(String, nullable=False, default="text")  # 'text' | 'pdf'
    content = Column(Text, nullable=True)                 # typed minutes body (entry_type='text')
    file_path = Column(String, nullable=True)             # stored PDF filename (entry_type='pdf')
    file_name = Column(String, nullable=True)             # original uploaded filename

    ai_summary = Column(Text, nullable=True)
    ai_summary_at = Column(DateTime, nullable=True)
    ai_summary_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    project = relationship("Project")
    creator = relationship("User", foreign_keys=[created_by])
    ai_summary_user = relationship("User", foreign_keys=[ai_summary_by])


class OhsStatistics(Base):
    """Monthly OH&S Statistics (form OHS-016) for a project, keyed by project + month + year."""
    __tablename__ = "ohs_statistics"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    month = Column(Integer, nullable=False)   # 1-12
    year = Column(Integer, nullable=False)

    company = Column(String, nullable=True)
    expected_duration = Column(String, nullable=True)
    current_age = Column(String, nullable=True)
    contractors_present = Column(Text, nullable=True)

    # JSON-encoded structures (descriptions/labels live on the client & in the report)
    section_a = Column(Text, nullable=True)        # list[4] of {avg_persons, man_hours}
    lti = Column(Text, nullable=True)              # list of {name, company, date, man_days_lost, investigated, report_sent}
    general_summary = Column(Text, nullable=True)  # list[8] of {for_month, cumulative, remarks}
    activities = Column(Text, nullable=True)       # list[14] of {for_month, cumulative, remarks}
    violations = Column(Text, nullable=True)       # list of {date, issued_to, issued_by, type, reason}

    safety_coordinator = Column(String, nullable=True)
    site_incharge = Column(String, nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (UniqueConstraint("project_id", "month", "year", name="uq_ohs_period"),)

    project = relationship("Project")
    updater = relationship("User", foreign_keys=[updated_by])


class PermitImage(Base):
    """Optional photos attached to a work permit — precautions per hazardous work type,
    pre-job discussion, and closure (work status / housekeeping)."""
    __tablename__ = "permit_images"
    id = Column(Integer, primary_key=True)
    permit_id = Column(Integer, ForeignKey("work_permits.id", ondelete="CASCADE"), nullable=False)
    category = Column(String, nullable=False)   # 'hazard:<code>' | 'prejob' | 'closure'
    file_path = Column(String, nullable=False)
    file_name = Column(String, nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    uploader = relationship("User", foreign_keys=[uploaded_by])
    permit = relationship("WorkPermit", backref="images")


class PermitComment(Base):
    """Chat/comment thread on a work permit — visible to all involved roles."""
    __tablename__ = "permit_comments"
    id = Column(Integer, primary_key=True)
    permit_id = Column(Integer, ForeignKey("work_permits.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    user = relationship("User", foreign_keys=[user_id])
    permit = relationship("WorkPermit", backref="comments")


class OhsFormItem(Base):
    """Admin-managed row of the Monthly OH&S Statistics form (OHS-016).
    Covers the fixed-description sections: 'section_a', 'general_summary', 'activities'.
    Values are stored on OhsStatistics keyed by item_key, so rows can be renamed/reordered."""
    __tablename__ = "ohs_form_items"
    id = Column(Integer, primary_key=True)
    section = Column(String, nullable=False)        # 'section_a' | 'general_summary' | 'activities'
    item_key = Column(String, nullable=False)       # stable slug used to key stored values
    label = Column(Text, nullable=False)
    sort_order = Column(Integer, default=0)
    active = Column(Boolean, default=True)


class LegacyData(Base):
    """Single shared store for the Legacy Data dashboard dataset. Admin/SuperAdmin
    upload replaces the stored JSON ({header, rows}); every user with access reads it,
    so legacy data is the same for everyone instead of living in each browser."""
    __tablename__ = "legacy_data"
    id = Column(Integer, primary_key=True)
    data = Column(Text, nullable=True)              # JSON: {"header": [...], "rows": [[...], ...]}
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    updater = relationship("User", foreign_keys=[updated_by])
