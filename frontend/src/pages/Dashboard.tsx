import { useState, useMemo, useRef, useCallback } from 'react'
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
  TrendingUp, ArrowUpRight, Hourglass, SlidersHorizontal, X, ChevronDown, Clock, Download, ThumbsUp,
} from 'lucide-react'
import ExcelJS from 'exceljs'
import { generateDashboardPdf } from '../lib/printPdf'
import api from '../lib/api'
import { fmtDate, getRiskClass, getStatusClass } from '../lib/utils'
import { MultiSelectFilter, type MSOption } from '../components/MultiSelectFilter'

const STATUS_COLORS: Record<string, string> = {
  Open: '#ef4444', Pending: '#f97316', 'Under Review': '#eab308',
  'Partially Closed': '#86efac', Closed: '#22c55e', 'Positive Approach': '#9ca3af',
}
const RISK_COLORS: Record<string, string> = { Low: '#10b981', Medium: '#f59e0b', High: '#f43f5e' }

const PRIORITY_OPTIONS: MSOption[] = [
  { value: 'High',   label: 'High'   },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low',    label: 'Low'    },
]

const AGEING_FILTER_OPTIONS: MSOption[] = [
  { value: 'overdue',   label: 'Overdue'           },
  { value: 'due_soon',  label: 'Due within 7 days' },
  { value: 'on_time',   label: 'On time'           },
  { value: 'no_target', label: 'No target date'    },
]

