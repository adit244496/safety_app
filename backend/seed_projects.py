"""
Run once to populate projects, buildings/towers, and floors.
Usage: python seed_projects.py
"""
from database import SessionLocal, init_db
import models

PROJECTS = [
    "AMTALA", "ECOSPACE", "USSHAR", "IFS PROJECT", "GANGA KUTIR 1 & 2",
    "SAGAR KUTIR", "ECOSPACE RESIDENCIA", "LATAGURI", "UDYATT", "UTPALAA",
    "URVISHA", "MAKAIBARI", "UTSODHAARA", "GHOOM PROJECT", "UTALIKA",
]

BUILDINGS = [
    "Tower C~ MIG",
    "Tower C~ HIG",
    "Tower-C ~ PARKING AREA",
    "Tower C ~ STP",
    "Tower C ~ UGR",
]

FLOORS = [f"Floor {i}" for i in range(1, 36)]   # Floor 1 … Floor 35


def seed():
    init_db()
    db = SessionLocal()
    try:
        added = {"projects": 0, "buildings": 0, "floors": 0}

        # Projects
        for name in PROJECTS:
            if not db.query(models.Project).filter(models.Project.name == name).first():
                db.add(models.Project(name=name))
                added["projects"] += 1

        db.flush()

        # Buildings (no project link yet)
        for name in BUILDINGS:
            if not db.query(models.Building).filter(models.Building.name == name).first():
                db.add(models.Building(name=name, project_id=None))
                added["buildings"] += 1

        db.flush()

        # Floors (no building link yet)
        for name in FLOORS:
            if not db.query(models.Floor).filter(models.Floor.name == name).first():
                db.add(models.Floor(name=name, building_id=None))
                added["floors"] += 1

        db.commit()
        print(f"Seeded: {added['projects']} projects, {added['buildings']} buildings, {added['floors']} floors")
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
