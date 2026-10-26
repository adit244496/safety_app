from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from database import init_db, SessionLocal, DATABASE_URL
from seed import seed_data
from seed_ease import seed_ease_scores
from seed_dummy import seed_dummy_data, seed_ease_dummy_data, seed_recent_observations
from seed_ease_criteria import seed_ease_criteria
from seed_permit_config import seed_permit_config
from seed_ohs_form import seed_ohs_form
from routers import auth, users, projects, observations, admin, uploads, notifications, ease_score, guidelines, trainings, work_permits, meeting_minutes, ohs_statistics, legacy_data
from escalation_scheduler import start_scheduler, stop_scheduler

app = FastAPI(title="Safety Observation API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(observations.router)
app.include_router(admin.router)
app.include_router(uploads.router)
app.include_router(notifications.router)
app.include_router(ease_score.router)
app.include_router(trainings.router)
app.include_router(work_permits.router)
app.include_router(guidelines.router)
app.include_router(meeting_minutes.router)
app.include_router(ohs_statistics.router)
app.include_router(legacy_data.router)

# Serve uploaded files
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


_IS_PROD = DATABASE_URL.startswith("postgresql")

_DEFAULT_SEVERITY = {
    0: "No Injury / Not Applicable",
    1: "First Aid only",
    2: "Medical Treatment, no lost time",
    3: "Lost Time Accident",
    4: "Serious Injury / Hospitalisation",
    5: "Fatality",
}
_DEFAULT_PROBABILITY = {
    0: "Not Applicable",
    1: "Very Unlikely",
    2: "Unlikely",
    3: "Possible",
    4: "Likely",
    5: "Almost Certain",
}


def _seed_risk_labels(db):
    """Ensure every default level (0–5) exists — idempotent per level, so it also
    back-fills the new level 0 on databases that were seeded with only 1–5."""
    import models as m
    for lvl, lbl in _DEFAULT_SEVERITY.items():
        if not db.query(m.SeverityLabel).filter(m.SeverityLabel.level == lvl).first():
            db.add(m.SeverityLabel(level=lvl, label=lbl))
    for lvl, lbl in _DEFAULT_PROBABILITY.items():
        if not db.query(m.ProbabilityLabel).filter(m.ProbabilityLabel.level == lvl).first():
            db.add(m.ProbabilityLabel(level=lvl, label=lbl))
    # Target-date risk matrix: seed once (only when empty) from the SHE matrix —
    # rows = probability 1–5, columns = consequence (severity) 1–5, values in hours.
    if not db.query(m.TargetMatrixCell).first():
        D = 24
        matrix = [
            [7*D, 7*D, 6*D, 6*D, 5*D],
            [7*D, 6*D, 4*D, 4*D, 3*D],
            [6*D, 4*D, 3*D, 3*D, 2*D],
            [6*D, 4*D, 3*D, 2*D, 1*D],
            [5*D, 3*D, 2*D, 1*D, 1],      # 5×5 → 1 hour
        ]
        for p, row in enumerate(matrix, start=1):
            for s, hours in enumerate(row, start=1):
                db.add(m.TargetMatrixCell(severity=s, probability=p, hours=hours))
    db.commit()


_DEFAULT_TRAINING_CATEGORIES = [
    "Safety Induction", "Toolbox Talk", "Classroom Session",
    "On-the-Job Training", "Mock Drill / Emergency Response", "Awareness Session",
]


def _seed_training_categories(db):
    import models as m
    if db.query(m.TrainingCategory).count() == 0:
        for i, name in enumerate(_DEFAULT_TRAINING_CATEGORIES):
            db.add(m.TrainingCategory(name=name, sort_order=i))
        db.commit()


@app.on_event("startup")
def startup():
    init_db()
    db = SessionLocal()
    try:
        seed_data(db)
        seed_ease_criteria(db)
        seed_permit_config(db)
        seed_ohs_form(db)
        _seed_risk_labels(db)
        _seed_training_categories(db)
        if not _IS_PROD:
            seed_ease_scores(db)
            seed_dummy_data(db)
            seed_ease_dummy_data(db)
            seed_recent_observations(db)
    finally:
        db.close()
    start_scheduler()


@app.on_event("shutdown")
def shutdown():
    stop_scheduler()


@app.get("/api/health")
def health():
    return {"status": "ok"}
