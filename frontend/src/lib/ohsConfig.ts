// Shared definitions for the Monthly OH&S Statistics form (OHS-016) and its report.
// Form rows are admin-managed (see Admin → OH&S Form); values are keyed by item_key.

export const OHS_DOC_NO = 'AN/OHS-016/Rev 2.0'

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export const monthName = (m: number) => MONTHS[m - 1] || ''

export interface FormItem { item_key: string; label: string }
export interface OhsFormConfig {
  section_a: FormItem[]
  general_summary: FormItem[]
  activities: FormItem[]
}

export interface SectionARow { avg_persons: string; man_hours: string }
export interface SummaryRow { for_month: string; cumulative: string; remarks: string }
export interface LtiRow {
  name: string; company: string; date: string;
  man_days_lost: string; investigated: string; report_sent: string
}
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
  section_a: Record<string, SectionARow>        // keyed by item_key
  lti: LtiRow[]
  general_summary: Record<string, SummaryRow>    // keyed by item_key
  activities: Record<string, SummaryRow>         // keyed by item_key
  violations: ViolationRow[]
  safety_coordinator: string
  site_incharge: string
}

const emptySecA = (): SectionARow => ({ avg_persons: '', man_hours: '' })
const emptySummary = (): SummaryRow => ({ for_month: '', cumulative: '', remarks: '' })

export function emptyOhsData(project_id: number, month: number, year: number, config?: OhsFormConfig): OhsData {
  const secA: Record<string, SectionARow> = {}
  const gen: Record<string, SummaryRow> = {}
  const act: Record<string, SummaryRow> = {}
  config?.section_a.forEach(i => { secA[i.item_key] = emptySecA() })
  config?.general_summary.forEach(i => { gen[i.item_key] = emptySummary() })
  config?.activities.forEach(i => { act[i.item_key] = emptySummary() })
  return {
    project_id, month, year, project_name: '',
    company: '', expected_duration: '', current_age: '', contractors_present: '',
    section_a: secA, lti: [], general_summary: gen, activities: act,
    violations: [], safety_coordinator: '', site_incharge: '',
  }
}

/** Merge a (possibly partial / legacy-list) server record onto the empty template for the given config. */
export function normalizeOhsData(project_id: number, month: number, year: number, raw: any, config?: OhsFormConfig): OhsData {
  const base = emptyOhsData(project_id, month, year, config)
  if (!raw) return base

  const mergeSecA = (dst: Record<string, SectionARow>, src: any, items?: FormItem[]) => {
    if (Array.isArray(src)) { items?.forEach((it, i) => { if (src[i]) dst[it.item_key] = { avg_persons: src[i].avg_persons ?? '', man_hours: src[i].man_hours ?? '' } }) }
    else if (src && typeof src === 'object') { for (const k of Object.keys(dst)) if (src[k]) dst[k] = { avg_persons: src[k].avg_persons ?? '', man_hours: src[k].man_hours ?? '' } }
  }
  const mergeSummary = (dst: Record<string, SummaryRow>, src: any, items?: FormItem[]) => {
    const take = (r: any): SummaryRow => ({ for_month: r?.for_month ?? '', cumulative: r?.cumulative ?? '', remarks: r?.remarks ?? '' })
    if (Array.isArray(src)) { items?.forEach((it, i) => { if (src[i]) dst[it.item_key] = take(src[i]) }) }
    else if (src && typeof src === 'object') { for (const k of Object.keys(dst)) if (src[k]) dst[k] = take(src[k]) }
  }
  mergeSecA(base.section_a, raw.section_a, config?.section_a)
  mergeSummary(base.general_summary, raw.general_summary, config?.general_summary)
  mergeSummary(base.activities, raw.activities, config?.activities)
  return {
    ...base,
    project_name: raw.project_name ?? '',
    company: raw.company ?? '',
    expected_duration: raw.expected_duration ?? '',
    current_age: raw.current_age ?? '',
    contractors_present: raw.contractors_present ?? '',
    lti: Array.isArray(raw.lti) ? raw.lti : [],
    violations: Array.isArray(raw.violations) ? raw.violations : [],
    safety_coordinator: raw.safety_coordinator ?? '',
    site_incharge: raw.site_incharge ?? '',
  }
}
