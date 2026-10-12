import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Save, X, ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react'
import api from '../../lib/api'

interface Item { id: number; section: string; item_key: string; label: string; sort_order: number; active: boolean }

const SECTIONS: { key: string; title: string; hint: string }[] = [
  { key: 'section_a', title: 'A · Details of Manhours Worked', hint: 'Avg. persons / day & man-hours per category' },
  { key: 'general_summary', title: 'C · General Summary', hint: 'For-the-month & cumulative metrics' },
  { key: 'activities', title: 'D · Activities', hint: 'Trainings, inductions, audits, drills, etc.' },
]

// ── Add / edit modal ───────────────────────────────────────────────────────
function ItemModal({ section, editing, onClose }: {
  section: string; editing?: Item | null; onClose: () => void
}) {
  const qc = useQueryClient()
  const [label, setLabel] = useState(editing?.label ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!label.trim()) { setError('Label is required'); return }
    setSaving(true); setError('')
    try {
      if (editing) await api.put(`/ohs-statistics/form-items/${editing.id}`, { label: label.trim() })
      else await api.post('/ohs-statistics/form-items', { section, label: label.trim() })
      qc.invalidateQueries({ queryKey: ['ohs-form-items'] })
      qc.invalidateQueries({ queryKey: ['ohs-form-config'] })
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">{editing ? 'Edit Row' : 'Add Row'}</h2>
          <button onClick={onClose} className="btn-icon"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div>
            <label className="label">Row label *</label>
            <textarea autoFocus className="input min-h-[80px] resize-y" value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Number of tool box talks conducted" />
          </div>
          {editing && <p className="text-xs text-slate-400">Key: <span className="font-mono">{editing.item_key}</span> — stays fixed so historical data keeps matching.</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">
            <Save className="w-4 h-4" />{saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirm({ message, onConfirm, onClose }: {
  message: string; onConfirm: () => Promise<void>; onClose: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const go = async () => { setDeleting(true); await onConfirm(); onClose() }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4">
        <p className="text-slate-800 font-medium">{message}</p>
        <div className="flex justify-center gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={go} disabled={deleting}
            className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OhsFormTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ open: boolean; section: string; editing?: Item | null }>({ open: false, section: '' })
  const [deleteState, setDeleteState] = useState<{ open: boolean; message: string; fn: () => Promise<void> }>({
    open: false, message: '', fn: async () => {},
  })

  const { data: items, isLoading } = useQuery<Item[]>({
    queryKey: ['ohs-form-items'],
    queryFn: () => api.get('/ohs-statistics/form-items').then(r => r.data),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ohs-form-items'] })
    qc.invalidateQueries({ queryKey: ['ohs-form-config'] })
  }

  const bySection = (s: string) =>
    (items || []).filter(i => i.section === s).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)

  async function toggleActive(it: Item) {
    await api.put(`/ohs-statistics/form-items/${it.id}`, { active: !it.active })
    invalidate()
  }

  async function move(section: string, index: number, dir: -1 | 1) {
    const rows = bySection(section)
    const j = index + dir
    if (j < 0 || j >= rows.length) return
    const reordered = [...rows]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(j, 0, moved)
    // Send every item's id in desired global order (all sections) for clean sort_order.
    const ids: number[] = []
    for (const sec of SECTIONS) {
      const list = sec.key === section ? reordered : bySection(sec.key)
      list.forEach(r => ids.push(r.id))
    }
    await api.put('/ohs-statistics/form-items/reorder', { ids })
    invalidate()
  }

  const remove = (it: Item) =>
    setDeleteState({
      open: true,
      message: `Delete row "${it.label}"? Historical figures stored under this row will no longer appear in the form.`,
      fn: async () => { await api.delete(`/ohs-statistics/form-items/${it.id}`); invalidate() },
    })

  if (isLoading) return (
    <div className="h-48 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        Manage the rows of the Monthly OH&amp;S Statistics form (OHS-016). Values are stored against each row’s fixed key,
        so renaming or reordering rows keeps historical data intact. Hidden rows stay in reports/history but are not shown on new entries.
      </p>

      {SECTIONS.map(sec => {
        const rows = bySection(sec.key)
        return (
          <div key={sec.key} className="card overflow-hidden p-0 border border-slate-200">
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-indigo-50">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">{sec.title}</h3>
                <p className="text-xs text-slate-400">{sec.hint} · {rows.length} rows</p>
              </div>
              <button onClick={() => setModal({ open: true, section: sec.key })}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 transition">
                <Plus className="w-3.5 h-3.5" /> Add Row
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-400 uppercase border-b border-slate-100">
                  <th className="py-2 px-4 w-8 text-center">#</th>
                  <th className="py-2 px-3 text-left">Row Label</th>
                  <th className="py-2 px-3 w-28 text-center">Order</th>
                  <th className="py-2 px-3 w-24 text-center">Status</th>
                  <th className="py-2 px-3 w-20 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-xs text-slate-400">No rows. Click “Add Row”.</td></tr>
                )}
                {rows.map((it, i) => (
                  <tr key={it.id} className={`border-b border-slate-100 hover:bg-slate-50 group ${it.active ? '' : 'opacity-50'}`}>
                    <td className="py-2.5 px-4 text-center text-slate-400 text-xs">{i + 1}</td>
                    <td className="py-2.5 px-3 text-slate-700 leading-relaxed">{it.label}</td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => move(sec.key, i, -1)} disabled={i === 0}
                          className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:hover:bg-transparent transition"><ChevronUp className="w-4 h-4" /></button>
                        <button onClick={() => move(sec.key, i, 1)} disabled={i === rows.length - 1}
                          className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:hover:bg-transparent transition"><ChevronDown className="w-4 h-4" /></button>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button onClick={() => toggleActive(it)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition ${it.active ? 'text-emerald-700 hover:bg-emerald-50' : 'text-slate-500 hover:bg-slate-100'}`}>
                        {it.active ? <><Eye className="w-3.5 h-3.5" /> Shown</> : <><EyeOff className="w-3.5 h-3.5" /> Hidden</>}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => setModal({ open: true, section: sec.key, editing: it })}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => remove(it)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}

      {modal.open && (
        <ItemModal section={modal.section} editing={modal.editing} onClose={() => setModal({ open: false, section: '' })} />
      )}
      {deleteState.open && (
        <DeleteConfirm message={deleteState.message} onConfirm={deleteState.fn}
          onClose={() => setDeleteState({ open: false, message: '', fn: async () => {} })} />
      )}
    </div>
  )
}
