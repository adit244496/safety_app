"""Seed dummy users and observations for demonstration."""
import random
from datetime import date, timedelta
from sqlalchemy.orm import Session
import models

# ─── EASE score categories (must match ease_score.py CATEGORY_ORDER) ─────────
EASE_CATEGORIES = [
    "General Safety",
    "Housekeeping",
    "Personal Protective Equipment and work apparels",
    "Work at Height",
    "Electrical",
    "Welding,  cutting and grinding",
    "Vehicles, Earth movers & Lifting Equipment",
    "Fire Prevention/ Protection",
    "First Aid & Medical Facilities",
    "Welfare Facilities and labour accomodation",
    "Environment Aspects",
    "Piling Work",
    "Excavation and confined space job",
    "Hand tools (manual and power driven)",
]
from auth import hash_password

# ─── Users ──────────────────────────────────────────────────────────────────

DUMMY_USERS = [
    # (name, email, password, role)
    ("Rahul Sharma",    "rahul.pc@safety.com",      "Pass@123", "PC"),
    ("Priya Mehta",     "priya.ho@safety.com",       "Pass@123", "HO"),
    ("Amit Kumar",      "amit.obs@safety.com",        "Pass@123", "Observer"),
    ("Sunita Devi",     "sunita.obs@safety.com",      "Pass@123", "Observer"),
    ("Ravi Patel",      "ravi.obs@safety.com",        "Pass@123", "Observer"),
    ("Meena Joshi",     "meena.obs@safety.com",       "Pass@123", "Observer"),
    ("ABC Construction","abc@safety.com",             "Pass@123", "Contractor"),
    ("XYZ Builders",    "xyz@safety.com",             "Pass@123", "Contractor"),
    ("PQR Infrastructure","pqr@safety.com",           "Pass@123", "Contractor"),
    ("DEF Works",       "def@safety.com",             "Pass@123", "Contractor"),
]

# ─── Observation templates (core_concern_id, observer_name, risk distribution) ─

# Core concern IDs from seed.py data:
# 1-PPE, 2-Floor edge WAH, 4-Machinery, 5-Scaffold WAH, 8-Electrical,
# 9-Hand Tools Manual, 11-Housekeeping, 17-Piling Work, 18-Excavation,
# 21-Welding, 24-Vehicle, 27-Env abuse, 29-Risky Behaviour

CONCERN_IDS = [1, 2, 4, 5, 8, 9, 11, 17, 18, 21, 24, 27, 29, 25]

# Risk combos: (severity, prob) → risk_factor
# Low (≤4): (1,1)=1, (1,2)=2, (2,2)=4, (1,4)=4
# Medium (5-12): (2,3)=6, (3,3)=9, (3,4)=12, (2,4)=8
# High (≥15): (3,5)=15, (4,4)=16, (5,3)=15, (5,4)=20

RISK_LOW    = [(1,1),(1,2),(2,2),(1,4),(2,1),(1,3)]
RISK_MEDIUM = [(2,3),(3,3),(3,4),(2,4),(4,3),(2,6)]
RISK_HIGH   = [(3,5),(4,4),(5,3),(5,4),(4,5),(5,5)]

STATUSES = ["Open", "Closed", "Pending", "Under Review"]

OBSERVER_NAMES = [
    "Amit Kumar", "Sunita Devi", "Ravi Patel", "Meena Joshi",
    "Deepak Singh", "Neha Verma", "Suresh Babu", "Pooja Nair",
]

LOCATIONS = [
    "Block A - Ground Floor", "Tower B - Level 3", "Site Entrance",
    "Basement Parking", "Terrace Level", "Common Area Wing C",
    "Utility Area", "Construction Zone East", "Scaffolding Zone",
]


def _calc_risk(sev: int, prob: int):
    f = sev * prob
    if f <= 4:
        return f, "Low"
    if f <= 12:
        return f, "Medium"
    return f, "High"


def _rand_date_in_quarter(fy_start: int, q: int) -> str:
    """Return a random obs_date string within the given Indian FY quarter."""
    if q == 1:   # Apr-Jun of fy_start
        start = date(fy_start, 4, 1)
        end   = date(fy_start, 6, 30)
    elif q == 2: # Jul-Sep of fy_start
        start = date(fy_start, 7, 1)
        end   = date(fy_start, 9, 30)
    elif q == 3: # Oct-Dec of fy_start
        start = date(fy_start, 10, 1)
        end   = date(fy_start, 12, 31)
    else:        # Jan-Mar of fy_start+1
        start = date(fy_start + 1, 1, 1)
        end   = date(fy_start + 1, 3, 31)
    delta = (end - start).days
    return (start + timedelta(days=random.randint(0, delta))).strftime("%Y-%m-%d")


