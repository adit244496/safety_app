from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from database import init_db, SessionLocal, DATABASE_URL
from seed import seed_data
from seed_ease import seed_ease_scores
from seed_dummy import seed_dummy_data, seed_ease_dummy_data, seed_recent_observations
from seed_ease_criteria import seed_ease_criteria
from routers import auth, users, projects, observations, admin, uploads, notifications, ease_score
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

# Serve uploaded files
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


_IS_PROD = DATABASE_URL.startswith("postgresql")

@app.on_event("startup")
def startup():
    init_db()
    db = SessionLocal()
    try:
        seed_data(db)
        seed_ease_criteria(db)
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
