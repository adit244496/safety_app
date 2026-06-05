import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import { BarChart3, TrendingUp, ArrowUpRight, Users, Award, ClipboardList, Save, CheckCircle, SlidersHorizontal, X } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../store/authStore'
import { MultiSelectFilter, type MSOption } from '../components/MultiSelectFilter'

// ─── helpers ────────────────────────────────────────────────────────────────

function rolling12Months() {
  const to = new Date()
  const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  }
}

function sortRows(rows: any[], key: string, asc: boolean) {
  return [...rows].sort((a, b) => {
    const l = a[key] ?? 0, r = b[key] ?? 0
    if (typeof l === 'string' && typeof r === 'string')
      return asc ? l.localeCompare(r) : r.localeCompare(l)
    return asc ? l - r : r - l
  })
}

const GRADATION_COLOR: Record<string, string> = {
  EXCELLENT: '#10b981',
  GOOD: '#22c55e',
  AVERAGE: '#f59e0b',
  'BELOW AVERAGE': '#ef4444',
  NA: '#94a3b8',
}

const GRADATION_BG: Record<string, string> = {
  EXCELLENT: 'bg-emerald-100 text-emerald-800',
  GOOD: 'bg-green-100 text-green-800',
  AVERAGE: 'bg-amber-100 text-amber-800',
  'BELOW AVERAGE': 'bg-red-100 text-red-800',
  NA: 'bg-slate-100 text-slate-500',
}

// ─── EASE Score Tab ──────────────────────────────────────────────────────────

