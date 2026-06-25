from sqlalchemy.orm import Session
from auth import hash_password
import models


CATEGORIES = [
    "General safety", "Housekeeping", "PPE and Work apparels", "Work at Height",
    "Electrical", "Welding cutting grinding", "Vehicles", "Earth Moving Equipment",
    "Lifting Appliances and Gear", "Fire Prevention / Protection", "First Aid and Medicals",
    "Welfare facilities and Labour accommodation", "Environment Aspects", "Piling Work",
    "Excavation & Confined space job", "Hand tools and Power tools",
]

CORE_CONCERNS = [
    ("General safety", "Personal Protective equipment", [
        "Damaged / Worn out PPE", "Safety Helmet not worn", "Safety shoes not worn",
        "Full body harness not worn", "Improper anchoring of safety harness",
        "Safety jacket not worn", "No PPEs worn at all", "Job specific PPEs not worn",
    ]),
    ("Work at Height", "Floor edge (Work at height)", [
        "Not barricaded / inadequately barricaded",
        "Safety net to protect fall of person is not provided",
        "Safety net to protect fall of material is not provided",
        "Damaged barricade. Needs repair", "No warning signage",
        "Safety net is either damaged or improperly fixed.",
        "Barricaded using unapproved means", "Debris accumulation on safety nets",
    ]),
    ("Work at Height", "Floor opening (Work at height)", [
        "Not barricaded / inadequately barricaded", "Barricaded using unapproved means",
        "Safety net is required but not fixed", "Uncovered pits", "No warning signage",
        "Safety net is either damaged or improperly fixed.",
        "Damaged barricade. Needs repair", "Debris accumulation on safety nets",
    ]),
    ("General safety", "Machinery", [
        "Unguarded rotating part", "Damaged", "Accessories missing",
        "Safety gadgets missing", "Faulty", "No certification obtained",
        "Manipulated / Improvised / tampered",
    ]),
    ("Work at Height", "Scaffold (Work at height)", [
        "Substandard materials used for construction", "Members missing", "Not in plumb",
        "Bad ground condition", "Improper footing", "Inadequately supported",
        "Appropriate tag missing", "Incomplete but still in use", "Close to power line",
    ]),
    ("Work at Height", "Ladder (Work at height)", [
        "Unsupported", "Damaged", "Bad ground condition",
        "Manipulated / Improvised / tampered", "Unmanned",
        "Inappropriate for the task", "Wrongly positioned",
    ]),
    ("Work at Height", "Work platform (Work at height)", [
        "Substandard materials used for construction", "Members missing", "Handrails missing",
        "Inadequately secured", "No lifeline provided for anchorage",
        "Lifeline is not as per standard", "Inadequately supported", "Inadequately decked",
        "No approach path", "Incomplete", "Close to power line", "Appropriate tag missing",
    ]),
    ("Electrical", "Electrical", [
        "No plug top / Bare wires inserted", "Substandard plug top",
        "RCCB not available / substandard", "RCCB inadequate in number",
        "Substandard distribution box / extension board", "Damaged power cable",
        "Cable in contact with sharp edges", "Substandard cable Joint",
        "Poor illumination", "No fire fighting device", "Improper cable routing",
        "No rescue kit", "No earthing", "No rubber mat",
        "Use of unapproved wires", "Substandard / inadequate insulation",
    ]),
    ("Hand tools and Power tools", "Hand Tools Manual", [
        "Wrong tool used for the job", "Insulation worn out", "Damaged / Worn out",
        "Faulty", "Manipulated / Improvised / tampered",
    ]),
    ("Hand tools and Power tools", "Hand Tools Power driven", [
        "Unguarded rotating part", "Electrical protection deteriorated",
        "Accessories missing /mismatch", "Damaged / Worn out",
        "Faulty", "Manipulated / Improvised / tampered",
    ]),
    ("Housekeeping", "Housekeeping", [
        "Improper stacking of materials", "Unclean work place",
        "Chemicals / Fuels not stored as per recommendations", "Materials found scattered",
        "Protruding rods or nails", "Sharp objects in exposed condition",
        "Obstacles / Obstruction", "Danger of slipping", "Danger of tripping",
        "Storage of inflammables haphazardly", "Walkways / Aisles are cluttered",
        "Walkways / Aisles are not designated or marked",
        "Severe undulation on the road/path", "Loose materials at floor edge",
        "Debris accumulation in non-designated place",
        "Insufficient numbers of safety posters and sign boards", "Stagnant water",
    ]),
    ("Welfare facilities and Labour accommodation", "Labour Welfare at work place", [
        "Insufficient/No provision of drinking water",
        "Insufficient/No provision of shelter at work place",
        "Insufficient/No urinals at work place", "Insufficient number of First Aid box",
        "Stretcher unavailable / insufficient", "Resting in non-designated area",
        "Inappropriate attire at work",
    ]),
    ("Welfare facilities and Labour accommodation", "Labour Hutment", [
        "Hole in walls and roof", "Substandard flooring", "Poor illumination",
        "Poor housekeeping inside rooms", "Constructed using inflammable material",
        "Substandard bedding", "Inadequate ventilation",
        "Sharp objects in exposed condition", "Unapproved materials used for construction",
        "Unapproved design", "Insufficient number of First Aid box",
        "Stretcher not available", "Unapproved electrical distribution",
        "Substandard sanitation system", "Storage of inflammables haphazardly",
        "Lack of hygiene", "Stagnant water", "Substandard Cooking facilities",
        "Improper stacking of materials",
    ]),
    ("Lifting Appliances and Gear", "Lifting Appliances", [
        "Unguarded rotating part", "Damaged", "Accessories missing",
        "Safety gadgets missing", "Faulty", "No certification obtained", "Manipulated",
    ]),
    ("Lifting Appliances and Gear", "Lifting Tools and Tackles", [
        "Unguarded", "Damaged", "Faulty", "No certification obtained", "Manipulated",
    ]),
    ("Earth Moving Equipment", "Earth moving equipment", [
        "Missing accessories", "Damaged", "Faulty", "No certification obtained", "Manipulated",
    ]),
    ("Piling Work", "Piling Work", [
        "Damaged lifting tools and tackles", "Abandoned pile pits",
        "Work place unapproachable", "Faulty Rig", "Faulty winch",
        "Missing accessories", "Unguarded rotating part",
        "No certification obtained", "Manipulated / Improvised / tampered",
    ]),
    ("Excavation & Confined space job", "Excavation", [
        "No hard barricade (>1.2 m)", "No soft barricade (<1.2 m)",
        "Improper access", "Undercut", "No sloping or benching",
        "No shoring / struting", "No caution boards",
        "Materials close to edge of excavated area",
        "Inadequate illumination", "Water accumulation",
    ]),
    ("Fire Prevention / Protection", "Firefighting", [
        "Inadequate number of extinguisher", "Inappropriate extinguisher",
        "Damaged fire fighting equipment", "Incorrect positioning of extinguishers",
    ]),
    ("General safety", "Working near or on waterbody", [
        "Persons not physically fit", "Machinery manipulated / Improvised / tampered",
        "No rescue equipment", "No supervision", "No barricade", "Faulty pontoon / vessel",
    ]),
    ("Welding cutting grinding", "Welding", [
        "Poor condition of machine", "Poor condition of cable", "Safety gadgets missing",
        "Job specific PPEs not worn", "Improper accessories", "No lugs", "No earthing",
    ]),
    ("Welding cutting grinding", "Gas cutting", [
        "No Flash back arrestor", "Poor hose condition", "Mismatch of hose colour",
        "Job specific PPEs not worn", "Poor gauge condition",
        "Improper positioning of gas cylinders", "Hotwork near combustible materials",
    ]),
    ("Welding cutting grinding", "Grinding", [
        "Damaged cutting wheel", "Job specific PPEs not worn",
        "Inappropriate cutting wheel", "Unguarded rotating part", "Manipulated machine",
    ]),
    ("Vehicles", "Vehicle", [
        "Missing accessories", "Damaged", "Faulty", "No certification obtained", "Manipulated",
    ]),
    ("Excavation & Confined space job", "Confined space entry", [
        "Entry without permission", "Persons not physically fit", "No supervision",
        "Entry without information", "Safety gadgets missing / inadequate",
        "Entry without testing", "Entry without precaution",
    ]),
    ("General safety", "Manual material handling", [
        "Wrong process of lifting load", "Insufficient persons", "Cluttered route",
        "Head loading", "Wrong posture of persons", "Excess load being lifted",
    ]),
    ("Environment Aspects", "Environment abuse", [
        "Possibility of Oil spillage", "Possibility of Chemical spillage",
        "Excessive dusty conditions", "Excessively noisy", "Muddy conditions of roads",
    ]),
    ("General safety", "Working condition", [
        "Excessively Noisy", "Excessively dusty", "Undulated floor condition",
        "Poorly Illuminated / Dark Work place", "Presence of chemical or fumes",
        "Damp and Moist", "Hot and humid", "Congested",
    ]),
    ("General safety", "Risky Behaviour", [
        "Driving/ Operating : recklessly/wrongly", "Driving/ Operating without authority",
        "Driving / Operating without permission", "Horse playing / Teasing",
        "Using unsafe alternative device / tools", "Standing / moving inside swing area",
        "Standing / moving under the load", "Adopting unsafe technique to perform task",
        "Adopting incorrect lifting techniques", "Violating safety instructions",
        "Using wrong tools for the task", "Smoking",
        "Working under influence of alcohol", "Abusing Personal Protective Equipment",
        "Person either below 18 or above 58",
    ]),
    ("General safety", "Praiseworthy observation", []),
    ("General safety", "Other issue", []),
]

