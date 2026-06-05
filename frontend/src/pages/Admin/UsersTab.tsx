import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, X, Save, Users } from 'lucide-react'
import api from '../../lib/api'
import { getRoleClass, ROLES } from '../../lib/utils'

interface UserForm { name: string; email: string; password: string; role: string; project_ids: number[] }
const EMPTY: UserForm = { name: '', email: '', password: '', role: 'Observer', project_ids: [] }

export default function UsersTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ open: boolean; editing?: any }>({ open: false })
  const [form, setForm] = useState<UserForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users/').then(r => r.data),
  })
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects/').then(r => r.data),
  })

  const set = (k: keyof UserForm, v: any) => setForm(f => ({ ...f, [k]: v }))

  const openCreate = () => { setForm(EMPTY); setError(''); setModal({ open: true }) }
  const openEdit = (u: any) => {
    setForm({ name: u.name, email: u.email, password: '', role: u.role, project_ids: u.projects?.map((p: any) => p.id) || [] })
    setError('')
    setModal({ open: true, editing: u })
  }

  const toggleProject = (id: number) =>
    set('project_ids', form.project_ids.includes(id)
      ? form.project_ids.filter(p => p !== id)
      : [...form.project_ids, id])

  async function save() {
    setSaving(true); setError('')
    try {
      if (modal.editing) {
        await api.put(`/users/${modal.editing.id}`, form)
      } else {
        if (!form.password) { setError('Password is required'); setSaving(false); return }
        await api.post('/users/', form)
      }
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['users-contractors'] })
      setModal({ open: false })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  async function deleteUser(id: number) {
    if (!confirm('Delete this user? This cannot be undone.')) return
    await api.delete(`/users/${id}`)
    qc.invalidateQueries({ queryKey: ['users'] })
    qc.invalidateQueries({ queryKey: ['users-contractors'] })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Users className="w-4 h-4" />
          <span>{(users || []).length} users</span>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full bg-white min-w-[560px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="th">Name</th>
              <th className="th">Email</th>
              <th className="th">Role</th>
              <th className="th">Project Access</th>
              <th className="th w-20"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="td text-center py-10 text-gray-400">Loading users…</td></tr>
            )}
            {!isLoading && (users || []).length === 0 && (
              <tr><td colSpan={5} className="td text-center py-10 text-gray-400">No users yet</td></tr>
            )}
            {(users || []).map((u: any) => (
              <tr key={u.id} className="tr">
                <td className="td">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {u.name?.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-gray-900">{u.name}</span>
                  </div>
                </td>
                <td className="td text-gray-500">{u.email}</td>
                <td className="td">
                  <span className={`badge ${getRoleClass(u.role)}`}>{u.role}</span>
                </td>
                <td className="td">
                  <div className="flex flex-wrap gap-1">
                    {u.projects?.length === 0 && (
                      <span className="text-xs text-gray-400 italic">All projects</span>
                    )}
                    {u.projects?.slice(0, 3).map((p: any) => (
                      <span key={p.id} className="badge badge-gray">{p.name}</span>
                    ))}
                    {u.projects?.length > 3 && (
                      <span className="badge badge-gray">+{u.projects.length - 3} more</span>
                    )}
                  </div>
                </td>
                <td className="td">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(u)} className="btn-icon" title="Edit">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteUser(u.id)}
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

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">
                {modal.editing ? 'Edit User' : 'Add New User'}
              </h2>
              <button onClick={() => setModal({ open: false })} className="btn-icon">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto thin-scroll">
              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Full Name *</label>
                  <input className="input" placeholder="Jane Smith" value={form.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div>
                  <label className="label">Email Address *</label>
                  <input type="email" className="input" placeholder="jane@company.com" value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
                <div>
                  <label className="label">
                    {modal.editing ? 'New Password' : 'Password *'}
                    {modal.editing && <span className="text-gray-400 font-normal ml-1">(leave blank to keep)</span>}
                  </label>
                  <input type="password" className="input" placeholder="••••••••" value={form.password} onChange={e => set('password', e.target.value)} />
                </div>
                <div>
                  <label className="label">Role *</label>
                  <select className="select" value={form.role} onChange={e => set('role', e.target.value)}>
                    {ROLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Project Access</label>
                <p className="text-xs text-gray-400 mb-2">Select which projects this user can access. Leave all unselected for full access.</p>
                <div className="flex flex-wrap gap-2">
                  {(projects || []).map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProject(p.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border-2 transition-all ${
                        form.project_ids.includes(p.id)
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                  {(projects || []).length === 0 && (
                    <span className="text-xs text-gray-400 italic">No projects — add projects in Data Input first</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 justify-end">
              <button onClick={() => setModal({ open: false })} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : <><Save className="w-4 h-4" /> Save User</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
