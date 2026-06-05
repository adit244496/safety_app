import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronRight, SlidersHorizontal, X, MessageSquare } from 'lucide-react'
import api from '../../lib/api'
import { fmtDate, getStatusClass, getRiskClass, STATUSES } from '../../lib/utils'
import { MultiSelectFilter, type MSOption } from '../../components/MultiSelectFilter'

const STABLE = { staleTime: 5 * 60 * 1000 } as const

const STATUS_OPTIONS:   MSOption[] = STATUSES.map(s => ({ value: s, label: s }))
const RISK_OPTIONS:     MSOption[] = ['High', 'Medium', 'Low'].map(r => ({ value: r, label: r }))

export default function ObservationsList() {
  const navigate = useNavigate()

  const [statuses,       setStatuses]       = useState<string[]>([])
  const [projectIds,     setProjectIds]     = useState<number[]>([])
  const [contractorIds,  setContractorIds]  = useState<number[]>([])
  const [riskLevels,     setRiskLevels]     = useState<string[]>([])
  const [coreConcernIds, setCoreConcernIds] = useState<number[]>([])
  const [dateFrom,       setDateFrom]       = useState('')
  const [dateTo,         setDateTo]         = useState('')
  const [page,           setPage]           = useState(1)

  const activeCount =
    (statuses.length       > 0 ? 1 : 0) +
    (projectIds.length     > 0 ? 1 : 0) +
    (contractorIds.length  > 0 ? 1 : 0) +
    (riskLevels.length     > 0 ? 1 : 0) +
    (coreConcernIds.length > 0 ? 1 : 0) +
    (dateFrom              ? 1 : 0) +
    (dateTo                ? 1 : 0)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['observations', statuses, projectIds, contractorIds, riskLevels, coreConcernIds, dateFrom, dateTo, page],
    queryFn: () => api.get('/observations/', {
      params: {
        status:              statuses.length       ? statuses       : undefined,
        project_id:          projectIds.length     ? projectIds     : undefined,
        contractor_user_id:  contractorIds.length  ? contractorIds  : undefined,
        risk_level:          riskLevels.length     ? riskLevels     : undefined,
        core_concern_id:     coreConcernIds.length ? coreConcernIds : undefined,
        date_from:           dateFrom              || undefined,
        date_to:             dateTo                || undefined,
        page,
        limit: 15,
      },
    }).then(r => r.data),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  })

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects/').then(r => r.data),
    ...STABLE,
  })
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users/').then(r => r.data),
    ...STABLE,
  })
  const { data: concerns } = useQuery({
    queryKey: ['core-concerns'],
    queryFn: () => api.get('/admin/core-concerns').then(r => r.data),
    ...STABLE,
  })

  const contractors: any[]    = (users || []).filter((u: any) => u.role === 'Contractor')
  const projectOptions:     MSOption[] = (projects    || []).map((p: any) => ({ value: p.id,   label: p.name }))
  const contractorOptions:  MSOption[] = contractors.map((c: any)          => ({ value: c.id,   label: c.name }))
  const coreConcernOptions: MSOption[] = (concerns    || []).map((c: any)  => ({ value: c.id,   label: c.name }))

  const obs        = data?.observations || []
  const total      = data?.total ?? 0
  const totalPages = data?.pages || 1

  const clearFilters = () => {
    setStatuses([]); setProjectIds([]); setContractorIds([])
    setRiskLevels([]); setCoreConcernIds([]); setDateFrom(''); setDateTo(''); setPage(1)
  }
  const resetPage = () => setPage(1)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Observations</h1>
          <p className="text-sm text-gray-400 mt-1">{total} total observation{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => navigate('/observations/new')} className="btn-primary flex-shrink-0">
          <Plus className="w-4 h-4" /> New Observation
        </button>
      </div>

      {/* Filters bar — all in one line */}
      <div className="card-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-gray-400 flex-shrink-0">
            <SlidersHorizontal className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Filters</span>
            {activeCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                {activeCount}
              </span>
            )}
          </div>
          <div className="w-px h-4 bg-gray-200 flex-shrink-0" />

          <MultiSelectFilter size="sm" options={STATUS_OPTIONS} value={statuses}
            onChange={v => { setStatuses(v as string[]); resetPage() }}
            placeholder="Status" className="min-w-[110px]" />

          <MultiSelectFilter size="sm" options={projectOptions} value={projectIds}
            onChange={v => { setProjectIds(v as number[]); resetPage() }}
            placeholder="Project" className="min-w-[120px]" />

          <MultiSelectFilter size="sm" options={contractorOptions} value={contractorIds}
            onChange={v => { setContractorIds(v as number[]); resetPage() }}
            placeholder="Contractor" className="min-w-[120px]" />

          <MultiSelectFilter size="sm" options={RISK_OPTIONS} value={riskLevels}
            onChange={v => { setRiskLevels(v as string[]); resetPage() }}
            placeholder="Risk Level" className="min-w-[110px]" />

          <MultiSelectFilter size="sm" options={coreConcernOptions} value={coreConcernIds}
            onChange={v => { setCoreConcernIds(v as number[]); resetPage() }}
            placeholder="Core Concern" className="min-w-[130px]" />

          <div className="flex items-center gap-1.5">
            <input
              type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); resetPage() }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 w-[130px]"
              title="Date from"
            />
            <span className="text-gray-300 text-xs">–</span>
            <input
              type="date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); resetPage() }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 w-[130px]"
              title="Date to"
            />
          </div>

          {activeCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        {isFetching && !isLoading && (
          <div className="h-0.5 bg-indigo-100 overflow-hidden">
            <div className="h-full bg-indigo-500 animate-pulse w-1/2" />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="th">Obs. ID</th>
                <th className="th">Project</th>
                <th className="th">Core Concern</th>
                <th className="th">Observer</th>
                <th className="th">Date</th>
                <th className="th">Risk</th>
                <th className="th">Status</th>
                <th className="th w-20"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="td text-center py-16">
                  <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto" />
                </td></tr>
              )}
              {!isLoading && obs.length === 0 && (
                <tr><td colSpan={8} className="td text-center py-16">
                  <div className="space-y-2">
                    <p className="text-gray-400">No observations found</p>
                    {activeCount > 0 && (
                      <button onClick={clearFilters} className="text-xs text-indigo-600 hover:underline">
                        Clear filters
                      </button>
                    )}
                  </div>
                </td></tr>
              )}
              {obs.map((o: any) => (
                <tr
                  key={o.id}
                  className="tr cursor-pointer"
                  onClick={() => navigate(`/observations/${o.observation_id}`)}
                >
                  <td className="td">
                    <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-md">
                      {o.observation_id}
                    </span>
                  </td>
                  <td className="td">
                    <span className="text-gray-700 text-xs font-medium">{o.project_name || '—'}</span>
                  </td>
                  <td className="td max-w-[180px]">
                    <span className="truncate block text-gray-700" title={o.core_concern_name}>
                      {o.core_concern_name || '—'}
                    </span>
                  </td>
                  <td className="td text-gray-500 text-xs">{o.observer_name || o.created_by_name || '—'}</td>
                  <td className="td text-gray-400 text-xs whitespace-nowrap">{fmtDate(o.obs_date || o.created_at)}</td>
                  <td className="td">
                    {o.risk_level
                      ? <span className={getRiskClass(o.risk_level)}>{o.risk_level} · {o.risk_factor}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="td">
                    <span className={getStatusClass(o.status)}>{o.status}</span>
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-1.5 justify-end">
                      {/* Chat quick-jump */}
                      <button
                        title="Open conversation"
                        onClick={e => { e.stopPropagation(); navigate(`/observations/${o.observation_id}#conversation`) }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 bg-gray-50/50">
            <span className="text-xs text-gray-500">
              Page <span className="font-medium text-gray-700">{page}</span> of {totalPages}
              <span className="ml-2 text-gray-400">({total} total)</span>
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-secondary btn-sm"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn btn-secondary btn-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