const AGEING_COLORS: Record<string, string> = {
  on_time:       '#10b981',
  overdue_1_7:   '#f59e0b',
  overdue_8_30:  '#f97316',
  overdue_30_plus: '#ef4444',
  no_target:     '#94a3b8',
}
const AGEING_LABELS: Record<string, string> = {
  on_time:       'On Time',
  overdue_1_7:   'Overdue ≤7d',
  overdue_8_30:  'Overdue 8-30d',
  overdue_30_plus: 'Overdue 30+d',
  no_target:     'No Target Set',
}

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
  const [ageingFilter,   setAgeingFilter]   = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const activeFilterCount =
    (projectIds.length    > 0 ? 1 : 0) +
    (buildingId           ? 1 : 0) +
    (!isContractor && selectedContractors.length > 0 ? 1 : 0) +
    (coreConcernIds.length > 0 ? 1 : 0) +
    (riskLevels.length    > 0 ? 1 : 0) +
    (ageingFilter.length  > 0 ? 1 : 0) +
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
    queryKey: ['stats', projectIds, buildingId, selectedContractors, dateFrom, dateTo, coreConcernIds, riskLevels, ageingFilter],
    queryFn: () => api.get('/observations/stats/summary', {
      params: {
        project_id:         projectIds.length          ? projectIds          : undefined,
        building_id:        buildingId                 || undefined,
        contractor_user_id: expandedContractorIds.length ? expandedContractorIds : undefined,
        date_from:          dateFrom             || undefined,
        date_to:            dateTo               || undefined,
        core_concern_id:    coreConcernIds.length ? coreConcernIds : undefined,
        risk_level:         riskLevels.length    ? riskLevels    : undefined,
        aging:              ageingFilter.length  ? ageingFilter  : undefined,
      },
    }).then(r => r.data),
  })

  const statusCounts: Record<string, number> = {}
  data?.byStatus?.forEach((s: any) => { statusCounts[s.status] = s.count })
  const statusPie     = data?.byStatus?.map((s: any) => ({ name: s.status, value: s.count })) || []
  const riskBars      = (data?.byRisk  || []).filter((r: any) => r.risk_level)
  const STATUSES_LIST = ['Open', 'Pending', 'Under Review', 'Partially Closed', 'Closed', 'Positive Approach'] as const
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
    { label: 'Positive Approach',  value: statusCounts['Positive Approach'] ?? 0,     icon: ThumbsUp,      bg: 'bg-teal-50',    color: 'text-teal-600',    border: 'border-teal-100'    },
  ]

  const resetFilters = () => {
    setProjectIds([]); setBuildingId('')
    if (!isContractor) setSelectedContractors([])
    setCoreConcernIds([]); setRiskLevels([]); setAgeingFilter([])
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

    // Sheet 1 – Summary KPIs (exclude totalPositive from separate card row duplication)
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
    const trendCols = ['Period', 'Open', 'Pending', 'Under Review', 'Partially Closed', 'Closed', 'Positive Approach', 'Total']
    ws2.columns = trendCols.map((h, i) => ({ header: h, width: i === 0 ? 16 : 14 }))
    addHeaderRow(ws2, trendCols, 'FF4F46E5')
    trendData.forEach((d: any, i) => {
      const row = ws2.addRow([d.month, d.Open || 0, d.Pending || 0, d['Under Review'] || 0, d['Partially Closed'] || 0, d.Closed || 0, d['Positive Approach'] || 0, d._total || 0])
      row.eachCell(cell => { cell.fill = hFill(i % 2 === 0 ? 'FFF5F5FF' : 'FFFFFFFF') })
      row.getCell(6).font = { color: { argb: 'FF0D9488' } }
      row.getCell(8).font = { bold: true }
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

    // Sheet 5 – Ageing Report
    const ws5 = wb.addWorksheet('Ageing Report')

    // Summary header — set columns before adding rows
    ws5.columns = [{ width: 22 }, { width: 10 }, { width: 14 }, { width: 16 }, { width: 22 }, { width: 22 }, { width: 16 }, { width: 14 }, { width: 10 }, { width: 18 }]
    const summaryTitleRow = ws5.addRow(['Ageing Summary'])
    ws5.mergeCells(`A${summaryTitleRow.number}:C${summaryTitleRow.number}`)
    summaryTitleRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF4F46E5' } }
    summaryTitleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
    summaryTitleRow.height = 22

    const summaryHeaders = ws5.addRow(['Ageing Bucket', 'Count', 'Percentage'])
    summaryHeaders.eachCell(cell => {
      cell.fill = hFill('FF4F46E5'); cell.font = bold()
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } } }
    })
    summaryHeaders.height = 20

    const byAging = data?.byAging || {}
    const agingBuckets = [
      { key: 'on_time',        label: 'On Time'          },
      { key: 'overdue_1_7',    label: 'Overdue 1-7 Days' },
      { key: 'overdue_8_30',   label: 'Overdue 8-30 Days'},
      { key: 'overdue_30_plus',label: 'Overdue 30+ Days' },
      { key: 'no_target',      label: 'No Target Set'    },
    ]
    const agingTotal = agingBuckets.reduce((s, b) => s + (byAging[b.key] || 0), 0)
    agingBuckets.forEach((b, i) => {
      const cnt = byAging[b.key] || 0
      const pct = agingTotal > 0 ? `${Math.round((cnt / agingTotal) * 100)}%` : '0%'
      const row = ws5.addRow([b.label, cnt, pct])
      row.getCell(1).fill = hFill(i % 2 === 0 ? 'FFF5F5FF' : 'FFFFFFFF')
      row.getCell(2).alignment = { horizontal: 'center' }
      row.getCell(3).alignment = { horizontal: 'center' }
    })
    const totalRow = ws5.addRow(['Total', agingTotal, '100%'])
    totalRow.eachCell(cell => { cell.font = { bold: true }; cell.alignment = { horizontal: 'center' } })
    totalRow.getCell(1).alignment = { horizontal: 'left' }

    ws5.addRow([])

    // Detail header — add the row first so rowCount is stable
    const detailTitleRow = ws5.addRow(['Ageing Detail'])
    ws5.mergeCells(`A${detailTitleRow.number}:G${detailTitleRow.number}`)
    const detailTitle = ws5.getCell(`A${detailTitleRow.number}`)
    detailTitle.font = { bold: true, size: 12, color: { argb: 'FF4F46E5' } }
    detailTitle.alignment = { horizontal: 'left', vertical: 'middle' }
    detailTitleRow.height = 22

    const detailCols = ['Obs ID', 'Project', 'Contractor', 'Status', 'Target Date', 'Days', 'Ageing Bucket']
    const detailHeaders = ws5.addRow(detailCols)
    detailHeaders.eachCell(cell => {
      cell.fill = hFill('FF4F46E5'); cell.font = bold()
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } } }
    })
    detailHeaders.height = 20

    try {
      const obsResp = await api.get('/observations/', {
        params: {
          project_id:         projectIds.length           ? projectIds           : undefined,
          building_id:        buildingId                  || undefined,
          contractor_user_id: expandedContractorIds.length ? expandedContractorIds : undefined,
          date_from:          dateFrom              || undefined,
          date_to:            dateTo                || undefined,
          core_concern_id:    coreConcernIds.length  ? coreConcernIds  : undefined,
          risk_level:         riskLevels.length     ? riskLevels      : undefined,
          limit: 10000,
        }
      })
      const allObs: any[] = obsResp.data?.observations ?? obsResp.data?.items ?? []
      const today = new Date(); today.setHours(0, 0, 0, 0)

      allObs.forEach((o: any, i: number) => {
        let bucket = 'No Target Set', daysStr: number | string = ''
        if (o.target_date_actual) {
          const target = new Date(o.target_date_actual); target.setHours(0, 0, 0, 0)
          const diff = Math.floor((today.getTime() - target.getTime()) / 86_400_000)
          if (diff <= 0) { bucket = 'On Time'; daysStr = Math.abs(diff) }
          else if (diff <= 7)  { bucket = 'Overdue 1-7 Days';  daysStr = diff }
          else if (diff <= 30) { bucket = 'Overdue 8-30 Days'; daysStr = diff }
          else                 { bucket = 'Overdue 30+ Days';  daysStr = diff }
        }
        const row = ws5.addRow([
          o.observation_id,
          o.project_name || '',
          o.contractor_name || '',
          o.status || '',
          o.target_date_actual || 'Not set',
          daysStr,
          bucket,
        ])
        row.eachCell(cell => { cell.fill = hFill(i % 2 === 0 ? 'FFF5F5FF' : 'FFFFFFFF') })
        row.getCell(6).alignment = { horizontal: 'center' }
        row.getCell(7).alignment = { horizontal: 'center' }
      })
    } catch { /* skip detail if fetch fails */ }

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Quarter label helper ────────────────────────────────────────────────
  function computeQuarterLabel(from?: string, _to?: string): string {
    const d = from ? new Date(from) : new Date()
    const m = d.getMonth() + 1
    const y = d.getFullYear()
    let qNum: number, qName: string
    if (m >= 4 && m <= 6)   { qNum = 1; qName = 'Apr to June' }
    else if (m >= 7 && m <= 9)  { qNum = 2; qName = 'Jul to Sep'  }
    else if (m >= 10 && m <= 12) { qNum = 3; qName = 'Oct to Dec' }
    else                         { qNum = 4; qName = 'Jan to Mar'  }
    const fyStart = m >= 4 ? y : y - 1
    return `Quarter - ${qNum} (${qName}), ${fyStart}-${String(fyStart + 1).slice(2)}`
  }

  function toFyQuarterLabel(year: number, month: number): string {
    if (month >= 4) {
      const q = month <= 6 ? 'Q-1' : month <= 9 ? 'Q-2' : 'Q-3'
      return `${q} (${String(year).slice(2)}-${String(year + 1).slice(2)})`
    }
    return `Q-4 (${String(year - 1).slice(2)}-${String(year).slice(2)})`
  }

  function quarterSortKey(label: string): number {
    const m = label.match(/Q-(\d)\s*\((\d{2})-/)
    if (!m) return 0
    return (2000 + parseInt(m[2])) * 10 + parseInt(m[1])
  }

  // ── PDF download ────────────────────────────────────────────────────────
  const [pdfGenerating, setPdfGenerating] = useState(false)

  const startPdfDownload = useCallback(async () => {
    setPdfGenerating(true)
    try {
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
      const quarterLabel = computeQuarterLabel(dateFrom, dateTo)

      // Fetch compliance summary
      let complianceData: { projectRows: any[]; contractorRows: any[]; topObservers: any[] } | undefined
      try {
        const res = await api.get('/observations/stats/summary-details', {
          params: {
            project_id:         projectIds.length            ? projectIds            : undefined,
            contractor_user_id: expandedContractorIds.length ? expandedContractorIds : undefined,
            date_from: dateFrom || undefined,
            date_to:   dateTo   || undefined,
          },
        })
        complianceData = {
          projectRows:    res.data?.projectSummary    || [],
          contractorRows: res.data?.contractorSummary || [],
          topObservers:   res.data?.topObservers      || [],
        }
      } catch { /* skip */ }

      // Fetch ease-score entries — 18 months for 4 full FY quarters of history
      let sheScoreByProject: Array<{ name: string; avgScore: number }> = []
      let sheScoreByCategory: Array<{ name: string; avgScore: number }> = []
      let projectSheHistory: Array<{ name: string; quarters: Array<{ label: string; score: number }> }> = []
      try {
        const now  = new Date()
        const from = new Date(now.getFullYear() - 1, now.getMonth() - 6, 1) // 18 months back
        const dateFrom18m = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`
        const easeResp = await api.get('/ease-score/', { params: { date_from: dateFrom18m } })
        const entries: any[] = easeResp.data || []

        // Current FY quarter label (for P1 SHE-score-by-project chart)
        const refDate = dateFrom ? new Date(dateFrom + 'T00:00:00') : now
        const currentQLabel = toFyQuarterLabel(refDate.getFullYear(), refDate.getMonth() + 1)

        const projMapCur = new Map<string, { total: number; count: number }>()
        const catMapCur  = new Map<string, { total: number; count: number }>()
        const projQMap   = new Map<string, Map<string, number[]>>()

        for (const e of entries) {
          const eqLabel = toFyQuarterLabel(e.period_year, e.period_month)

          // All quarters → P2 mini-chart history
          if (e.overall_score != null) {
            if (!projQMap.has(e.project_name)) projQMap.set(e.project_name, new Map())
            const qmap = projQMap.get(e.project_name)!
            if (!qmap.has(eqLabel)) qmap.set(eqLabel, [])
            qmap.get(eqLabel)!.push(e.overall_score)
          }

          // Current quarter only → P1 SHE score bars & category bars
          if (eqLabel === currentQLabel) {
            if (e.overall_score != null) {
              const cur = projMapCur.get(e.project_name) || { total: 0, count: 0 }
              cur.total += e.overall_score; cur.count += 1
              projMapCur.set(e.project_name, cur)
            }
            for (const cat of (e.categories || [])) {
              if (cat.score != null) {
                const cur = catMapCur.get(cat.category) || { total: 0, count: 0 }
                cur.total += cat.score; cur.count += 1
                catMapCur.set(cat.category, cur)
              }
            }
          }
        }

        // Fallback: if current quarter has no data, use latest available quarter per project
        const useProjMap = projMapCur.size > 0 ? projMapCur : (() => {
          const m = new Map<string, { total: number; count: number }>()
          for (const [name, qmap] of projQMap.entries()) {
            const sorted = Array.from(qmap.entries()).sort((a, b) => quarterSortKey(a[0]) - quarterSortKey(b[0]))
            const [, scores] = sorted[sorted.length - 1]
            const avg = scores.reduce((s, v) => s + v, 0) / scores.length
            m.set(name, { total: avg, count: 1 })
          }
          return m
        })()
        const useCatMap = catMapCur.size > 0 ? catMapCur : new Map<string, { total: number; count: number }>()

        sheScoreByProject = Array.from(useProjMap.entries())
          .map(([name, { total, count }]) => ({ name, avgScore: Math.round(total / count) }))
          .sort((a, b) => b.avgScore - a.avgScore)
        sheScoreByCategory = Array.from(useCatMap.entries())
          .map(([name, { total, count }]) => ({ name, avgScore: Math.round(total / count) }))

        // P2 mini-charts: last 4 FY quarters per project
        projectSheHistory = Array.from(projQMap.entries()).map(([name, qmap]) => ({
          name,
          quarters: Array.from(qmap.entries())
            .map(([label, scores]) => ({
              label,
              score: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
            }))
            .sort((a, b) => quarterSortKey(a.label) - quarterSortKey(b.label))
            .slice(-4),
        }))
      } catch { /* skip */ }

      // Fetch SHE report stats
      let sheReport: any
      try {
        const rr = await api.get('/observations/stats/she-report', {
          params: {
            project_id: projectIds.length ? projectIds : undefined,
            date_from:  dateFrom || undefined,
            date_to:    dateTo   || undefined,
          },
        })
        sheReport = rr.data
      } catch { /* skip */ }

      // Build manpower from localStorage (set via Summary → Man Power Details tab)
      const stored: { name: string; manHours: number; avgPersons: number }[] = (() => {
        try { return JSON.parse(localStorage.getItem('she_manpower_data') || '[]') } catch { return [] }
      })()
      const mpProjectNames: string[] = (
        sheReport?.projectRectification?.map((r: any) => r.project_name)
        ?? complianceData?.projectRows?.map((r: any) => r.project_name)
        ?? sheScoreByProject.map(p => p.name)
      ).filter((n: string) => n && n !== 'Unknown')
      const manpower = mpProjectNames.map((name: string) => {
        const found = stored.find(s => s.name === name)
        return { name, manHours: found?.manHours ?? 0, avgPersons: found?.avgPersons ?? 0 }
      })

      await generateDashboardPdf({
        cards: cards.map(c => ({ label: c.label, value: c.value })),
        statusPie,
        riskBars,
        ageingData: data?.byAging || {},
        filterDesc,
        quarterLabel,
        complianceData,
        sheScoreByProject,
        sheScoreByCategory,
        projectSheHistory,
        sheReport,
        manpower,
      })
    } finally {
      setPdfGenerating(false)
    }
  }, [
    projectIds, isContractor, user, selectedContractors, riskLevels, dateFrom, dateTo,
    expandedContractorIds, cards, statusPie, riskBars, data, projects,
  ])

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
              <button onClick={() => { startPdfDownload(); setShowDownloadMenu(false) }} disabled={pdfGenerating} className="w-full text-left px-4 py-2.5 text-xs hover:bg-indigo-50 text-gray-700 flex items-center gap-2 disabled:opacity-50">
                <span>📄</span> {pdfGenerating ? 'Generating…' : 'PDF Report'}
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
          <MultiSelectFilter size="sm" options={AGEING_FILTER_OPTIONS} value={ageingFilter}
            onChange={v => setAgeingFilter(v as string[])} placeholder="Ageing" className="w-full sm:w-auto sm:min-w-[130px]" />
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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
                        if (v.startsWith('Q')) return v
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
                        <LabelList
                          dataKey={s}
                          position="inside"
                          formatter={(v: unknown) => (v as number) > 0 ? (v as number) : ''}
                          style={{ fontSize: 9, fontWeight: 700, fill: '#fff' }}
                        />
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

          {/* Aging + Risk (left col) | Recent (right col) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left column: aging donut + risk distribution stacked */}
            <div className="space-y-5">
            {/* Aging donut */}
            {(() => {
              const byAging = data?.byAging || {}
              const agingPie = Object.entries(AGEING_LABELS)
                .map(([key, label]) => ({ name: label, value: byAging[key] || 0, key }))
                .filter(d => d.value > 0)
              const agingTotal = agingPie.reduce((s, d) => s + d.value, 0)
              return (
                <div id="dash-aging-donut" className="card">
                  <h2 className="font-semibold text-gray-900 mb-1">Ageing Distribution</h2>
                  <p className="text-[10px] text-gray-400 mb-3">Days past target rectification date</p>
                  {agingPie.length > 0 ? (
                    <>
                      <div className="relative">
                        <ResponsiveContainer width="100%" height={190}>
                          <PieChart>
                            <Pie
                              data={agingPie}
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
                              {agingPie.map((d) => (
                                <Cell key={d.key} fill={AGEING_COLORS[d.key] || '#94a3b8'} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v, n) => [v, n]} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-gray-900">{agingTotal}</p>
                            <p className="text-[10px] text-gray-400">Total</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1.5 mt-2">
                        {agingPie.map((d) => (
                          <div key={d.key} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: AGEING_COLORS[d.key] }} />
                              <span className="text-gray-600">{d.name}</span>
                            </div>
                            <span className="font-semibold text-gray-900">{d.value}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data</div>}
                </div>
              )
            })()}

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
            </div>{/* end left column */}

            {/* Right column: Recent observations */}
            <div className="card flex flex-col">
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
