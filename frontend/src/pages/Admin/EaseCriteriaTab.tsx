import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Save, X, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'
import api from '../../lib/api'

// ── Topic form modal ──────────────────────────────────────────────────────────

function TopicModal({
  editing, onClose,
}: {
  editing?: { id: number; name: string; sort_order: number } | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(editing?.name ?? '')
  const [sortOrder, setSortOrder] = useState(String(editing?.sort_order ?? 0))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const body = { name: name.trim(), sort_order: Number(sortOrder) || 0 }
      if (editing) {
        await api.put(`/ease-score/criteria/topics/${editing.id}`, body)
      } else {
        await api.post('/ease-score/criteria/topics', body)
      }
      qc.invalidateQueries({ queryKey: ['ease-criteria'] })
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">{editing ? 'Edit Topic' : 'Add Topic'}</h2>
          <button onClick={onClose} className="btn-icon"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div>
            <label className="label">Topic Name *</label>
            <input autoFocus className="input" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()} placeholder="e.g. General Safety" />
          </div>
          <div>
            <label className="label">Sort Order</label>
            <input className="input" type="number" value={sortOrder}
              onChange={e => setSortOrder(e.target.value)} placeholder="0" />
          </div>
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

// ── Element form modal ────────────────────────────────────────────────────────

function ElementModal({
  topicId, editing, onClose,
}: {
  topicId: number
  editing?: { id: number; question: string; assessment_value: number; sort_order: number } | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [question, setQuestion] = useState(editing?.question ?? '')
  const [value, setValue] = useState(String(editing?.assessment_value ?? 3))
  const [sortOrder, setSortOrder] = useState(String(editing?.sort_order ?? 0))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!question.trim()) { setError('Question is required'); return }
    if (!Number(value) || Number(value) < 1) { setError('Assessment value must be ≥ 1'); return }
    setSaving(true); setError('')
    try {
      if (editing) {
        await api.put(`/ease-score/criteria/elements/${editing.id}`, {
          question: question.trim(),
          assessment_value: Number(value),
          sort_order: Number(sortOrder) || 0,
        })
      } else {
        await api.post('/ease-score/criteria/elements', {
          topic_id: topicId,
          question: question.trim(),
          assessment_value: Number(value),
          sort_order: Number(sortOrder) || 0,
        })
      }
      qc.invalidateQueries({ queryKey: ['ease-criteria'] })
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">{editing ? 'Edit Evaluation Element' : 'Add Evaluation Element'}</h2>
          <button onClick={onClose} className="btn-icon"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div>
            <label className="label">Question / Evaluation Element *</label>
            <textarea autoFocus className="input min-h-[80px] resize-y" value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Are Safety meetings conducted at least once monthly?" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Assessment Value (max marks) *</label>
              <input className="input" type="number" min={1} max={10} value={value}
                onChange={e => setValue(e.target.value)} />
            </div>
            <div>
              <label className="label">Sort Order</label>
              <input className="input" type="number" value={sortOrder}
                onChange={e => setSortOrder(e.target.value)} />
            </div>
          </div>
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

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({
  message, onConfirm, onClose,
}: {
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

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function EaseCriteriaTab() {
  const qc = useQueryClient()
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set())
  const [topicModal, setTopicModal] = useState<{ open: boolean; editing?: any }>({ open: false })
  const [elemModal, setElemModal] = useState<{ open: boolean; topicId: number; editing?: any }>({
    open: false, topicId: 0,
  })
  const [deleteState, setDeleteState] = useState<{ open: boolean; message: string; fn: () => Promise<void> }>({
    open: false, message: '', fn: async () => {},
  })

  const { data: criteria, isLoading } = useQuery({
    queryKey: ['ease-criteria'],
    queryFn: () => api.get('/ease-score/criteria').then(r => r.data),
  })

  const toggleTopic = (id: number) =>
    setExpandedTopics(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const deleteTopic = (id: number, name: string) =>
    setDeleteState({
      open: true,
      message: `Delete topic "${name}" and all its evaluation elements?`,
      fn: async () => { await api.delete(`/ease-score/criteria/topics/${id}`); qc.invalidateQueries({ queryKey: ['ease-criteria'] }) },
    })

  const deleteElement = (id: number) =>
    setDeleteState({
      open: true,
      message: 'Delete this evaluation element?',
      fn: async () => { await api.delete(`/ease-score/criteria/elements/${id}`); qc.invalidateQueries({ queryKey: ['ease-criteria'] }) },
    })

  const totalElements = (criteria || []).reduce((s: number, t: any) => s + t.elements.length, 0)
  const totalMarks = (criteria || []).reduce(
    (s: number, t: any) => s + t.elements.reduce((ss: number, e: any) => ss + e.assessment_value, 0), 0,
  )

  if (isLoading) return (
    <div className="h-48 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {(criteria || []).length} topics · {totalElements} elements · {totalMarks} total marks
          </p>
        </div>
        <button onClick={() => setTopicModal({ open: true })} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Topic
        </button>
      </div>

      {/* Topics list */}
      {(criteria || []).map((topic: any, ti: number) => {
        const isOpen = expandedTopics.has(topic.id)
        const topicMarks = topic.elements.reduce((s: number, e: any) => s + e.assessment_value, 0)
        return (
          <div key={topic.id} className="card overflow-hidden p-0 border border-slate-200">
            {/* Topic row */}
            <div className="flex items-center gap-2 px-4 py-3 bg-indigo-50">
              <button onClick={() => toggleTopic(topic.id)} className="flex items-center gap-2 flex-1 text-left">
                <GripVertical className="w-4 h-4 text-slate-300" />
                {isOpen
                  ? <ChevronDown className="w-4 h-4 text-indigo-500" />
                  : <ChevronRight className="w-4 h-4 text-indigo-500" />
                }
                <span className="text-xs font-bold text-indigo-400 w-5">{ti + 1}</span>
                <span className="font-semibold text-slate-900">{topic.name}</span>
                <span className="text-xs text-slate-400 ml-2">
                  {topic.elements.length} elements · {topicMarks} marks
                </span>
              </button>
              <button onClick={() => setTopicModal({ open: true, editing: topic })}
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 transition">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => deleteTopic(topic.id, topic.name)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Elements */}
            {isOpen && (
              <div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-400 uppercase border-b border-slate-100">
                      <th className="py-2 px-4 w-8 text-center">#</th>
                      <th className="py-2 px-3 text-left">Evaluation Element</th>
                      <th className="py-2 px-4 w-28 text-center">Max Marks</th>
                      <th className="py-2 px-3 w-20 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topic.elements.map((el: any, ei: number) => (
                      <tr key={el.id} className="border-b border-slate-100 hover:bg-slate-50 group">
                        <td className="py-2.5 px-4 text-center text-slate-400 text-xs">{ei + 1}</td>
                        <td className="py-2.5 px-3 text-slate-700 leading-relaxed">{el.question}</td>
                        <td className="py-2.5 px-4 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 font-semibold text-sm">
                            {el.assessment_value}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button onClick={() => setElemModal({ open: true, topicId: topic.id, editing: el })}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteElement(el.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Add element button */}
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
                  <button
                    onClick={() => setElemModal({ open: true, topicId: topic.id })}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition">
                    <Plus className="w-3.5 h-3.5" /> Add Evaluation Element
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Modals */}
      {topicModal.open && (
        <TopicModal editing={topicModal.editing} onClose={() => setTopicModal({ open: false })} />
      )}
      {elemModal.open && (
        <ElementModal
          topicId={elemModal.topicId}
          editing={elemModal.editing}
          onClose={() => setElemModal({ open: false, topicId: 0 })}
        />
      )}
      {deleteState.open && (
        <DeleteConfirm
          message={deleteState.message}
          onConfirm={deleteState.fn}
          onClose={() => setDeleteState({ open: false, message: '', fn: async () => {} })}
        />
      )}
    </div>
  )
}