POSSIBLE_OUTCOMES = [
    "Person may fall on the same level", "Person may fall from height",
    "Person may get hit", "Person may drown",
    "Person may receive electrical shock", "Person may get burns",
    "Person may lose eyesight", "Person may choke",
    "Person may get runover by vehicle", "Person may fall ill",
    "Person may not be visible from distance", "Person may hurt his/her feet",
    "Person may get entangled", "Materials may roll down",
    "Materials may fall from height", "Danger of explosion",
    "Soil pollution", "Water pollution", "Air pollution",
    "Project may look shabby", "Fire may occur",
    "Chances of property damage", "Soil subsidence",
    "Violation of legal obligation", "Emergency evacuation may be difficult",
    "Vehicular collision / topple / subsidence", "No chance of anything happening",
]

TARGET_DATES = [
    (1, "Stop the job. Rectify immediately"),
    (2, "Rectify before the job starts"),
    (3, "Rectify within 2 days"),
    (4, "Rectify within 4 days"),
    (5, "Rectify within 7 days"),
    (6, "Continue the good practice"),
]

VIOLATIONS = [
    "Job procedure unavailable", "Job procedure inaccurate", "Job procedure violated",
    "Job procedure not explained properly", "Instructions not understood",
    "Supervision not present", "Supervision not competent", "Supervision not strong",
    "Workman not competent", "Workman physically unfit", "Lack of training on the task",
    "No maintenance / servicing", "Irregular maintenance / servicing",
    "Disobeying the supervision", "Noticed but moved on",
    "Clause not mentioned in contract", "Contract clause not enforced",
    "Confusion / Misunderstanding", "Poor perception of danger",
    "Overconfidence", "Haste and Hurry", "Unergonomic workplace", "Unhygienic work place",
]

