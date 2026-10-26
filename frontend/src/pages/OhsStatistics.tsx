import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, Save, FileDown, Plus, Trash2, Loader2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import api from '../lib/api'
import { useAuth } from '../store/authStore'
import {
  OhsData, OhsFormConfig, FormItem, MONTHS,
  emptyOhsData, normalizeOhsData, SummaryRow, LtiRow, ViolationRow,
} from '../lib/ohsConfig'
import { generateOhsStatisticsPdf } from '../lib/ohsReport'
import OhsDashboard from './OhsDashboard'

const WRITE_ROLES = ['SuperAdmin', 'Admin', 'HO', 'PSO']
const MANPOWER_STORAGE_KEY = 'she_manpower_data'

const now = new Date()
const YEARS = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i)

const EMPTY_CONFIG: OhsFormConfig = { section_a: [], general_summary: [], activities: [] }

const num = (v: any) => { const n = parseFloat(String(v ?? '').replace(/,/g, '').trim()); return isNaN(n) ? 0 : n }
const fmtNum = (n: number) => String(+n.toFixed(2))

// ── small input helpers ─────────────────────────────────────────────────────
function Cell({ value, onChange, disabled, align = 'left', placeholder }: {
  value: string; onChange: (v: string) => void; disabled: boolean; align?: 'left' | 'center'; placeholder?: string
}) {
  return (
    <input
      value={value} disabled={disabled} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={`w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-slate-50 disabled:text-slate-500 ${align === 'center' ? 'text-center' : ''}`}
    />
  )
}

function SectionTitle({ letter, title }: { letter: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-1">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-indigo-600 text-white text-xs font-bold">{letter}</span>
      <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
    </div>
  )
}

