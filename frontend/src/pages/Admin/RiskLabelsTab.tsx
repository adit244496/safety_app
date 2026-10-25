import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, Plus, Trash2, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import api from '../../lib/api'

const LEVELS = [0, 1, 2, 3, 4, 5]

function LabelEditor({
  title,
  hint,
  queryKey,
  getUrl,
  putUrl,
}: {
  title: string
  hint: string
  queryKey: string
  getUrl: string
  putUrl: (level: number) => string
}) {
  const qc = useQueryClient()
  const { data: labels = [] as any[] } = useQuery<any[]>({
    queryKey: [queryKey],
    queryFn: () => api.get(getUrl).then(r => r.data),
    staleTime: 60_000,
  })
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<number | null>(null)

  function currentLabel(level: number): string {
    const found = labels.find((l: any) => l.level === level)
    return found ? found.label : ''
  }

  function draft(level: number): string {
    return drafts[level] ?? currentLabel(level)
  }

  async function save(level: number) {
    const label = (drafts[level] ?? currentLabel(level)).trim()
    if (!label) return
    setSaving(level)
    await api.put(putUrl(level), { label })
    qc.invalidateQueries({ queryKey: [queryKey] })
    setDrafts(d => { const c = { ...d }; delete c[level]; return c })
    setSaving(null)
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
      </div>
      <div className="space-y-2">
        {LEVELS.map(level => {
          const isDirty = drafts[level] !== undefined && drafts[level] !== currentLabel(level)
          return (
            <div key={level} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{
                  background: level === 5 ? '#fef2f2' : level === 4 ? '#fff7ed' : level === 3 ? '#fefce8' : level === 2 ? '#f0fdf4' : '#f0f9ff',
                  color: level === 5 ? '#dc2626' : level === 4 ? '#ea580c' : level === 3 ? '#ca8a04' : level === 2 ? '#16a34a' : '#0284c7',
                }}>
                {level}
              </div>
              <input
                className="input flex-1 text-sm py-1.5"
                value={draft(level)}
                onChange={e => setDrafts(d => ({ ...d, [level]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') save(level) }}
                placeholder={`Label for level ${level}…`}
              />
              {isDirty && (
                <button
                  onClick={() => save(level)}
                  disabled={saving === level}
                  className="flex-shrink-0 flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {saving === level
                    ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                    : <Save className="w-3 h-3" />}
                  Save
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

type Rule = { min_score: number | ''; max_score: number | ''; days: number | '' }

const ruleTone = (max: number) =>
  max >= 13 ? 'bg-red-50 text-red-700' : max >= 5 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'

/** Risk score range → days to rectify. Drives the auto-filled Target Date on observations. */
function TargetDayRulesEditor() {
  const qc = useQueryClient()
  const { data: saved = [] as any[] } = useQuery<any[]>({
    queryKey: ['target-day-rules'],
    queryFn: () => api.get('/admin/target-day-rules').then(r => r.data),
    staleTime: 60_000,
  })
  const [rows, setRows] = useState<Rule[] | null>(null)
  const [saving, setSaving] = useState(false)
  const current: Rule[] = rows ?? saved.map((r: any) => ({ min_score: r.min_score, max_score: r.max_score, days: r.days }))
  const dirty = rows !== null

  const update = (i: number, k: keyof Rule, v: string) =>
    setRows(current.map((r, idx) => idx === i ? { ...r, [k]: v === '' ? '' : Number(v) } : r))
  const add = () => setRows([...current, { min_score: '', max_score: '', days: '' }])
  const remove = (i: number) => setRows(current.filter((_, idx) => idx !== i))

  // Scores 0–25 not covered by any range get no automatic target date.
  const uncovered = useMemo(() => {
    const gaps: number[] = []
    for (let s = 0; s <= 25; s++) {
      if (!current.some(r => r.min_score !== '' && r.max_score !== '' && s >= r.min_score && s <= r.max_score)) gaps.push(s)
    }
    return gaps
  }, [current])

  async function save() {
    if (current.some(r => r.min_score === '' || r.max_score === '' || r.days === '')) {
      toast.error('Fill in every score range and number of days'); return
    }
    setSaving(true)
    try {
      await api.put('/admin/target-day-rules', current)
      qc.invalidateQueries({ queryKey: ['target-day-rules'] })
      setRows(null)
      toast.success('Target date rules saved')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="card p-5 space-y-4 lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-indigo-500" /> Target Date for Rectification</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Risk score = Severity × Probability (0–25). The observation form auto-fills the target date as
            observation date + the days for its score range.
          </p>
        </div>
        <button onClick={add} className="btn-secondary btn-sm flex-shrink-0"><Plus className="w-3.5 h-3.5" /> Add range</button>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-1">
          <span>Score from</span><span>Score to</span><span>Days to rectify</span><span className="w-8" />
        </div>
        {current.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
            <input type="number" min={0} max={25} className="input text-sm py-1.5" value={r.min_score} onChange={e => update(i, 'min_score', e.target.value)} />
            <input type="number" min={0} max={25} className="input text-sm py-1.5" value={r.max_score} onChange={e => update(i, 'max_score', e.target.value)} />
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={365} className="input text-sm py-1.5 flex-1 min-w-0" value={r.days} onChange={e => update(i, 'days', e.target.value)} />
              {r.max_score !== '' && (
                <span className={`hidden sm:inline text-[11px] font-semibold px-2 py-1 rounded-md whitespace-nowrap ${ruleTone(Number(r.max_score))}`}>
                  {r.days === 0 ? 'Same day' : r.days === '' ? '—' : `${r.days} day${r.days === 1 ? '' : 's'}`}
                </span>
              )}
            </div>
            <button onClick={() => remove(i)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500" title="Remove range"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {current.length === 0 && <p className="text-xs text-gray-400 py-2">No ranges yet — add one.</p>}
      </div>

      {uncovered.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Scores not covered: {uncovered.join(', ')} — no target date will be auto-filled for these.
        </p>
      )}

      {dirty && (
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => setRows(null)} className="btn-ghost btn-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary btn-sm">
            {saving ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <Save className="w-3.5 h-3.5" />}
            Save rules
          </button>
        </div>
      )}
    </div>
  )
}

export default function RiskLabelsTab() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <TargetDayRulesEditor />
      <LabelEditor
        title="Severity of Consequence"
        hint="Labels shown in the risk assessment dropdown (1 = least severe, 5 = fatal)."
        queryKey="severity-labels"
        getUrl="/admin/severity-labels"
        putUrl={level => `/admin/severity-labels/${level}`}
      />
      <LabelEditor
        title="Probability of Occurrence"
        hint="Labels shown in the risk assessment dropdown (1 = very unlikely, 5 = almost certain)."
        queryKey="probability-labels"
        getUrl="/admin/probability-labels"
        putUrl={level => `/admin/probability-labels/${level}`}
      />
    </div>
  )
}
