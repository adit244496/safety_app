// Shared definitions for the Monthly OH&S Statistics form (OHS-016) and its report.

export const OHS_DOC_NO = 'AN/OHS-016/Rev 2.0'

export const SECTION_A_ROWS = [
  'Ambuja Neotia Employee',
  'Workmen & Security personnel deployed by Ambuja Neotia',
  'Workmen deployed by Contractors',
  "Contractor's employee (including security)",
]

export const GENERAL_SUMMARY_ROWS = [
  'Man-hours worked',
  'Man-hours worked without occurrence of any LTI',
  'Number of near-misses recorded',
  'Number of Fire incidents',
  'Number of First-Aid cases',
  'Number of temporary (Full or Partial) disablements',
  'Number of permanent (Full or Partial) disablements',
  'Number of fatal accidents',
]

export const ACTIVITY_ROWS = [
  'Number of persons provided with Safety Induction',
  'Number of Safety trainings provided for Ambuja Neotia staff',
  'Number of Safety trainings provided for Contractor staff',
  'Number of Safety trainings provided for Contractor workers',
  'Number of Safety Observations by Project Team members. (This includes Ambuja Neotia team and Contractor team)',
  'Number of Safety Observations by HO Team.',
  'Number of Good points observed by (Project+HO) Team members.',
  'Number of tool box talks conducted',
  'Number of mock drills conducted',
  'Number of persons undergone pre-employment medical checkup',
  'Number of Medical health camps conducted',
  'Number of safety motivational programs organised',
  'Number of Health and Safety audits conducted',
  'Number of site inspections by Project Safety Committee Members',
]

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const monthName = (m: number) => MONTHS[m - 1] || ''

export interface SectionARow { avg_persons: string; man_hours: string }
export interface LtiRow {
  name: string; company: string; date: string;
  man_days_lost: string; investigated: string; report_sent: string
}
export interface SummaryRow { for_month: string; cumulative: string; remarks: string }
export interface ViolationRow {
  date: string; issued_to: string; issued_by: string; type: string; reason: string
}

export interface OhsData {
  project_id: number
  project_name?: string
  month: number
  year: number
  company: string
  expected_duration: string
  current_age: string
  contractors_present: string
  section_a: SectionARow[]        // length 4
  lti: LtiRow[]
  general_summary: SummaryRow[]   // length 8
  activities: SummaryRow[]        // length 14
  violations: ViolationRow[]
  safety_coordinator: string
  site_incharge: string
}

const summaryRows = (n: number): SummaryRow[] =>
  Array.from({ length: n }, () => ({ for_month: '', cumulative: '', remarks: '' }))

export function emptyOhsData(project_id: number, month: number, year: number): OhsData {
  return {
    project_id, month, year,
    project_name: '',
    company: '',
    expected_duration: '',
    current_age: '',
    contractors_present: '',
    section_a: SECTION_A_ROWS.map(() => ({ avg_persons: '', man_hours: '' })),
    lti: [],
    general_summary: summaryRows(GENERAL_SUMMARY_ROWS.length),
    activities: summaryRows(ACTIVITY_ROWS.length),
    violations: [],
    safety_coordinator: '',
    site_incharge: '',
  }
}

/** Merge a (possibly partial) server record onto the empty template so lengths are always correct. */
export function normalizeOhsData(project_id: number, month: number, year: number, raw: any): OhsData {
  const base = emptyOhsData(project_id, month, year)
  if (!raw) return base
  const take = <T,>(arr: any, fallback: T[]): T[] => (Array.isArray(arr) && arr.length ? arr : fallback)
  const mergeFixed = (arr: any, len: number): SummaryRow[] => {
    const out = summaryRows(len)
    if (Array.isArray(arr)) arr.slice(0, len).forEach((r: any, i: number) => {
      out[i] = { for_month: r?.for_month ?? '', cumulative: r?.cumulative ?? '', remarks: r?.remarks ?? '' }
    })
    return out
  }
  const mergeSecA = (arr: any): SectionARow[] => {
    const out = SECTION_A_ROWS.map(() => ({ avg_persons: '', man_hours: '' }))
    if (Array.isArray(arr)) arr.slice(0, out.length).forEach((r: any, i: number) => {
      out[i] = { avg_persons: r?.avg_persons ?? '', man_hours: r?.man_hours ?? '' }
    })
    return out
  }
  return {
    ...base,
    project_name: raw.project_name ?? '',
    company: raw.company ?? '',
    expected_duration: raw.expected_duration ?? '',
    current_age: raw.current_age ?? '',
    contractors_present: raw.contractors_present ?? '',
    section_a: mergeSecA(raw.section_a),
    lti: take(raw.lti, []),
    general_summary: mergeFixed(raw.general_summary, GENERAL_SUMMARY_ROWS.length),
    activities: mergeFixed(raw.activities, ACTIVITY_ROWS.length),
    violations: take(raw.violations, []),
    safety_coordinator: raw.safety_coordinator ?? '',
    site_incharge: raw.site_incharge ?? '',
  }
}
