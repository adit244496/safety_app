import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Save, GripVertical, ShieldAlert, ToggleLeft, CheckSquare, Type } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../store/authStore'
import api from '../../lib/api'

const INPUT_TYPES = [
  { value: 'checkbox', label: 'Checkbox', icon: CheckSquare },
  { value: 'toggle', label: 'Toggle (Yes/No)', icon: ToggleLeft },
  { value: 'text', label: 'Text box', icon: Type },
]

function TypeIcon({ t }: { t: string }) {
  const meta = INPUT_TYPES.find(x => x.value === t) || INPUT_TYPES[0]
  const Icon = meta.icon
  return <Icon className="w-3.5 h-3.5" />
}

export default function PermitConfigTab() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'SuperAdmin'
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newTypeName, setNewTypeName] = useState('')

  const { data: workTypes = [] } = useQuery<any[]>({ queryKey: ['permit-work-types'], queryFn: () => api.get('/admin/permit-work-types').then(r => r.data) })
  useEffect(() => { if (selectedId == null && workTypes.length) setSelectedId(workTypes[0].id) }, [workTypes, selectedId])
  const selected = workTypes.find(w => w.id === selectedId) || null

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['permit-work-types'] }); qc.invalidateQueries({ queryKey: ['permit-config'] }); qc.invalidateQueries({ queryKey: ['permit-config-all'] }) }

  async function addType() {
    if (!newTypeName.trim()) return
    try {
      const { data } = await api.post('/admin/permit-work-types', { name: newTypeName.trim(), sort_order: workTypes.length })
      setNewTypeName(''); invalidate(); setSelectedId(data.id)
      toast.success('Work type added')
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Failed') }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="w-4 h-4 text-indigo-500" />
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Work Permit Configuration</h3>
          <p className="text-xs text-gray-400">Manage hazardous work types and their precaution checklists used on the CHWP form.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        {/* Work types list */}
        <div className="card p-3 h-fit">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1.5">Work Types ({workTypes.length})</p>
          <div className="space-y-1 max-h-[55vh] overflow-y-auto thin-scroll -mx-1 px-1">
            {workTypes.map(wt => (
              <button key={wt.id} onClick={() => setSelectedId(wt.id)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors border ${selectedId === wt.id ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-gray-50 border-transparent'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-medium line-clamp-2 ${selectedId === wt.id ? 'text-indigo-700' : 'text-gray-800'}`}>{wt.name}</span>
                  {!wt.active && <span className="text-[10px] text-gray-400 flex-shrink-0">hidden</span>}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">{wt.precaution_count} precautions</p>
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 mt-2 pt-2 border-t border-gray-100">
            <input className="input !py-1.5 text-sm flex-1" placeholder="New work type…" value={newTypeName}
              onChange={e => setNewTypeName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addType() }} />
            <button onClick={addType} className="btn-primary btn-sm !px-2" title="Add"><Plus className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Detail */}
        {!selected ? (
          <div className="card p-10 text-center text-gray-400">Select or add a work type.</div>
        ) : (
          <div className="space-y-4">
            <WorkTypeEditor key={selected.id} wt={selected} isSuperAdmin={isSuperAdmin} onChange={invalidate} onDeleted={() => { setSelectedId(null); invalidate() }} />
            <PrecautionEditor workTypeId={selected.id} onChange={invalidate} />
          </div>
        )}
      </div>
    </div>
  )
}

function WorkTypeEditor({ wt, isSuperAdmin, onChange, onDeleted }: { wt: any; isSuperAdmin: boolean; onChange: () => void; onDeleted: () => void }) {
  const [name, setName] = useState(wt.name)
  const [description, setDescription] = useState(wt.description || '')
  const [hasGas, setHasGas] = useState(!!wt.has_gas_table)
  const [active, setActive] = useState(!!wt.active)
  const [saving, setSaving] = useState(false)

  const dirty = name !== wt.name || description !== (wt.description || '') || hasGas !== !!wt.has_gas_table || active !== !!wt.active

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await api.put(`/admin/permit-work-types/${wt.id}`, { name: name.trim(), description, has_gas_table: hasGas, active, sort_order: wt.sort_order })
      onChange(); toast.success('Work type updated')
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Failed') } finally { setSaving(false) }
  }
  async function remove() {
    if (!confirm(`Delete work type "${wt.name}" and all its precautions?`)) return
    try { await api.delete(`/admin/permit-work-types/${wt.id}`); toast.success('Deleted'); onDeleted() }
    catch (e: any) { toast.error(e.response?.data?.detail || 'Failed') }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">Work Type Settings</h4>
        <span className="text-[11px] font-mono text-gray-400">{wt.code}</span>
      </div>
      <div>
        <label className="label">Name</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">Description (optional)</label>
        <textarea rows={2} className="input resize-none" value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={hasGas} onChange={e => setHasGas(e.target.checked)} />
          Show gas-test table
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={active} onChange={e => setActive(e.target.checked)} />
          Active (shown on form)
        </label>
        <div className="ml-auto flex items-center gap-2">
          {isSuperAdmin && <button onClick={remove} className="btn-ghost btn-sm text-gray-400 hover:text-red-500" title="Delete work type"><Trash2 className="w-4 h-4" /></button>}
          <button onClick={save} disabled={!dirty || saving} className="btn-primary btn-sm disabled:opacity-40">
            {saving ? <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> : <Save className="w-3.5 h-3.5" />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

function PrecautionEditor({ workTypeId, onChange }: { workTypeId: number; onChange: () => void }) {
  const qc = useQueryClient()
  const { data: rows = [] } = useQuery<any[]>({ queryKey: ['permit-precautions', workTypeId], queryFn: () => api.get('/admin/permit-precautions', { params: { work_type_id: workTypeId } }).then(r => r.data) })
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['permit-precautions', workTypeId] }); onChange() }

  // Local ordering for drag-and-drop (kept in sync with the server list)
  const [items, setItems] = useState<any[]>([])
  useEffect(() => { setItems(rows) }, [rows])
  const dragFrom = useRef<number | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  async function persistOrder(next: any[]) {
    setItems(next)
    try {
      await api.post('/admin/permit-precautions/reorder', { ids: next.map(r => r.id) })
      invalidate()
    } catch (e: any) { toast.error('Failed to save order'); setItems(rows) }
  }
  function handleDrop(to: number) {
    const from = dragFrom.current
    dragFrom.current = null; setOverIndex(null); setDragId(null)
    if (from == null || from === to) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    persistOrder(next)
  }

  const [nLabel, setNLabel] = useState('')
  const [nSection, setNSection] = useState('Precautions Taken')
  const [nType, setNType] = useState('checkbox')
  const [adding, setAdding] = useState(false)

  async function add() {
    if (!nLabel.trim()) return
    setAdding(true)
    try {
      await api.post('/admin/permit-precautions', { work_type_id: workTypeId, label: nLabel.trim(), section: nSection.trim() || null, input_type: nType, sort_order: items.length })
      setNLabel(''); invalidate(); toast.success('Precaution added')
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Failed') } finally { setAdding(false) }
  }

  return (
    <div className="card p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">Precautions ({items.length}) <span className="text-xs font-normal text-gray-400">— drag the handle to reorder</span></h4>

      <div className="space-y-1.5">
        {items.map((pr, i) => (
          <div key={pr.id}
            draggable={dragId === pr.id}
            onDragStart={() => { dragFrom.current = i }}
            onDragOver={e => { e.preventDefault(); if (overIndex !== i) setOverIndex(i) }}
            onDrop={() => handleDrop(i)}
            onDragEnd={() => { dragFrom.current = null; setOverIndex(null); setDragId(null) }}
            className={`rounded-lg transition-shadow ${overIndex === i && dragFrom.current !== null && dragFrom.current !== i ? 'ring-2 ring-indigo-300' : ''} ${dragId === pr.id ? 'opacity-60' : ''}`}
          >
            <PrecautionRow pr={pr} onChange={invalidate}
              gripProps={{ onMouseDown: () => setDragId(pr.id), onMouseUp: () => setDragId(null) }} />
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-gray-400 py-2">No precautions yet — add one below.</p>}
      </div>

      {/* Add row */}
      <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-[1fr_160px_150px_auto] gap-2 items-end">
        <div>
          <label className="label">New precaution label</label>
          <input className="input !py-1.5 text-sm" value={nLabel} onChange={e => setNLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="e.g. Area barricaded" />
        </div>
        <div>
          <label className="label">Section</label>
          <input className="input !py-1.5 text-sm" value={nSection} onChange={e => setNSection(e.target.value)} placeholder="Section heading" />
        </div>
        <div>
          <label className="label">Input type</label>
          <select className="select !py-1.5 text-sm" value={nType} onChange={e => setNType(e.target.value)}>
            {INPUT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <button onClick={add} disabled={adding || !nLabel.trim()} className="btn-primary btn-sm disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Add</button>
      </div>
    </div>
  )
}

function PrecautionRow({ pr, onChange, gripProps }: { pr: any; onChange: () => void; gripProps?: any }) {
  const [label, setLabel] = useState(pr.label)
  const [section, setSection] = useState(pr.section || '')
  const [type, setType] = useState(pr.input_type)
  const [busy, setBusy] = useState(false)
  const dirty = label !== pr.label || section !== (pr.section || '') || type !== pr.input_type

  async function save() {
    if (!label.trim()) return
    setBusy(true)
    try { await api.put(`/admin/permit-precautions/${pr.id}`, { work_type_id: pr.work_type_id, label: label.trim(), section: section.trim() || null, input_type: type, sort_order: pr.sort_order }); onChange() }
    catch (e: any) { toast.error(e.response?.data?.detail || 'Failed') } finally { setBusy(false) }
  }
  async function remove() {
    try { await api.delete(`/admin/permit-precautions/${pr.id}`); onChange() }
    catch (e: any) { toast.error(e.response?.data?.detail || 'Failed') }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px_140px_auto] gap-2 items-center bg-gray-50/60 rounded-lg px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <span {...gripProps} title="Drag to reorder" className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0 select-none"><GripVertical className="w-3.5 h-3.5" /></span>
        <span className="text-gray-400"><TypeIcon t={type} /></span>
        <input className="input !py-1 text-sm flex-1 !bg-white" value={label} onChange={e => setLabel(e.target.value)} />
      </div>
      <input className="input !py-1 text-sm !bg-white" value={section} onChange={e => setSection(e.target.value)} placeholder="Section" />
      <select className="select !py-1 text-sm !bg-white" value={type} onChange={e => setType(e.target.value)}>
        {INPUT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <div className="flex items-center gap-1 justify-end">
        {dirty && <button onClick={save} disabled={busy} className="btn-primary btn-sm !px-2" title="Save">{busy ? <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> : <Save className="w-3.5 h-3.5" />}</button>}
        <button onClick={remove} className="btn-ghost btn-sm !p-1.5 text-gray-400 hover:text-red-500" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  )
}
