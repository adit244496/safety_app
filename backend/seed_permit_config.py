"""Seed the CHWP work-type & precaution catalogue from the OHS-005 template.
Runs only when the permit_work_types table is empty, so admin edits are never overwritten.
"""
from sqlalchemy.orm import Session
import models

# Each work type: (code, name, has_gas_table, sections)
# sections: list of (section_title, input_type, [(item_key, label), ...])
GEN = "General"
TAKEN = "Precautions Taken"
EQUIP = "Equipment Provided"

CATEGORIES = [
    ("c1", "Potential exposure to hazardous atmospheres — confined spaces (Catchpits, Manholes, OH Tanks, UGR, etc.)", True, [
        (GEN, "toggle", [
            ("procedure", "Contractor procedure in place"),
            ("toxic", "Identified as space containing toxic substance (If YES — STOP)"),
        ]),
        (TAKEN, "checkbox", [
            ("circle_safety", "Circle of safety & JSA applied"),
            ("locked_tagged", "All valves and equipment locked and tagged"),
            ("blinds", "Blinds"),
            ("block_bleed", "Block and Bleed"),
            ("piping_separation", "Piping Separation"),
            ("process_purged", "Process purged"),
            ("ventilation", "Ventilation provided"),
            ("vent_mechanical", "Mechanical"),
            ("vent_natural", "Natural Draft"),
            ("atmosphere_tested", "Atmosphere tested (O2, H2, CH4, etc.) — see table below"),
            ("attendant", "Attendant / Rescuer"),
            ("training_drills", "Training Drills"),
        ]),
        (EQUIP, "checkbox", [
            ("respirator", "Respirator"),
            ("scba", "Self-Contained Breathing Apparatus"),
            ("negative_pressure", "Negative Pressure"),
            ("supplied_air", "Supplied Air"),
            ("lifeline", "Lifeline"),
            ("harness_lanyard", "Safety Harness and Lanyard / Lifeline"),
            ("shock_absorber", "Shock Absorber"),
            ("body_wrist_harness", "Body or Wrist Harness"),
            ("two_way_comm", "Two-way communication"),
            ("emergency_alarm", "Emergency Alarm"),
            ("special_clothing", "Special Clothing"),
            ("hood", "Hood"),
            ("dust_goggles", "Dust Goggles"),
        ]),
        ("Other", "text", [("other", "Other / remarks")]),
    ]),
    ("c2", "Hot work / spark generating work — Welding, Drilling, Grinding/Cutting or Gas Cutting", False, [
        (GEN, "toggle", [("procedure", "Contractor procedure in place")]),
        (TAKEN, "checkbox", [
            ("flammables_protected", "Flammables / Combustibles (paper, rags, wood, etc.) protected"),
            ("fire_watch", "Fire Watch Established"),
            ("equipment_positioned", "Welding & Cutting equipment positioned properly"),
            ("leads_up", "Leads up and do not pose a tripping hazard"),
            ("area_hazards_covered", "Area hazards covered"),
        ]),
        ("Fire Protection", "checkbox", [
            ("combustibles_removed", "Combustibles (paper, rags, wood, etc.) removed"),
            ("gas_containers_removed", "Combustible gas or liquid containers removed"),
            ("area_wet_down", "Area wet down"),
            ("spark_shields", "Spark shields installed"),
            ("fire_watcher", "Fire watcher assigned"),
            ("spark_resistant_tools", "Spark resistant tools"),
        ]),
        (EQUIP, "checkbox", [
            ("fire_hose", "Fire Hose"),
            ("fire_extinguishers", "Fire extinguishers"),
            ("fe_co2", "Extinguisher type: CO2"),
            ("fe_dry_powder", "Extinguisher type: Dry Powder"),
        ]),
        (EQUIP, "text", [
            ("fe_type_other", "Extinguisher type (other)"),
            ("fe_size", "Extinguisher size"),
            ("fe_number", "Extinguisher number"),
        ]),
    ]),
    ("c3", "Manual Excavations & Trenching exceeding 4 ft (1.2 m) and all mechanical excavation, boring", False, [
        (GEN, "toggle", [("procedure", "Contractor procedure in place")]),
        (TAKEN, "checkbox", [
            ("competent_person", "Competent person assigned to inspect & control condition of excavation on site"),
            ("utilities_identified", "Underground utilities identified"),
            ("equipment_grounded", "Power equipment grounded"),
            ("overhead_clearances", "Electrical or mechanical overhead clearances checked"),
            ("barricades_warning", "Barricades, flashers, pennants (area warning) placed"),
            ("egress", "Means of egress (ladder or steps) placed"),
            ("shored", "Side walls shored or laid back"),
            ("lighted", "Area adequately lighted"),
            ("soil_removed", "Material or soil removed from excavation edge"),
        ]),
        ("Other", "text", [("other", "Other / remarks")]),
    ]),
    ("c4", "Elevated & Overhead work — scaffolds, platforms, ladders, tanks, positions above 6 ft (1.8 m)", False, [
        (GEN, "toggle", [("procedure", "Contractor procedure in place")]),
        (TAKEN, "checkbox", [
            ("ladder_inspected", "Ladder(s) inspected prior to use"),
            ("ladder_supported", "Ladder properly supported and leveled"),
            ("tied_top", "Tied Top"),
            ("tied_bottom", "Tied Bottom"),
            ("scaffolds_inspected", "Scaffolds/platforms inspected (secured flooring and guardrails)"),
            ("roped_off", "Work area roped off and warning signs in place"),
            ("personnel_warn", "Personnel assigned to warn of floor opening or other hazardous exposure"),
            ("tools_stored", "Tools and other equipment stored in safe manner"),
            ("area_cleared_below", "Area cleared below prior to starting work"),
        ]),
        (EQUIP, "checkbox", [
            ("harness_anchored", "Safety Harness and Lanyard anchored to independent rigid object"),
            ("lifeline_rope_grab", "Lifeline with rope grab shock absorber"),
            ("full_body_harness", "Full Body Harness"),
            ("wrist_harness", "Wrist harness (for preventing fall of hand tools)"),
        ]),
        ("Other", "text", [("other", "Other / remarks")]),
    ]),
    ("c5", "Crane lifts & critical rigging — over 10 Tons or above 85% of load chart of the SWL", False, [
        (GEN, "toggle", [("procedure", "Contractor procedure in place")]),
        (TAKEN, "checkbox", [
            ("crane_inspected", "Crane inspected before use"),
            ("operator_qualified", "Operator qualified by the contractor"),
            ("power_line_clearance", "Electrical power line clearance (12 ft) checked"),
            ("outriggers", "Outriggers supported; Crane leveled"),
            ("barrier", "Barrier Installed"),
            ("safety_observer", "Safety Observer Assigned"),
            ("prejob_load", "Pre-job discussion held (load / lift)"),
            ("slings_inspected", "Slings inspected prior to use"),
            ("special_lift", "Special lift as per construction manual"),
        ]),
        ("Other", "text", [("other", "Other / remarks")]),
    ]),
    ("c6", "Demolition / Rework", False, [
        (GEN, "toggle", [("procedure", "Contractor procedure in place")]),
        (TAKEN, "checkbox", [
            ("disconnection", "Disconnection of electrical cable / water / steam / gas line etc."),
            ("work_schedules", "Work schedules considered the minimum potential exposures to site personnel"),
            ("competent_personnel", "Competent qualified personnel assigned for tasks"),
            ("clearance_identified", "Clearance and safe area identified"),
            ("barricades_obvious", "Barricades and warning signs are in place and obvious"),
        ]),
        ("Other", "text", [("other", "Other / remarks")]),
    ]),
    ("c7", "Suspended work basket / Platform / Gondola / Boatswain's chair / Harness", False, [
        (GEN, "toggle", [("procedure", "Contractor procedure in place")]),
        (TAKEN, "checkbox", [
            ("strictly_controlled", "Use strictly controlled"),
            ("approved_type", "Approved type only"),
            ("separate_anchorage", "Lifelines and harnesses approved type with separate anchorage for each individual"),
            ("communications", "Communications established"),
            ("prestart_checklist", "Pre-start checklist complete / TPLGA obtained"),
        ]),
        ("Other", "text", [("other", "Other / remarks")]),
    ]),
    ("c8", "Working on/around pressurized or energized systems / Pneumatic Testing / Hydraulic Testing", False, [
        (GEN, "toggle", [
            ("procedure", "Contractor procedure in place"),
            ("planned", "Is work to be performed planned (If NO — STOP)"),
        ]),
        (TAKEN, "checkbox", [
            ("plan_considered", "Access/egress, Hot work, Other on-going work considered in plan"),
            ("hazards_identified", "Specific hazards in the work area identified"),
            ("test_guidelines", "Test conducted as per approved guidelines"),
            ("area_cleared", "Area cleared of non-test personnel and barricaded"),
            ("relief_directed", "Discharge of safety relief valves directed away from personnel area"),
            ("outside_boundaries", "Precautions taken for protection outside boundaries (blanks, bleeds, disconnects, power services)"),
            ("formal_discussions", "Formal discussions with personnel performing or affected by this work held"),
        ]),
        ("Other", "text", [("other", "Other / remarks")]),
    ]),
    ("c9", "Maintenance Work: Electrical, Mechanical Power or Lockout / Tagout", False, [
        (GEN, "toggle", [("procedure", "Contractor procedure in place")]),
        ("Type of power supply", "checkbox", [
            ("pt_hydraulic", "Hydraulic"),
            ("pt_pneumatic", "Pneumatic"),
            ("pt_steam", "Steam"),
            ("pt_mechanical", "Mechanical"),
            ("pt_electrical", "Electrical"),
            ("pt_other", "Other"),
        ]),
        (TAKEN, "checkbox", [
            ("valves_locked", "All valves locked and tagged"),
            ("blinds_installed", "Blinds installed"),
            ("block_bleed_positioned", "Block and bleed valves positioned"),
            ("piping_separated", "Piping separated"),
            ("pressure_bled", "Pressure bled from lines and equipment"),
            ("instrument_gas", "Instrument gas disconnected"),
            ("attempt_start", "Attempt to start the equipment"),
            ("mechanical_blocked", "Mechanical energy blocked"),
            ("maintenance_lock", "Maintenance lock / contractor lock required"),
        ]),
        ("Live Electrical Work (qualified electrician only)", "checkbox", [
            ("power_locked", "Power supply locked and tagged"),
            ("zero_voltage", "Circuit checked for zero voltage"),
            ("cords_inspected", "Portable cords and electric tools inspected"),
            ("backup_man", "Safety back-up man appointed"),
            ("self_start_deactivated", "Self-starting mechanism deactivated"),
        ]),
        (EQUIP, "checkbox", [
            ("rubber_gloves", "Approved rubber and leather gloves"),
            ("insulating_mat", "Insulating mat"),
            ("fuse_puller", "Fuse puller"),
            ("disconnect_pole", "Disconnect pole or safety rope"),
            ("non_conductive_hat", "Non-conductive hard hat"),
            ("rccb", "Residual Current Circuit Breaker (RCCB)"),
        ]),
        ("Other", "text", [("other", "Other / remarks")]),
    ]),
    ("c10", "Removal of Existing Covers, Barricades, Railings, Lifelines, guards, existing Fire Extinguishers", False, [
        (GEN, "toggle", [("procedure", "Contractor procedure in place")]),
        (TAKEN, "checkbox", [
            ("instruction_personnel", "Instruction to personnel regarding hazards and safe working procedure"),
            ("notification_contractors", "Notification to other contractors / sub-contractors"),
            ("area_fenced", "Area below cut-out, lift shaft grill & guardrail fenced / barricaded and signage displayed"),
            ("red_signals", "Red light / Red flag / Red reflecting tape displayed (for night)"),
            ("separate_routes", "Separate routes for man and materials entry provided and kept clear"),
            ("alt_fall_protection", "Alternative fall protection/prevention provided"),
            ("supervisor", "Supervisor deployed to supervise the job"),
        ]),
        ("Other", "text", [("other", "Other / remarks")]),
    ]),
    ("c11", "Working on or near Water body having depth more than 500 mm", False, [
        (GEN, "toggle", [("procedure", "Contractor procedure in place")]),
        (TAKEN, "checkbox", [
            ("brac", "Breath Alcohol Concentration (BrAC) of 0.00%"),
            ("workers_fit", "Workers engaged are fit and free from heart conditions and epilepsy"),
            ("area_fenced", "Appropriate area fenced / barricaded and signage displayed"),
            ("red_signals", "Red light (for night) / Red flag / Red reflecting tape displayed"),
            ("rescue_trained", "Appropriate number of workers trained for rescue operations"),
            ("supervisor", "Supervisor deployed to supervise the job"),
            ("life_equipment", "Life buoy, ring buoy, boat hook, 30 m life line, life jackets (incl. one per rescue crew) available"),
            ("audible_alarm", "Audible alarm available"),
        ]),
        ("Other", "text", [("other", "Other / remarks")]),
    ]),
    ("c12", "Other", False, [
        ("Other", "text", [("other", "Describe the other hazardous work")]),
    ]),
]


def seed_permit_config(db: Session):
    if db.query(models.PermitWorkType).count() > 0:
        return
    for wt_order, (code, name, has_gas, sections) in enumerate(CATEGORIES):
        wt = models.PermitWorkType(code=code, name=name, has_gas_table=has_gas, sort_order=wt_order, active=True)
        db.add(wt)
        db.flush()
        order = 0
        for section_title, input_type, items in sections:
            for item_key, label in items:
                db.add(models.PermitPrecaution(
                    work_type_id=wt.id, item_key=item_key, section=section_title,
                    label=label, input_type=input_type, sort_order=order,
                ))
                order += 1
    db.commit()
