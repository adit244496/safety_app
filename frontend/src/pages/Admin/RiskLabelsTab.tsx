import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, CalendarClock } from 'lucide-react'
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

type Unit = 'days' | 'hours'
type Cell = { value: number | ''; unit: Unit }
const MATRIX = [1, 2, 3, 4, 5]
const key = (s: number, p: number) => `${s}x${p}`

// Same bands as the risk level (Low ≤ 4, Medium ≤ 12, High) — matches the SHE matrix colours.
const cellTone = (score: number) =>
  score > 12 ? 'bg-red-500 text-white' : score > 4 ? 'bg-sky-400 text-slate-900' : 'bg-green-600 text-white'

const toCell = (hours: number): Cell => hours % 24 === 0 ? { value: hours / 24, unit: 'days' } : { value: hours, unit: 'hours' }
const toHours = (c: Cell) => c.value === '' ? NaN : c.unit === 'days' ? Number(c.value) * 24 : Number(c.value)

/** Severity × Probability → time to rectify. Drives the auto-filled (and maximum) Target Date. */
function TargetMatrixEditor() {
  const qc = useQueryClient()
  const { data: saved = [] as any[] } = useQuery<any[]>({
    queryKey: ['target-matrix'],
    queryFn: () => api.get('/admin/target-matrix').then(r => r.data),
    staleTime: 60_000,
  })
  const savedCells = useMemo(() => {
    const m: Record<string, Cell> = {}
    for (const c of saved) m[key(c.severity, c.probability)] = toCell(c.hours)
    return m
  }, [saved])
  const [draft, setDraft] = useState<Record<string, Cell> | null>(null)
  const [saving, setSaving] = useState(false)
  const cells = draft ?? savedCells
  const cell = (s: number, p: number): Cell => cells[key(s, p)] ?? { value: '', unit: 'days' }
  const update = (s: number, p: number, patch: Partial<Cell>) =>
    setDraft({ ...cells, [key(s, p)]: { ...cell(s, p), ...patch } })

  async function save() {
    const body = MATRIX.flatMap(p => MATRIX.map(s => ({ severity: s, probability: p, hours: toHours(cell(s, p)) })))
    if (body.some(c => !Number.isFinite(c.hours) || c.hours < 1)) {
      toast.error('Every cell needs a duration of at least 1 hour'); return
    }
    setSaving(true)
    try {
      await api.put('/admin/target-matrix', body)
      qc.invalidateQueries({ queryKey: ['target-matrix'] })
      setDraft(null)
      toast.success('Target date matrix saved')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="card p-5 space-y-4 lg:col-span-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-indigo-500" /> Target Date for Rectification — Risk Matrix</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Time allowed to rectify for each Consequence (Severity) × Probability. The observation form auto-fills the target
          date from the observation date &amp; time; users may pick an earlier date but not a later one.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse text-xs mx-auto">
          <thead>
            <tr>
              <th className="p-1" />
              <th className="p-1" />
              <th colSpan={5} className="p-2 bg-rose-100 text-gray-800 font-semibold border border-gray-300">Consequence (Severity)</th>
            </tr>
            <tr>
              <th className="p-1" />
              <th className="p-1 border border-gray-300 bg-gray-800" />
              {MATRIX.map(s => <th key={s} className="p-2 w-28 bg-yellow-200 border border-gray-300 font-semibold">{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((p, i) => (
              <tr key={p}>
                {i === 0 && (
                  <th rowSpan={5} className="p-2 bg-rose-100 border border-gray-300 font-semibold text-gray-800">
                    <span className="[writing-mode:vertical-rl] rotate-180">Probability</span>
                  </th>
                )}
                <th className="p-2 bg-yellow-200 border border-gray-300 font-semibold">{p}</th>
                {MATRIX.map(s => {
                  const c = cell(s, p)
                  return (
                    <td key={s} className={`p-1.5 border border-gray-300 text-center ${cellTone(s * p)}`}>
                      <div className="font-bold text-sm leading-none mb-1">{s * p}</div>
                      <div className="flex items-center gap-1 justify-center">
                        <input type="number" min={1} value={c.value}
                          onChange={e => update(s, p, { value: e.target.value === '' ? '' : Number(e.target.value) })}
                          className="w-11 rounded px-1 py-0.5 text-center text-gray-900 bg-white/90 border border-black/10 text-xs" />
                        <select value={c.unit} onChange={e => update(s, p, { unit: e.target.value as Unit })}
                          className="rounded px-0.5 py-0.5 text-gray-900 bg-white/90 border border-black/10 text-[11px]">
                          <option value="days">days</option>
                          <option value="hours">hours</option>
                        </select>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => setDraft(null)} className="btn-ghost btn-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary btn-sm">
            {saving ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <Save className="w-3.5 h-3.5" />}
            Save matrix
          </button>
        </div>
      )}
    </div>
  )
}

export default function RiskLabelsTab() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <TargetMatrixEditor />
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
