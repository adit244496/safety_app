// Construction Hazardous Work Permit (CHWP) — hazard categories & precaution checklists.
// Transcribed from OHS 005 Construction Hazardous Work Permit Ver1.0.

export interface ChecklistItem { key: string; label: string }
export interface ChecklistSection { key: string; title: string; items: ChecklistItem[] }
export interface HazardCategory {
  id: string
  no: number
  title: string             // page-1 checkbox title
  procedure?: boolean       // "Contractor procedure in place: YES / NO"
  gate?: { key: string; label: string; stopWhen: 'YES' | 'NO' }  // YES/NO gating question
  sections: ChecklistSection[]
  gasTable?: boolean        // category 1 — atmospheric test table
  powerTypes?: string[]     // category 9 — type of power supply
  fireExtinguisher?: boolean // category 2 — extinguisher type/size/number
  otherText?: boolean       // free "Other (explain)" note for the category
}

const it = (key: string, label: string): ChecklistItem => ({ key, label })

export const HAZARD_CATEGORIES: HazardCategory[] = [
  {
    id: 'c1', no: 1,
    title: 'Potential exposure to hazardous atmospheres — confined spaces (Catchpits, Manholes, OH Tanks, UGR, etc.)',
    procedure: true,
    gate: { key: 'toxic', label: 'Identified as space containing toxic substance', stopWhen: 'YES' },
    gasTable: true,
    otherText: true,
    sections: [
      {
        key: 'taken', title: 'Precautions Taken', items: [
          it('circle_safety', 'Circle of safety & JSA applied'),
          it('locked_tagged', 'All valves and equipment locked and tagged'),
          it('blinds', 'Blinds'),
          it('block_bleed', 'Block and Bleed'),
          it('piping_separation', 'Piping Separation'),
          it('process_purged', 'Process purged'),
          it('ventilation', 'Ventilation provided'),
          it('vent_mechanical', 'Mechanical'),
          it('vent_natural', 'Natural Draft'),
          it('atmosphere_tested', 'Atmosphere tested (O2, H2, CH4, etc.) — see table below'),
          it('attendant', 'Attendant / Rescuer'),
          it('training_drills', 'Training Drills'),
        ],
      },
      {
        key: 'equipment', title: 'Equipment Provided', items: [
          it('respirator', 'Respirator'),
          it('scba', 'Self-Contained Breathing Apparatus'),
          it('negative_pressure', 'Negative Pressure'),
          it('supplied_air', 'Supplied Air'),
          it('lifeline', 'Lifeline'),
          it('harness_lanyard', 'Safety Harness and Lanyard / Lifeline'),
          it('shock_absorber', 'Shock Absorber'),
          it('body_wrist_harness', 'Body or Wrist Harness'),
          it('two_way_comm', 'Two-way communication'),
          it('emergency_alarm', 'Emergency Alarm'),
          it('special_clothing', 'Special Clothing'),
          it('hood', 'Hood'),
          it('dust_goggles', 'Dust Goggles'),
        ],
      },
    ],
  },
  {
    id: 'c2', no: 2,
    title: 'Hot work / spark generating work — Welding, Drilling, Grinding/Cutting or Gas Cutting',
    procedure: true, fireExtinguisher: true, otherText: true,
    sections: [
      {
        key: 'taken', title: 'Precautions Taken', items: [
          it('flammables_protected', 'Flammables / Combustibles (paper, rags, wood, etc.) protected'),
          it('fire_watch', 'Fire Watch Established'),
          it('equipment_positioned', 'Welding & Cutting equipment positioned properly'),
          it('leads_up', 'Leads up and do not pose a tripping hazard'),
          it('area_hazards_covered', 'Area hazards covered'),
        ],
      },
      {
        key: 'fire', title: 'Fire Protection — Precautions Taken', items: [
          it('combustibles_removed', 'Combustibles (paper, rags, wood, etc.) removed'),
          it('gas_containers_removed', 'Combustible gas or liquid containers removed'),
          it('area_wet_down', 'Area wet down'),
          it('spark_shields', 'Spark shields installed'),
          it('fire_watcher', 'Fire watcher assigned'),
          it('spark_resistant_tools', 'Spark resistant tools'),
        ],
      },
      {
        key: 'equipment', title: 'Equipment Provided', items: [
          it('fire_hose', 'Fire Hose'),
          it('fire_extinguishers', 'Fire extinguishers'),
        ],
      },
    ],
  },
  {
    id: 'c3', no: 3,
    title: 'Manual Excavations & Trenching exceeding 4 ft (1.2 m) and all mechanical excavation, boring',
    procedure: true, otherText: true,
    sections: [
      {
        key: 'taken', title: 'Precautions Taken', items: [
          it('competent_person', 'Contractor has a competent person assigned to inspect & control condition of excavation on site'),
          it('utilities_identified', 'Underground utilities identified'),
          it('equipment_grounded', 'Power equipment grounded'),
          it('overhead_clearances', 'Electrical or mechanical overhead clearances checked'),
          it('barricades_warning', 'Barricades, flashers, pennants (area warning) placed'),
          it('egress', 'Means of egress (ladder or steps) placed'),
          it('shored', 'Side walls shored or laid back'),
          it('lighted', 'Area adequately lighted'),
          it('soil_removed', 'Material or soil removed from excavation edge'),
        ],
      },
    ],
  },
  {
    id: 'c4', no: 4,
    title: 'Elevated & Overhead work — scaffolds, platforms, ladders, tanks, positions above 6 ft (1.8 m)',
    procedure: true, otherText: true,
    sections: [
      {
        key: 'taken', title: 'Precautions Taken', items: [
          it('ladder_inspected', 'Ladder(s) inspected prior to use'),
          it('ladder_supported', 'Ladder properly supported and leveled'),
          it('tied_top', 'Tied Top'),
          it('tied_bottom', 'Tied Bottom'),
          it('scaffolds_inspected', 'Scaffolds/platforms inspected for good repair and proper construction (secured flooring and guardrails)'),
          it('roped_off', 'Work area roped off and warning signs in place'),
          it('personnel_warn', 'Personnel assigned to warn of floor opening or other hazardous exposure'),
          it('tools_stored', 'Tools and other equipment stored in safe manner'),
          it('area_cleared_below', 'Area cleared below prior to starting work'),
        ],
      },
      {
        key: 'equipment', title: 'Equipment Provided', items: [
          it('harness_anchored', 'Safety Harness and Lanyard anchored to independent rigid object'),
          it('lifeline_rope_grab', 'Lifeline with rope grab shock absorber'),
          it('full_body_harness', 'Full Body Harness'),
          it('wrist_harness', 'Wrist harness (for preventing fall of hand tools)'),
        ],
      },
    ],
  },
  {
    id: 'c5', no: 5,
    title: 'Crane lifts & critical rigging — over 10 Tons or above 85% of load chart of the SWL',
    procedure: true, otherText: true,
    sections: [
      {
        key: 'taken', title: 'Precautions Taken', items: [
          it('crane_inspected', 'Crane inspected before use'),
          it('operator_qualified', 'Operator qualified by the contractor'),
          it('power_line_clearance', 'Electrical power line clearance (12 ft) checked'),
          it('outriggers', 'Outriggers supported; Crane leveled'),
          it('barrier', 'Barrier Installed'),
          it('safety_observer', 'Safety Observer Assigned'),
          it('prejob_load', 'Pre-job discussion held (load / lift)'),
          it('slings_inspected', 'Slings inspected prior to use'),
          it('special_lift', 'Special lift as per construction manual'),
        ],
      },
    ],
  },
  {
    id: 'c6', no: 6,
    title: 'Demolition / Rework',
    procedure: true, otherText: true,
    sections: [
      {
        key: 'taken', title: 'Precautions Taken', items: [
          it('disconnection', 'Disconnection of electrical cable connection / water / steam / gas line etc.'),
          it('work_schedules', 'Work schedules considered the minimum potential exposures to site personnel'),
          it('competent_personnel', 'Competent qualified personnel assigned for tasks'),
          it('clearance_identified', 'Clearance and safe area identified'),
          it('barricades_obvious', 'Barricades and warning signs are in place and obvious'),
        ],
      },
    ],
  },
  {
    id: 'c7', no: 7,
    title: "Suspended work basket / Platform / Gondola / Boatswain's chair / Harness",
    procedure: true, otherText: true,
    sections: [
      {
        key: 'taken', title: 'Precautions Taken', items: [
          it('strictly_controlled', 'Use strictly controlled'),
          it('approved_type', 'Approved type only'),
          it('separate_anchorage', 'Lifelines and harnesses approved type with separate anchorage for each individual'),
          it('communications', 'Communications established'),
          it('prestart_checklist', 'Pre-start checklist complete / TPLGA obtained'),
        ],
      },
    ],
  },
  {
    id: 'c8', no: 8,
    title: 'Working on/around pressurized or energized systems / Pneumatic Testing / Hydraulic Testing',
    procedure: true, otherText: true,
    gate: { key: 'planned', label: 'Is work to be performed planned', stopWhen: 'NO' },
    sections: [
      {
        key: 'taken', title: 'Precautions Taken', items: [
          it('plan_considered', 'Access/egress, Hot work, Other on-going work considered in plan'),
          it('hazards_identified', 'Specific hazards in the work area identified'),
          it('test_guidelines', 'Test conducted as per approved guidelines'),
          it('area_cleared', 'Area cleared of non-test personnel and barricaded'),
          it('relief_directed', 'Discharge of safety relief valves directed away from personnel area'),
          it('outside_boundaries', 'Precautions taken for protection outside boundaries (blanks, bleeds, disconnects, power services)'),
          it('formal_discussions', 'Formal discussions with personnel performing or affected by this work held'),
        ],
      },
    ],
  },
  {
    id: 'c9', no: 9,
    title: 'Maintenance Work: Electrical, Mechanical Power or Lockout / Tagout',
    procedure: true, otherText: true,
    powerTypes: ['Hydraulic', 'Pneumatic', 'Steam', 'Mechanical', 'Electrical', 'Other'],
    sections: [
      {
        key: 'taken', title: 'Precautions Taken', items: [
          it('valves_locked', 'All valves locked and tagged'),
          it('blinds_installed', 'Blinds installed'),
          it('block_bleed_positioned', 'Block and bleed valves positioned'),
          it('piping_separated', 'Piping separated'),
          it('pressure_bled', 'Pressure bled from lines and equipment'),
          it('instrument_gas', 'Instrument gas disconnected'),
          it('attempt_start', 'Attempt to start the equipment'),
          it('mechanical_blocked', 'Mechanical energy blocked'),
          it('maintenance_lock', 'Maintenance lock / contractor lock required'),
        ],
      },
      {
        key: 'live', title: 'Live Electrical Work (by qualified electrician only)', items: [
          it('power_locked', 'Power supply locked and tagged'),
          it('zero_voltage', 'Circuit checked for zero voltage'),
          it('cords_inspected', 'Portable cords and electric tools inspected'),
          it('backup_man', 'Safety back-up man appointed'),
          it('self_start_deactivated', 'Self-starting mechanism deactivated'),
        ],
      },
      {
        key: 'equipment', title: 'Equipment Provided', items: [
          it('rubber_gloves', 'Approved rubber and leather gloves'),
          it('insulating_mat', 'Insulating mat'),
          it('fuse_puller', 'Fuse puller'),
          it('disconnect_pole', 'Disconnect pole or safety rope'),
          it('non_conductive_hat', 'Non-conductive hard hat'),
          it('rccb', 'Residual Current Circuit Breaker (RCCB)'),
        ],
      },
    ],
  },
  {
    id: 'c10', no: 10,
    title: 'Removal of Existing Covers, Barricades, Railings, Lifelines, guards, existing Fire Extinguishers',
    procedure: true, otherText: true,
    sections: [
      {
        key: 'taken', title: 'Precautions Taken', items: [
          it('instruction_personnel', 'Instruction to personnel regarding hazards and safe working procedure'),
          it('notification_contractors', 'Notification to other contractors / sub-contractors'),
          it('area_fenced', 'Area below cut-out, lift shaft grill & guardrail fenced / barricaded and signage displayed'),
          it('red_signals', 'Red light / Red flag / Red reflecting tape displayed (for night)'),
          it('separate_routes', 'Separate routes for man and materials entry provided and kept clear'),
          it('alt_fall_protection', 'Alternative fall protection/prevention provided'),
          it('supervisor', 'Supervisor deployed to supervise the job'),
        ],
      },
    ],
  },
  {
    id: 'c11', no: 11,
    title: 'Working on or near Water body having depth more than 500 mm',
    procedure: true, otherText: true,
    sections: [
      {
        key: 'taken', title: 'Precautions Taken', items: [
          it('brac', 'Breath Alcohol Concentration (BrAC) of 0.00%'),
          it('workers_fit', 'Workers engaged are fit and free from heart conditions and epilepsy'),
          it('area_fenced', 'Appropriate area fenced / barricaded and signage displayed'),
          it('red_signals', 'Red light (for night) / Red flag / Red reflecting tape displayed'),
          it('rescue_trained', 'Appropriate number of workers trained for rescue operations'),
          it('supervisor', 'Supervisor deployed to supervise the job'),
          it('life_equipment', 'Life buoy, ring buoy, boat hook, 30 m life line, life jackets (incl. one per rescue crew) available'),
          it('audible_alarm', 'Audible alarm available'),
        ],
      },
    ],
  },
  {
    id: 'c12', no: 12,
    title: 'Other',
    otherText: true,
    sections: [],
  },
]

export const CLOSURE_OPTIONS = [
  'Work satisfactorily completed',
  'Work not finished this shift',
  'CHWP area and equipment released in proper condition for normal use',
  'CHWP conditions not met - CHWP cancelled. Job withheld',
]

export const PERMIT_STATUS_META: Record<string, { color: string; bg: string }> = {
  Draft: { color: '#64748b', bg: '#f1f5f9' },
  'Pending Approval': { color: '#d97706', bg: '#fffbeb' },
  Approved: { color: '#059669', bg: '#ecfdf5' },
  Declined: { color: '#dc2626', bg: '#fef2f2' },
  'Closure Requested': { color: '#7c3aed', bg: '#f5f3ff' },
  Closed: { color: '#334155', bg: '#f1f5f9' },
  Cancelled: { color: '#dc2626', bg: '#fef2f2' },
}