def seed_dummy_data(db: Session):
    if db.query(models.User).count() > 2:
        return  # Already seeded (admin + Ankit = 2)

    random.seed(42)

    # ── 1. Create users ──────────────────────────────────────────────────────
    user_map: dict[str, models.User] = {}
    for name, email, pwd, role in DUMMY_USERS:
        u = models.User(name=name, email=email, password_hash=hash_password(pwd), role=role)
        db.add(u)
        db.flush()
        user_map[role if role not in user_map else f"{role}_{name}"] = u
    db.flush()

    contractors = db.query(models.User).filter(models.User.role == "Contractor").all()
    observers_list = OBSERVER_NAMES

    # ── 2. Assign buildings to projects ─────────────────────────────────────
    projects = db.query(models.Project).order_by(models.Project.id).all()
    buildings = db.query(models.Building).all()

    # Assign first 5 buildings to first project (AMTALA), create more for UTPALAA
    for b in buildings:
        b.project_id = projects[0].id  # AMTALA

    utpalaa = next((p for p in projects if "UTPALAA" in p.name.upper()), projects[9])
    amtala  = projects[0]
    ecospace = next((p for p in projects if "ECOSPACE" in p.name.upper()), projects[1])
    usshar  = next((p for p in projects if "USSHAR" in p.name.upper()), projects[2])

    tower_names = ["Tower A", "Tower B", "Tower C", "Tower D"]
    for tname in tower_names:
        db.add(models.Building(name=tname, project_id=utpalaa.id))
    db.add(models.Building(name="Block 1", project_id=ecospace.id))
    db.add(models.Building(name="Block 2", project_id=ecospace.id))
    db.flush()

    utpalaa_buildings = db.query(models.Building).filter(models.Building.project_id == utpalaa.id).all()
    amtala_buildings  = db.query(models.Building).filter(models.Building.project_id == amtala.id).all()

    # ── 3. Assign users to projects ──────────────────────────────────────────
    pc_user  = db.query(models.User).filter(models.User.role == "PC").first()
    ho_user  = db.query(models.User).filter(models.User.role == "HO").first()

    for proj in [utpalaa, amtala, ecospace, usshar]:
        for u in ([pc_user, ho_user] + contractors[:2]):
            if u:
                exists = db.query(models.UserProject).filter_by(user_id=u.id, project_id=proj.id).first()
                if not exists:
                    db.add(models.UserProject(user_id=u.id, project_id=proj.id))
    db.flush()

    # ── 4. Generate observations ─────────────────────────────────────────────
    core_concerns = db.query(models.CoreConcern).all()
    cc_map = {cc.id: cc for cc in core_concerns}
    available_cc_ids = [cc.id for cc in core_concerns]

    # Quarters: FY 24-25 Q1,Q2,Q3,Q4 and FY 25-26 Q1
    # (fy_start, q) → used for date generation
    quarters = [
        (2024, 1), (2024, 2), (2024, 3), (2024, 4),
        (2025, 1),
    ]

    # Projects x contractors combos
    project_contractor = [
        (utpalaa, contractors[0] if contractors else None, utpalaa_buildings),
        (utpalaa, contractors[1] if len(contractors) > 1 else None, utpalaa_buildings),
        (amtala,  contractors[2] if len(contractors) > 2 else None, amtala_buildings),
        (amtala,  contractors[0] if contractors else None, amtala_buildings),
        (ecospace, contractors[1] if len(contractors) > 1 else None, []),
        (usshar,  contractors[3] if len(contractors) > 3 else None, []),
    ]

    obs_count = 0
    admin_user = db.query(models.User).filter(models.User.role == "Admin").first()
    creator_id = admin_user.id if admin_user else 1

    for fy_start, q in quarters:
        # ~20 observations per quarter
        for _ in range(22):
            proj, contractor, bldgs = random.choice(project_contractor)
            if contractor is None:
                contractor = random.choice(contractors) if contractors else None

            bldg = random.choice(bldgs) if bldgs else None
            cc_id = random.choice(available_cc_ids)

            # Weight towards Low/Medium to produce ~80% compliance
            weights = [0.45, 0.38, 0.17]  # Low, Medium, High
            risk_type = random.choices(["low", "medium", "high"], weights=weights)[0]
            if risk_type == "low":
                sev, prob = random.choice(RISK_LOW)
            elif risk_type == "medium":
                sev, prob = random.choice(RISK_MEDIUM)
            else:
                sev, prob = random.choice(RISK_HIGH)

            # Clamp probability to valid range
            prob = min(prob, 5)
            factor, level = _calc_risk(sev, prob)

            # Status: mostly Closed for older quarters
            if fy_start == 2024:
                status = random.choices(["Open", "Closed", "Pending", "Under Review"],
                                        weights=[0.1, 0.7, 0.1, 0.1])[0]
            else:
                status = random.choices(["Open", "Closed", "Pending", "Under Review"],
                                        weights=[0.35, 0.35, 0.15, 0.15])[0]

            obs_date = _rand_date_in_quarter(fy_start, q)
            prefix = "".join(c for c in proj.name if c.isalnum()).upper()[:4]
            obs_count += 1
            obs_id_str = f"{prefix}-{obs_date.replace('-','')[:8]}-{str(obs_count).zfill(4)}"

            obs = models.Observation(
                observation_id=obs_id_str,
                project_id=proj.id,
                building_id=bldg.id if bldg else None,
                floor_id=None,
                exact_location=random.choice(LOCATIONS),
                obs_time=f"{random.randint(8,17):02d}:{random.choice(['00','15','30','45'])}",
                obs_date=obs_date,
                contractor_user_id=contractor.id if contractor else None,
                observer_name=random.choice(observers_list),
                core_concern_id=cc_id,
                severity=sev,
                probability=prob,
                risk_factor=factor,
                risk_level=level,
                status=status,
                created_by=creator_id,
            )
            db.add(obs)

    db.commit()
    print(f"Dummy data seeded: {len(DUMMY_USERS)} users, {obs_count} observations")


