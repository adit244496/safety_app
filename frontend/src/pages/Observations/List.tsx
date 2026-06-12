import { useState, useMemo } from 'react'
import { usePageTitle } from '../../store/pageTitleContext'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronRight, ChevronDown, SlidersHorizontal, X, MessageSquare, PencilLine, Trash2 } from 'lucide-react'
import api from '../../lib/api'
import { fmtDate, getStatusClass, getRiskClass, STATUSES } from '../../lib/utils'
import { MultiSelectFilter, type MSOption } from '../../components/MultiSelectFilter'
import { useAuth } from '../../store/authStore'

const STABLE = { staleTime: 5 * 60 * 1000 } as const

const STATUS_OPTIONS:   MSOption[] = STATUSES.map(s => ({ value: s, label: s }))
const RISK_OPTIONS:     MSOption[] = ['High', 'Medium', 'Low'].map(r => ({ value: r, label: r }))

const AGING_OPTIONS: MSOption[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'due_soon', label: 'Due within 7 days' },
  { value: 'on_time', label: 'On time / Closed on time' },
]

function calcAgingDays(obs: any): number | null {
  if (!obs.target_date_actual) return null
  const target = new Date(obs.target_date_actual)
  const end = obs.closed_at ? new Date(obs.closed_at) : new Date()
  return Math.floor((end.getTime() - target.getTime()) / 86_400_000)
}

function fmtAging(days: number | null): string {
  if (days === null) return '—'
  if (days < 0) return `${Math.abs(days)}d early`
  if (days === 0) return 'On time'
  return `+${days}d overdue`
}

function agingClass(days: number | null): string {
  if (days === null) return 'text-gray-300 text-xs'
  if (days < 0) return 'text-emerald-600 text-xs font-medium'
  if (days === 0) return 'text-blue-600 text-xs font-medium'
  return 'text-red-600 text-xs font-medium'
}

