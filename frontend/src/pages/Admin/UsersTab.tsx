import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, X, Save, Users, ChevronDown, Search, Check, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, SkipForward } from 'lucide-react'
import api from '../../lib/api'
import { getRoleClass, ROLES } from '../../lib/utils'
import { useAuth } from '../../store/authStore'

interface UserForm { name: string; email: string; password: string; role: string; mobile: string; project_ids: number[] }
const EMPTY: UserForm = { name: '', email: '', password: '', role: 'Observer', mobile: '', project_ids: [] }

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
        <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl shadow-lg border border-gray-100 w-48 py-2">
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

interface UploadResult {
  created_count: number
  skipped_count: number
  error_count: number
  created: string[]
  skipped: string[]
  errors: string[]
}

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/users/bulk-upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(res.data)
      if (res.data.created_count > 0) onDone()
    } catch (e: any) {
      setUploadError(e.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            <h2 className="font-semibold text-gray-900">Upload Users from Excel</h2>
          </div>
          <button onClick={onClose} className="btn-icon"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {!result && (
            <>
              <div className="text-sm text-gray-500 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 space-y-1">
                <p className="font-medium text-blue-800">Expected Excel columns:</p>
                <p>Project · Contractor · Mobile · Email</p>
                <p className="text-xs text-blue-600 mt-1">Default password for all new users: <strong>123456</strong></p>
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                }`}
              >
                <Upload className={`w-8 h-8 mx-auto mb-2 ${file ? 'text-green-500' : 'text-gray-400'}`} />
                {file ? (
                  <p className="text-sm font-medium text-green-700">{file.name}</p>
                ) : (
                  <p className="text-sm text-gray-500">Click to select Excel file (.xlsx)</p>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
              </div>

              {uploadError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {uploadError}
                </div>
              )}
            </>
          )}

          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-green-50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-green-700">{result.created_count}</p>
                  <p className="text-xs text-green-600 mt-0.5">Created</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-amber-700">{result.skipped_count}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Skipped</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-red-700">{result.error_count}</p>
                  <p className="text-xs text-red-600 mt-0.5">Errors</p>
                </div>
              </div>

              {result.created.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer flex items-center gap-1.5 text-green-700 font-medium py-1">
                    <CheckCircle2 className="w-4 h-4" /> Created ({result.created_count})
                  </summary>
                  <div className="mt-1 max-h-32 overflow-y-auto thin-scroll bg-green-50 rounded-lg p-2 space-y-0.5">
                    {result.created.map((s, i) => <p key={i} className="text-xs text-green-800">{s}</p>)}
                  </div>
                </details>
              )}

              {result.skipped.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer flex items-center gap-1.5 text-amber-700 font-medium py-1">
                    <SkipForward className="w-4 h-4" /> Skipped ({result.skipped_count})
                  </summary>
                  <div className="mt-1 max-h-32 overflow-y-auto thin-scroll bg-amber-50 rounded-lg p-2 space-y-0.5">
                    {result.skipped.map((s, i) => <p key={i} className="text-xs text-amber-800">{s}</p>)}
                  </div>
                </details>
              )}

              {result.errors.length > 0 && (
                <details className="text-sm" open>
                  <summary className="cursor-pointer flex items-center gap-1.5 text-red-700 font-medium py-1">
                    <AlertCircle className="w-4 h-4" /> Errors ({result.error_count})
                  </summary>
                  <div className="mt-1 max-h-32 overflow-y-auto thin-scroll bg-red-50 rounded-lg p-2 space-y-0.5">
                    {result.errors.map((s, i) => <p key={i} className="text-xs text-red-800">{s}</p>)}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 justify-end">
          <button onClick={onClose} className="btn-secondary">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button onClick={handleUpload} disabled={!file || uploading} className="btn-primary">
              {uploading ? 'Uploading…' : <><Upload className="w-4 h-4" /> Upload</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function UsersTab() {
  const qc = useQueryClient()
  const { isSuperAdmin } = useAuth()
  const [modal, setModal] = useState<{ open: boolean; editing?: any }>({ open: false })
  const [form, setForm] = useState<UserForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterRoles, setFilterRoles] = useState<string[]>([])
  const [filterProjects, setFilterProjects] = useState<string[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users/').then(r => r.data),
  })
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects/').then(r => r.data),
  })

  const set = (k: keyof UserForm, v: any) => setForm(f => ({ ...f, [k]: v }))

  const filteredUsers = (users || []).filter((u: any) => {
    if (filterRoles.length > 0 && !filterRoles.includes(u.role)) return false
    if (filterProjects.length > 0) {
      const userProjectIds = (u.projects || []).map((p: any) => String(p.id))
      if (!filterProjects.some(pid => userProjectIds.includes(pid))) return false
    }
    return true
  })

  const roleOptions = ROLES.map(r => ({ value: r, label: r }))
  const projectOptions = (projects || []).map((p: any) => ({ value: String(p.id), label: p.name }))

  const openCreate = () => { setForm(EMPTY); setError(''); setModal({ open: true }) }
  const openEdit = (u: any) => {
    setForm({ name: u.name, email: u.email, password: '', role: u.role, mobile: u.mobile || '', project_ids: u.projects?.map((p: any) => p.id) || [] })
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
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-gray-500 text-sm flex-shrink-0">
          <Users className="w-4 h-4" />
          <span>
            {filteredUsers.length === (users || []).length
              ? `${(users || []).length} users`
              : `${filteredUsers.length} of ${(users || []).length} users`}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-end gap-2">
          <FilterDropdown
            label="Role"
            options={roleOptions}
            selected={filterRoles}
            onChange={setFilterRoles}
          />
          <FilterDropdown
            label="Project"
            options={projectOptions}
            selected={filterProjects}
            onChange={setFilterProjects}
          />
          <button onClick={() => setUploadOpen(true)} className="btn-secondary">
            <FileSpreadsheet className="w-4 h-4" /> Upload Excel
          </button>
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> Add User
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full bg-white min-w-[560px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="th">Name</th>
              <th className="th">Email</th>
              <th className="th">Mobile</th>
              <th className="th">Role</th>
              <th className="th">Project Access</th>
              <th className="th w-20"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="td text-center py-10 text-gray-400">Loading users…</td></tr>
            )}
            {!isLoading && filteredUsers.length === 0 && (
              <tr><td colSpan={6} className="td text-center py-10 text-gray-400">
                {(users || []).length === 0 ? 'No users yet' : 'No users match the selected filters'}
              </td></tr>
            )}
            {filteredUsers.map((u: any) => (
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
                <td className="td text-gray-500">{u.mobile || <span className="text-gray-300 italic">—</span>}</td>
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
                    {isSuperAdmin() && (
                      <button
                        onClick={() => deleteUser(u.id)}
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

      {/* Upload Modal */}
      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['users'] })
            qc.invalidateQueries({ queryKey: ['users-contractors'] })
          }}
        />
      )}

      {/* Edit/Create Modal */}
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
                  <label className="label">{form.role === 'Contractor' ? 'Contractor Company Name *' : 'Full Name *'}</label>
                  <input className="input" placeholder={form.role === 'Contractor' ? 'e.g. ABC Construction' : 'Jane Smith'} value={form.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div>
                  <label className="label">Email Address *</label>
                  <input type="email" className="input" placeholder="jane@company.com" value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
                <div>
                  <label className="label">Mobile Number</label>
                  <input type="tel" className="input" placeholder="+91 98765 43210" value={form.mobile} onChange={e => set('mobile', e.target.value)} />
                </div>
                <div>
                  <label className="label">Role *</label>
                  <select className="select" value={form.role} onChange={e => set('role', e.target.value)}>
                    {ROLES.filter(r => isSuperAdmin() || r !== 'SuperAdmin').map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">
                    {modal.editing ? 'New Password' : 'Password *'}
                    {modal.editing && <span className="text-gray-400 font-normal ml-1">(leave blank to keep)</span>}
                  </label>
                  <input type="password" className="input" placeholder="••••••••" value={form.password} onChange={e => set('password', e.target.value)} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">Project Access</label>
                  {(projects || []).length > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => set('project_ids', (projects || []).map((p: any) => p.id))}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Select All
                      </button>
                      <span className="text-xs text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={() => set('project_ids', [])}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                      >
                        Clear All
                      </button>
                    </div>
                  )}
                </div>
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
