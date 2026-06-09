import { useState, useMemo, useRef } from 'react'
import { usePageTitle } from '../store/pageTitleContext'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/authStore'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  ClipboardList, AlertTriangle, CheckCircle,
  TrendingUp, ArrowUpRight, Hourglass, SlidersHorizontal, X, ChevronDown, Clock, Download,
} from 'lucide-react'
import ExcelJS from 'exceljs'
import { generateDashboardPdf } from '../lib/printPdf'
import api from '../lib/api'
import { fmtDate, getRiskClass, getStatusClass } from '../lib/utils'
import { MultiSelectFilter, type MSOption } from '../components/MultiSelectFilter'

const STATUS_COLORS: Record<string, string> = {
  Open: '#6366f1', Pending: '#f59e0b', 'Under Review': '#3b82f6',
  'Partially Closed': '#8b5cf6', Closed: '#10b981',
}
const RISK_COLORS: Record<string, string> = { Low: '#10b981', Medium: '#f59e0b', High: '#f43f5e' }

const PRIORITY_OPTIONS: MSOption[] = [
  { value: 'High',   label: 'High'   },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low',    label: 'Low'    },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isContractor = user?.role === 'Contractor'
  const [showFilters, setShowFilters] = useState(false)
  usePageTitle('Dashboard', 'Overview of all safety observations')

  // ── Filter state (arrays for multi-select) ──────────────────────────────
  const [projectIds,     setProjectIds]     = useState<number[]>([])
  const [buildingId,     setBuildingId]     = useState<number | ''>('')
  const [selectedContractors, setSelectedContractors] = useState<string[]>(
    () => isContractor && user?.name ? [user.name] : []
  )
  const [coreConcernIds, setCoreConcernIds] = useState<number[]>([])
  const [riskLevels,     setRiskLevels]     = useState<string[]>([])
  const [dateFrom,       setDateFrom]       = useState('')
  const [dateTo,         setDateTo]         = useState('')

  const activeFilterCount =
    (projectIds.length    > 0 ? 1 : 0) +
    (buildingId           ? 1 : 0) +
    (!isContractor && selectedContractors.length > 0 ? 1 : 0) +
    (coreConcernIds.length > 0 ? 1 : 0) +
    (riskLevels.length    > 0 ? 1 : 0) +
    (dateFrom             ? 1 : 0) +
    (dateTo               ? 1 : 0)

  // ── Lookup data ─────────────────────────────────────────────────────────
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects/').then(r => r.data),
  })
  // Buildings only meaningful when exactly one project is selected
  const singleProjectId = projectIds.length === 1 ? projectIds[0] : null
  const { data: buildings } = useQuery({
    queryKey: ['buildings', singleProjectId],
    queryFn: () => singleProjectId
      ? api.get(`/projects/${singleProjectId}/buildings`).then(r => r.data)
      : Promise.resolve([]),
    enabled: !!singleProjectId,
  })
  const { data: contractors = [] as any[] } = useQuery({
    queryKey: ['contractors'],
    queryFn: () => api.get('/users/contractors').then(r => r.data),
  })
  const { data: coreConcerns } = useQuery({
    queryKey: ['core-concerns'],
    queryFn: () => api.get('/admin/core-concerns').then(r => r.data),
  })
  // Cascading: contractor options narrowed to selected projects
  const contractorOptions: MSOption[] = useMemo(() => {
    const seen = new Set<string>()
    return contractors
      .filter((c: any) => {
        if (seen.has(c.name)) return false
        seen.add(c.name)
        if (projectIds.length === 0) return true
        return (c.projects || []).some((p: any) => projectIds.includes(p.id))
      })
      .map((c: any) => ({ value: c.name, label: c.name }))
  }, [contractors, projectIds])

  // Cascading: project options narrowed to selected contractors
  const contractorProjectIds = useMemo(() => {
    if (selectedContractors.length === 0) return null
    const ids = new Set<number>()
    contractors
      .filter((c: any) => selectedContractors.includes(c.name))
      .forEach((c: any) => (c.projects || []).forEach((p: any) => ids.add(p.id)))
    return ids
  }, [contractors, selectedContractors])

  const companyToUserIds = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const c of contractors) { map.set(c.name, [...(map.get(c.name) || []), c.id]) }
    return map
  }, [contractors])
  const expandedContractorIds = useMemo(() =>
    selectedContractors.flatMap(name => companyToUserIds.get(name) || []),
    [selectedContractors, companyToUserIds]
  )

  // ── Stats query ─────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['stats', projectIds, buildingId, selectedContractors, dateFrom, dateTo, coreConcernIds, riskLevels],
    queryFn: () => api.get('/observations/stats/summary', {
      params: {
        project_id:         projectIds.length          ? projectIds          : undefined,
        building_id:        buildingId                 || undefined,
        contractor_user_id: expandedContractorIds.length ? expandedContractorIds : undefined,
        date_from:          dateFrom             || undefined,
        date_to:            dateTo               || undefined,
        core_concern_id:    coreConcernIds.length ? coreConcernIds : undefined,
        risk_level:         riskLevels.length    ? riskLevels    : undefined,
      },
    }).then(r => r.data),
  })

  const statusCounts: Record<string, number> = {}
  data?.byStatus?.forEach((s: any) => { statusCounts[s.status] = s.count })
  const statusPie     = data?.byStatus?.map((s: any) => ({ name: s.status, value: s.count })) || []
  const riskBars      = (data?.byRisk  || []).filter((r: any) => r.risk_level)
  const STATUSES_LIST = ['Open', 'Pending', 'Under Review', 'Partially Closed', 'Closed'] as const
  const MONTHS_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const monthData = ((data?.byMonthStatus || []) as any[]).map((d: any) => ({
    ...d,
    _total: STATUSES_LIST.reduce((sum, s) => sum + (d[s] || 0), 0),
  }))

  const [viewMode, setViewMode] = useState<'monthly' | 'quarterly'>('monthly')

  const quarterData = useMemo(() => {
    const byQuarter: Record<string, any> = {}
    for (const d of monthData) {
      // d.month is "YYYY-MM" from backend (e.g. "2026-02")
      const [year, mStr] = (d.month as string).split('-')
      const mIdx = parseInt(mStr, 10) - 1  // 0-based
      if (isNaN(mIdx)) continue
      const q   = Math.floor(mIdx / 3) + 1
      const key = `Q${q} ${year}`
      if (!byQuarter[key]) { byQuarter[key] = { month: key }; STATUSES_LIST.forEach(s => { byQuarter[key][s] = 0 }) }
      STATUSES_LIST.forEach(s => { byQuarter[key][s] = (byQuarter[key][s] || 0) + (d[s] || 0) })
    }
    return Object.values(byQuarter).map(d => ({
      ...d,
      _total: STATUSES_LIST.reduce((sum, s) => sum + (d[s] || 0), 0),
    }))
  }, [monthData])

  const trendData = viewMode === 'quarterly' ? quarterData : monthData

  const cards = [
    { label: 'Total Observations', value: data?.total ?? 0,                          icon: ClipboardList, bg: 'bg-indigo-50',  color: 'text-indigo-600',  border: 'border-indigo-100'  },
    { label: 'Open',               value: statusCounts['Open'] ?? 0,                 icon: AlertTriangle, bg: 'bg-rose-50',    color: 'text-rose-600',    border: 'border-rose-100'    },
    { label: 'Pending',            value: statusCounts['Pending'] ?? 0,              icon: Hourglass,     bg: 'bg-amber-50',   color: 'text-amber-600',   border: 'border-amber-100'   },
    { label: 'Partially Closed',   value: statusCounts['Partially Closed'] ?? 0,     icon: Clock,         bg: 'bg-violet-50',  color: 'text-violet-600',  border: 'border-violet-100'  },
    { label: 'Closed',             value: statusCounts['Closed'] ?? 0,               icon: CheckCircle,   bg: 'bg-emerald-50', color: 'text-emerald-600', border: 'border-emerald-100' },
  ]

  const resetFilters = () => {
    setProjectIds([]); setBuildingId('')
    if (!isContractor) setSelectedContractors([])
    setCoreConcernIds([]); setRiskLevels([])
    setDateFrom(''); setDateTo('')
  }

  // Options arrays for MultiSelectFilter (project options cascade from contractor selection)
  const projectOptions: MSOption[] = useMemo(() =>
    (projects || [])
      .filter((p: any) => !contractorProjectIds || contractorProjectIds.has(p.id))
      .map((p: any) => ({ value: p.id, label: p.name })),
    [projects, contractorProjectIds]
  )
  const buildingOptions:    MSOption[] = (buildings   || []).map((b: any) => ({ value: b.id,   label: b.name }))
  const coreConcernOptions: MSOption[] = (coreConcerns || []).map((c: any) => ({ value: c.id, label: c.name }))

  async function downloadExcel() {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Neo SHE Safety App'

    const hFill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
    const bold  = (size = 10): Partial<ExcelJS.Font> => ({ bold: true, size, color: { argb: 'FFFFFFFF' } })
    const addHeaderRow = (ws: ExcelJS.Worksheet, cols: string[], color: string) => {
      const row = ws.addRow(cols)
      row.eachCell(cell => {
        cell.fill = hFill(color); cell.font = bold()
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } } }
      })
      row.height = 20
    }

    // Sheet 1 – Summary KPIs
    const ws1 = wb.addWorksheet('Summary')
    ws1.columns = [{ width: 24 }, { width: 12 }]
    addHeaderRow(ws1, ['Metric', 'Count'], 'FF4F46E5')
    cards.forEach((c, i) => {
      const row = ws1.addRow([c.label, c.value])
      row.getCell(1).fill = hFill(i % 2 === 0 ? 'FFF5F5FF' : 'FFFFFFFF')
      row.getCell(2).alignment = { horizontal: 'center' }
    })

    // Sheet 2 – Trend
    const ws2 = wb.addWorksheet(viewMode === 'quarterly' ? 'Quarterly Trend' : 'Monthly Trend')
    const trendCols = ['Period', 'Open', 'Pending', 'Under Review', 'Partially Closed', 'Closed', 'Total']
    ws2.columns = trendCols.map((h, i) => ({ header: h, width: i === 0 ? 16 : 14 }))
    addHeaderRow(ws2, trendCols, 'FF4F46E5')
    trendData.forEach((d: any, i) => {
      const row = ws2.addRow([d.month, d.Open || 0, d.Pending || 0, d['Under Review'] || 0, d['Partially Closed'] || 0, d.Closed || 0, d._total || 0])
      row.eachCell(cell => { cell.fill = hFill(i % 2 === 0 ? 'FFF5F5FF' : 'FFFFFFFF') })
      row.getCell(7).font = { bold: true }
    })

    // Sheet 3 – By Status
    const ws3 = wb.addWorksheet('By Status')
    ws3.columns = [{ width: 20 }, { width: 12 }]
    addHeaderRow(ws3, ['Status', 'Count'], 'FF4F46E5')
    statusPie.forEach((s: any, i: number) => {
      const row = ws3.addRow([s.name, s.value])
      row.getCell(1).fill = hFill(i % 2 === 0 ? 'FFF5F5FF' : 'FFFFFFFF')
      row.getCell(2).alignment = { horizontal: 'center' }
    })

    // Sheet 4 – By Risk
    if (riskBars.length > 0) {
      const ws4 = wb.addWorksheet('By Risk')
      ws4.columns = [{ width: 14 }, { width: 12 }]
      addHeaderRow(ws4, ['Risk Level', 'Count'], 'FF4F46E5')
      riskBars.forEach((r: any, i: number) => {
        const row = ws4.addRow([r.risk_level, r.count])
        row.getCell(1).fill = hFill(i % 2 === 0 ? 'FFF5F5FF' : 'FFFFFFFF')
        row.getCell(2).alignment = { horizontal: 'center' }
      })
    }

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click(); URL.revokeObjectURL(url)
  }

  function downloadPdf() {
    const filterParts = [
      projectIds.length
        ? `Projects: ${projectIds.map(id => (projects as any[] || []).find((p: any) => p.id === id)?.name || id).join(', ')}`
        : null,
      isContractor
        ? `Contractor: ${user?.name}`
        : selectedContractors.length ? `Contractors: ${selectedContractors.join(', ')}` : null,
      riskLevels.length ? `Risk: ${riskLevels.join(', ')}` : null,
      dateFrom || dateTo ? `${dateFrom || 'start'} → ${dateTo || 'today'}` : null,
    ].filter(Boolean)
    const filterDesc = filterParts.length ? filterParts.join(' | ') : 'All data — no filters applied'

    generateDashboardPdf({
      cards: cards.map(c => ({ label: c.label, value: c.value })),
      statusPie,
      riskBars,
      recent: data?.recent || [],
      filterDesc,
      viewMode,
    })
  }

  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const dlRef = useRef<HTMLDivElement>(null)

  return (
    <div id="dashboard-pdf-content" className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="lg:hidden">
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">Overview of all safety observations</p>
        </div>
        <div className="ml-auto relative" ref={dlRef}>
          <button
            onClick={() => setShowDownloadMenu(v => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download Report
            <ChevronDown className="w-3 h-3 ml-0.5" />
          </button>
          {showDownloadMenu && (
            <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden">
              <button onClick={() => { downloadExcel(); setShowDownloadMenu(false) }} className="w-full text-left px-4 py-2.5 text-xs hover:bg-indigo-50 text-gray-700 flex items-center gap-2">
                <span>📊</span> Excel (.xlsx)
              </button>
              <button onClick={() => { downloadPdf(); setShowDownloadMenu(false) }} className="w-full text-left px-4 py-2.5 text-xs hover:bg-indigo-50 text-gray-700 flex items-center gap-2">
                <span>📄</span> PDF (Print)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Inline filter bar */}
      <div className="card-sm">
        {/* Header row: always visible */}
        <div
          className="flex items-center gap-2 sm:pointer-events-none cursor-pointer sm:cursor-default"
          onClick={() => setShowFilters(v => !v)}
        >
          <SlidersHorizontal className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Filters</span>
          {activeFilterCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{activeFilterCount}</span>
          )}
          <ChevronDown className={`ml-auto w-4 h-4 text-gray-400 sm:hidden transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
        </div>

        {/* Filter controls: hidden on mobile until toggled, always visible on sm+ */}
        <div className={`gap-2 mt-3 sm:mt-2 sm:flex sm:flex-wrap sm:items-center ${showFilters ? 'grid grid-cols-2' : 'hidden'}`}>
          <div className="hidden sm:block w-px h-4 bg-gray-200 flex-shrink-0" />
          <MultiSelectFilter size="sm" options={projectOptions} value={projectIds}
            onChange={v => {
              const ids = v as number[]
              setProjectIds(ids); setBuildingId('')
              if (ids.length > 0) {
                const valid = new Set(contractors.filter((c: any) => (c.projects || []).some((p: any) => ids.includes(p.id))).map((c: any) => c.name))
                setSelectedContractors(prev => prev.filter(n => valid.has(n)))
              }
            }}
            placeholder="Project" className="w-full sm:w-auto sm:min-w-[110px]" />
          {singleProjectId && (
            <select
              value={buildingId}
              onChange={e => setBuildingId(Number(e.target.value) || '')}
              className="w-full sm:w-auto text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">Tower / Block</option>
              {buildingOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          )}
          {isContractor ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1.5 rounded-lg cursor-default">
              <span className="text-gray-400">Contractor:</span> {user?.name}
            </span>
          ) : (
            <MultiSelectFilter size="sm" options={contractorOptions} value={selectedContractors}
              onChange={v => {
                const names = v as string[]
                setSelectedContractors(names)
                if (names.length > 0) {
                  const valid = new Set<number>()
                  contractors.filter((c: any) => names.includes(c.name)).forEach((c: any) => (c.projects || []).forEach((p: any) => valid.add(p.id)))
                  setProjectIds(prev => prev.filter(id => valid.has(id)))
                }
              }}
              placeholder="Contractor" className="w-full sm:w-auto sm:min-w-[120px]" />
          )}
          <MultiSelectFilter size="sm" options={PRIORITY_OPTIONS} value={riskLevels}
            onChange={v => setRiskLevels(v as string[])} placeholder="Risk Level" className="w-full sm:w-auto sm:min-w-[110px]" />
          <MultiSelectFilter size="sm" options={coreConcernOptions} value={coreConcernIds}
            onChange={v => setCoreConcernIds(v as number[])} placeholder="Core Concern" className="w-full sm:w-auto sm:min-w-[130px]" />
          <div className="col-span-2 sm:col-auto flex items-center gap-1.5">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="flex-1 sm:flex-none sm:w-[130px] text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400" title="Date from" />
            <span className="text-gray-300 text-xs flex-shrink-0">–</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="flex-1 sm:flex-none sm:w-[130px] text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400" title="Date to" />
          </div>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters}
              className="col-span-2 sm:col-auto flex items-center justify-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors border border-red-100 sm:border-0 sm:px-2 sm:py-1">
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {cards.map(({ label, value, icon: Icon, bg, color, border }) => (
              <div key={label} className={`stat-card border ${border}`}>
                <div className={`${bg} ${color} p-3 rounded-xl flex-shrink-0`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Trend chart — Monthly or Quarterly */}
            <div id="dash-trend-chart" className="card lg:col-span-2">
              <div className="flex items-start justify-between gap-2 mb-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                  </div>
                  <h2 className="font-semibold text-gray-900">
                    {viewMode === 'monthly' ? 'Monthly' : 'Quarterly'} Trend
                  </h2>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Monthly / Quarterly toggle */}
                  <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg">
                    {(['monthly', 'quarterly'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setViewMode(m)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                          viewMode === m
                            ? 'bg-white text-indigo-700 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {m === 'monthly' ? 'Monthly' : 'Quarterly'}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {STATUSES_LIST.map(s => (
                      <div key={s} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[s] }} />
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={trendData} margin={{ top: 18, right: 8, left: -24, bottom: 0 }}>
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: string) => {
                        // quarterly keys are already "Q1 2026" — pass through
                        if (v.startsWith('Q')) return v
                        // monthly keys are "YYYY-MM" — convert to "Feb '26"
                        const [yr, mo] = v.split('-')
                        if (!mo) return v
                        return `${MONTHS_SHORT[parseInt(mo, 10) - 1]} '${yr.slice(2)}`
                      }}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      content={({ active, payload, label }) => active && payload?.length ? (
                        <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                          <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
                          {payload.slice().reverse().map((p: any) => p.value > 0 && (
                            <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
                                <span className="text-gray-600">{p.dataKey}</span>
                              </div>
                              <span className="font-semibold text-gray-900">{p.value}</span>
                            </div>
                          ))}
                          <div className="border-t border-gray-100 mt-1.5 pt-1.5 flex justify-between">
                            <span className="text-gray-500">Total</span>
                            <span className="font-bold text-gray-900">
                              {payload.reduce((s: number, p: any) => s + (p.value || 0), 0)}
                            </span>
                          </div>
                        </div>
                      ) : null}
                      cursor={{ fill: '#eff6ff' }}
                    />
                    {STATUSES_LIST.map((s, idx) => (
                      <Bar
                        key={s}
                        dataKey={s}
                        stackId="a"
                        fill={STATUS_COLORS[s]}
                        maxBarSize={52}
                        radius={idx === STATUSES_LIST.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      >
                        {/* Label inside each segment — only shown when value > 0 */}
                        <LabelList
                          dataKey={s}
                          position="inside"
                          formatter={(v: unknown) => (v as number) > 0 ? (v as number) : ''}
                          style={{ fontSize: 9, fontWeight: 700, fill: '#fff' }}
                        />
                        {/* Total above bar on the topmost segment */}
                        {idx === STATUSES_LIST.length - 1 && (
                          <LabelList
                            dataKey="_total"
                            position="top"
                            formatter={(v: unknown) => (v as number) > 0 ? (v as number) : ''}
                            style={{ fontSize: 10, fontWeight: 700, fill: '#374151' }}
                          />
                        )}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data for the selected filters</div>
              )}
            </div>

            {/* Status donut — full tenure */}
            <div id="dash-status-donut" className="card">
              <h2 className="font-semibold text-gray-900 mb-1">By Status</h2>
              <p className="text-[10px] text-gray-400 mb-3">Entire filtered tenure</p>
              {statusPie.length > 0 ? (
                <>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={190}>
                      <PieChart>
                        <Pie
                          data={statusPie}
                          dataKey="value"
                          nameKey="name"
                          cx="50%" cy="50%"
                          innerRadius={52}
                          outerRadius={75}
                          labelLine={false}
                          label={({ cx, cy, midAngle, innerRadius, outerRadius, value, percent }) => {
                            if (!percent || percent < 0.06 || midAngle == null) return null
                            const RADIAN = Math.PI / 180
                            const r = innerRadius + (outerRadius - innerRadius) * 0.5
                            const x = (cx as number) + r * Math.cos(-midAngle * RADIAN)
                            const y = (cy as number) + r * Math.sin(-midAngle * RADIAN)
                            return (
                              <text x={x} y={y} fill="white" textAnchor="middle"
                                dominantBaseline="central" fontSize={11} fontWeight={700}>
                                {value}
                              </text>
                            )
                          }}
                        >
                          {statusPie.map((s: any) => <Cell key={s.name} fill={STATUS_COLORS[s.name] || '#94a3b8'} />)}
                        </Pie>
                        <Tooltip formatter={(v) => [v, '']} />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Total in center hole */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-900">
                          {statusPie.reduce((s: number, x: any) => s + x.value, 0)}
                        </p>
                        <p className="text-[10px] text-gray-400">Total</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5 mt-2">
                    {statusPie.map((s: any) => (
                      <div key={s.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[s.name] }} />
                          <span className="text-gray-600">{s.name}</span>
                        </div>
                        <span className="font-semibold text-gray-900">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data</div>}
            </div>
          </div>

          {/* Risk + Recent */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Risk bars */}
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">Risk Distribution</h2>
              {riskBars.length > 0 ? (
                <div className="space-y-4">
                  {['High', 'Medium', 'Low'].map(level => {
                    const item = riskBars.find((r: any) => r.risk_level === level)
                    if (!item) return null
                    const total = riskBars.reduce((s: number, x: any) => s + x.count, 0)
                    const pct = Math.round((item.count / total) * 100)
                    return (
                      <div key={level}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className={getRiskClass(level)}>{level} Risk</span>
                          <span className="text-xs font-semibold text-gray-700">{item.count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: RISK_COLORS[level] }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : <div className="text-gray-400 text-sm text-center py-10">No risk data</div>}
            </div>

            {/* Recent observations */}
            <div className="card lg:col-span-2 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Recent Observations <span className="text-xs font-normal text-gray-400">(latest 4)</span></h2>
              </div>
              {(data?.recent || []).length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm flex-1">No observations for the selected filters</div>
              ) : (
                <div className="space-y-2 flex-1">
                  {(data?.recent || []).map((o: any) => (
                    <div
                      key={o.observation_id}
                      onClick={() => navigate(`/observations/${o.observation_id}`)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/40 cursor-pointer transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                            {o.observation_id}
                          </span>
                          {o.core_concern_name && (
                            <span className="text-xs text-gray-600 truncate">{o.core_concern_name}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {o.project_name} · {o.obs_date ? fmtDate(o.obs_date) : fmtDate(o.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {o.risk_level && <span className={getRiskClass(o.risk_level)}>{o.risk_level}</span>}
                        <span className={getStatusClass(o.status)}>{o.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => navigate('/observations')}
                className="mt-4 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-indigo-200 text-indigo-600 text-sm font-medium hover:bg-indigo-50 transition"
              >
                View all observations <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
