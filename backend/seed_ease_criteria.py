"""Seed EASE evaluation criteria (topics + elements). Idempotent."""
from sqlalchemy.orm import Session
import models

CRITERIA = [
    ("General Safety", 3, [
        "Are Safety meetings conducted across the table at least once monthly and minutes communicated?",
        "Are Safety tool-box talks conducted daily and records maintained?",
        "Are Safety induction provided to all new joinings and records maintained?",
        "Is pre-employment medical checkup conducted for all newly joined workers?",
        "Is work beside water bodies being conducted without any risk whatsoever?",
        "Are there display of Safety posters and messages in dimensions 3 feet by 4 feet? Minimum 20 numbers",
        "Are there display of Safety signage and warning/ caution signs in all the relevant areas?",
        "Are there display of Emergency contact numbers at prominent places in work area easily visible to the eye?",
        "Are Near Misses reported?",
        "Are approach roads safe for vehicle and pedestrian movement?",
        "Are there enough resting sheds for the labours inside the work zone?",
        "Are contractors served written warnings on repetitive / pending observations?",
        "Do the execution team members conduct safety observations (5 observations/ per day/ per person)?",
        "Is percentage of rectification more than 90%?",
        "Do all the unsafe jobs receive a Job Discontinuation / stoppage / penalty notice from site management?",
        "Is the site free of 'High Risk (fatality potential) observations'?",
        "Is there minimum 1 mock drill conducted per month and the documents are available?",
        "Is there minimum 1 SHE campaigns organised such as safety stand-downs, demonstrations, etc. per month?",
    ]),
    ("Housekeeping", 4, [
        "Is the site neat and clean?",
        "Are all access / egress routes, pathways, staircases etc. free from risk of slip, trip & fall hazards?",
        "Is the site free from signs of oil spillage and other agents that can pollute the top soil?",
        "Are walking paths for pedestrians marked and separated from vehical routes?",
        "Are construction materials, earth, etc. stacked and stored that they do not roll or collapse?",
        "Is the average illumination level of the entire project site more than equal to 150 Lux?",
        "Are chemicals and oils stored as per recommendations in the MSDS?",
        "Is the site free from rods protruding from ground or sharp objects along height of a person's face?",
        "Are debris disposal chutes available to dispose debris from elevated floors?",
        "Is the site free of stagnant water and waterlogging?",
    ]),
    ("Personal Protective Equipment and work apparels", 4, [
        "Are all workers provided with appropriate PPE before entering the work zone?",
        "Are all workers wearing safety helmets correctly within the site at all times?",
        "Are all workers wearing safety shoes / boots within the site?",
        "Are workers at height wearing full body harness with double lanyard correctly anchored?",
        "Are workers wearing reflective jackets / vests within the site?",
        "Are job-specific PPEs (e.g., welding shields, chemical gloves, hearing protection) in use?",
        "Are PPEs inspected regularly and damaged or expired PPEs replaced?",
        "Is there a documented system for recording PPE issuance to workers?",
    ]),
    ("Work at Height", 5, [
        "Is a Permit to Work system in place and obtained for all work at height above 1.8 m?",
        "Are all floor openings adequately barricaded and covered with load-bearing covers?",
        "Are all floor edges at elevated slabs and platforms adequately barricaded?",
        "Are all scaffolds erected by competent / trained persons and inspected by a supervisor?",
        "Are scaffold inspection tags updated weekly and displayed on every scaffold?",
        "Are ladders of appropriate type, in good condition, and secured at top and bottom?",
        "Are working platforms with guard rails and toe boards provided at all elevated levels?",
        "Are safety nets installed at every floor where fall-from-height risk exists?",
        "Are aerial work platforms (scissor lifts / boom lifts) operated by trained personnel only?",
    ]),
    ("Electrical", 4, [
        "Are all distribution boards properly labelled, covered, and locked?",
        "Are RCCBs (ELCB) of adequate rating provided at all distribution boards?",
        "Are cables properly routed in trays or conduits and protected from physical damage?",
        "Are all connections made using proper plug tops (no bare wire insertions)?",
        "Is earthing / grounding provided for all portable electrical equipment?",
        "Is the site free from damaged cables, spliced joints, or overloaded extension boards?",
        "Are electrical inspections conducted monthly and records maintained?",
        "Are rubber mats provided in front of all electrical panels and switchboards?",
    ]),
    ("Welding,  cutting and grinding", 3, [
        "Are Hot Work Permits obtained before any welding, cutting, or grinding operations?",
        "Are flash back arrestors fitted on both ends of gas cutting hoses?",
        "Are welders, gas cutters, and grinders using all required PPE?",
        "Are fire extinguishers readily available near all hot work areas?",
        "Are gas cylinders properly stored upright, chained, and away from heat sources?",
        "Are grinding wheels inspected for damage and rated speed before mounting?",
        "Are welding / cutting areas segregated and protected from combustible materials?",
    ]),
    ("Vehicles, Earth movers & Lifting Equipment", 4, [
        "Are all vehicles and equipment operated only by trained and authorized personnel?",
        "Are daily pre-use inspection checks conducted and records maintained?",
        "Are trained banks-men / signalers deployed for all vehicle movements in congested areas?",
        "Are speed limits (10 km/h on site) enforced and signage displayed?",
        "Are all lifting operations planned, risk-assessed, and supervised by a competent person?",
        "Are lifting gear (slings, shackles, hooks) inspected, certified, and colour-coded?",
        "Are Safe Working Load limits clearly marked on cranes, hoists, and forklift trucks?",
    ]),
    ("Fire Prevention/ Protection", 4, [
        "Are adequate fire extinguishers available and located at all required positions?",
        "Are fire extinguishers inspected monthly and service records maintained?",
        "Are evacuation / emergency assembly routes clearly marked and free of obstructions?",
        "Is a fire assembly point clearly marked and communicated to all workers?",
        "Are hot work areas equipped with fire suppression and fire watch personnel?",
        "Are flammable and combustible materials stored safely away from ignition sources?",
        "Is there an emergency response plan displayed and communicated to all workers?",
    ]),
    ("First Aid & Medical Facilities", 4, [
        "Are first aid kits available on site and adequately stocked at all times?",
        "Are trained first aiders (1 per 50 workers) available on site at all times?",
        "Is emergency medical and ambulance contact information displayed prominently?",
        "Are stretchers and spine boards available on site?",
        "Are records of all first aid cases maintained in a register?",
        "Is the nearest hospital / clinic within a reasonable distance and identified?",
        "Is an ambulance or emergency transport arrangement available on site?",
    ]),
    ("Welfare Facilities and labour accomodation", 3, [
        "Is adequate safe potable drinking water provided to all workers?",
        "Are sufficient clean toilet and washing facilities provided per applicable norms?",
        "Are proper covered resting areas provided within the work zone?",
        "Is labour accommodation clean, well-ventilated, and properly maintained?",
        "Are food preparation and storage areas meeting basic hygiene standards?",
        "Are workers provided with all welfare facilities as required by applicable laws?",
        "Is the accommodation free from structural damage, leaks, and pest infestation?",
    ]),
    ("Environment Aspects", 3, [
        "Are dust suppression measures (water spraying, dust screens) in place?",
        "Is noise controlled to acceptable levels and barriers provided where required?",
        "Are waste disposal and segregation procedures in place and followed?",
        "Are silt / sediment fences installed to prevent run-off to drains and water bodies?",
        "Are trees and existing vegetation protected from damage during construction?",
        "Are fuel and oil storage areas bunded to prevent spillage and pollution?",
        "Is there a designated and managed area for hazardous waste disposal?",
    ]),
    ("Piling Work", 4, [
        "Are piling operations conducted under the supervision of a competent piling engineer?",
        "Are all open pile pits and bore holes adequately barricaded?",
        "Is the piling rig / equipment inspected, certified, and in good working condition?",
        "Are piling crew members wearing appropriate PPE including hearing protection?",
        "Are lifting tools and tackles used in piling operations tested and certified?",
        "Are piling operations conducted as per approved method statement?",
    ]),
    ("Excavation and confined space job", 5, [
        "Is a Permit to Work required and obtained for all excavations deeper than 1.2 m?",
        "Are excavations properly sloped, benched, or shored as per soil conditions?",
        "Are excavation edges barricaded with hard barricades and warning signs?",
        "Are safe access and egress ladders provided for all excavations?",
        "Is atmospheric testing conducted before any confined space entry?",
        "Are confined space entry permits in place and rescue equipment available?",
        "Are excavations inspected at the start of every shift by a competent person?",
    ]),
    ("Hand tools (manual and power driven)", 3, [
        "Are workers using the correct tools for the job (no improvisation)?",
        "Are all hand tools in good condition and free from cracks, broken handles, or damage?",
        "Are power tools inspected before each use and defective tools removed from service?",
        "Are all guards on power tools in place and functioning effectively?",
        "Are insulated tools used for all electrical work?",
        "Are tool inspection records maintained and colour-coded tags in use?",
    ]),
]


def seed_ease_criteria(db: Session):
    if db.query(models.EaseTopic).count() > 0:
        return
    for i, (topic_name, av, questions) in enumerate(CRITERIA):
        topic = models.EaseTopic(name=topic_name, sort_order=i)
        db.add(topic)
        db.flush()
        for j, q in enumerate(questions):
            db.add(models.EaseEvaluationElement(
                topic_id=topic.id, question=q,
                assessment_value=av, sort_order=j,
            ))
    db.commit()
    print("EASE evaluation criteria seeded.")
