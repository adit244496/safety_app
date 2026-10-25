import { useMemo } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import api from './api'
import type { MSOption } from '../components/MultiSelectFilter'

/**
 * Cascading filters driven by the data: `endpoint` returns, per filter dimension,
 * the values that occur in records matching all the *other* active filters
 * (e.g. GET /observations/facets). Each dropdown then lists only those values.
 */
export function useFacets(endpoint: string, params: Record<string, unknown>, enabled = true) {
  const { data, isFetching } = useQuery({
    queryKey: ['facets', endpoint, params],
    queryFn: () => api.get(endpoint, { params }).then(r => r.data as Record<string, (string | number)[]>),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  })

  const sets = useMemo(() => {
    if (!data) return undefined
    const out: Record<string, Set<string>> = {}
    for (const [k, vals] of Object.entries(data)) out[k] = new Set((vals || []).map(String))
    return out
  }, [data])

  /** True once facets for the current filters have loaded — use as MultiSelectFilter's `prune`. */
  const ready = !!data && !isFetching

  /**
   * Keep only options whose value occurs in the data for `key`. `valuesOf` maps an
   * option to the underlying facet values when they differ (e.g. a contractor
   * company → its user ids). Until facets load, all options are shown.
   */
  const narrow = (key: string, options: MSOption[], valuesOf?: (o: MSOption) => (string | number)[]): MSOption[] => {
    const allowed = sets?.[key]
    if (!allowed) return options
    return options.filter(o => (valuesOf ? valuesOf(o) : [o.value]).some(v => allowed.has(String(v))))
  }

  return { narrow, ready }
}
