import { useState, useMemo, useEffect } from 'react'
import { usePageTitle } from '../../store/pageTitleContext'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { Plus, ChevronRight, ChevronDown, SlidersHorizontal, X, MessageSquare, PencilLine, Trash2 } from 'lucide-react'
import api from '../../lib/api'
import { fmtDate, getStatusClass, getRiskClass, STATUSES } from '../../lib/utils'
import { MultiSelectFilter, type MSOption } from '../../components/MultiSelectFilter'
import { useFacets } from '../../lib/facets'
import { useAuth } from '../../store/authStore'

const STABLE = { staleTime: 5 * 60 * 1000 } as const

const RISK_OPTIONS:     MSOption[] = ['High', 'Medium', 'Low'].map(r => ({ value: r, label: r }))

const AGEING_OPTIONS: MSOption[] = [
  { value: 'overdue_30_plus', label: 'Overdue 30+ days' },
  { value: 'overdue_8_30', label: 'Overdue 8–30 days' },
  { value: 'overdue_1_7', label: 'Overdue 1–7 days' },
  { value: 'on_time', label: 'On time' },
  { value: 'no_target', label: 'No target date' },
]

function calcAgeingDays(obs: any): number | null {
  if (!obs.target_date_actual) return null
  const target = new Date(obs.target_date_actual)
  const end = obs.closed_at ? new Date(obs.closed_at) : new Date()
  return Math.floor((end.getTime() - target.getTime()) / 86_400_000)
}

function fmtAgeing(days: number | null): string {
  if (days === null) return '—'
  if (days < 0) return `${Math.abs(days)}d early`
  if (days === 0) return 'On time'
  return `+${days}d overdue`
}

function ageingClass(days: number | null): string {
  if (days === null) return 'text-gray-300 text-xs'
  if (days < 0) return 'text-emerald-600 text-xs font-medium'
  if (days === 0) return 'text-blue-600 text-xs font-medium'
  return 'text-red-600 text-xs font-medium'
}

