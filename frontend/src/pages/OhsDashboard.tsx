import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Minus, Loader2, BarChart3 } from 'lucide-react'
import api from '../lib/api'
import { OhsFormConfig, MONTHS } from '../lib/ohsConfig'

// ── Data shapes ─────────────────────────────────────────────────────────────
interface MonthRow {
  year: number; month: number
  general_summary: Record<string, number>; activities: Record<string, number>
  man_hours: number; avg_persons: number; lti: number; man_days_lost: number; violations: number
}
type Totals = Record<string, number>          // metric id → value
type View = 'cumulative' | 'month' | 'quarter' | 'year'

interface Metric { id: string; label: string; group: string; average?: boolean }

// Series colour: categorical slot 1 of the reference palette (single series → no legend).
const SERIES_1 = '#2a78d6'

// ── Periods (quarters & years follow the Indian financial year, Apr–Mar) ────
const fyStart = (y: number, m: number) => (m >= 4 ? y : y - 1)
const fyLabel = (start: number) => `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`
const fyQuarter = (m: number) => Math.floor(((m + 8) % 12) / 3) + 1      // Apr–Jun = Q1
const monthIdx = (y: number, m: number) => y * 12 + (m - 1)

function periodKey(view: Exclude<View, 'cumulative'>, y: number, m: number): string {
  if (view === 'month') return `${y}-${String(m).padStart(2, '0')}`
  if (view === 'quarter') return `${fyStart(y, m)}-Q${fyQuarter(m)}`
  return `${fyStart(y, m)}`
}
function periodLabel(view: Exclude<View, 'cumulative'>, key: string): string {
  if (view === 'month') { const [y, m] = key.split('-').map(Number); return `${MONTHS[m - 1].slice(0, 3)} ${y}` }
  if (view === 'quarter') {
    const [s, q] = key.split('-Q').map(Number)
    const first = ((q - 1) * 3 + 3) % 12   // Q1 → Apr (index 3)
    return `Q${q} ${fyLabel(s).replace('FY ', 'FY')} (${MONTHS[first].slice(0, 3)}–${MONTHS[(first + 2) % 12].slice(0, 3)})`
  }
  return fyLabel(Number(key))
}
/** Step a period key back by one. */
function prevKey(view: Exclude<View, 'cumulative'>, key: string): string {
  if (view === 'month') { const [y, m] = key.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}` }
  if (view === 'quarter') { const [s, q] = key.split('-Q').map(Number); return q === 1 ? `${s - 1}-Q4` : `${s}-Q${q - 1}` }
  return String(Number(key) - 1)
}

/** Sum a set of months into metric totals; averages (manpower) are averaged over months with data. */
function aggregate(rows: MonthRow[], metrics: Metric[]): Totals {
  const out: Totals = {}
  for (const mt of metrics) out[mt.id] = 0
  for (const r of rows) {
    out.man_hours += r.man_hours; out.avg_persons += r.avg_persons
    out.lti += r.lti; out.man_days_lost += r.man_days_lost; out.violations += r.violations
    for (const [k, v] of Object.entries(r.general_summary)) if (`gs:${k}` in out) out[`gs:${k}`] += v
    for (const [k, v] of Object.entries(r.activities)) if (`act:${k}` in out) out[`act:${k}`] += v
  }
  if (rows.length) out.avg_persons = out.avg_persons / rows.length
  return out
}

const fmt = (n: number | undefined) =>
  n === undefined || Number.isNaN(n) ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: n % 1 ? 1 : 0 })

function Change({ a, b }: { a: number; b: number }) {
  const d = a - b
  if (!d) return <span className="inline-flex items-center gap-0.5 text-slate-400"><Minus className="w-3 h-3" /> 0</span>
  const pct = b ? ` (${d > 0 ? '+' : ''}${((d / b) * 100).toFixed(0)}%)` : ''
  // Neutral ink: whether "up" is good depends on the metric (trainings vs injuries).
  return (
    <span className="inline-flex items-center gap-0.5 text-slate-600 tabular-nums">
      {d > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {d > 0 ? '+' : ''}{fmt(d)}{pct}
    </span>
  )
}

// ── Component ───────────────────────────────────────────────────────────────
export default function OhsDashboard({ projects, projectId, month, year, config }: {
  projects: any[]; projectId: number | ''; month: number; year: number; config: OhsFormConfig
}) {
  const [scope, setScope] = useState<'project' | 'all'>('project')
  const [view, setView] = useState<View>('cumulative')
  const [periodA, setPeriodA] = useState<string>('')        // '' = the page's selected month/quarter/year
  const [periodB, setPeriodB] = useState<string>('')        // '' = the period before A
  const [trendMetric, setTrendMetric] = useState('man_hours')

  const { data: series = [], isLoading } = useQuery<MonthRow[]>({
    queryKey: ['ohs-series', scope, projectId],
    enabled: scope === 'all' || projectId !== '',
    queryFn: () => api.get('/ohs-statistics/series', { params: { project_id: scope === 'project' ? [projectId] : undefined } }).then(r => r.data),
  })

  const metrics: Metric[] = useMemo(() => [
    { id: 'man_hours', label: 'Man-hours worked', group: 'Key figures' },
    { id: 'avg_persons', label: 'Average manpower (persons)', group: 'Key figures', average: true },
    { id: 'lti', label: 'Lost time injuries', group: 'Key figures' },
    { id: 'man_days_lost', label: 'Man-days lost', group: 'Key figures' },
    { id: 'violations', label: 'Violation memos / stop-work notices', group: 'Key figures' },
    ...config.general_summary.map(it => ({ id: `gs:${it.item_key}`, label: it.label, group: 'General summary' })),
    ...config.activities.map(it => ({ id: `act:${it.item_key}`, label: it.label, group: 'Safety activities' })),
  ], [config])

  const pageMonthIdx = monthIdx(year, month)

  // Column A / B totals + labels for the selected view.
  const { colA, colB, labelA, labelB, periodOptions } = useMemo(() => {
    if (view === 'cumulative') {
      const cur = series.filter(r => monthIdx(r.year, r.month) === pageMonthIdx)
      const upto = series.filter(r => monthIdx(r.year, r.month) <= pageMonthIdx)
      return {
        colA: aggregate(cur, metrics), colB: aggregate(upto, metrics),
        labelA: `${MONTHS[month - 1]} ${year}`, labelB: `Cumulative to ${MONTHS[month - 1].slice(0, 3)} ${year}`,
        periodOptions: [] as string[],
      }
    }
    const byKey = new Map<string, MonthRow[]>()
    for (const r of series) {
      const k = periodKey(view, r.year, r.month)
      byKey.set(k, [...(byKey.get(k) || []), r])
    }
    const a = periodA || periodKey(view, year, month)
    const b = periodB || prevKey(view, a)
    const opts = Array.from(new Set([...byKey.keys(), a, b])).sort().reverse()
    return {
      colA: aggregate(byKey.get(a) || [], metrics), colB: aggregate(byKey.get(b) || [], metrics),
      labelA: periodLabel(view, a), labelB: periodLabel(view, b), periodOptions: opts,
    }
  }, [view, series, metrics, periodA, periodB, pageMonthIdx, month, year])

  // Trend of one metric: last 12 months / 8 quarters / 5 financial years up to the selected period.
  const trend = useMemo(() => {
    const v: Exclude<View, 'cumulative'> = view === 'cumulative' ? 'month' : view
    const n = v === 'month' ? 12 : v === 'quarter' ? 8 : 5
    const end = view === 'cumulative' || !periodA ? periodKey(v, year, month) : periodA
    const keys: string[] = [end]
    while (keys.length < n) keys.unshift(prevKey(v, keys[0]))
    const metric = metrics.find(m => m.id === trendMetric) || metrics[0]
    return keys.map(k => {
      const rows = series.filter(r => periodKey(v, r.year, r.month) === k)
      return { key: k, label: periodLabel(v, k), value: rows.length ? aggregate(rows, metrics)[metric.id] : 0, hasData: rows.length > 0 }
    })
  }, [view, series, metrics, trendMetric, periodA, month, year])

  const projectName = projects.find((p: any) => p.id === projectId)?.name || 'Selected project'
  const isCum = view === 'cumulative'
  const groups = ['Key figures', 'General summary', 'Safety activities']
  const trendMetricLabel = metrics.find(m => m.id === trendMetric)?.label || ''
  const noData = !isLoading && series.length === 0

  const VIEWS: { id: View; label: string }[] = [
    { id: 'cumulative', label: 'Month vs Cumulative' },
    { id: 'month', label: 'Monthly' },
    { id: 'quarter', label: 'Quarterly' },
    { id: 'year', label: 'Yearly' },
  ]

  return (
    <div className="space-y-5">
      {/* Filters — one row above the charts */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Scope</label>
            <select className="input !py-1.5 text-sm" value={scope} onChange={e => setScope(e.target.value as any)}>
              <option value="project">{projectName}</option>
              <option value="all">All projects</option>
            </select>
          </div>
          <div>
            <label className="label">Compare</label>
            <div className="inline-flex rounded-xl bg-gray-100 p-1">
              {VIEWS.map(v => (
                <button key={v.id} onClick={() => { setView(v.id); setPeriodA(''); setPeriodB('') }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === v.id ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          {!isCum && (
            <>
              <div>
                <label className="label">Period</label>
                <select className="input !py-1.5 text-sm" value={periodA || periodKey(view, year, month)} onChange={e => { setPeriodA(e.target.value); setPeriodB('') }}>
                  {periodOptions.map(k => <option key={k} value={k}>{periodLabel(view, k)}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Compared with</label>
                <select className="input !py-1.5 text-sm" value={periodB || prevKey(view, periodA || periodKey(view, year, month))} onChange={e => setPeriodB(e.target.value)}>
                  {periodOptions.map(k => <option key={k} value={k}>{periodLabel(view, k)}</option>)}
                </select>
              </div>
            </>
          )}
          <p className="text-xs text-slate-400 ml-auto self-center">
            {isCum ? 'Month and year follow the selectors above.' : 'Quarters and years are financial (Apr–Mar).'}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="card h-40 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : noData ? (
        <div className="card p-12 text-center">
          <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 font-medium">No saved OH&amp;S statistics yet{scope === 'project' ? ` for ${projectName}` : ''}</p>
          <p className="text-sm text-gray-400 mt-0.5">Fill in and save the monthly form to see comparisons here.</p>
        </div>
      ) : (
        <>
          {/* Hero tiles — key figures */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {metrics.filter(m => m.group === 'Key figures').map(m => (
              <div key={m.id} className="card p-4">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide leading-tight">{m.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{fmt(colA[m.id])}</p>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  {isCum ? <>Cumulative {fmt(colB[m.id])}</> : <>vs {fmt(colB[m.id])} in {labelB}</>}
                </p>
                {!isCum && <p className="text-xs mt-0.5"><Change a={colA[m.id]} b={colB[m.id]} /></p>}
              </div>
            ))}
          </div>

          {/* Trend of one metric (single series) */}
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="font-semibold text-gray-900 text-sm">
                {trendMetricLabel} — {view === 'quarter' ? 'by quarter' : view === 'year' ? 'by financial year' : 'by month'}
              </h3>
              <select className="input !py-1 text-xs max-w-xs" value={trendMetric} onChange={e => setTrendMetric(e.target.value)}>
                {groups.map(g => (
                  <optgroup key={g} label={g}>
                    {metrics.filter(m => m.group === g).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#d1d5db' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={48}
                    tickFormatter={(v: number) => v.toLocaleString('en-IN', { notation: 'compact' })} />
                  <Tooltip cursor={{ fill: 'rgba(42,120,214,0.08)' }}
                    formatter={(v: any, _n: any, p: any) => [p?.payload?.hasData ? fmt(Number(v)) : 'No data saved', trendMetricLabel]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  <Bar dataKey="value" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Comparison table — every metric */}
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="text-left font-semibold px-4 py-2.5">Metric</th>
                  <th className="text-right font-semibold px-4 py-2.5 whitespace-nowrap">{labelA}</th>
                  <th className="text-right font-semibold px-4 py-2.5 whitespace-nowrap">{labelB}</th>
                  <th className="text-right font-semibold px-4 py-2.5 whitespace-nowrap">{isCum ? 'Month share' : 'Change'}</th>
                </tr>
              </thead>
              {groups.map(g => {
                const rows = metrics.filter(m => m.group === g)
                if (!rows.length) return null
                return (
                  <tbody key={g}>
                    <tr><td colSpan={4} className="px-4 pt-4 pb-1 text-xs font-semibold text-indigo-700">{g}</td></tr>
                    {rows.map(m => (
                      <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setTrendMetric(m.id)}
                        title="Show this metric in the chart">
                        <td className={`px-4 py-2 ${trendMetric === m.id ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{m.label}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-900">{fmt(colA[m.id])}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600">{fmt(colB[m.id])}</td>
                        <td className="px-4 py-2 text-right text-xs">
                          {isCum
                            ? <span className="tabular-nums text-slate-500">{m.average ? '—' : colB[m.id] ? `${((colA[m.id] / colB[m.id]) * 100).toFixed(0)}%` : '—'}</span>
                            : <Change a={colA[m.id]} b={colB[m.id]} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )
              })}
            </table>
          </div>
          <p className="text-[11px] text-slate-400 -mt-2">
            Values are the saved "For the month" figures. Average manpower is averaged over the months in a period; everything else is summed.
            {isCum ? ' Cumulative = all saved months up to and including the selected month.' : ''}
          </p>
        </>
      )}
    </div>
  )
}
