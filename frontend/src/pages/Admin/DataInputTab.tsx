import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Save, X, Link2 } from 'lucide-react'
import api from '../../lib/api'

type Section = 'projects' | 'buildings' | 'floors'

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'projects', label: 'Projects' },
  { key: 'buildings', label: 'Buildings / Towers' },
  { key: 'floors', label: 'Floors' },
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isEdit = !!state.editing

  async function save() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const body: any = { name: name.trim() }
      if (state.section === 'buildings') body.project_id = projectId ? Number(projectId) : null

      const endpoint =
        state.section === 'projects' ? '/projects/' :
        state.section === 'buildings' ? '/admin/buildings' : '/admin/floors'

      if (isEdit) {
        await api.put(`${endpoint}/${state.editing.id}`, body)
      } else {
        await api.post(endpoint, body)
      }

      qc.invalidateQueries({ queryKey: [state.section] })
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
            {isEdit ? 'Edit' : 'Add'} {SECTIONS.find(s => s.key === state.section)?.label.replace('s', '').trimEnd()}
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
                state.section === 'projects' ? 'e.g. ECOSPACE RESIDENCIA' :
                state.section === 'buildings' ? 'e.g. Tower A ~ Block 1' : 'e.g. Floor 5'
              }
            />
          </div>

          {state.section === 'buildings' && (
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
  const [section, setSection] = useState<Section>('projects')
  const [modal, setModal] = useState<ModalState | null>(null)

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects/').then(r => r.data),
  })
  const { data: buildings = [], isLoading: loadingBuildings } = useQuery({
    queryKey: ['buildings'],
    queryFn: () => api.get('/admin/buildings').then(r => r.data),
  })
  const { data: floors = [], isLoading: loadingFloors } = useQuery({
    queryKey: ['floors'],
    queryFn: () => api.get('/admin/floors').then(r => r.data),
  })

  const dataMap = { projects, buildings, floors }
  const loadingMap = { projects: loadingProjects, buildings: loadingBuildings, floors: loadingFloors }

  async function deleteItem(section: Section, id: number) {
    if (!confirm('Delete this entry? This cannot be undone.')) return
    const endpoint =
      section === 'projects' ? `/projects/${id}` :
      section === 'buildings' ? `/admin/buildings/${id}` : `/admin/floors/${id}`
    await api.delete(endpoint)
    qc.invalidateQueries({ queryKey: [section] })
  }

  let items: any[] = dataMap[section]
  const loading = loadingMap[section]
  
  // Sort floors in descending order
  if (section === 'floors') {
    items = [...items].sort((a, b) => {
      const numA = parseInt(a.name.replace(/\D/g, '')) || 0
      const numB = parseInt(b.name.replace(/\D/g, '')) || 0
      return numB - numA
    })
  }

  // Build project/building lookup maps for display
  const projectMap: Record<number, string> = {}
  projects.forEach((p: any) => { projectMap[p.id] = p.name })
  const buildingMap: Record<number, string> = {}
  buildings.forEach((b: any) => { buildingMap[b.id] = b.name })

  return (
    <div className="space-y-5">
      {/* Section tabs */}
      <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg w-fit">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              section === s.key ? 'bg-white shadow-xs text-indigo-600' : 'text-gray-600 hover:text-gray-900'
            }`}>{s.label}</button>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-gray-900">{SECTIONS.find(s => s.key === section)?.label}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{items.length} entries</p>
          </div>
          <button
            onClick={() => setModal({ open: true, section })}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            Add {section === 'projects' ? 'Project' : section === 'buildings' ? 'Building / Tower' : 'Floor'}
          </button>
        </div>

        {/* Table */}
        <div className="overflow-hidden border border-gray-200 rounded-xl">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th w-8">#</th>
                <th className="th">Name</th>
                {section === 'buildings' && <th className="th">Assigned Project</th>}
                <th className="th w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={4} className="td text-center py-10">
                  <div className="animate-spin w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto" />
                </td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={4} className="td text-center py-10 text-gray-400 italic">
                  No entries yet — click "Add" to get started
                </td></tr>
              )}
              {items.map((item: any, idx: number) => (
                <tr key={item.id} className="tr">
                  <td className="td text-gray-400 text-xs">{idx + 1}</td>
                  <td className="td font-medium text-gray-900">{item.name}</td>
                  {section === 'buildings' && (
                    <td className="td">
                      {item.project_id
                        ? <span className="badge badge-open">{projectMap[item.project_id] || `Project #${item.project_id}`}</span>
                        : <span className="text-xs text-gray-400 italic">Not assigned</span>}
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
                      <button
                        onClick={() => deleteItem(section, item.id)}
                        className="btn-icon text-red-400 hover:text-red-600 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Helper note for buildings */}
        {section === 'buildings' && (
          <p className="text-xs text-gray-400 mt-2.5 flex items-center gap-1.5">
            <Link2 className="w-3 h-3" />
            Click Edit to assign buildings to projects.
          </p>
        )}
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
