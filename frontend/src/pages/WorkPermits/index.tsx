import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileCheck2, Plus, Search, X, ChevronRight, Inbox } from 'lucide-react'
import { usePageTitle } from '../../store/pageTitleContext'
import { useAuth } from '../../store/authStore'
import api from '../../lib/api'
import { fmtDate } from '../../lib/utils'
import { MultiSelectFilter, type MSOption } from '../../components/MultiSelectFilter'
import { PERMIT_STATUS_META } from '../../lib/permitConfig'

const STATUS_OPTIONS: MSOption[] = [
  'Draft', 'Pending Approval', 'Approved', 'Declined', 'Closure Requested', 'Closed', 'Cancelled',
].map(s => ({ value: s, label: s }))

export function PermitStatusBadge({ status }: { status?: string | null }) {
  const m = PERMIT_STATUS_META[status || 'Draft'] || PERMIT_STATUS_META.Draft
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap" style={{ background: m.bg, color: m.color }}>
      {status || 'Draft'}
    </span>
  )
}

export default function WorkPermits() {
  usePageTitle('Work Permits', 'Construction Hazardous Work Permits')
  const navigate = useNavigate()
  const { user } = useAuth()
  const isContractor = user?.role === 'Contractor'
  const canCreate = ['Contractor', 'SuperAdmin'].includes(user?.role || '')
  const isApprover = ['PIC', 'PSO', 'EIC'].includes(user?.role || '')

  const [statusFilter, setStatusFilter] = useState<(string | number)[]>([])
  const [projectIds, setProjectIds] = useState<(string | number)[]>([])
  const [scope, setScope] = useState<'' | 'mine' | 'to_approve'>('')
  const [search, setSearch] = useState('')

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => api.get('/projects/').then(r => r.data), staleTime: 300_000 })
  const projectOptions: MSOption[] = useMemo(() => (projects || []).map((p: any) => ({ value: p.id, label: p.name })), [projects])

  const params = { status: statusFilter, project_id: projectIds, scope: scope || undefined, search: search || undefined }
  const { data: permits, isLoading } = useQuery({
    queryKey: ['work-permits', params],
    queryFn: () => api.get('/work-permits/', { params }).then(r => r.data),
  })
  const list: any[] = permits || []

  const hasFilters = statusFilter.length || projectIds.length || scope || search
  const clearFilters = () => { setStatusFilter([]); setProjectIds([]); setScope(''); setSearch('') }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><FileCheck2 className="w-5 h-5 text-indigo-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Work Permits</h1>
            <p className="text-xs text-gray-400">Submit, approve and close Construction Hazardous Work Permits</p>
          </div>
        </div>
        {canCreate && (
          <button onClick={() => navigate('/work-permits/new')} className="btn-primary btn-sm"><Plus className="w-3.5 h-3.5" /> New Permit</button>
        )}
      </div>

      {/* Scope tabs (approvers/contractors) */}
      {(isApprover || isContractor) && (
        <div className="inline-flex rounded-xl bg-gray-100 p-1">
          <button onClick={() => setScope('')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${scope === '' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>All</button>
          {isContractor && <button onClick={() => setScope('mine')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${scope === 'mine' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>My Permits</button>}
          {isApprover && <button onClick={() => setScope('to_approve')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${scope === 'to_approve' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>To Approve</button>}
        </div>
      )}

      {/* Filters */}
      <div className="card p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px]">
            <label className="label">Status</label>
            <MultiSelectFilter size="sm" options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" />
          </div>
          <div className="min-w-[160px]">
            <label className="label">Project</label>
            <MultiSelectFilter size="sm" options={projectOptions} value={projectIds} onChange={setProjectIds} placeholder="All projects" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="label">Search</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input className="input !py-1.5 text-sm pl-8" placeholder="Permit no, location, receiver…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          {hasFilters ? <button onClick={clearFilters} className="btn-ghost btn-sm text-gray-500"><X className="w-3.5 h-3.5" /> Clear</button> : null}
        </div>
      </div>

      {/* List */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400">Loading…</div>
        ) : list.length === 0 ? (
          <div className="p-10 text-center">
            <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">No permits found</p>
            <p className="text-sm text-gray-400 mt-0.5">{hasFilters ? 'Try adjusting the filters.' : isContractor ? 'Create your first work permit.' : 'Permits will appear here.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Permit No</th>
                  <th className="text-left px-4 py-3 font-semibold">Project</th>
                  <th className="text-left px-4 py-3 font-semibold">Work / Location</th>
                  <th className="text-left px-4 py-3 font-semibold">Approvers</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Created</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/60 cursor-pointer" onClick={() => navigate(`/work-permits/${p.id}`)}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-600 whitespace-nowrap">{p.permit_no}</td>
                    <td className="px-4 py-3 text-gray-600">{p.project_name || '—'}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-800 line-clamp-1">{p.work_description || p.work_location || '—'}</p>
                      {p.work_location && p.work_description && <p className="text-xs text-gray-400">{p.work_location}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {[p.pic_user?.name && `PIC: ${p.pic_user.name}`, p.pso_user?.name && `PSO: ${p.pso_user.name}`, p.eic_user?.name && `EIC: ${p.eic_user.name}`].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3"><PermitStatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(p.created_at)}</td>
                    <td className="px-4 py-3 text-gray-300"><ChevronRight className="w-4 h-4" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
