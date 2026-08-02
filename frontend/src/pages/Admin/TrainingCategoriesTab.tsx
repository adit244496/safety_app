import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Save, Pencil, X, GraduationCap } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../store/authStore'
import api from '../../lib/api'

export default function TrainingCategoriesTab() {
  const qc = useQueryClient()
  const { isSuperAdmin } = useAuth()
  const { data: rows = [] } = useQuery<any[]>({ queryKey: ['admin-training-categories'], queryFn: () => api.get('/admin/training-categories').then(r => r.data) })

  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-training-categories'] })
    qc.invalidateQueries({ queryKey: ['training-categories'] })
  }

  async function add() {
    if (!newName.trim()) return
    setAdding(true)
    try { await api.post('/admin/training-categories', { name: newName.trim() }); setNewName(''); invalidate(); toast.success('Category added') }
    catch (e: any) { toast.error(e.response?.data?.detail || 'Failed') } finally { setAdding(false) }
  }
  async function saveEdit(id: number) {
    if (!editName.trim()) return
    try { await api.put(`/admin/training-categories/${id}`, { name: editName.trim() }); setEditId(null); invalidate(); toast.success('Updated') }
    catch (e: any) { toast.error(e.response?.data?.detail || 'Failed') }
  }
  async function remove(id: number) {
    if (!confirm('Delete this category?')) return
    try { await api.delete(`/admin/training-categories/${id}`); invalidate(); toast.success('Deleted') }
    catch (e: any) { toast.error(e.response?.data?.detail || 'Failed') }
  }

  return (
    <div className="max-w-2xl">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-800">Training Categories</h3>
        </div>
        <p className="text-xs text-gray-400 mb-4">These appear in the Category dropdown when recording a training.</p>

        <div className="space-y-1.5">
          {rows.length === 0 && <p className="text-sm text-gray-400 py-2">No categories yet — add one below.</p>}
          {rows.map(c => (
            <div key={c.id} className="flex items-center gap-2 bg-gray-50/60 rounded-lg px-3 py-2">
              {editId === c.id ? (
                <>
                  <input className="input !py-1 text-sm flex-1 !bg-white" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(c.id); if (e.key === 'Escape') setEditId(null) }} autoFocus />
                  <button onClick={() => saveEdit(c.id)} className="btn-primary btn-sm !px-2" title="Save"><Save className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditId(null)} className="btn-ghost btn-sm !p-1.5 text-gray-400" title="Cancel"><X className="w-4 h-4" /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-800">{c.name}</span>
                  <button onClick={() => { setEditId(c.id); setEditName(c.name) }} className="btn-ghost btn-sm !p-1.5 text-gray-400 hover:text-indigo-600" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                  {isSuperAdmin() && <button onClick={() => remove(c.id)} className="btn-ghost btn-sm !p-1.5 text-gray-400 hover:text-red-500" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
          <input className="input !py-1.5 text-sm flex-1" placeholder="New category…" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} />
          <button onClick={add} disabled={adding || !newName.trim()} className="btn-primary btn-sm disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
      </div>
    </div>
  )
}
