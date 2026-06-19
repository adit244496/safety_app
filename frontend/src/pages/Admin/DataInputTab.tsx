import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Save, X, Link2, ChevronDown, Search, Check } from 'lucide-react'
import api from '../../lib/api'
import { useAuth } from '../../store/authStore'

function FilterDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setSearch('') }}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all whitespace-nowrap ${
          selected.length > 0
            ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
            {selected.length}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl shadow-lg border border-gray-100 w-52 py-2">
          <div className="px-2 pb-2">
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
              <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
              <input
                autoFocus
                className="text-xs bg-transparent outline-none w-full text-gray-700 placeholder:text-gray-400"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto thin-scroll">
            {filtered.length === 0 && (
              <p className="text-xs text-gray-400 px-3 py-2 italic">No results</p>
            )}
            {filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
              >
                <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                  selected.includes(o.value) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                }`}>
                  {selected.includes(o.value) && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
                {o.label}
              </button>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-gray-100 mt-1 pt-1 px-3">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type Section = 'projects' | 'buildings'

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'projects', label: 'Projects' },
  { key: 'buildings', label: 'Buildings / Towers' },
]

// ─── Modal for create / edit ─────────────────────────────────────────────────
interface ModalState {
  open: boolean
  editing?: any
  section: Section
}

function Modal({
  state, onClose, projects,
}: {
  state: ModalState
  onClose: () => void
  projects: any[]
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(state.editing?.name ?? '')
  const [projectId, setProjectId] = useState<string>(state.editing?.project_id?.toString() ?? '')
  const [totalFloors, setTotalFloors] = useState<string>(state.editing?.floor_count?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isEdit = !!state.editing

  async function save() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const body: any = { name: name.trim() }
      if (state.section === 'buildings') {
        body.project_id = projectId ? Number(projectId) : null
        if (totalFloors && Number(totalFloors) > 0) {
          body.total_floors = Number(totalFloors)
        }
      }

      const endpoint = state.section === 'projects' ? '/projects/' : '/admin/buildings'

      if (isEdit) {
        await api.put(`${endpoint}/${state.editing.id}`, body)
      } else {
        await api.post(endpoint, body)
      }

      qc.invalidateQueries({ queryKey: [state.section] })
      qc.invalidateQueries({ queryKey: ['floors'] })
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">
            {isEdit ? 'Edit' : 'Add'} {state.section === 'projects' ? 'Project' : 'Building / Tower'}
          </h2>
          <button onClick={onClose} className="btn-icon"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div>
            <label className="label">Name *</label>
            <input
              autoFocus className="input" value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder={
                state.section === 'projects' ? 'e.g. ECOSPACE RESIDENCIA' : 'e.g. Tower A ~ Block 1'
              }
            />
          </div>

          {state.section === 'buildings' && (
            <>
              <div>
                <label className="label flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-blue-500" />
                  Assign to Project
                  <span className="text-gray-400 font-normal text-xs">(optional — can be set later)</span>
                </label>
                <select className="select" value={projectId} onChange={e => setProjectId(e.target.value)}>
                  <option value="">— Not assigned —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="label">Total Floors
                  <span className="text-gray-400 font-normal text-xs ml-1">
                    {isEdit ? '(increase to add more floors)' : '(auto-creates Floor 1 … Floor N)'}
                  </span>
                </label>
                <input
                  type="number" min="0" max="200"
                  className="input"
                  placeholder="e.g. 10"
                  value={totalFloors}
                  onChange={e => setTotalFloors(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t bg-gray-50 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : <><Save className="w-4 h-4" /> Save</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DataInputTab() {
  const qc = useQueryClient()
  const { isSuperAdmin } = useAuth()
  const [section, setSection] = useState<Section>('projects')
  const [modal, setModal] = useState<ModalState | null>(null)
  const [filterProjects, setFilterProjects] = useState<string[]>([])

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects/').then(r => r.data),
  })
  const { data: buildings = [], isLoading: loadingBuildings } = useQuery({
    queryKey: ['buildings'],
    queryFn: () => api.get('/admin/buildings').then(r => r.data),
  })

  const dataMap = { projects, buildings }
  const loadingMap = { projects: loadingProjects, buildings: loadingBuildings }

  async function deleteItem(section: Section, id: number) {
    if (!confirm('Delete this entry? This cannot be undone.')) return
    try {
      const endpoint = section === 'projects' ? `/projects/${id}` : `/admin/buildings/${id}`
      await api.delete(endpoint)
      qc.invalidateQueries({ queryKey: [section] })
      qc.invalidateQueries({ queryKey: ['floors'] })
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete entry')
    }
  }

  const allItems: any[] = dataMap[section]
  const loading = loadingMap[section]

  const projectMap: Record<number, string> = {}
  projects.forEach((p: any) => { projectMap[p.id] = p.name })

  const projectOptions = projects.map((p: any) => ({ value: String(p.id), label: p.name }))

  const items = section === 'buildings' && filterProjects.length > 0
    ? allItems.filter((b: any) => filterProjects.includes(String(b.project_id)))
    : allItems

  const showBuildingCol = section === 'buildings'
  const colSpan = showBuildingCol ? 5 : 3

  return (
    <div className="space-y-5">
      {/* Section tabs */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg w-fit min-w-max">
          {SECTIONS.map(s => (
            <button key={s.key} onClick={() => { setSection(s.key); setFilterProjects([]) }}
              className={`px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                section === s.key ? 'bg-white shadow-xs text-indigo-600' : 'text-gray-600 hover:text-gray-900'
              }`}>{s.label}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-shrink-0">
            <h2 className="font-semibold text-gray-900">{SECTIONS.find(s => s.key === section)?.label}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {items.length === allItems.length
                ? `${allItems.length} entries`
                : `${items.length} of ${allItems.length} entries`}
            </p>
          </div>
          <div className="flex-1 flex items-center justify-end gap-2">
            {section === 'buildings' && (
              <FilterDropdown
                label="Project"
                options={projectOptions}
                selected={filterProjects}
                onChange={setFilterProjects}
              />
            )}
            <button
              onClick={() => setModal({ open: true, section })}
              className="btn-primary btn-sm sm:text-sm sm:px-4 sm:py-2"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add </span>
              {section === 'projects' ? 'Project' : 'Building'}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto overflow-hidden border border-gray-200 rounded-xl">
          <table className="w-full min-w-[360px]">
            <thead>
              <tr>
                <th className="th w-8">#</th>
                <th className="th">Name</th>
                {showBuildingCol && <th className="th">Assigned Project</th>}
                {showBuildingCol && <th className="th w-24 text-center">Floors</th>}
                <th className="th w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={colSpan} className="td text-center py-10">
                  <div className="animate-spin w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto" />
                </td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={colSpan} className="td text-center py-10 text-gray-400 italic">
                  {allItems.length === 0
                    ? 'No entries yet — click "Add" to get started'
                    : 'No buildings match the selected project filter'}
                </td></tr>
              )}
              {items.map((item: any, idx: number) => (
                <tr key={item.id} className="tr">
                  <td className="td text-gray-400 text-xs">{idx + 1}</td>
                  <td className="td font-medium text-gray-900">{item.name}</td>
                  {showBuildingCol && (
                    <td className="td">
                      {item.project_id
                        ? <span className="badge badge-open">{projectMap[item.project_id] || `Project #${item.project_id}`}</span>
                        : <span className="text-xs text-gray-400 italic">Not assigned</span>}
                    </td>
                  )}
                  {showBuildingCol && (
                    <td className="td text-center">
                      {item.floor_count > 0
                        ? <span className="text-xs font-medium text-gray-700">{item.floor_count}</span>
                        : <span className="text-xs text-gray-400 italic">—</span>}
                    </td>
                  )}
                  <td className="td">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setModal({ open: true, editing: item, section })}
                        className="btn-icon"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {isSuperAdmin() && (
                        <button
                          onClick={() => deleteItem(section, item.id)}
                          className="btn-icon text-red-400 hover:text-red-600 hover:bg-red-50"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal?.open && (
        <Modal
          state={modal}
          onClose={() => setModal(null)}
          projects={projects}
        />
      )}
    </div>
  )
}
