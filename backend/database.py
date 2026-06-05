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


def init_db():
    from models import Base as ModelBase
    from sqlalchemy.exc import ProgrammingError, IntegrityError
    try:
        ModelBase.metadata.create_all(bind=engine)
    except (ProgrammingError, IntegrityError):
        # Another worker already created the tables (race condition with --workers 2)
        pass
    if DATABASE_URL.startswith("sqlite"):
        with engine.connect() as conn:
            conn.execute(text("PRAGMA foreign_keys = ON"))
            conn.commit()