export default function ObservationsList() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const isContractor = user?.role === 'Contractor'
  const canCreate = user?.role !== 'Contractor'
  const [confirmDiscard, setConfirmDiscard] = useState<number | null>(null)

  // All filters read from URL search params
  const statuses            = searchParams.getAll('status')
  const projectIds          = searchParams.getAll('project_id').map(Number)
  const selectedContractors = searchParams.getAll('contractor')
  const riskLevels          = searchParams.getAll('risk')
  const coreConcernIds      = searchParams.getAll('core_concern').map(Number)
  const specificConcernIds  = searchParams.getAll('specific_concern').map(Number)
  const buildingIds         = searchParams.getAll('building_id').map(Number)
  const floorIds            = searchParams.getAll('floor_id').map(Number)
  const eicIds              = searchParams.getAll('eic').map(Number)
  const outcomeFilter       = searchParams.getAll('outcome')
  const violationIds        = searchParams.getAll('violation').map(Number)
  const rcCatIds            = searchParams.getAll('root_cause').map(Number)
  const rcSpecIds           = searchParams.getAll('root_cause_specific').map(Number)
  const ageingFilter        = searchParams.getAll('ageing')
  const dateFrom            = searchParams.get('date_from') || ''
  const dateTo              = searchParams.get('date_to') || ''
  const page                = parseInt(searchParams.get('page') || '1', 10)

  // Auto-open filters panel if there are active filter params (e.g. when navigating back)
  const hasActiveFilters = searchParams.has('status') || searchParams.has('project_id') ||
    searchParams.has('contractor') || searchParams.has('risk') || searchParams.has('core_concern') ||
    searchParams.has('specific_concern') || searchParams.has('building_id') || searchParams.has('floor_id') ||
    searchParams.has('eic') || searchParams.has('outcome') || searchParams.has('violation') ||
    searchParams.has('root_cause') || searchParams.has('root_cause_specific') || searchParams.has('ageing') ||
    searchParams.has('date_from') || searchParams.has('date_to')
  const [showFilters, setShowFilters] = useState(hasActiveFilters)

  // Set contractor's own name as default filter on first load
  useEffect(() => {
    if (isContractor && user?.name && !searchParams.has('contractor')) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.append('contractor', user.name!)
        return next
      }, { replace: true })
    }
  }, [isContractor, user?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  const discardDraft = useMutation({
    mutationFn: (id: number) => api.delete(`/observations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['observations'] })
      setConfirmDiscard(null)
    },
  })

  // Update one or more filter params at once, resetting page to 1
  const updateFilter = (updates: Record<string, string[]>, resetPage = true) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (resetPage) next.set('page', '1')
      for (const [key, values] of Object.entries(updates)) {
        next.delete(key)
        values.forEach(v => next.append(key, v))
      }
      return next
    }, { replace: true })
  }

  const setPage = (p: number) => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    next.set('page', String(p))
    return next
  }, { replace: true })

  const activeCount =
    (statuses.length > 0 ? 1 : 0) +
    (projectIds.length > 0 ? 1 : 0) +
    (!isContractor && selectedContractors.length > 0 ? 1 : 0) +
    (riskLevels.length > 0 ? 1 : 0) +
    (coreConcernIds.length > 0 ? 1 : 0) +
    (specificConcernIds.length > 0 ? 1 : 0) +
    (buildingIds.length > 0 ? 1 : 0) +
    (floorIds.length > 0 ? 1 : 0) +
    (eicIds.length > 0 ? 1 : 0) +
    (outcomeFilter.length > 0 ? 1 : 0) +
    (violationIds.length > 0 ? 1 : 0) +
    (rcCatIds.length > 0 ? 1 : 0) +
    (rcSpecIds.length > 0 ? 1 : 0) +
    (ageingFilter.length > 0 ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['observations', statuses, projectIds, selectedContractors, riskLevels, coreConcernIds, specificConcernIds, buildingIds, floorIds, eicIds, outcomeFilter, violationIds, rcCatIds, rcSpecIds, ageingFilter, dateFrom, dateTo, page],
    queryFn: () => api.get('/observations/', {
      params: {
        status:               statuses.length              ? statuses              : undefined,
        project_id:           projectIds.length            ? projectIds            : undefined,
        contractor_user_id:   expandedContractorIds.length ? expandedContractorIds : undefined,
        risk_level:           riskLevels.length        ? riskLevels        : undefined,
        core_concern_id:      coreConcernIds.length    ? coreConcernIds    : undefined,
        specific_concern_id:  specificConcernIds.length ? specificConcernIds : undefined,
        building_id:          buildingIds.length       ? buildingIds       : undefined,
        floor_id:             floorIds.length          ? floorIds          : undefined,
        eic_user_id:          eicIds.length            ? eicIds            : undefined,
        possible_outcome:     outcomeFilter.length     ? outcomeFilter     : undefined,
        violation_id:         violationIds.length      ? violationIds      : undefined,
        root_cause_category_id: rcCatIds.length        ? rcCatIds          : undefined,
        root_cause_specific_id: rcSpecIds.length       ? rcSpecIds         : undefined,
        aging:                ageingFilter.length      ? ageingFilter      : undefined,
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
  // Status filter options = only statuses that actually exist in the data
  const { data: statusOptionsData } = useQuery({
    queryKey: ['status-options'],
    queryFn: () => api.get('/observations/status-options').then(r => r.data),
    staleTime: 60_000,
  })
  const statusOptions: MSOption[] = ((statusOptionsData as string[]) || STATUSES).map(s => ({ value: s, label: s }))
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
  // Reference data for the extended filters (fetched once; cascading done client-side)
  const { data: allBuildings } = useQuery({ queryKey: ['all-buildings'], queryFn: () => api.get('/admin/buildings').then(r => r.data), ...STABLE })
  const { data: allFloors } = useQuery({ queryKey: ['all-floors'], queryFn: () => api.get('/admin/floors').then(r => r.data), ...STABLE })
  const { data: eicUsers } = useQuery({ queryKey: ['eic-users', projectIds], queryFn: () => api.get('/users/eic', { params: { project_id: projectIds.length ? projectIds : undefined } }).then(r => r.data), ...STABLE })
  const { data: possibleOutcomes } = useQuery({ queryKey: ['possible-outcomes'], queryFn: () => api.get('/admin/possible-outcomes').then(r => r.data), ...STABLE })
  const { data: violations } = useQuery({ queryKey: ['violations'], queryFn: () => api.get('/admin/violations').then(r => r.data), ...STABLE })
  const { data: rcCategories } = useQuery({ queryKey: ['rc-categories'], queryFn: () => api.get('/admin/root-cause-categories').then(r => r.data), ...STABLE })
  const { data: allRcSpecifics } = useQuery({ queryKey: ['all-rc-specifics'], queryFn: () => api.get('/admin/root-cause-specifics').then(r => r.data), ...STABLE })

  const buildingOptions: MSOption[] = useMemo(() =>
    (allBuildings || []).filter((b: any) => !projectIds.length || projectIds.includes(b.project_id)).map((b: any) => ({ value: b.id, label: b.name })),
    [allBuildings, projectIds])
  const eicOptions: MSOption[] = useMemo(() => (eicUsers || []).map((u: any) => ({ value: u.id, label: u.name })), [eicUsers])
  const outcomeOptions: MSOption[] = useMemo(() => (possibleOutcomes || []).map((o: any) => ({ value: o.name, label: o.name })), [possibleOutcomes])
  const violationOptions: MSOption[] = useMemo(() => (violations || []).map((v: any) => ({ value: v.id, label: v.name })), [violations])
  const rcCategoryOptions: MSOption[] = useMemo(() => (rcCategories || []).map((c: any) => ({ value: c.id, label: c.name })), [rcCategories])

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
  const coreConcernOptions: MSOption[] = (concerns || []).map((c: any) => ({ value: c.id, label: c.name }))
  const filteredSpecificConcerns = useMemo(() => {
    const all: any[] = allSpecificConcerns || []
    if (coreConcernIds.length === 0) return all
    return all.filter((s: any) => coreConcernIds.includes(s.core_concern_id))
  }, [allSpecificConcerns, coreConcernIds])
  const specificConcernOptions: MSOption[] = filteredSpecificConcerns.map((s: any) => ({ value: s.id, label: s.name }))

  // Cascading filters: every dropdown lists only values present in observations
  // matching the other selected filters.
  const facet = useFacets('/observations/facets', {
    status: statuses, project_id: projectIds, contractor_user_id: expandedContractorIds,
    risk_level: riskLevels, core_concern_id: coreConcernIds, specific_concern_id: specificConcernIds,
    building_id: buildingIds, floor_id: floorIds, eic_user_id: eicIds, possible_outcome: outcomeFilter,
    violation_id: violationIds, root_cause_category_id: rcCatIds, root_cause_specific_id: rcSpecIds,
    aging: ageingFilter, date_from: dateFrom || undefined, date_to: dateTo || undefined,
  })
  // Floors no longer need a building first; label them with their building when ambiguous.
  const buildingName = useMemo(() => new Map((allBuildings || []).map((b: any) => [b.id, b.name])), [allBuildings])
  const allFloorOptions: MSOption[] = useMemo(() =>
    (allFloors || [])
      .filter((f: any) => buildingIds.length ? buildingIds.includes(f.building_id) : buildingName.has(f.building_id))
      .filter((f: any) => !projectIds.length || (allBuildings || []).some((b: any) => b.id === f.building_id && projectIds.includes(b.project_id)))
      .map((f: any) => ({ value: f.id, label: buildingIds.length === 1 ? f.name : `${f.name} · ${buildingName.get(f.building_id) ?? ''}` })),
    [allFloors, allBuildings, buildingIds, projectIds, buildingName])
  const allRcSpecificOptions: MSOption[] = useMemo(() =>
    (allRcSpecifics || []).filter((s: any) => !rcCatIds.length || rcCatIds.includes(s.root_cause_category_id)).map((s: any) => ({ value: s.id, label: s.name })),
    [allRcSpecifics, rcCatIds])
  const fStatus      = facet.narrow('status', statusOptions)
  const fProject     = facet.narrow('project_id', projectOptions)
  const fBuilding    = facet.narrow('building_id', buildingOptions)
  const fFloor       = facet.narrow('floor_id', allFloorOptions)
  const fContractor  = facet.narrow('contractor_user_id', contractorOptions, o => companyToUserIds.get(String(o.value)) || [])
  const fEic         = facet.narrow('eic_user_id', eicOptions)
  const fRisk        = facet.narrow('risk_level', RISK_OPTIONS)
  const fCore        = facet.narrow('core_concern_id', coreConcernOptions)
  const fSpecific    = facet.narrow('specific_concern_id', specificConcernOptions)
  const fOutcome     = facet.narrow('possible_outcome', outcomeOptions)
  const fViolation   = facet.narrow('violation_id', violationOptions)
  const fRcCategory  = facet.narrow('root_cause_category_id', rcCategoryOptions)
  const fRcSpecific  = facet.narrow('root_cause_specific_id', allRcSpecificOptions)

  const obs        = data?.observations || []
  const total      = data?.total ?? 0
  const totalPages = data?.pages || 1
  usePageTitle('Observations', `${total} total observation${total !== 1 ? 's' : ''}`)

  const clearFilters = () => {
    setSearchParams(() => {
      const next = new URLSearchParams()
      next.set('page', '1')
      if (isContractor && user?.name) next.append('contractor', user.name)
      return next
    }, { replace: true })
  }

  // Aging is filtered server-side (accurate across pagination); render rows as returned.
  const visibleObs = obs

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
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => setShowFilters(v => !v)}
        >
          <SlidersHorizontal className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Filters</span>
          {activeCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{activeCount}</span>
          )}
          <ChevronDown className={`ml-auto w-4 h-4 text-gray-400 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
        </div>

        {/* Filter controls */}
        <div className={showFilters ? 'flex flex-wrap items-center gap-2 mt-3' : 'hidden'}>
          <div className="hidden sm:block w-px h-4 bg-gray-200 flex-shrink-0" />

          <MultiSelectFilter size="sm" options={fStatus} value={statuses} prune={facet.ready}
            onChange={v => updateFilter({ status: v as string[] })}
            placeholder="Status" className="w-full sm:w-auto sm:min-w-[110px]" />

          <MultiSelectFilter size="sm" options={fProject} value={projectIds} prune={facet.ready}
            onChange={v => {
              const ids = v as number[]
              const updates: Record<string, string[]> = { project_id: ids.map(String), building_id: [], floor_id: [], eic: [] }
              if (ids.length > 0) {
                const validNames = new Set(contractors.filter((c: any) => (c.projects || []).some((p: any) => ids.includes(p.id))).map((c: any) => c.name))
                updates.contractor = selectedContractors.filter(n => validNames.has(n))
              }
              updateFilter(updates)
            }}
            placeholder="Project" className="w-full sm:w-auto sm:min-w-[120px]" />

          <MultiSelectFilter size="sm" options={fBuilding} value={buildingIds} prune={facet.ready}
            onChange={v => updateFilter({ building_id: (v as number[]).map(String), floor_id: [] })}
            placeholder="Building" className="w-full sm:w-auto sm:min-w-[120px]" />

          <MultiSelectFilter size="sm" options={fFloor} value={floorIds} prune={facet.ready}
            onChange={v => updateFilter({ floor_id: (v as number[]).map(String) })}
            placeholder="Floor" className="w-full sm:w-auto sm:min-w-[120px]" />

          {isContractor ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1.5 rounded-lg cursor-default col-span-1">
              <span className="text-gray-400">Contractor:</span> {user?.name}
            </span>
          ) : (
            <MultiSelectFilter size="sm" options={fContractor} value={selectedContractors} prune={facet.ready}
              onChange={v => {
                const names = v as string[]
                const updates: Record<string, string[]> = { contractor: names }
                if (names.length > 0) {
                  const valid = new Set<number>()
                  contractors.filter((c: any) => names.includes(c.name)).forEach((c: any) => (c.projects || []).forEach((p: any) => valid.add(p.id)))
                  updates.project_id = projectIds.filter(id => valid.has(id)).map(String)
                }
                updateFilter(updates)
              }}
              placeholder="Contractor" className="w-full sm:w-auto sm:min-w-[120px]" />
          )}

          <MultiSelectFilter size="sm" options={fEic} value={eicIds} prune={facet.ready}
            onChange={v => updateFilter({ eic: (v as number[]).map(String) })}
            placeholder="Concerned EIC" className="w-full sm:w-auto sm:min-w-[130px]" />

          <MultiSelectFilter size="sm" options={fRisk} value={riskLevels} prune={facet.ready}
            onChange={v => updateFilter({ risk: v as string[] })}
            placeholder="Risk Level" className="w-full sm:w-auto sm:min-w-[110px]" />

          <MultiSelectFilter size="sm" options={fCore} value={coreConcernIds} prune={facet.ready}
            onChange={v => updateFilter({ core_concern: (v as number[]).map(String), specific_concern: [] })}
            placeholder="Core Concern" className="w-full sm:w-auto sm:min-w-[130px]" />

          <MultiSelectFilter size="sm" options={fSpecific} value={specificConcernIds} prune={facet.ready}
            onChange={v => updateFilter({ specific_concern: (v as number[]).map(String) })}
            placeholder="Specific Concern" className="w-full sm:w-auto sm:min-w-[150px]" />

          <MultiSelectFilter size="sm" options={fOutcome} value={outcomeFilter} prune={facet.ready}
            onChange={v => updateFilter({ outcome: v as string[] })}
            placeholder="Possible Outcome" className="w-full sm:w-auto sm:min-w-[150px]" />

          <MultiSelectFilter size="sm" options={fViolation} value={violationIds} prune={facet.ready}
            onChange={v => updateFilter({ violation: (v as number[]).map(String) })}
            placeholder="Violation" className="w-full sm:w-auto sm:min-w-[140px]" />

          <MultiSelectFilter size="sm" options={fRcCategory} value={rcCatIds} prune={facet.ready}
            onChange={v => updateFilter({ root_cause: (v as number[]).map(String), root_cause_specific: [] })}
            placeholder="Root Cause" className="w-full sm:w-auto sm:min-w-[130px]" />

          <MultiSelectFilter size="sm" options={fRcSpecific} value={rcSpecIds} prune={facet.ready}
            onChange={v => updateFilter({ root_cause_specific: (v as number[]).map(String) })}
            placeholder="Specific Root Cause" className="w-full sm:w-auto sm:min-w-[160px]" />

          <div className="col-span-2 sm:col-auto flex items-center gap-1.5">
            <input
              type="date" value={dateFrom}
              onChange={e => updateFilter({ date_from: e.target.value ? [e.target.value] : [] })}
              className="flex-1 sm:flex-none sm:w-[130px] text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
              title="Date from"
            />
            <span className="text-gray-300 text-xs flex-shrink-0">–</span>
            <input
              type="date" value={dateTo}
              onChange={e => updateFilter({ date_to: e.target.value ? [e.target.value] : [] })}
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
          <MultiSelectFilter size="sm" options={AGEING_OPTIONS} value={ageingFilter}
            onChange={v => updateFilter({ ageing: v as string[] })}
            placeholder="Ageing" className="w-full sm:w-auto sm:min-w-[140px]" />

        </div>
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
                onClick={() => navigate(`/observations/${o.observation_id}`, { state: { from: location.pathname + location.search } })}
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
                    {o.target_date_actual && <p>Target: {fmtDate(o.target_date_actual)}</p>}
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
          <div className="hidden sm:block overflow-x-auto overflow-y-auto max-h-[75vh]">
            <table className="w-full min-w-[960px]">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-gray-100">
                  <th className="th">Obs. ID</th>
                  <th className="th">Project</th>
                  <th className="th">Core Concern</th>
                  <th className="th">Observer</th>
                  <th className="th">Obs Date</th>
                  <th className="th">Target Date</th>
                  <th className="th">Risk</th>
                  <th className="th">Status</th>
                  <th className="th">Ageing</th>
                  <th className="th w-20"></th>
                </tr>
              </thead>
              <tbody>
                {visibleObs.map((o: any) => (
                  <tr
                    key={o.id}
                    className={`tr cursor-pointer ${o.status === 'Draft' ? 'bg-red-50 hover:bg-red-100 shadow-[inset_3px_0_0_#ef4444]' : ''}`}
                    onClick={() => navigate(`/observations/${o.observation_id}`, { state: { from: location.pathname + location.search } })}
                  >
                    <td className="td">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded-md ${o.status === 'Draft' ? 'text-red-700 bg-red-100' : 'text-indigo-700 bg-indigo-50'}`}>
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
                    <td className="td text-gray-500 text-xs whitespace-nowrap">{o.target_date_actual ? fmtDate(o.target_date_actual) : '—'}</td>
                    <td className="td">
                      {o.risk_level
                        ? <span className={getRiskClass(o.risk_level)}>{o.risk_level} · {o.risk_factor}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="td">
                      <span className={getStatusClass(o.status)}>{o.status}</span>
                    </td>
                    <td className="td whitespace-nowrap">
                      <span className={ageingClass(calcAgeingDays(o))}>{fmtAgeing(calcAgeingDays(o))}</span>
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
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="btn btn-secondary btn-sm">← Prev</button>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="btn btn-secondary btn-sm">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