export default function OhsStatistics() {
  const { user } = useAuth()
  const canWrite = WRITE_ROLES.includes(user?.role || '')

  const [projectId, setProjectId] = useState<number | ''>('')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [form, setForm] = useState<OhsData>(emptyOhsData(0, month, year))
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)
  const [mode, setMode] = useState<'form' | 'dashboard'>('form')

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => api.get('/projects/').then(r => r.data) })

  // Admin-managed form rows (sections A / C / D) — keyed by item_key.
  const { data: configData } = useQuery({
    queryKey: ['ohs-form-config'],
    queryFn: () => api.get('/ohs-statistics/form-config').then(r => r.data),
  })
  const config: OhsFormConfig = configData || EMPTY_CONFIG

  // default to first project once loaded
  useEffect(() => {
    if (projectId === '' && projects?.length) setProjectId(projects[0].id)
  }, [projects]) // eslint-disable-line react-hooks/exhaustive-deps

  const projectName = (projects || []).find((p: any) => p.id === projectId)?.name || ''

  const { data: record, isFetching } = useQuery({
    queryKey: ['ohs', projectId, month, year],
    enabled: projectId !== '',
    queryFn: () => api.get('/ohs-statistics/', { params: { project_id: projectId, month, year } }).then(r => r.data),
  })

  // Prior-period cumulative sums (project-to-date, strictly before the selected month)
  const { data: prior } = useQuery({
    queryKey: ['ohs-cum', projectId, month, year],
    enabled: projectId !== '',
    queryFn: () => api.get('/ohs-statistics/cumulative', { params: { project_id: projectId, month, year } }).then(r => r.data),
  })

  // Cumulative = prior saved history + this month's live "For the month" value (keyed by item_key).
  const cumFor = (items: FormItem[], data: Record<string, SummaryRow>, priorSums: any): Record<string, number> => {
    const out: Record<string, number> = {}
    items.forEach(it => { out[it.item_key] = (priorSums?.[it.item_key] ?? 0) + num(data[it.item_key]?.for_month) })
    return out
  }
  const genCum = cumFor(config.general_summary, form.general_summary, prior?.general_summary)
  const actCum = cumFor(config.activities, form.activities, prior?.activities)

  const withCum = (data: Record<string, SummaryRow>, cums: Record<string, number>): Record<string, SummaryRow> => {
    const out: Record<string, SummaryRow> = {}
    for (const k of Object.keys(data)) out[k] = { ...data[k], cumulative: fmtNum(cums[k] ?? 0) }
    return out
  }

  // populate the form whenever the record / config / selected period changes
  useEffect(() => {
    if (projectId === '') return
    setForm(normalizeOhsData(Number(projectId), month, year, record, config))
  }, [record, projectId, month, year, configData]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof OhsData>(k: K, v: OhsData[K]) => setForm(f => ({ ...f, [k]: v }))

  const setSecA = (key: string, k: 'avg_persons' | 'man_hours', v: string) =>
    setForm(f => ({ ...f, section_a: { ...f.section_a, [key]: { ...(f.section_a[key] || { avg_persons: '', man_hours: '' }), [k]: v } } }))
  const setSummary = (section: 'general_summary' | 'activities', key: string, k: keyof SummaryRow, v: string) =>
    setForm(f => ({ ...f, [section]: { ...f[section], [key]: { ...(f[section][key] || { for_month: '', cumulative: '', remarks: '' }), [k]: v } } }))
  const setLti = (i: number, k: keyof LtiRow, v: string) =>
    setForm(f => ({ ...f, lti: f.lti.map((r, idx) => idx === i ? { ...r, [k]: v } : r) }))
  const setViol = (i: number, k: keyof ViolationRow, v: string) =>
    setForm(f => ({ ...f, violations: f.violations.map((r, idx) => idx === i ? { ...r, [k]: v } : r) }))

  const addLti = () => set('lti', [...form.lti, { name: '', company: '', date: '', man_days_lost: '', investigated: '', report_sent: '' }])
  const addViol = () => set('violations', [...form.violations, { date: '', issued_to: '', issued_by: '', type: '', reason: '' }])

  // Keep the dashboard SHE PDF manpower feed in sync (derived from Section A totals).
  function syncManpower() {
    if (!projectName) return
    try {
      const stored: any[] = JSON.parse(localStorage.getItem(MANPOWER_STORAGE_KEY) || '[]')
      const rows = Object.values(form.section_a)
      const manHours = rows.reduce((s, r) => s + (parseFloat(r.man_hours) || 0), 0)
      const avgPersons = rows.reduce((s, r) => s + (parseFloat(r.avg_persons) || 0), 0)
      const map = new Map(stored.map(r => [r.name, r]))
      map.set(projectName, { name: projectName, manHours, avgPersons })
      localStorage.setItem(MANPOWER_STORAGE_KEY, JSON.stringify([...map.values()]))
    } catch { /* ignore */ }
  }

  async function save() {
    if (projectId === '') { toast.error('Select a project'); return }
    setSaving(true)
    try {
      await api.put('/ohs-statistics/', {
        project_id: Number(projectId), month, year,
        company: form.company, expected_duration: form.expected_duration,
        current_age: form.current_age, contractors_present: form.contractors_present,
        section_a: form.section_a, lti: form.lti,
        general_summary: withCum(form.general_summary, genCum),
        activities: withCum(form.activities, actCum),
        violations: form.violations,
        safety_coordinator: form.safety_coordinator, site_incharge: form.site_incharge,
      })
      syncManpower()
      setSavedMsg(true); setTimeout(() => setSavedMsg(false), 3000)
      toast.success('OH&S statistics saved')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  function report() {
    if (projectId === '') { toast.error('Select a project'); return }
    generateOhsStatisticsPdf({
      ...form, project_id: Number(projectId), project_name: projectName, month, year,
      general_summary: withCum(form.general_summary, genCum),
      activities: withCum(form.activities, actCum),
    }, config)
  }

  return (
    <div className="space-y-5">
      {/* Header / controls */}
      <div className="card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-indigo-600" />
              <h2 className="font-semibold text-gray-900 text-lg">Monthly OH&amp;S Statistics</h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
              Form <span className="font-medium text-slate-500">OHS-016</span>. Select a project and period, fill in the
              monthly statistics, and generate the report. Section A also feeds the manpower figures used in the SHE dashboard PDF.
              Rows are managed in <span className="font-medium text-slate-500">Admin → OH&amp;S Form</span>.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <div className="inline-flex rounded-xl bg-gray-100 p-1">
              {(['form', 'dashboard'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === m ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
                  {m === 'form' ? 'Form' : 'Dashboard'}
                </button>
              ))}
            </div>
            {mode === 'form' && <>
            {savedMsg && <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium"><CheckCircle className="w-4 h-4" /> Saved</span>}
            <button onClick={report} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 transition">
              <FileDown className="w-4 h-4" /> Generate Report
            </button>
            {canWrite && (
              <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
              </button>
            )}
            </>}
          </div>
        </div>

        {/* Period selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div>
            <label className="label">Project Site</label>
            <select className="input" value={projectId} onChange={e => setProjectId(Number(e.target.value))}>
              {(projects || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Month</label>
            <select className="input" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <select className="input" value={year} onChange={e => setYear(Number(e.target.value))}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {mode === 'dashboard' ? (
        <OhsDashboard projects={projects || []} projectId={projectId} month={month} year={year} config={config} />
      ) : isFetching ? (
        <div className="card h-40 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : (
        <>
          {/* Header fields */}
          <div className="card grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <div><label className="label">Company</label><input className="input" disabled={!canWrite} value={form.company} onChange={e => set('company', e.target.value)} /></div>
            <div><label className="label">Expected duration of the project</label><input className="input" disabled={!canWrite} value={form.expected_duration} onChange={e => set('expected_duration', e.target.value)} /></div>
            <div><label className="label">Current age of the project</label><input className="input" disabled={!canWrite} value={form.current_age} onChange={e => set('current_age', e.target.value)} /></div>
            <div><label className="label">Contractors currently present</label><input className="input" disabled={!canWrite} value={form.contractors_present} onChange={e => set('contractors_present', e.target.value)} /></div>
          </div>

          {/* A — Manhours */}
          <div className="card overflow-x-auto">
            <SectionTitle letter="A" title="Details of Manhours Worked" />
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-xs uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-2 w-10 text-left font-medium">#</th>
                  <th className="py-2 pr-3 text-left font-medium">Description</th>
                  <th className="py-2 px-2 w-44 text-center font-medium">Avg. persons / day</th>
                  <th className="py-2 px-2 w-44 text-center font-medium">Man-hours (Monthly)</th>
                </tr>
              </thead>
              <tbody>
                {config.section_a.map((it, i) => (
                  <tr key={it.item_key} className="border-b border-slate-100">
                    <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                    <td className="py-2 pr-3 text-slate-700">{it.label}</td>
                    <td className="py-1.5 px-2"><Cell align="center" disabled={!canWrite} value={form.section_a[it.item_key]?.avg_persons || ''} onChange={v => setSecA(it.item_key, 'avg_persons', v)} /></td>
                    <td className="py-1.5 px-2"><Cell align="center" disabled={!canWrite} value={form.section_a[it.item_key]?.man_hours || ''} onChange={v => setSecA(it.item_key, 'man_hours', v)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* B — LTI */}
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between">
              <SectionTitle letter="B" title="Details of Lost Time Injury" />
              {canWrite && <button onClick={addLti} className="btn-secondary btn-sm"><Plus className="w-3.5 h-3.5" /> Add row</button>}
            </div>
            {form.lti.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No lost-time injuries. Click “Add row” to record one.</p>
            ) : (
              <table className="w-full text-sm min-w-[760px]">
                <thead><tr className="text-xs uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-2 text-left font-medium">Name of Injured</th><th className="py-2 px-2 text-left font-medium">Company</th>
                  <th className="py-2 px-2 text-left font-medium">Date</th><th className="py-2 px-2 text-center font-medium">Man-days lost</th>
                  <th className="py-2 px-2 text-center font-medium">Investigated?</th><th className="py-2 px-2 text-center font-medium">Report to HO</th><th className="w-8"></th>
                </tr></thead>
                <tbody>
                  {form.lti.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2"><Cell disabled={!canWrite} value={r.name} onChange={v => setLti(i, 'name', v)} /></td>
                      <td className="py-1.5 px-2"><Cell disabled={!canWrite} value={r.company} onChange={v => setLti(i, 'company', v)} /></td>
                      <td className="py-1.5 px-2"><Cell disabled={!canWrite} value={r.date} onChange={v => setLti(i, 'date', v)} placeholder="YYYY-MM-DD" /></td>
                      <td className="py-1.5 px-2"><Cell align="center" disabled={!canWrite} value={r.man_days_lost} onChange={v => setLti(i, 'man_days_lost', v)} /></td>
                      <td className="py-1.5 px-2"><Cell align="center" disabled={!canWrite} value={r.investigated} onChange={v => setLti(i, 'investigated', v)} placeholder="Yes/No" /></td>
                      <td className="py-1.5 px-2"><Cell align="center" disabled={!canWrite} value={r.report_sent} onChange={v => setLti(i, 'report_sent', v)} placeholder="Yes/No" /></td>
                      <td className="text-center">{canWrite && <button onClick={() => set('lti', form.lti.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* C — General Summary */}
          <SummaryTable letter="C" title="General Summary" items={config.general_summary} data={form.general_summary} cumulative={genCum} disabled={!canWrite} onChange={(key, k, v) => setSummary('general_summary', key, k, v)} />

          {/* D — Activities */}
          <SummaryTable letter="D" title="Activities" items={config.activities} data={form.activities} cumulative={actCum} disabled={!canWrite} onChange={(key, k, v) => setSummary('activities', key, k, v)} />

          {/* E — Violations */}
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between">
              <SectionTitle letter="E" title="Violation Memo & Stop Work Notice (PIC, EIC, PSO)" />
              {canWrite && <button onClick={addViol} className="btn-secondary btn-sm"><Plus className="w-3.5 h-3.5" /> Add row</button>}
            </div>
            {form.violations.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">None issued. Click “Add row” to record one.</p>
            ) : (
              <table className="w-full text-sm min-w-[760px]">
                <thead><tr className="text-xs uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-2 text-left font-medium">Date</th><th className="py-2 px-2 text-left font-medium">Issued to (Contractor)</th>
                  <th className="py-2 px-2 text-left font-medium">Issued by</th><th className="py-2 px-2 text-center font-medium">Memo / Stoppage</th>
                  <th className="py-2 px-2 text-left font-medium">Reason</th><th className="w-8"></th>
                </tr></thead>
                <tbody>
                  {form.violations.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2"><Cell disabled={!canWrite} value={r.date} onChange={v => setViol(i, 'date', v)} placeholder="YYYY-MM-DD" /></td>
                      <td className="py-1.5 px-2"><Cell disabled={!canWrite} value={r.issued_to} onChange={v => setViol(i, 'issued_to', v)} /></td>
                      <td className="py-1.5 px-2"><Cell disabled={!canWrite} value={r.issued_by} onChange={v => setViol(i, 'issued_by', v)} /></td>
                      <td className="py-1.5 px-2"><Cell align="center" disabled={!canWrite} value={r.type} onChange={v => setViol(i, 'type', v)} placeholder="Memo / Stoppage" /></td>
                      <td className="py-1.5 px-2"><Cell disabled={!canWrite} value={r.reason} onChange={v => setViol(i, 'reason', v)} /></td>
                      <td className="text-center">{canWrite && <button onClick={() => set('violations', form.violations.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Signatures */}
          <div className="card grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <div><label className="label">Name of Safety Coordinator</label><input className="input" disabled={!canWrite} value={form.safety_coordinator} onChange={e => set('safety_coordinator', e.target.value)} /></div>
            <div><label className="label">Name of Site In-charge</label><input className="input" disabled={!canWrite} value={form.site_incharge} onChange={e => set('site_incharge', e.target.value)} /></div>
          </div>

          {!canWrite && <p className="text-xs text-slate-400 text-center">Your role can view and export this form but not edit it.</p>}
        </>
      )}
    </div>
  )
}

// ── reusable summary table (sections C & D) ──────────────────────────────────
function SummaryTable({ letter, title, items, data, cumulative, disabled, onChange }: {
  letter: string; title: string; items: FormItem[]; data: Record<string, SummaryRow>; cumulative: Record<string, number>; disabled: boolean
  onChange: (key: string, k: keyof SummaryRow, v: string) => void
}) {
  return (
    <div className="card overflow-x-auto">
      <SectionTitle letter={letter} title={title} />
      <table className="w-full text-sm min-w-[620px]">
        <thead>
          <tr className="text-xs uppercase text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-2 w-8 text-left font-medium">#</th>
            <th className="py-2 pr-3 text-left font-medium">Description</th>
            <th className="py-2 px-2 w-28 text-center font-medium">For the month</th>
            <th className="py-2 px-2 w-28 text-center font-medium">
              Cumulative <span className="text-[9px] text-indigo-400 normal-case">(auto)</span>
            </th>
            <th className="py-2 px-2 w-48 text-left font-medium">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.item_key} className="border-b border-slate-100">
              <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
              <td className="py-2 pr-3 text-slate-700">{it.label}</td>
              <td className="py-1.5 px-2"><Cell align="center" disabled={disabled} value={data[it.item_key]?.for_month || ''} onChange={v => onChange(it.item_key, 'for_month', v)} /></td>
              <td className="py-1.5 px-2 text-center">
                <span className="inline-block w-full text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5"
                  title="Project-to-date total (history + this month), auto-calculated">
                  {fmtNum(cumulative[it.item_key] ?? 0)}
                </span>
              </td>
              <td className="py-1.5 px-2"><Cell disabled={disabled} value={data[it.item_key]?.remarks || ''} onChange={v => onChange(it.item_key, 'remarks', v)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