ROOT_CAUSES = [
    ("Procedures", [
        "Inadequate team that developed the procedure.",
        "Inadequate feedback about the procedures.", "Bypassing procedure",
        "Lack of standardization.",
        "Personnel not informed about procedures.", "Lack of Procedure",
        "Lack of requirement to have task procedure.",
    ]),
    ("Conflicting targets", [
        "Conflict between production and safe working practices.",
        "Conflict between financial priorities and safe working practices.",
        "Conflict between social and domestic priorities on safe working practices.",
        "Conflict between individual priorities and safe working practices.",
    ]),
    ("Communication", [
        "Language problem / Cultural barriers.", "Lack of clear lines of communications.",
        "Overruling the supervision", "Inadequate Feedback.",
        "No standardization of information formats.",
        "Inadequate communication between design and user, allowing substandard conditions to remain.",
        "Lines of communication overloaded.",
    ]),
    ("Hardware", [
        "Inadequate specification of equipment.", "Wrong components purchased / used.",
        "Equipment may not be available leading to improvisation.",
        "Defective equipments.", "Age of equipment compared to life expectancy.",
        "Servicing / Maintenance are not carried out in time.",
    ]),
    ("Design", [
        "Design not fully understood to operate safely.",
        "Poor specifications leading to substandard material and inherent weakness in the system.",
        "Specifications not complied with requirement.", "Not ergonomically designed.",
    ]),
    ("Environmental Conditions", [
        "Poor morals caused by a number of situations e.g. unfair enforcement of rules, weak discipline etc.",
        "Physical deterioration, caused by long working hours, subject to undue pressure.",
        "Staff unable to cope up or respond to emergency or unusual situation.",
        "Information not correct or supplied.",
        "Poor co-ordination between departments causing interface problems.",
        "Circumstantial factors such as domestic pressures, homesickness etc.",
    ]),
    ("Training", [
        "Ineffective pre-employment selection.",
        "Poor education not compatible with job requirements.",
        "No structured planning of training programmes.",
        "No assessment of training effectiveness.",
        "Ineffective training - Lack of subject Knowledge",
        "Training not appropriate for the personnel selected.",
        "Lack of Anticipation or foresightedness",
    ]),
    ("Organization", [
        "Inadequately defined departments or parts of organization.",
        "Unclear accountability, responsibility or delegation structure.",
        "Inadequate definitions of objectives and co-ordination of project and tasks.",
        "Frequent reorganization of departments.", "Too much bureaucracy and rigidity.",
    ]),
    ("Maintenance", [
        "Inadequate maintenance programme.", "Shortage of maintenance personnel.",
        "Financial or time constraints.",
    ]),
    ("Discipline", [
        "Ergonomic consideration, human limitation e.g., size and strength of individuals.",
        "Looking the other way",
        "Financial and other constraints during design/execution phase.",
        "Poor discipline and enforcement",
    ]),
]