def _ease_gradation(score: float) -> str:
    if score >= 0.90: return "EXCELLENT"
    if score >= 0.75: return "GOOD"
    if score >= 0.60: return "AVERAGE"
    return "BELOW AVERAGE"


def seed_ease_dummy_data(db: Session):
    """Insert EASE score entries for the last 4 months if none exist."""
    if db.query(models.EaseScoreEntry).count() > 0:
        return

    random.seed(77)
    today = date.today()

    # Build last 4 calendar months (oldest → newest)
    periods = []
    for offset in range(3, -1, -1):
        m = today.month - offset
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        periods.append((y, m))

    projects = db.query(models.Project).order_by(models.Project.id).limit(3).all()
    project_names = [p.name for p in projects]

    count = 0
    for project_name in project_names:
        for year, month in periods:
            # Random score per category (mostly AVERAGE → EXCELLENT range)
            cat_scores = [round(random.uniform(0.62, 0.97), 4) for _ in EASE_CATEGORIES]
            overall    = round(sum(cat_scores) / len(cat_scores), 4)
            overall_grad = _ease_gradation(overall)

            for cat, score in zip(EASE_CATEGORIES, cat_scores):
                db.add(models.EaseScoreEntry(
                    project_name=project_name,
                    period_year=year,
                    period_month=month,
                    category=cat,
                    score=score,
                    gradation=_ease_gradation(score),
                    overall_score=overall,
                    ease_category=overall_grad,
                ))
            count += 1

    db.commit()
    print(f"EASE dummy data seeded: {len(project_names)} projects × {len(periods)} months = {count} period entries")


def seed_recent_observations(db: Session):
    """Add ~25 observations dated in the last 60 days if none exist in that window."""
    today = date.today()
    cutoff = (today - timedelta(days=60)).isoformat()
    recent_count = db.query(models.Observation).filter(
        models.Observation.obs_date >= cutoff
    ).count()
    if recent_count >= 10:
        return  # Already have recent data

    random.seed(55)
    admin_user  = db.query(models.User).filter(models.User.role == "Admin").first()
    creator_id  = admin_user.id if admin_user else 1
    projects    = db.query(models.Project).order_by(models.Project.id).limit(4).all()
    contractors = db.query(models.User).filter(models.User.role == "Contractor").all()
    cc_ids      = [cc.id for cc in db.query(models.CoreConcern).all()]

    obs_count = db.query(models.Observation).count()

    for _ in range(25):
        proj       = random.choice(projects)
        contractor = random.choice(contractors) if contractors else None
        cc_id      = random.choice(cc_ids) if cc_ids else None
        days_ago   = random.randint(0, 59)
        obs_date   = (today - timedelta(days=days_ago)).isoformat()

        risk_type = random.choices(["low", "medium", "high"], weights=[0.40, 0.40, 0.20])[0]
        if risk_type == "low":
            sev, prob = random.choice(RISK_LOW)
        elif risk_type == "medium":
            sev, prob = random.choice(RISK_MEDIUM)
        else:
            sev, prob = random.choice(RISK_HIGH)
        prob = min(prob, 5)
        factor, level = _calc_risk(sev, prob)

        status = random.choices(
            ["Open", "Closed", "Pending", "Under Review"],
            weights=[0.35, 0.30, 0.20, 0.15]
        )[0]

        prefix = "".join(c for c in proj.name if c.isalnum()).upper()[:4]
        obs_count += 1
        obs_id_str = f"{prefix}-{obs_date.replace('-','')[:8]}-R{str(obs_count).zfill(3)}"

        db.add(models.Observation(
            observation_id=obs_id_str,
            project_id=proj.id,
            obs_date=obs_date,
            obs_time=f"{random.randint(8, 17):02d}:{random.choice(['00','15','30','45'])}",
            contractor_user_id=contractor.id if contractor else None,
            observer_name=random.choice(OBSERVER_NAMES),
            core_concern_id=cc_id,
            severity=sev,
            probability=prob,
            risk_factor=factor,
            risk_level=level,
            status=status,
            created_by=creator_id,
            exact_location=random.choice(LOCATIONS),
        ))

    db.commit()
    print(f"Recent observations seeded: 25 observations in the last 60 days")