export default function ObservationsList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()
  const isContractor = user?.role === 'Contractor'
  const canCreate = ['SuperAdmin', 'Admin', 'PSO', 'Observer'].includes(user?.role || '')
  const [showFilters, setShowFilters] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState<number | null>(null)

  const discardDraft = useMutation({
    mutationFn: (id: number) => api.delete(`/observations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['observations'] })
      setConfirmDiscard(null)
    },
  })

  const [statuses,       setStatuses]       = useState<string[]>([])
  const [projectIds,     setProjectIds]     = useState<number[]>([])
  const [selectedContractors, setSelectedContractors] = useState<string[]>(
    () => isContractor && user?.name ? [user.name] : []
  )
  const [riskLevels,     setRiskLevels]     = useState<string[]>([])
  const [coreConcernIds,    setCoreConcernIds]    = useState<number[]>([])
  const [specificConcernIds, setSpecificConcernIds] = useState<number[]>([])
  const [agingFilter,        setAgingFilter]        = useState<string[]>([])
  const [dateFrom,           setDateFrom]           = useState('')
  const [dateTo,             setDateTo]             = useState('')
  const [page,               setPage]               = useState(1)

  const activeCount =
    (statuses.length          > 0 ? 1 : 0) +
    (projectIds.length        > 0 ? 1 : 0) +
    (!isContractor && selectedContractors.length > 0 ? 1 : 0) +
    (riskLevels.length        > 0 ? 1 : 0) +
    (coreConcernIds.length    > 0 ? 1 : 0) +
    (specificConcernIds.length > 0 ? 1 : 0) +
    (agingFilter.length       > 0 ? 1 : 0) +
    (dateFrom                 ? 1 : 0) +
    (dateTo                   ? 1 : 0)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['observations', statuses, projectIds, selectedContractors, riskLevels, coreConcernIds, specificConcernIds, dateFrom, dateTo, page],
    queryFn: () => api.get('/observations/', {
      params: {
        status:               statuses.length              ? statuses              : undefined,
        project_id:           projectIds.length            ? projectIds            : undefined,
        contractor_user_id:   expandedContractorIds.length ? expandedContractorIds : undefined,
        risk_level:           riskLevels.length        ? riskLevels        : undefined,
        core_concern_id:      coreConcernIds.length    ? coreConcernIds    : undefined,
        specific_concern_id:  specificConcernIds.length ? specificConcernIds : undefined,
        date_from:            dateFrom                 || undefined,
        date_to:              dateTo                   || undefined,
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
  const { data: contractors = [] as any[] } = useQuery({
    queryKey: ['contractors'],
    queryFn: () => api.get('/users/contractors').then(r => r.data),
    ...STABLE,
  })
  const { data: concerns } = useQuery({
    queryKey: ['core-concerns'],
    queryFn: () => api.get('/admin/core-concerns').then(r => r.data),
    ...STABLE,
  })
  const { data: allSpecificConcerns } = useQuery({
    queryKey: ['all-specific-concerns'],
    queryFn: () => api.get('/admin/specific-concerns').then(r => r.data),
    ...STABLE,
  })
  // Cascading: contractor options narrowed by selected projects
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

  // Cascading: project options narrowed by selected contractors
  const contractorProjectIds = useMemo(() => {
    if (selectedContractors.length === 0) return null
    const ids = new Set<number>()
    contractors.filter((c: any) => selectedContractors.includes(c.name))
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
  const projectOptions: MSOption[] = useMemo(() =>
    (projects || [])
      .filter((p: any) => !contractorProjectIds || contractorProjectIds.has(p.id))
      .map((p: any) => ({ value: p.id, label: p.name })),
    [projects, contractorProjectIds]
  )
  const coreConcernOptions: MSOption[] = (concerns  || []).map((c: any) => ({ value: c.id, label: c.name }))
  const filteredSpecificConcerns = useMemo(() => {
    const all: any[] = allSpecificConcerns || []
    if (coreConcernIds.length === 0) return all
    return all.filter((s: any) => coreConcernIds.includes(s.core_concern_id))
  }, [allSpecificConcerns, coreConcernIds])
  const specificConcernOptions: MSOption[] = filteredSpecificConcerns.map((s: any) => ({ value: s.id, label: s.name }))

  const obs        = data?.observations || []
  const total      = data?.total ?? 0
  const totalPages = data?.pages || 1
  usePageTitle('Observations', `${total} total observation${total !== 1 ? 's' : ''}`)

  const clearFilters = () => {
    setStatuses([]); setProjectIds([])
    if (!isContractor) setSelectedContractors([])
    setRiskLevels([]); setCoreConcernIds([]); setSpecificConcernIds([]); setAgingFilter([]); setDateFrom(''); setDateTo(''); setPage(1)
  }
  const resetPage = () => setPage(1)

  const visibleObs = useMemo(() => {
    if (agingFilter.length === 0) return obs
    return obs.filter((o: any) => {
      const days = calcAgingDays(o)
      return agingFilter.some(f => {
        if (f === 'overdue') return days !== null && days > 0
        if (f === 'due_soon') return days !== null && days <= 0 && days >= -7
        if (f === 'on_time') return days !== null && days <= 0
        return true
      })
    })
  }, [obs, agingFilter])

  return (
    <div className="space-y-5">
      {/* Header — hidden on desktop (shown in top bar instead) */}
      <div className="flex items-start justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="page-title">Observations</h1>
          <p className="text-sm text-gray-400 mt-1">{total} total observation{total !== 1 ? 's' : ''}</p>
        </div>
        {canCreate && (
          <button onClick={() => navigate('/observations/new')} className="btn-primary flex-shrink-0">
            <Plus className="w-4 h-4" /> New Observation
          </button>
        )}
      </div>

      {/* Filters bar */}
      <div className="card-sm">
        {/* Header: always visible */}
        <div
          className="flex items-center gap-2 sm:pointer-events-none cursor-pointer sm:cursor-default"
          onClick={() => setShowFilters(v => !v)}
        >
          <SlidersHorizontal className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Filters</span>
          {activeCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{activeCount}</span>
          )}
          <ChevronDown className={`ml-auto w-4 h-4 text-gray-400 sm:hidden transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
        </div>

        {/* Filter controls */}
        <div className={`gap-2 mt-3 sm:mt-2 sm:flex sm:flex-wrap sm:items-center ${showFilters ? 'grid grid-cols-2' : 'hidden'}`}>
          <div className="hidden sm:block w-px h-4 bg-gray-200 flex-shrink-0" />

          <MultiSelectFilter size="sm" options={STATUS_OPTIONS} value={statuses}
            onChange={v => { setStatuses(v as string[]); resetPage() }}
            placeholder="Status" className="w-full sm:w-auto sm:min-w-[110px]" />

          <MultiSelectFilter size="sm" options={projectOptions} value={projectIds}
            onChange={v => {
              const ids = v as number[]
              setProjectIds(ids); resetPage()
              if (ids.length > 0) {
                const valid = new Set(contractors.filter((c: any) => (c.projects || []).some((p: any) => ids.includes(p.id))).map((c: any) => c.name))
                setSelectedContractors(prev => prev.filter(n => valid.has(n)))
              }
            }}
            placeholder="Project" className="w-full sm:w-auto sm:min-w-[120px]" />

          {isContractor ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1.5 rounded-lg cursor-default col-span-1">
              <span className="text-gray-400">Contractor:</span> {user?.name}
            </span>
          ) : (
            <MultiSelectFilter size="sm" options={contractorOptions} value={selectedContractors}
              onChange={v => {
                const names = v as string[]
                setSelectedContractors(names); resetPage()
                if (names.length > 0) {
                  const valid = new Set<number>()
                  contractors.filter((c: any) => names.includes(c.name)).forEach((c: any) => (c.projects || []).forEach((p: any) => valid.add(p.id)))
                  setProjectIds(prev => prev.filter(id => valid.has(id)))
                }
              }}
              placeholder="Contractor" className="w-full sm:w-auto sm:min-w-[120px]" />
          )}

          <MultiSelectFilter size="sm" options={RISK_OPTIONS} value={riskLevels}
            onChange={v => { setRiskLevels(v as string[]); resetPage() }}
            placeholder="Risk Level" className="w-full sm:w-auto sm:min-w-[110px]" />

          <MultiSelectFilter size="sm" options={coreConcernOptions} value={coreConcernIds}
            onChange={v => { setCoreConcernIds(v as number[]); setSpecificConcernIds([]); resetPage() }}
            placeholder="Core Concern" className="w-full sm:w-auto sm:min-w-[130px]" />

          <MultiSelectFilter size="sm" options={specificConcernOptions} value={specificConcernIds}
            onChange={v => { setSpecificConcernIds(v as number[]); resetPage() }}
            placeholder="Specific Concern" className="w-full sm:w-auto sm:min-w-[150px]" />

          <div className="col-span-2 sm:col-auto flex items-center gap-1.5">
            <input
              type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); resetPage() }}
              className="flex-1 sm:flex-none sm:w-[130px] text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
              title="Date from"
            />
            <span className="text-gray-300 text-xs flex-shrink-0">–</span>
            <input
              type="date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); resetPage() }}
              className="flex-1 sm:flex-none sm:w-[130px] text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
              title="Date to"
            />
          </div>

          {activeCount > 0 && (
            <button
              onClick={clearFilters}
              className="col-span-2 sm:col-auto flex items-center justify-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors border border-red-100 sm:border-0"
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
          <MultiSelectFilter size="sm" options={AGING_OPTIONS} value={agingFilter}
            onChange={v => { setAgingFilter(v as string[]); resetPage() }}
            placeholder="Aging" className="w-full sm:w-auto sm:min-w-[140px]" />

        </div>
      </div>

      {/* Specific Concern quick-filter + New Observation button */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <MultiSelectFilter
            size="sm"
            options={specificConcernOptions}
            value={specificConcernIds}
            onChange={v => { setSpecificConcernIds(v as number[]); resetPage() }}
            placeholder="Filter by Specific Concern…"
            className="w-full"
          />
        </div>
        {canCreate && (
          <button onClick={() => navigate('/observations/new')} className="btn-primary flex-shrink-0">
            <Plus className="w-4 h-4" /> New Observation
          </button>
        )}
      </div>

      {/* Observations output */}
      <div className="card !p-0 overflow-hidden">
        {isFetching && !isLoading && (
          <div className="h-0.5 bg-indigo-100 overflow-hidden">
            <div className="h-full bg-indigo-500 animate-pulse w-1/2" />
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="py-16 flex justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && visibleObs.length === 0 && (
          <div className="py-16 text-center space-y-2">
            <p className="text-gray-400">No observations found</p>
            {activeCount > 0 && (
              <button onClick={clearFilters} className="text-xs text-indigo-600 hover:underline">Clear filters</button>
            )}
          </div>
        )}

        {/* Mobile card list — shown only on small screens */}
        {!isLoading && visibleObs.length > 0 && (
          <div className="sm:hidden divide-y divide-slate-100">
            {visibleObs.map((o: any) => (
              <div
                key={o.id}
                className={`p-4 cursor-pointer active:bg-indigo-50/50 transition-colors ${o.status === 'Draft' ? 'bg-red-50 border-l-4 border-red-400' : ''}`}
                onClick={() => navigate(`/observations/${o.observation_id}`)}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">{o.observation_id}</span>
                    {o.status === 'Draft' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 bg-amber-100 border border-dashed border-amber-300 px-1.5 py-0.5 rounded">
                        <PencilLine className="w-2.5 h-2.5" /> Draft
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {o.risk_level && <span className={getRiskClass(o.risk_level)}>{o.risk_level}</span>}
                    <span className={getStatusClass(o.status)}>{o.status}</span>
                  </div>
                </div>
                <p className="text-sm font-medium text-gray-800 leading-snug">{o.core_concern_name || '—'}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <div className="text-xs text-gray-400 space-y-0.5">
                    <p>{o.project_name || '—'} · {fmtDate(o.obs_date || o.created_at)}</p>
                    <p className="text-gray-400">{o.observer_name || o.created_by_name || '—'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {(user?.role === 'SuperAdmin' || o.status === 'Draft') && (
                      confirmDiscard === o.id ? (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <span className="text-[10px] text-red-600 font-medium">Delete?</span>
                          <button
                            onClick={e => { e.stopPropagation(); discardDraft.mutate(o.id) }}
                            className="text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 px-1.5 py-0.5 rounded"
                          >Yes</button>
                          <button
                            onClick={e => { e.stopPropagation(); setConfirmDiscard(null) }}
                            className="text-[10px] font-semibold text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100"
                          >No</button>
                        </div>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmDiscard(o.id) }}
                          className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/observations/${o.observation_id}#conversation`) }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Desktop table — hidden on small screens */}
        {!isLoading && visibleObs.length > 0 && (
          <div className="hidden sm:block overflow-x-auto overflow-y-auto max-h-[65vh]">
            <table className="w-full min-w-[860px]">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-gray-100">
                  <th className="th">Obs. ID</th>
                  <th className="th">Project</th>
                  <th className="th">Core Concern</th>
                  <th className="th">Observer</th>
                  <th className="th">Date</th>
                  <th className="th">Risk</th>
                  <th className="th">Status</th>
                  <th className="th">Aging</th>
                  <th className="th w-20"></th>
                </tr>
              </thead>
              <tbody>
                {visibleObs.map((o: any) => (
                  <tr
                    key={o.id}
                    className={`tr cursor-pointer ${o.status === 'Draft' ? 'bg-red-50 hover:bg-red-100 shadow-[inset_3px_0_0_#ef4444]' : ''}`}
                    onClick={() => navigate(`/observations/${o.observation_id}`)}
                  >
                    <td className="td">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-mono text-xs font-bold px-2 py-1 rounded-md ${o.status === 'Draft' ? 'text-red-700 bg-red-100' : 'text-indigo-700 bg-indigo-50'}`}>
                          {o.observation_id}
                        </span>
                        {o.status === 'Draft' && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-700 bg-red-100 border border-dashed border-red-400 px-1.5 py-0.5 rounded">
                            <PencilLine className="w-2.5 h-2.5" /> Draft
                          </span>
                        )}
                      </div>
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
                    <td className="td whitespace-nowrap">
                      <span className={agingClass(calcAgingDays(o))}>{fmtAging(calcAgingDays(o))}</span>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-1.5 justify-end">
                        {(user?.role === 'SuperAdmin' || o.status === 'Draft') && (
                          confirmDiscard === o.id ? (
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <span className="text-[10px] text-red-600 font-medium">Delete?</span>
                              <button
                                onClick={e => { e.stopPropagation(); discardDraft.mutate(o.id) }}
                                className="text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 px-1.5 py-0.5 rounded transition-colors"
                              >Yes</button>
                              <button
                                onClick={e => { e.stopPropagation(); setConfirmDiscard(null) }}
                                className="text-[10px] font-semibold text-gray-600 hover:text-gray-800 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors"
                              >No</button>
                            </div>
                          ) : (
                            <button
                              title="Delete observation"
                              onClick={e => { e.stopPropagation(); setConfirmDiscard(o.id) }}
                              className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )
                        )}
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
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-t border-gray-100 bg-gray-50/50">
            <span className="text-xs text-gray-500">
              Page <span className="font-medium text-gray-700">{page}</span> of {totalPages}
              <span className="ml-2 text-gray-400">({total})</span>
            </span>
            <div className="flex gap-1.5">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-secondary btn-sm">← Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-secondary btn-sm">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
