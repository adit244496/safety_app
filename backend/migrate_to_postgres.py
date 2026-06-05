"""
Migrate data from local SQLite (safety.db) to a PostgreSQL database.

Usage:
    python migrate_to_postgres.py postgresql://user:password@host:5432/safety_db

Run this ONCE after setting up PostgreSQL on EC2.
The target PostgreSQL DB must already exist and tables must be created
(start the app once first so init_db() creates them, then stop it and run this).
"""

import sys
import os
from sqlalchemy import create_engine, text, MetaData, Table, inspect

SQLITE_URL = f"sqlite:///{os.path.join(os.path.dirname(__file__), 'safety.db')}"

# Tables in FK-safe insertion order
TABLE_ORDER = [
    "categories",
    "projects",
    "users",
    "possible_outcomes",
    "target_dates",
    "violations",
    "root_cause_categories",
    "ease_topics",
    "smtp_settings",
    "core_concerns",
    "buildings",
    "observers",
    "root_cause_specifics",
    "ease_evaluation_elements",
    "ease_score_entries",
    "specific_concerns",
    "user_projects",
    "floors",
    "observations",
    "ease_element_responses",
    "observation_images",
    "observation_comments",
    "notifications",
]


def migrate(pg_url: str):
    print(f"Source : {SQLITE_URL}")
    print(f"Target : {pg_url}\n")

    src_engine = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
    dst_engine = create_engine(pg_url)

    src_meta = MetaData()
    src_meta.reflect(bind=src_engine)

    dst_inspector = inspect(dst_engine)
    dst_tables = dst_inspector.get_table_names()

    with src_engine.connect() as src_conn, dst_engine.connect() as dst_conn:
        # Disable FK checks during import (PostgreSQL uses deferred approach via DEFERRABLE,
        # but we rely on correct table order instead — simpler)
        for table_name in TABLE_ORDER:
            if table_name not in src_meta.tables:
                print(f"  skip  {table_name} (not in source)")
                continue
            if table_name not in dst_tables:
                print(f"  skip  {table_name} (not in destination — run app once to create tables)")
                continue

            src_table = src_meta.tables[table_name]
            rows = src_conn.execute(src_table.select()).mappings().all()

            if not rows:
                print(f"  empty {table_name}")
                continue

            dst_table = Table(table_name, MetaData(), autoload_with=dst_engine)

            # Clear destination table before inserting
            dst_conn.execute(dst_table.delete())

            dst_conn.execute(dst_table.insert(), [dict(r) for r in rows])
            dst_conn.commit()
            print(f"  ok    {table_name} — {len(rows)} rows")

        # Reset PostgreSQL sequences so auto-increment IDs continue from current max
        print("\nResetting sequences...")
        for table_name in TABLE_ORDER:
            if table_name not in dst_tables:
                continue
            try:
                dst_conn.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM {table_name}), 1))"
                ))
                dst_conn.commit()
            except Exception:
                pass  # table has no serial id column (e.g. user_projects)

    print("\nMigration complete.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python migrate_to_postgres.py postgresql://user:password@host:5432/safety_db")
        sys.exit(1)
    migrate(sys.argv[1])
