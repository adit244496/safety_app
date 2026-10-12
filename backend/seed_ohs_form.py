"""Seed the default Monthly OH&S Statistics (OHS-016) form rows. Idempotent."""
import models

# (section, item_key, label) in display order
DEFAULT_ITEMS = [
    # Section A — Details of Manhours Worked
    ("section_a", "an_employee", "Ambuja Neotia Employee"),
    ("section_a", "an_workmen", "Workmen & Security personnel deployed by Ambuja Neotia"),
    ("section_a", "contractor_workmen", "Workmen deployed by Contractors"),
    ("section_a", "contractor_employee", "Contractor's employee (including security)"),
    # General Summary
    ("general_summary", "manhours_worked", "Man-hours worked"),
    ("general_summary", "manhours_no_lti", "Man-hours worked without occurrence of any LTI"),
    ("general_summary", "near_misses", "Number of near-misses recorded"),
    ("general_summary", "fire_incidents", "Number of Fire incidents"),
    ("general_summary", "first_aid", "Number of First-Aid cases"),
    ("general_summary", "temp_disablement", "Number of temporary (Full or Partial) disablements"),
    ("general_summary", "perm_disablement", "Number of permanent (Full or Partial) disablements"),
    ("general_summary", "fatal", "Number of fatal accidents"),
    # Activities
    ("activities", "inductions", "Number of persons provided with Safety Induction"),
    ("activities", "training_an_staff", "Number of Safety trainings provided for Ambuja Neotia staff"),
    ("activities", "training_contractor_staff", "Number of Safety trainings provided for Contractor staff"),
    ("activities", "training_contractor_workers", "Number of Safety trainings provided for Contractor workers"),
    ("activities", "obs_project_team", "Number of Safety Observations by Project Team members. (This includes Ambuja Neotia team and Contractor team)"),
    ("activities", "obs_ho_team", "Number of Safety Observations by HO Team."),
    ("activities", "good_points", "Number of Good points observed by (Project+HO) Team members."),
    ("activities", "toolbox_talks", "Number of tool box talks conducted"),
    ("activities", "mock_drills", "Number of mock drills conducted"),
    ("activities", "pre_employment_medical", "Number of persons undergone pre-employment medical checkup"),
    ("activities", "medical_camps", "Number of Medical health camps conducted"),
    ("activities", "safety_campaigns", "Number of safety motivational programs organised"),
    ("activities", "hs_audits", "Number of Health and Safety audits conducted"),
    ("activities", "site_inspections", "Number of site inspections by Project Safety Committee Members"),
]


def seed_ohs_form(db):
    if db.query(models.OhsFormItem).count() > 0:
        return
    for i, (section, key, label) in enumerate(DEFAULT_ITEMS):
        db.add(models.OhsFormItem(section=section, item_key=key, label=label, sort_order=i, active=True))
    db.commit()
    print("OH&S form items seeded.")