def seed_data(db: Session):
    # Seed lookup data only if the categories table is empty
    if not db.query(models.Category).first():
        cat_map = {}
        for i, name in enumerate(CATEGORIES):
            cat = models.Category(name=name, sort_order=i)
            db.add(cat)
            db.flush()
            cat_map[name] = cat.id

        for i, (cat_name, cc_name, specifics) in enumerate(CORE_CONCERNS):
            cc = models.CoreConcern(name=cc_name, category_id=cat_map.get(cat_name), sort_order=i)
            db.add(cc)
            db.flush()
            for sc_name in specifics:
                db.add(models.SpecificConcern(name=sc_name, core_concern_id=cc.id))

        for name in POSSIBLE_OUTCOMES:
            db.add(models.PossibleOutcome(name=name))

        for sort_order, name in TARGET_DATES:
            db.add(models.TargetDate(name=name, sort_order=sort_order))

        for name in VIOLATIONS:
            db.add(models.Violation(name=name))

        for cat_name, specifics in ROOT_CAUSES:
            rcc = models.RootCauseCategory(name=cat_name)
            db.add(rcc)
            db.flush()
            for name in specifics:
                db.add(models.RootCauseSpecific(name=name, root_cause_category_id=rcc.id))

        db.commit()
        print("Lookup data seeded successfully.")

    # Create default admin user if not present (independent of lookup data)
    if not db.query(models.User).filter_by(email="admin@safety.com").first():
        db.add(models.User(
            name="Administrator",
            email="admin@safety.com",
            password_hash=hash_password("Admin@123"),
            role="Admin",
        ))
        db.commit()
        print("Default admin user created.")
