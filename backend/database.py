from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os
from dotenv import load_dotenv

load_dotenv()

_default_db = f"sqlite:///{os.path.join(os.path.dirname(__file__), 'safety.db')}"
DATABASE_URL = os.getenv("DATABASE_URL", _default_db)

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=_connect_args, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _run_migrations():
    """Apply schema migrations that create_all cannot handle (new columns on existing tables)."""
    is_sqlite = DATABASE_URL.startswith("sqlite")

    # Each entry: (table, column, sql_type_sqlite, sql_type_pg)
    # Using None for sql_type_pg means same as sqlite type (no FK syntax differences needed here).
    _obs_columns = [
        ("observations", "contractor_user_ids", "TEXT",                                None),
        ("observations", "target_date_actual",  "VARCHAR",                             None),
        ("observations", "closed_at",           "DATETIME",                            "TIMESTAMP"),
        ("observations", "eic_user_id",         "INTEGER REFERENCES users(id)",        "INTEGER REFERENCES users(id)"),
    ]
    _user_columns = [
        ("users", "mobile", "VARCHAR", None),
    ]
    all_migrations = _obs_columns + _user_columns

    with engine.connect() as conn:
        if is_sqlite:
            conn.execute(text("PRAGMA foreign_keys = ON"))

        for table, column, sqlite_type, pg_type in all_migrations:
            col_type = sqlite_type if is_sqlite else (pg_type or sqlite_type)
            if is_sqlite:
                try:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
                    conn.commit()
                except Exception:
                    pass  # column already exists
            else:
                try:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}"))
                    conn.commit()
                except Exception:
                    pass

        # PostgreSQL: ensure tables created without SERIAL have a proper id sequence.
        # Run each statement separately so a partial failure doesn't block the rest.
        if not is_sqlite:
            _tables_needing_seq = [
                "root_cause_specifics",
                "root_cause_categories",
                "violations",
                "possible_outcomes",
                "target_dates",
                "specific_concerns",
                "core_concerns",
            ]
            for tbl in _tables_needing_seq:
                seq = f"{tbl}_id_seq"
                for stmt in [
                    f"CREATE SEQUENCE IF NOT EXISTS {seq}",
                    f"SELECT setval('{seq}', COALESCE((SELECT MAX(id) FROM {tbl}), 0), true)",
                    f"ALTER TABLE {tbl} ALTER COLUMN id SET DEFAULT nextval('{seq}')",
                    f"ALTER SEQUENCE {seq} OWNED BY {tbl}.id",
                ]:
                    try:
                        conn.execute(text(stmt))
                        conn.commit()
                    except Exception:
                        conn.rollback()  # clear failed transaction so next stmt can run


def init_db():
    from models import Base as ModelBase
    from sqlalchemy.exc import ProgrammingError, IntegrityError
    try:
        ModelBase.metadata.create_all(bind=engine)
    except (ProgrammingError, IntegrityError):
        # Another worker already created the tables (race condition with --workers 2)
        pass
    _run_migrations()
