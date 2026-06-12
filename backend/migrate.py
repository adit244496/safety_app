"""
One-time migration: add new columns and tables.
Works with both SQLite (local) and PostgreSQL (EC2/prod).
Run once after deploying the new code:  python migrate.py
"""
from sqlalchemy import text, inspect
from database import engine

insp = inspect(engine)
is_pg = engine.dialect.name == "postgresql"

def col_exists(table, col):
    return col in [c["name"] for c in insp.get_columns(table)]

def table_exists(name):
    return name in insp.get_table_names()

# Column type syntax differs between SQLite and PostgreSQL
VARCHAR = "VARCHAR" if is_pg else "TEXT"
TIMESTAMP = "TIMESTAMP" if is_pg else "DATETIME"
SERIAL = "SERIAL" if is_pg else "INTEGER"
AUTOINCREMENT = "" if is_pg else "AUTOINCREMENT"

with engine.begin() as conn:
    # ── observations.target_date_actual ───────────────────────────────────────
    if not col_exists("observations", "target_date_actual"):
        conn.execute(text(f"ALTER TABLE observations ADD COLUMN target_date_actual {VARCHAR}"))
        print("Added observations.target_date_actual")
    else:
        print("observations.target_date_actual already exists")

    # ── observations.closed_at ────────────────────────────────────────────────
    if not col_exists("observations", "closed_at"):
        conn.execute(text(f"ALTER TABLE observations ADD COLUMN closed_at {TIMESTAMP}"))
        print("Added observations.closed_at")
    else:
        print("observations.closed_at already exists")

    # ── severity_labels ───────────────────────────────────────────────────────
    if not table_exists("severity_labels"):
        if is_pg:
            conn.execute(text("""
                CREATE TABLE severity_labels (
                    id SERIAL PRIMARY KEY,
                    level INTEGER NOT NULL UNIQUE,
                    label VARCHAR NOT NULL
                )
            """))
        else:
            conn.execute(text("""
                CREATE TABLE severity_labels (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    level INTEGER NOT NULL UNIQUE,
                    label TEXT NOT NULL
                )
            """))
        print("Created severity_labels table")
    else:
        print("severity_labels already exists")

    # ── probability_labels ────────────────────────────────────────────────────
    if not table_exists("probability_labels"):
        if is_pg:
            conn.execute(text("""
                CREATE TABLE probability_labels (
                    id SERIAL PRIMARY KEY,
                    level INTEGER NOT NULL UNIQUE,
                    label VARCHAR NOT NULL
                )
            """))
        else:
            conn.execute(text("""
                CREATE TABLE probability_labels (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    level INTEGER NOT NULL UNIQUE,
                    label TEXT NOT NULL
                )
            """))
        print("Created probability_labels table")
    else:
        print("probability_labels already exists")

    # ── escalation_logs ───────────────────────────────────────────────────────
    if not table_exists("escalation_logs"):
        if is_pg:
            conn.execute(text("""
                CREATE TABLE escalation_logs (
                    id SERIAL PRIMARY KEY,
                    observation_id INTEGER REFERENCES observations(id) ON DELETE CASCADE,
                    obs_ref VARCHAR,
                    reminder_number INTEGER NOT NULL DEFAULT 1,
                    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    recipients_json TEXT
                )
            """))
        else:
            conn.execute(text("""
                CREATE TABLE escalation_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    observation_id INTEGER REFERENCES observations(id) ON DELETE CASCADE,
                    obs_ref TEXT,
                    reminder_number INTEGER NOT NULL DEFAULT 1,
                    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    recipients_json TEXT
                )
            """))
        print("Created escalation_logs table")
    else:
        print("escalation_logs already exists")

print("Migration complete.")
