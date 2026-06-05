import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Save, X, ChevronDown, ChevronRight } from 'lucide-react'
import api from '../../lib/api'
import { useAuth } from '../../store/authStore'

// ─── Generic inline-editable list ────────────────────────────────────────────
function EditableList({
  title, items, onAdd, onEdit, onDelete, loading, canDelete,
}: {
  title: string
  items: { id: number; name: string; sub?: string }[]
  onAdd: (name: string) => Promise<void>
  onEdit: (id: number, name: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
  loading?: boolean
  canDelete?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)

  async function doAdd() {
    if (!newName.trim()) return
    setBusy(true)
    await onAdd(newName.trim())
    setNewName(''); setAdding(false); setBusy(false)
  }
  async function doEdit(id: number) {
    if (!editName.trim()) return
    setBusy(true)
    await onEdit(id, editName.trim())
    setEditId(null); setBusy(false)
  }
  async function doDelete(id: number) {
    if (!confirm('Delete this entry?')) return
    await onDelete(id)
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
        <button onClick={() => { setAdding(true); setNewName('') }}
          className="text-indigo-600 hover:text-indigo-800 p-0.5 rounded transition-colors">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {adding && (
        <div className="flex gap-1 mb-2">
          <input autoFocus className="input text-xs py-1 px-2 flex-1"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doAdd(); if (e.key === 'Escape') setAdding(false) }}
            placeholder="Enter name..." />
          <button onClick={doAdd} disabled={busy} className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors">
            <Save className="w-3 h-3" />
          </button>
          <button onClick={() => setAdding(false)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="space-y-0.5 overflow-y-auto thin-scroll flex-1 min-h-0">
        {loading && <p className="text-xs text-gray-400 py-2 text-center">Loading...</p>}
        {!loading && items.length === 0 && <p className="text-xs text-gray-400 py-4 text-center italic">No entries</p>}
        {items.map((item, idx) => (
          <div key={item.id} className="group flex items-start gap-1 px-1.5 py-1 rounded hover:bg-gray-50 transition-colors">
            <span className="text-xs text-gray-300 w-4 flex-shrink-0 pt-0.5 select-none">{idx + 1}.</span>
            {editId === item.id ? (
              <div className="flex gap-1 flex-1">
                <input autoFocus className="input text-xs py-0.5 px-1.5 flex-1"
                  value={editName} onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doEdit(item.id); if (e.key === 'Escape') setEditId(null) }} />
                <button onClick={() => doEdit(item.id)} className="p-1 bg-green-600 text-white rounded hover:bg-green-700">
                  <Save className="w-3 h-3" />
                </button>
                <button onClick={() => setEditId(null)} className="p-1 text-gray-500 hover:bg-gray-100 rounded">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <>
                <span className="text-xs text-gray-800 flex-1 leading-relaxed">{item.name}</span>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => { setEditId(item.id); setEditName(item.name) }}
                    className="p-0.5 text-gray-400 hover:text-indigo-600 rounded transition-colors">
                    <Edit2 className="w-3 h-3" />
                  </button>
                  {canDelete && (
                    <button onClick={() => doDelete(item.id)}
                      className="p-0.5 text-gray-400 hover:text-red-600 rounded transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Hierarchical list (e.g. Core Concern → Specific Concerns) ────────────────
function HierarchicalList({
  title, parents, children, parentField, onAddParent, onEditParent, onDeleteParent,
  onAddChild, onEditChild, onDeleteChild, loadingParents, canDelete,
}: {
  title: string
  parents: { id: number; name: string }[]
  children: { id: number; name: string; [key: string]: any }[]
  parentField: string
  onAddParent: (name: string) => Promise<void>
  onEditParent: (id: number, name: string) => Promise<void>
  onDeleteParent: (id: number) => Promise<void>
  onAddChild: (parentId: number, name: string) => Promise<void>
  onEditChild: (id: number, name: string, parentId: number) => Promise<void>
  onDeleteChild: (id: number) => Promise<void>
  loadingParents?: boolean
  canDelete?: boolean
}) {
  // empty = all collapsed; add id to expand it
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [addingParent, setAddingParent] = useState(false)
  const [addingChildFor, setAddingChildFor] = useState<number | null>(null)
  const [newParentName, setNewParentName] = useState('')
  const [newChildName, setNewChildName] = useState('')
  const [editParentId, setEditParentId] = useState<number | null>(null)
  const [editParentName, setEditParentName] = useState('')
  const [editChildId, setEditChildId] = useState<number | null>(null)
  const [editChildName, setEditChildName] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [busy, setBusy] = useState(false)

  void busy // Intentionally unused, but setBusy is used in handlers

  const toggle = (id: number) => setExpanded(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const childrenFor = (parentId: number) => children.filter(c => c[parentField] === parentId)

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
        <button onClick={() => { setAddingParent(true); setNewParentName('') }}
          className="text-indigo-600 hover:text-indigo-800 p-0.5 rounded transition-colors">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {addingParent && (
        <div className="flex gap-1 mb-2 flex-shrink-0">
          <input autoFocus className="input text-xs py-1 px-2 flex-1" value={newParentName}
            onChange={e => setNewParentName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { setBusy(true); onAddParent(newParentName.trim()).then(() => { setAddingParent(false); setBusy(false) }) }
              if (e.key === 'Escape') setAddingParent(false)
            }}
            placeholder="New group name..." />
          <button onClick={() => { setBusy(true); onAddParent(newParentName.trim()).then(() => { setAddingParent(false); setBusy(false) }) }}
            className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"><Save className="w-3 h-3" /></button>
          <button onClick={() => setAddingParent(false)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"><X className="w-3 h-3" /></button>
        </div>
      )}

      <div className="overflow-y-auto thin-scroll flex-1 min-h-0 space-y-1">
        {loadingParents && <p className="text-xs text-gray-400 py-2 text-center">Loading...</p>}
        {parents.map(parent => (
          <div key={parent.id} className="border border-gray-100 rounded-lg overflow-hidden">
            {/* Parent row */}
            <div className="group flex items-center gap-1 px-2 py-1.5 bg-gray-50 hover:bg-gray-100 transition-colors">
              <button onClick={() => toggle(parent.id)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                {expanded.has(parent.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>

              {editParentId === parent.id ? (
                <div className="flex gap-1 flex-1">
                  <input autoFocus className="input text-xs py-0.5 px-1.5 flex-1"
                    value={editParentName} onChange={e => setEditParentName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { setBusy(true); onEditParent(parent.id, editParentName).then(() => { setEditParentId(null); setBusy(false) }) }
                      if (e.key === 'Escape') setEditParentId(null)
                    }} />
                  <button onClick={() => { setBusy(true); onEditParent(parent.id, editParentName).then(() => { setEditParentId(null); setBusy(false) }) }}
                    className="p-1 bg-green-600 text-white rounded"><Save className="w-3 h-3" /></button>
                  <button onClick={() => setEditParentId(null)} className="p-1 text-gray-500 hover:bg-gray-100 rounded"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <>
                  <span className="text-xs font-semibold text-gray-800 flex-1">{parent.name}</span>
                  <span className="text-xs text-gray-400 mr-1">{childrenFor(parent.id).length}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setAddingChildFor(parent.id); setNewChildName('') }}
                      className="p-0.5 text-indigo-400 hover:text-indigo-600 rounded"><Plus className="w-3 h-3" /></button>
                    <button onClick={() => { setEditParentId(parent.id); setEditParentName(parent.name) }}
                      className="p-0.5 text-gray-400 hover:text-indigo-600 rounded"><Edit2 className="w-3 h-3" /></button>
                    {canDelete && (
                      <button onClick={() => onDeleteParent(parent.id)}
                        className="p-0.5 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-3 h-3" /></button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Children */}
            {expanded.has(parent.id) && (
              <div className="px-2 py-1 space-y-0.5">
                {addingChildFor === parent.id && (
                  <div className="flex gap-1 py-1">
                    <input autoFocus className="input text-xs py-0.5 px-2 flex-1" value={newChildName}
                      onChange={e => setNewChildName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { setBusy(true); onAddChild(parent.id, newChildName.trim()).then(() => { setAddingChildFor(null); setBusy(false) }) }
                        if (e.key === 'Escape') setAddingChildFor(null)
                      }}
                      placeholder="New item..." />
                    <button onClick={() => { setBusy(true); onAddChild(parent.id, newChildName.trim()).then(() => { setAddingChildFor(null); setBusy(false) }) }}
                      className="p-1 bg-indigo-600 text-white rounded"><Save className="w-3 h-3" /></button>
                    <button onClick={() => setAddingChildFor(null)} className="p-1 text-gray-500 hover:bg-gray-100 rounded"><X className="w-3 h-3" /></button>
                  </div>
                )}
                {childrenFor(parent.id).map((child, idx) => (
                  <div key={child.id} className="group flex items-start gap-1 pl-3 py-0.5 rounded hover:bg-gray-50 transition-colors">
                    <span className="text-xs text-gray-300 w-4 flex-shrink-0 pt-0.5 select-none">{idx + 1}.</span>
                    {editChildId === child.id ? (
                      <div className="flex gap-1 flex-1">
                        <input autoFocus className="input text-xs py-0.5 px-1.5 flex-1"
                          value={editChildName} onChange={e => setEditChildName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { setBusy(true); onEditChild(child.id, editChildName, parent.id).then(() => { setEditChildId(null); setBusy(false) }) }
                            if (e.key === 'Escape') setEditChildId(null)
                          }} />
                        <button onClick={() => { setBusy(true); onEditChild(child.id, editChildName, parent.id).then(() => { setEditChildId(null); setBusy(false) }) }}
                          className="p-1 bg-green-600 text-white rounded"><Save className="w-3 h-3" /></button>
                        <button onClick={() => setEditChildId(null)} className="p-1 text-gray-500 hover:bg-gray-100 rounded"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <>
                        <span className="text-xs text-gray-700 flex-1 leading-relaxed">{child.name}</span>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button onClick={() => { setEditChildId(child.id); setEditChildName(child.name) }}
                            className="p-0.5 text-gray-400 hover:text-indigo-600 rounded"><Edit2 className="w-3 h-3" /></button>
                          {canDelete && (
                            <button onClick={() => onDeleteChild(child.id)}
                              className="p-0.5 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-3 h-3" /></button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {childrenFor(parent.id).length === 0 && !addingChildFor && (
                  <p className="text-xs text-gray-300 italic pl-3 py-1">No items — click + to add</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Safety Measures Tab ────────────────────────────────────────────────
export default function SafetyMeasuresTab() {
  const qc = useQueryClient()
  const { isSuperAdmin } = useAuth()
  const canDelete = isSuperAdmin()

  // Fetches
  const { data: coreConcerns = [], isLoading: loadingCC } = useQuery({ queryKey: ['core-concerns'], queryFn: () => api.get('/admin/core-concerns').then(r => r.data) })
  const { data: specificConcerns = [] } = useQuery({ queryKey: ['specific-concerns'], queryFn: () => api.get('/admin/specific-concerns').then(r => r.data) })
  const { data: outcomes = [], isLoading: loadingOut } = useQuery({ queryKey: ['possible-outcomes'], queryFn: () => api.get('/admin/possible-outcomes').then(r => r.data) })
  const { data: targetDates = [], isLoading: loadingTD } = useQuery({ queryKey: ['target-dates'], queryFn: () => api.get('/admin/target-dates').then(r => r.data) })
  const { data: violations = [], isLoading: loadingVio } = useQuery({ queryKey: ['violations'], queryFn: () => api.get('/admin/violations').then(r => r.data) })
  const { data: rootCats = [], isLoading: loadingRCC } = useQuery({ queryKey: ['root-cause-categories'], queryFn: () => api.get('/admin/root-cause-categories').then(r => r.data) })
  const { data: rootSpecifics = [] } = useQuery({ queryKey: ['root-cause-specifics'], queryFn: () => api.get('/admin/root-cause-specifics').then(r => r.data) })

  const inv = (keys: string[]) => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }))

  // Core Concerns CRUD
  const addCC = (name: string) => api.post('/admin/core-concerns', { name }).then(() => inv(['core-concerns']))
  const editCC = (id: number, name: string) => api.put(`/admin/core-concerns/${id}`, { name }).then(() => inv(['core-concerns']))
  const deleteCC = (id: number) => api.delete(`/admin/core-concerns/${id}`).then(() => inv(['core-concerns', 'specific-concerns']))

  // Specific Concerns CRUD
  const addSC = (parentId: number, name: string) => api.post('/admin/specific-concerns', { name, core_concern_id: parentId }).then(() => inv(['specific-concerns']))
  const editSC = (id: number, name: string, parentId: number) => api.put(`/admin/specific-concerns/${id}`, { name, core_concern_id: parentId }).then(() => inv(['specific-concerns']))
  const deleteSC = (id: number) => api.delete(`/admin/specific-concerns/${id}`).then(() => inv(['specific-concerns']))

  // Possible Outcomes CRUD
  const addOut = (name: string) => api.post('/admin/possible-outcomes', { name }).then(() => inv(['possible-outcomes']))
  const editOut = (id: number, name: string) => api.put(`/admin/possible-outcomes/${id}`, { name }).then(() => inv(['possible-outcomes']))
  const deleteOut = (id: number) => api.delete(`/admin/possible-outcomes/${id}`).then(() => inv(['possible-outcomes']))

  // Target Dates CRUD
  const addTD = (name: string) => api.post('/admin/target-dates', { name }).then(() => inv(['target-dates']))
  const editTD = (id: number, name: string) => api.put(`/admin/target-dates/${id}`, { name }).then(() => inv(['target-dates']))
  const deleteTD = (id: number) => api.delete(`/admin/target-dates/${id}`).then(() => inv(['target-dates']))

  // Violations CRUD
  const addVio = (name: string) => api.post('/admin/violations', { name }).then(() => inv(['violations']))
  const editVio = (id: number, name: string) => api.put(`/admin/violations/${id}`, { name }).then(() => inv(['violations']))
  const deleteVio = (id: number) => api.delete(`/admin/violations/${id}`).then(() => inv(['violations']))

  // Root Cause Categories CRUD
  const addRCC = (name: string) => api.post('/admin/root-cause-categories', { name }).then(() => inv(['root-cause-categories']))
  const editRCC = (id: number, name: string) => api.put(`/admin/root-cause-categories/${id}`, { name }).then(() => inv(['root-cause-categories']))
  const deleteRCC = (id: number) => api.delete(`/admin/root-cause-categories/${id}`).then(() => inv(['root-cause-categories', 'root-cause-specifics']))

  // Root Cause Specifics CRUD
  const addRCS = (parentId: number, name: string) => api.post('/admin/root-cause-specifics', { name, root_cause_category_id: parentId }).then(() => inv(['root-cause-specifics']))
  const editRCS = (id: number, name: string, parentId: number) => api.put(`/admin/root-cause-specifics/${id}`, { name, root_cause_category_id: parentId }).then(() => inv(['root-cause-specifics']))
  const deleteRCS = (id: number) => api.delete(`/admin/root-cause-specifics/${id}`).then(() => inv(['root-cause-specifics']))

  const COL = 'flex flex-col border-r border-gray-200 last:border-r-0 overflow-hidden h-full'
  const HDR = 'bg-indigo-900 text-white text-xs font-semibold px-3 py-2.5 text-center tracking-wide flex-shrink-0'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Safety Measures Reference Data</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Matches columns from the Safety Observation App data sheet · Hover any row to edit or delete
          </p>
        </div>
      </div>

      {/* Column legend matching Excel sheet */}
      <div className="card !p-0 overflow-x-auto border border-gray-200 rounded-xl">
        <div className="min-w-[700px]">
        {/* Header row matching Excel */}
        <div className="grid grid-cols-5 border-b border-indigo-800">
          <div className={HDR}>Core Concern<br /><span className="font-normal text-indigo-200 text-xs">→ Specific Concern</span></div>
          <div className={HDR}>Possible Outcome<br /><span className="font-normal text-indigo-200 text-xs">What may occur</span></div>
          <div className={HDR}>Target Date<br /><span className="font-normal text-indigo-200 text-xs">For rectification</span></div>
          <div className={HDR}>Violation Caused Due To</div>
          <div className={HDR}>Root Cause<br /><span className="font-normal text-indigo-200 text-xs">→ Specific Root Cause</span></div>
        </div>

        {/* Data columns */}
        <div className="grid grid-cols-5 divide-x divide-gray-200" style={{ height: '68vh' }}>
          {/* Col 1: Core Concern → Specific Concern */}
          <div className={`${COL} p-3`}>
            <HierarchicalList
              title={`Core Concerns (${coreConcerns.length})`}
              parents={coreConcerns}
              children={specificConcerns}
              parentField="core_concern_id"
              onAddParent={addCC}
              onEditParent={editCC}
              onDeleteParent={deleteCC}
              onAddChild={addSC}
              onEditChild={editSC}
              onDeleteChild={deleteSC}
              loadingParents={loadingCC}
              canDelete={canDelete}
            />
          </div>

          {/* Col 2: Possible Outcomes */}
          <div className={`${COL} p-3`}>
            <EditableList
              title={`Possible Outcomes (${outcomes.length})`}
              items={outcomes}
              onAdd={addOut}
              onEdit={editOut}
              onDelete={deleteOut}
              loading={loadingOut}
              canDelete={canDelete}
            />
          </div>

          {/* Col 3: Target Dates */}
          <div className={`${COL} p-3`}>
            <EditableList
              title={`Target Dates (${targetDates.length})`}
              items={targetDates}
              onAdd={addTD}
              onEdit={editTD}
              onDelete={deleteTD}
              loading={loadingTD}
              canDelete={canDelete}
            />
          </div>

          {/* Col 4: Violations */}
          <div className={`${COL} p-3`}>
            <EditableList
              title={`Violations (${violations.length})`}
              items={violations}
              onAdd={addVio}
              onEdit={editVio}
              onDelete={deleteVio}
              loading={loadingVio}
              canDelete={canDelete}
            />
          </div>

          {/* Col 5: Root Cause → Specific Root Cause */}
          <div className={`${COL} p-3`}>
            <HierarchicalList
              title={`Root Causes (${rootCats.length})`}
              parents={rootCats}
              children={rootSpecifics}
              parentField="root_cause_category_id"
              onAddParent={addRCC}
              onEditParent={editRCC}
              onDeleteParent={deleteRCC}
              onAddChild={addRCS}
              onEditChild={editRCS}
              onDeleteChild={deleteRCS}
              loadingParents={loadingRCC}
              canDelete={canDelete}
            />
          </div>
        </div>
        </div>{/* /min-w wrapper */}
      </div>

      {/* Count summary bar */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        {[
          { label: 'Core Concerns', count: coreConcerns.length, sub: `${specificConcerns.length} specific concerns` },
          { label: 'Possible Outcomes', count: outcomes.length },
          { label: 'Target Dates', count: targetDates.length },
          { label: 'Violations', count: violations.length },
          { label: 'Root Cause Categories', count: rootCats.length, sub: `${rootSpecifics.length} specifics` },
        ].map(({ label, count, sub }) => (
          <div key={label} className="flex items-center gap-1.5 bg-gray-100 px-3 py-1.5 rounded-full">
            <span className="font-semibold text-gray-700">{count}</span>
            <span>{label}</span>
            {sub && <span className="text-gray-400">({sub})</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
