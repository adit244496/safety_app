"""One-time migration: add columns and tables missing from existing SQLite DB."""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "safety.db")

def col_exists(cur, table, col):
    cur.execute(f"PRAGMA table_info({table})")
    return any(r[1] == col for r in cur.fetchall())

def table_exists(cur, name):
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,))
    return cur.fetchone() is not None

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# ── observations ──────────────────────────────────────────────────────────────
if not col_exists(cur, "observations", "target_date_actual"):
    cur.execute("ALTER TABLE observations ADD COLUMN target_date_actual TEXT")
    print("Added observations.target_date_actual")
else:
    print("observations.target_date_actual already exists")

if not col_exists(cur, "observations", "closed_at"):
    cur.execute("ALTER TABLE observations ADD COLUMN closed_at DATETIME")
    print("Added observations.closed_at")
else:
    print("observations.closed_at already exists")

# ── severity_labels ───────────────────────────────────────────────────────────
if not table_exists(cur, "severity_labels"):
    cur.execute("""
        CREATE TABLE severity_labels (
            id INTEGER PRIMARY KEY,
            level INTEGER NOT NULL UNIQUE,
            label TEXT NOT NULL
        )
    """)
    print("Created severity_labels table")
else:
    print("severity_labels already exists")

# ── probability_labels ────────────────────────────────────────────────────────
if not table_exists(cur, "probability_labels"):
    cur.execute("""
        CREATE TABLE probability_labels (
            id INTEGER PRIMARY KEY,
            level INTEGER NOT NULL UNIQUE,
            label TEXT NOT NULL
        )
    """)
    print("Created probability_labels table")
else:
    print("probability_labels already exists")

# ── escalation_logs ───────────────────────────────────────────────────────────
if not table_exists(cur, "escalation_logs"):
    cur.execute("""
        CREATE TABLE escalation_logs (
            id INTEGER PRIMARY KEY,
            observation_id INTEGER REFERENCES observations(id) ON DELETE CASCADE,
            obs_ref TEXT,
            reminder_number INTEGER NOT NULL DEFAULT 1,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            recipients_json TEXT
        )
    """)
    print("Created escalation_logs table")
else:
    print("escalation_logs already exists")

conn.commit()
conn.close()
print("Migration complete.")