function EaseScoreView() {
  const last90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today  = new Date().toISOString().slice(0, 10)
  const [projectFilter, setProjectFilter] = useState('')
  const [dateFrom, setDateFrom] = useState(last90)
  const [dateTo, setDateTo]     = useState(today)

  const { data: easeProjects } = useQuery({
    queryKey: ['ease-projects'],
    queryFn: () => api.get('/ease-score/projects').then(r => r.data),
  })

  const { data: easeData, isLoading } = useQuery({
    queryKey: ['ease-scores', projectFilter, dateFrom, dateTo],
    queryFn: () => api.get('/ease-score/', {
      params: {
        project_name: projectFilter || undefined,
        date_from: dateFrom,
        date_to: dateTo,
      },
    }).then(r => r.data),
  })

  const periods: any[] = easeData || []
  const allCategories: string[] = periods[0]?.categories?.map((c: any) => c.category) || []

  // Aggregated overall % (average of all periods' overall scores)
  const aggregatedOverall = useMemo(() => {
    const valid = periods.filter((p: any) => p.overall_score != null)
    if (!valid.length) return null
    return Math.round(valid.reduce((s: number, p: any) => s + p.overall_score, 0) / valid.length * 10) / 10
  }, [periods])

  const aggregatedGrad = aggregatedOverall != null
    ? aggregatedOverall >= 90 ? 'EXCELLENT' : aggregatedOverall >= 75 ? 'GOOD' : aggregatedOverall >= 60 ? 'AVERAGE' : 'BELOW AVERAGE'
    : 'NA'

  // Aggregated bar chart: average score per category across all periods
  const aggregatedChartData = useMemo(() => {
    if (!allCategories.length) return []
    return allCategories.map((cat: string) => {
      const scores = periods
        .map((p: any) => p.categories.find((c: any) => c.category === cat)?.score)
        .filter((s: any) => s != null) as number[]
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null
      const grad = avg != null
        ? avg >= 90 ? 'EXCELLENT' : avg >= 75 ? 'GOOD' : avg >= 60 ? 'AVERAGE' : 'BELOW AVERAGE'
        : 'NA'
      return {
        category: cat.length > 15 ? cat.slice(0, 14) + '…' : cat,
        fullCategory: cat,
        score: avg,
        fill: GRADATION_COLOR[grad] || '#94a3b8',
      }
    })
  }, [periods, allCategories])

  // 3 columns anchored to the most recent period that has data
  const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const recentSlots = useMemo(() => {
    let refYear: number, refMonth: number

    if (periods.length > 0) {
      // Use the latest period present in the fetched data
      const latest = [...periods].sort((a: any, b: any) =>
        b.period_year !== a.period_year ? b.period_year - a.period_year : b.period_month - a.period_month
      )[0]
      refYear = latest.period_year
      refMonth = latest.period_month
    } else if (dateTo) {
      const ref = new Date(dateTo + 'T00:00:00')
      refYear = ref.getFullYear()
      refMonth = ref.getMonth() + 1
    } else {
      const now = new Date()
      refMonth = now.getMonth() || 12
      refYear = now.getFullYear() - (now.getMonth() === 0 ? 1 : 0)
    }

    return [0, 1, 2].map(offset => {
      let m = refMonth - offset, y = refYear
      if (m <= 0) { m += 12; y-- }
      const label = `${MONTH_NAMES_SHORT[m - 1]} ${y}`
      const match = periods.find((p: any) => p.period_year === y && p.period_month === m)
      return { year: y, month: m, label, data: match ?? null }
    })
  }, [periods, dateTo])

  const GradBadge = ({ g }: { g: string }) => (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${GRADATION_BG[g] || GRADATION_BG.NA}`}>
      {g === 'NA' ? 'N/A' : g}
    </span>
  )

  const ScoreBar = ({ score }: { score: number | null }) => {
    if (score === null) return <span className="text-slate-300 text-xs">N/A</span>
    const color = score >= 90 ? '#10b981' : score >= 75 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div style={{ width: `${score}%`, background: color }} className="h-full rounded-full" />
        </div>
        <span className="text-xs font-semibold" style={{ color }}>{score}%</span>
      </div>
    )
  }

  const easeActiveCount = (projectFilter ? 1 : 0) + (dateFrom !== last90 ? 1 : 0) + (dateTo !== today ? 1 : 0)

  return (
    <div className="space-y-5">
      {/* Inline filter bar */}
      <div className="card-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-gray-400 flex-shrink-0">
            <SlidersHorizontal className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Filters</span>
            {easeActiveCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{easeActiveCount}</span>
            )}
          </div>
          <div className="w-px h-4 bg-gray-200 flex-shrink-0" />
          <MultiSelectFilter
            size="sm"
            options={(easeProjects || []).map((p: string) => ({ value: p, label: p }))}
            value={projectFilter ? [projectFilter] : []}
            onChange={v => setProjectFilter((v as string[])[0] ?? '')}
            placeholder="Project"
            className="min-w-[130px]"
          />
          <div className="flex items-center gap-1.5">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 w-[130px]" title="Date from" />
            <span className="text-gray-300 text-xs">–</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 w-[130px]" title="Date to" />
          </div>
          {easeActiveCount > 0 && (
            <button onClick={() => { setProjectFilter(''); setDateFrom(last90); setDateTo(today) }}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : !periods.length ? (
        <div className="card h-48 flex items-center justify-center text-slate-400">No EASE Score data for the selected filters.</div>
      ) : (
        <>
          {/* Overall % */}
          <div className="card flex items-center gap-6">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <Award className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Overall EASE Score</p>
              <p className="text-3xl font-bold text-slate-900">
                {aggregatedOverall != null ? `${aggregatedOverall}%` : '—'}
              </p>
            </div>
            <div className="ml-2">
              <GradBadge g={aggregatedGrad} />
            </div>
            <div className="ml-auto text-xs text-slate-400 text-right">
              {periods.length} period{periods.length !== 1 ? 's' : ''} · {projectFilter || 'All projects'}
            </div>
          </div>

          {/* Aggregated bar chart */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold text-gray-900">Category Scores (Aggregated)</h2>
              <span className="ml-auto text-xs text-slate-400">{aggregatedChartData.length} categories</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={aggregatedChartData} margin={{ top: 16, right: 10, left: -10, bottom: 80 }}>
                <XAxis dataKey="category" angle={-45} textAnchor="end" interval={0} height={90}
                  tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`}
                  tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                      <p className="font-semibold text-slate-800 mb-0.5">{d.payload.fullCategory}</p>
                      <p className="font-bold" style={{ color: d.payload.fill }}>{d.value != null ? `${d.value}%` : 'N/A'}</p>
                    </div>
                  )
                }} />
                <Bar dataKey="score" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {aggregatedChartData.map((_: any, i: number) => (
                    <Cell key={i} fill={aggregatedChartData[i].fill} />
                  ))}
                  <LabelList dataKey="score" position="top" formatter={(v: any) => v != null ? `${v}%` : ''} style={{ fontSize: 9, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-3">
              {Object.entries(GRADATION_COLOR).map(([g, c]) => (
                <div key={g} className="flex items-center gap-1 text-xs text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: c }} />
                  {g}
                </div>
              ))}
            </div>
          </div>

          {/* Category Scores by Period — prev 3 months always shown */}
          <div className="card overflow-x-auto">
            <h2 className="font-semibold text-gray-900 mb-4">Category Scores by Period <span className="text-xs font-normal text-slate-400 ml-1">(last 3 months)</span></h2>
            <table className="w-full text-sm text-left min-w-[500px]">
              <thead>
                <tr className="text-xs uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4 w-64">Category</th>
                  {recentSlots.map(slot => (
                    <th key={slot.label} className="py-2 px-3 text-center whitespace-nowrap">
                      {slot.label}
                      {!slot.data && <><br /><span className="text-[10px] text-slate-300 normal-case font-normal">no data</span></>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allCategories.map((cat: string) => (
                  <tr key={cat} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2.5 pr-4 font-medium text-slate-800">{cat}</td>
                    {recentSlots.map(slot => {
                      const catData = slot.data?.categories.find((c: any) => c.category === cat)
                      return (
                        <td key={`${slot.label}-${cat}`} className="py-2.5 px-3">
                          <div className="flex flex-col items-center gap-1">
                            <ScoreBar score={catData?.score ?? null} />
                            {catData && <GradBadge g={catData.gradation || 'NA'} />}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                  <td className="py-2.5 pr-4 text-slate-900">Overall Score</td>
                  {recentSlots.map(slot => (
                    <td key={`overall-${slot.label}`} className="py-2.5 px-3">
                      <div className="flex flex-col items-center gap-1">
                        <ScoreBar score={slot.data?.overall_score ?? null} />
                        {slot.data && <GradBadge g={slot.data.ease_category || 'NA'} />}
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Compliance Analysis Tab ─────────────────────────────────────────────────

// Priority sort: 0-obs first → high_risk desc → compliance_score asc (lower = more concerns)
function prioritySort(rows: any[]): any[] {
  return [...rows].sort((a, b) => {
    const aZero = a.total === 0, bZero = b.total === 0
    if (aZero !== bZero) return aZero ? -1 : 1
    if (b.high_risk !== a.high_risk) return b.high_risk - a.high_risk
    return a.compliance_score - b.compliance_score
  })
}

function rowPriority(row: any): 'critical' | 'warning' | 'normal' {
  if (row.total === 0) return 'critical'
  if (row.high_risk > 0) return 'warning'
  return 'normal'
}

function ComplianceAnalysis() {
  const [projectIds,    setProjectIds]    = useState<number[]>([])
  const [contractorIds, setContractorIds] = useState<number[]>([])
  const [dateFrom,      setDateFrom]      = useState('')
  const [dateTo,        setDateTo]        = useState('')
  const [projectSort,   setProjectSort]   = useState({ key: 'priority', asc: true })
  const [contractorSort,setContractorSort]= useState({ key: 'priority', asc: true })

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects/').then(r => r.data),
  })
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users/').then(r => r.data),
  })
  const contractors: any[] = (users || []).filter((u: any) => u.role === 'Contractor')
  const projectOptions:    MSOption[] = (projects || []).map((p: any) => ({ value: p.id, label: p.name }))
  const contractorOptions: MSOption[] = contractors.map((c: any)     => ({ value: c.id, label: c.name }))

  const { data: details, isLoading } = useQuery({
    queryKey: ['compliance-details', projectIds, contractorIds, dateFrom, dateTo],
    queryFn: () => api.get('/observations/stats/summary-details', {
      params: {
        project_id:         projectIds.length    ? projectIds    : undefined,
        contractor_user_id: contractorIds.length ? contractorIds : undefined,
        date_from: dateFrom,
        date_to:   dateTo,
      },
    }).then(r => r.data),
  })

  const applySorting = (rows: any[], sort: { key: string; asc: boolean }) =>
    sort.key === 'priority' ? prioritySort(rows) : sortRows(rows, sort.key, sort.asc)

  const sortedProjects = useMemo(
    () => applySorting(details?.projectSummary || [], projectSort),
    [details?.projectSummary, projectSort],
  )
  const sortedContractors = useMemo(
    () => applySorting(details?.contractorSummary || [], contractorSort),
    [details?.contractorSummary, contractorSort],
  )

  const toggleSort = (section: 'project' | 'contractor', key: string) => {
    const cur = section === 'project' ? projectSort : contractorSort
    const next = { key, asc: cur.key === key ? !cur.asc : false }
    if (section === 'project') setProjectSort(next)
    else setContractorSort(next)
  }

  const SortTh = ({ section, col, label }: { section: 'project' | 'contractor', col: string, label: string }) => {
    const cur = section === 'project' ? projectSort : contractorSort
    return (
      <th className="py-2 px-2 cursor-pointer select-none hover:text-indigo-600 whitespace-nowrap"
        onClick={() => toggleSort(section, col)}>
        {label} {cur.key === col ? (cur.asc ? '↑' : '↓') : <span className="text-slate-300">↕</span>}
      </th>
    )
  }

  const ComplianceBar = ({ score }: { score: number }) => {
    const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
    return (
      <div className="flex items-center gap-2">
        <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div style={{ width: `${score}%`, background: color }} className="h-full rounded-full" />
        </div>
        <span className="font-semibold text-xs" style={{ color }}>{score}%</span>
      </div>
    )
  }

  const PriorityBadge = ({ row }: { row: any }) => {
    const p = rowPriority(row)
    if (p === 'critical') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 ml-1.5">NO OBS</span>
    if (p === 'warning') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-1.5">HIGH RISK</span>
    return null
  }

  const rowBg = (row: any) => {
    const p = rowPriority(row)
    if (p === 'critical') return 'bg-red-50/60'
    if (p === 'warning') return 'bg-amber-50/40'
    return ''
  }

  const compActiveCount =
    (projectIds.length > 0 ? 1 : 0) + (contractorIds.length > 0 ? 1 : 0) +
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)

  return (
    <div className="space-y-5">
      {/* Inline filter bar */}
      <div className="card-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-gray-400 flex-shrink-0">
            <SlidersHorizontal className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Filters</span>
            {compActiveCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{compActiveCount}</span>
            )}
          </div>
          <div className="w-px h-4 bg-gray-200 flex-shrink-0" />
          <MultiSelectFilter size="sm" options={projectOptions} value={projectIds}
            onChange={v => setProjectIds(v as number[])} placeholder="Project" className="min-w-[120px]" />
          <MultiSelectFilter size="sm" options={contractorOptions} value={contractorIds}
            onChange={v => setContractorIds(v as number[])} placeholder="Contractor" className="min-w-[130px]" />
          <div className="flex items-center gap-1.5">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 w-[130px]" title="Date from" />
            <span className="text-gray-300 text-xs">–</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 w-[130px]" title="Date to" />
          </div>
          {compActiveCount > 0 && (
            <button onClick={() => { setProjectIds([]); setContractorIds([]); setDateFrom(''); setDateTo('') }}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Project compliance */}
          <div className="card overflow-x-auto">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold text-gray-900">Project-wise Safety Compliance</h2>
              <button onClick={() => setProjectSort({ key: 'priority', asc: true })}
                className={`ml-auto text-xs px-2 py-1 rounded-lg transition ${projectSort.key === 'priority' ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                Priority view
              </button>
            </div>
            {!sortedProjects.length ? (
              <p className="text-sm text-slate-400 py-6 text-center">No project data for the selected range.</p>
            ) : (
              <table className="w-full text-sm text-left min-w-[560px]">
                <thead>
                  <tr className="text-xs uppercase text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4">Project</th>
                    <SortTh section="project" col="total" label="Total Obs" />
                    <SortTh section="project" col="compliance_score" label="Compliance" />
                    <SortTh section="project" col="high_risk" label="High Risk" />
                    <SortTh section="project" col="closed" label="Closed" />
                  </tr>
                </thead>
                <tbody>
                  {sortedProjects.map((row: any) => (
                    <tr key={row.project_id} className={`border-b border-slate-100 hover:bg-slate-50 ${rowBg(row)}`}>
                      <td className="py-3 pr-4 font-medium text-slate-900 flex items-center gap-1">
                        {row.project_name}
                        <PriorityBadge row={row} />
                      </td>
                      <td className="py-3 px-2">{row.total}</td>
                      <td className="py-3 px-2">{row.total > 0 ? <ComplianceBar score={row.compliance_score} /> : <span className="text-xs text-slate-400">—</span>}</td>
                      <td className="py-3 px-2">
                        <span className={`font-semibold ${row.high_risk > 0 ? 'text-red-600' : row.total > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                          {row.total > 0 ? row.high_risk : '—'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-slate-600">{row.total > 0 ? row.closed : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Contractor compliance */}
          <div className="card overflow-x-auto">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold text-gray-900">Contractor-wise Safety Compliance</h2>
              <button onClick={() => setContractorSort({ key: 'priority', asc: true })}
                className={`ml-auto text-xs px-2 py-1 rounded-lg transition ${contractorSort.key === 'priority' ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                Priority view
              </button>
            </div>
            {!sortedContractors.length ? (
              <p className="text-sm text-slate-400 py-6 text-center">No contractor data for the selected range.</p>
            ) : (
              <table className="w-full text-sm text-left min-w-[560px]">
                <thead>
                  <tr className="text-xs uppercase text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4">Contractor</th>
                    <SortTh section="contractor" col="total" label="Total Obs" />
                    <SortTh section="contractor" col="compliance_score" label="Compliance" />
                    <SortTh section="contractor" col="high_risk" label="High Risk" />
                    <SortTh section="contractor" col="closed" label="Closed" />
                  </tr>
                </thead>
                <tbody>
                  {sortedContractors.map((row: any) => (
                    <tr key={`${row.contractor_id}-${row.contractor_name}`} className={`border-b border-slate-100 hover:bg-slate-50 ${rowBg(row)}`}>
                      <td className="py-3 pr-4 font-medium text-slate-900">
                        <div className="flex items-center gap-1">
                          {row.contractor_name || 'Unknown'}
                          <PriorityBadge row={row} />
                        </div>
                      </td>
                      <td className="py-3 px-2">{row.total}</td>
                      <td className="py-3 px-2">{row.total > 0 ? <ComplianceBar score={row.compliance_score} /> : <span className="text-xs text-slate-400">—</span>}</td>
                      <td className="py-3 px-2">
                        <span className={`font-semibold ${row.high_risk > 0 ? 'text-red-600' : row.total > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                          {row.total > 0 ? row.high_risk : '—'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-slate-600">{row.total > 0 ? row.closed : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Top Observers */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold text-gray-900">Top Observers</h2>
              <span className="text-xs text-slate-400 ml-1">(by number of observations)</span>
            </div>
            {!details?.topObservers?.length ? (
              <p className="text-sm text-slate-400 py-6 text-center">No observer data for the selected range.</p>
            ) : (
              <div className="space-y-2">
                {details.topObservers.map((obs: any, i: number) => {
                  const max = details.topObservers[0]?.count || 1
                  const pct = Math.round((obs.count / max) * 100)
                  return (
                    <div key={obs.observer_name} className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                        ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-100 text-slate-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-500'}`}>
                        {i + 1}
                      </span>
                      <span className="w-40 truncate font-medium text-slate-900 text-sm">{obs.observer_name}</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div style={{ width: `${pct}%` }} className="h-full rounded-full bg-indigo-500" />
                      </div>
                      <span className="text-xs text-slate-600 w-16 text-right">{obs.count} obs</span>
                      {i === 0 && <ArrowUpRight className="w-4 h-4 text-amber-500" />}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Evaluation Criteria Tab ─────────────────────────────────────────────────

const RESPONSE_OPTIONS = ['Yes', 'Tending Yes', 'Tending No', 'No', 'NA'] as const
type ResponseOption = typeof RESPONSE_OPTIONS[number]

function marksObtained(response: ResponseOption | undefined, maxMarks: number): number | null {
  if (!response || response === 'NA') return null
  if (response === 'Yes') return maxMarks
  if (response === 'Tending Yes') return maxMarks / 2
  if (response === 'Tending No') return maxMarks / 4
  return 0
}

const RESPONSE_COLORS: Record<string, string> = {
  'Yes': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Tending Yes': 'bg-green-50 text-green-700 border-green-200',
  'Tending No': 'bg-amber-50 text-amber-700 border-amber-200',
  'No': 'bg-red-50 text-red-700 border-red-200',
  'NA': 'bg-slate-50 text-slate-500 border-slate-200',
}

function EvaluationCriteria() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Admin'
  const qc = useQueryClient()

  // Filters
  const now = new Date()
  const [projectFilter, setProjectFilter] = useState('')
  const [periodYear, setPeriodYear] = useState(now.getFullYear())
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1)

  // Local edits: elementId → response
  const [edits, setEdits] = useState<Record<number, ResponseOption>>({})
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  const { data: easeProjects } = useQuery({
    queryKey: ['ease-projects'],
    queryFn: () => api.get('/ease-score/projects').then(r => r.data),
  })

  const { data: criteria, isLoading: criteriaLoading } = useQuery({
    queryKey: ['ease-criteria'],
    queryFn: () => api.get('/ease-score/criteria').then(r => r.data),
  })

  const { data: savedResponses, isLoading: responsesLoading } = useQuery({
    queryKey: ['ease-responses', projectFilter, periodYear, periodMonth],
    queryFn: () => projectFilter
      ? api.get('/ease-score/responses', { params: { project_name: projectFilter, period_year: periodYear, period_month: periodMonth } }).then(r => r.data)
      : Promise.resolve({}),
    enabled: !!projectFilter,
  })

  // Merge saved responses with local edits
  const responses: Record<number, ResponseOption> = { ...(savedResponses || {}), ...edits }

  const toggleTopic = (id: number) =>
    setExpandedTopics(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const expandAll = () => setExpandedTopics(new Set((criteria || []).map((t: any) => t.id)))
  const collapseAll = () => setExpandedTopics(new Set())

  const totalElements = (criteria || []).reduce((s: number, t: any) => s + t.elements.length, 0)
  const totalMarks = (criteria || []).reduce(
    (s: number, t: any) => s + t.elements.reduce((ss: number, e: any) => ss + e.assessment_value, 0), 0
  )

  const handleSave = async () => {
    if (!projectFilter) return
    setSaving(true)
    try {
      const allElements: { id: number }[] = (criteria || []).flatMap((t: any) => t.elements)
      const responseItems = allElements.map((el: any) => ({
        element_id: el.id,
        response: responses[el.id] || null,
      }))
      await api.post('/ease-score/responses', {
        project_name: projectFilter,
        period_year: periodYear,
        period_month: periodMonth,
        date_from: null,
        date_to: null,
        responses: responseItems,
      })
      setEdits({})
      qc.invalidateQueries({ queryKey: ['ease-responses', projectFilter, periodYear, periodMonth] })
      qc.invalidateQueries({ queryKey: ['ease-scores'] })
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const monthName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][periodMonth - 1]
  const hasEdits = Object.keys(edits).length > 0

  if (criteriaLoading) return (
    <div className="h-48 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Filter + action bar */}
      <div className="card">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="w-5 h-5 text-indigo-600" />
              <h2 className="font-semibold text-gray-900 text-lg">EASE Evaluation Criteria</h2>
            </div>
            <p className="text-xs text-slate-400">
              Scoring: Yes → full · Tending Yes → ½ · Tending No → ¼ · No → 0 · NA → excluded
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={expandAll} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Expand All</button>
            <button onClick={collapseAll} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Collapse All</button>
            {isAdmin && (
              <a href="/admin/ease-criteria" className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition font-medium">Manage Criteria →</a>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1 text-sm text-slate-600">
            <span className="font-medium">Project *</span>
            <select
              value={projectFilter}
              onChange={e => { setProjectFilter(e.target.value); setEdits({}) }}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 bg-white text-slate-900 text-sm"
            >
              <option value="">— Select project —</option>
              {(easeProjects || []).map((p: string) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-slate-600">
            <span className="font-medium">Month / Year</span>
            <input
              type="month"
              value={`${periodYear}-${String(periodMonth).padStart(2, '0')}`}
              onChange={e => {
                const [y, m] = e.target.value.split('-')
                setPeriodYear(Number(y)); setPeriodMonth(Number(m)); setEdits({})
              }}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 bg-white text-slate-900 text-sm"
            />
          </label>
        </div>
      </div>

      {!projectFilter ? (
        <div className="card h-32 flex items-center justify-center text-slate-400 text-sm">
          Select a project above to view and enter evaluation data.
        </div>
      ) : responsesLoading ? (
        <div className="h-32 flex items-center justify-center">
          <div className="animate-spin w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Period summary + save */}
          <div className="card flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-slate-900">{projectFilter} — {monthName} {periodYear}</p>
              <p className="text-xs text-slate-400">{totalElements} elements · {totalMarks} max marks</p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {savedMsg && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                  <CheckCircle className="w-4 h-4" /> Saved successfully
                </span>
              )}
              {hasEdits && (
                <span className="text-xs text-amber-600 font-medium">{Object.keys(edits).length} unsaved change{Object.keys(edits).length !== 1 ? 's' : ''}</span>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save Responses'}
              </button>
            </div>
          </div>

          {/* Topics */}
          {(criteria || []).map((topic: any, ti: number) => {
            const isOpen = expandedTopics.has(topic.id)
            const topicMaxMarks = topic.elements.reduce((s: number, e: any) => s + e.assessment_value, 0)
            const topicObtained = topic.elements.reduce((s: number, e: any) => {
              const m = marksObtained(responses[e.id], e.assessment_value)
              return s + (m ?? 0)
            }, 0)
            const topicApplicable = topic.elements.reduce((s: number, e: any) => {
              const r = responses[e.id]
              return r && r !== 'NA' ? s + e.assessment_value : s
            }, 0)
            const topicScore = topicApplicable > 0 ? Math.round(topicObtained / topicApplicable * 1000) / 10 : null

            return (
              <div key={topic.id} className="card overflow-hidden p-0">
                <button
                  onClick={() => toggleTopic(topic.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 bg-indigo-50 hover:bg-indigo-100 transition text-left"
                >
                  {isOpen ? <ChevronDown className="w-4 h-4 text-indigo-600 shrink-0" /> : <ChevronRight className="w-4 h-4 text-indigo-600 shrink-0" />}
                  <span className="text-xs font-bold text-indigo-500 w-6 shrink-0">{ti + 1}</span>
                  <span className="font-semibold text-slate-900 flex-1">{topic.name}</span>
                  <span className="text-xs text-slate-500 shrink-0 mr-3">
                    {topic.elements.length} elements · {topicMaxMarks} max marks
                  </span>
                  {topicScore !== null && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${topicScore >= 90 ? 'bg-emerald-100 text-emerald-700' : topicScore >= 75 ? 'bg-green-100 text-green-700' : topicScore >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {topicScore}%
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[700px]">
                      <thead>
                        <tr className="bg-slate-50 text-xs uppercase text-slate-400 border-b border-slate-100">
                          <th className="py-2 px-4 w-8 text-center">#</th>
                          <th className="py-2 px-3 text-left">Evaluation Element</th>
                          <th className="py-2 px-3 text-center w-20">Max</th>
                          <th className="py-2 px-3 text-center w-44">Response</th>
                          <th className="py-2 px-3 text-center w-24">Marks Obtained</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topic.elements.map((el: any, ei: number) => {
                          const resp = responses[el.id] as ResponseOption | undefined
                          const obtained = marksObtained(resp, el.assessment_value)
                          return (
                            <tr key={el.id} className={`border-b border-slate-100 hover:bg-slate-50 ${ei % 2 ? 'bg-white' : ''}`}>
                              <td className="py-3 px-4 text-center text-slate-400 text-xs">{ei + 1}</td>
                              <td className="py-3 px-3 text-slate-800 leading-relaxed">{el.question}</td>
                              <td className="py-3 px-3 text-center">
                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 font-semibold text-sm">
                                  {el.assessment_value}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <select
                                  value={resp || ''}
                                  onChange={e => setEdits(prev => ({ ...prev, [el.id]: e.target.value as ResponseOption }))}
                                  className={`w-full rounded-lg border px-2 py-1.5 text-xs font-medium text-center cursor-pointer transition ${resp ? RESPONSE_COLORS[resp] : 'bg-white text-slate-400 border-slate-200'}`}
                                >
                                  <option value="">— Select —</option>
                                  {RESPONSE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                              </td>
                              <td className="py-3 px-3 text-center">
                                {resp === 'NA' ? (
                                  <span className="text-xs text-slate-400">N/A</span>
                                ) : obtained != null ? (
                                  <span className={`inline-flex items-center justify-center w-10 h-7 rounded-lg font-bold text-sm ${obtained === el.assessment_value ? 'bg-emerald-100 text-emerald-700' : obtained > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                                    {obtained}
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-300">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                        <tr className="bg-indigo-50/60 font-semibold">
                          <td colSpan={2} className="py-2.5 px-4 text-right text-xs text-indigo-600 uppercase tracking-wide">
                            {topic.name} — Total
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-flex items-center justify-center w-10 h-7 rounded-lg bg-indigo-600 text-white font-bold text-sm">{topicMaxMarks}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center text-xs text-slate-500">
                            {topicScore !== null ? `Score: ${topicScore}%` : ''}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-flex items-center justify-center w-10 h-7 rounded-lg bg-slate-200 text-slate-800 font-bold text-sm">{topicObtained}</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}

          {/* Grand total */}
          {(() => {
            const allElements = (criteria || []).flatMap((t: any) => t.elements)
            const grandObtained = allElements.reduce((s: number, e: any) => {
              const m = marksObtained(responses[e.id], e.assessment_value)
              return s + (m ?? 0)
            }, 0)
            const grandApplicable = allElements.reduce((s: number, e: any) => {
              const r = responses[e.id]
              return r && r !== 'NA' ? s + e.assessment_value : s
            }, 0)
            const grandScore = grandApplicable > 0 ? Math.round(grandObtained / grandApplicable * 1000) / 10 : null
            return (
              <div className="card bg-slate-900 text-white">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <span className="font-semibold">Grand Total — All Topics</span>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Max Marks</p>
                      <p className="text-xl font-bold">{totalMarks}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Obtained</p>
                      <p className="text-xl font-bold">{grandObtained}</p>
                    </div>
                    {grandScore !== null && (
                      <div className="text-center">
                        <p className="text-xs text-slate-400">Score</p>
                        <p className={`text-xl font-bold ${grandScore >= 90 ? 'text-emerald-400' : grandScore >= 75 ? 'text-green-400' : grandScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                          {grandScore}%
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}

// ─── Main Summary Page ───────────────────────────────────────────────────────

type Tab = 'ease' | 'compliance' | 'criteria'

export default function Summary() {
  const [activeTab, setActiveTab] = useState<Tab>('ease')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'ease', label: 'EASE Score' },
    { id: 'compliance', label: 'Compliance Analysis' },
    { id: 'criteria', label: 'Evaluation Criteria' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Summary</h1>
          <p className="text-sm text-gray-400 mt-1">EASE scores and compliance analysis across projects and contractors.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'ease' && <EaseScoreView />}
      {activeTab === 'compliance' && <ComplianceAnalysis />}
      {activeTab === 'criteria' && <EvaluationCriteria />}
    </div>
  )
}
