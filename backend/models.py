from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime, default=func.now())
    buildings = relationship("Building", back_populates="project", cascade="all, delete")
    observers = relationship("Observer", back_populates="project", cascade="all, delete")
    user_projects = relationship("UserProject", back_populates="project", cascade="all, delete")


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # Admin, PIC, AIC, HO, Contractor, Observer
    created_at = Column(DateTime, default=func.now())
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
    contractor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
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
    status = Column(String, nullable=False, default="Open")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

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
    created_at = Column(DateTime, default=func.now())
    observation = relationship("Observation", back_populates="images")
    uploader = relationship("User")


class ObservationComment(Base):
    __tablename__ = "observation_comments"
    id = Column(Integer, primary_key=True)
    observation_id = Column(Integer, ForeignKey("observations.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id"))
    comment = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now())
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
    created_at = Column(DateTime, default=func.now())
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
    created_at = Column(DateTime, default=func.now())


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
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class EaseElementResponse(Base):
    __tablename__ = "ease_element_responses"
    id = Column(Integer, primary_key=True)
    project_name = Column(String, nullable=False)
    period_year = Column(Integer, nullable=False)
    period_month = Column(Integer, nullable=False)
    element_id = Column(Integer, ForeignKey("ease_evaluation_elements.id", ondelete="CASCADE"))
    response = Column(String, nullable=True)  # 'Yes', 'Tending Yes', 'Tending No', 'No', 'NA'
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    element = relationship("EaseEvaluationElement")
