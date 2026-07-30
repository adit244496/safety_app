import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, ArrowLeft, AlertTriangle, Send, FileText, ShieldAlert, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import api from '../../lib/api'
import { MultiSelectFilter, type MSOption } from '../../components/MultiSelectFilter'

const STABLE = { staleTime: 5 * 60 * 1000 } as const
const todayStr = () => new Date().toISOString().slice(0, 10)

interface Precaution { id: number; item_key: string; section: string | null; label: string; input_type: string; sort_order: number }
interface WorkType { id: number; code: string; name: string; description?: string; has_gas_table: boolean; precautions: Precaution[] }

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function SectionCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="section-card">
      <div className="section-card-header">{icon && <span className="text-indigo-500">{icon}</span>}<h2>{title}</h2></div>
      <div className="section-card-body">{children}</div>
    </div>
  )
}

const emptyGasRow = () => ({ time: '', o2: '', lel: '', pel: '', location: '', testedBy: '' })

export default function WorkPermitForm() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const savingRef = useRef(false)
  const loadedRef = useRef(false)

  const [form, setForm] = useState<any>(() => {
    const t = todayStr()
    return {
      project_id: '', other_permits: '',
      receiver_user_ids: [] as number[],
      issued_date: t,
      work_location: '', area: '', starts_at: `${t}T09:00`, expires_at: `${t}T18:00`, work_description: '',
      pre_job_discussion: false, pic_user_id: '', pso_user_id: '', eic_user_id: '',
    }
  })
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [answers, setAnswers] = useState<Record<string, any>>({})  // { [code]: { [item_key]: value, __gas: [] } }
  const [saving, setSaving] = useState<'' | 'draft' | 'submit'>('')
  const [error, setError] = useState('')

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  // Setting an approver also drops any "Issued To" receiver that is no longer one of the three
  const setApprover = (field: string, value: string) => setForm((f: any) => {
    const next = { ...f, [field]: value }
    const validIds = [next.pic_user_id, next.pso_user_id, next.eic_user_id].filter(Boolean).map(Number)
    return { ...next, receiver_user_ids: (f.receiver_user_ids || []).filter((idv: number) => validIds.includes(idv)) }
  })

  const { data: config } = useQuery<WorkType[]>({ queryKey: ['permit-config'], queryFn: () => api.get('/work-permits/config').then(r => r.data), ...STABLE })
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => api.get('/projects/').then(r => r.data), ...STABLE })
  const pid = form.project_id
  const { data: picUsers } = useQuery({ queryKey: ['approvers', 'PIC', pid], queryFn: () => api.get('/work-permits/approvers', { params: { role: 'PIC', project_id: pid || undefined } }).then(r => r.data), staleTime: 30_000 })
  const { data: psoUsers } = useQuery({ queryKey: ['approvers', 'PSO', pid], queryFn: () => api.get('/work-permits/approvers', { params: { role: 'PSO', project_id: pid || undefined } }).then(r => r.data), staleTime: 30_000 })
  const { data: eicUsers } = useQuery({ queryKey: ['approvers', 'EIC', pid], queryFn: () => api.get('/work-permits/approvers', { params: { role: 'EIC', project_id: pid || undefined } }).then(r => r.data), staleTime: 30_000 })
  const { data: buildings } = useQuery({ queryKey: ['permit-buildings', pid], queryFn: () => api.get('/admin/buildings', { params: { project_id: pid } }).then(r => r.data), enabled: !!pid, staleTime: 30_000 })
  const { data: existing } = useQuery({ queryKey: ['work-permit', id], queryFn: () => api.get(`/work-permits/${id}`).then(r => r.data), enabled: isEdit })

  // Receiver ("Issued To") is picked from the assigned PIC / PSO / EIC only
  const findUser = (users: any[] | undefined, uid: string) => (users || []).find((u: any) => u.id.toString() === uid?.toString())
  const receiverOptions: MSOption[] = useMemo(() => {
    const opts: MSOption[] = []
    const add = (u: any, role: string) => { if (u) opts.push({ value: u.id, label: `${u.name} · ${role}` }) }
    add(findUser(picUsers, form.pic_user_id), 'PIC')
    add(findUser(psoUsers, form.pso_user_id), 'PSO')
    add(findUser(eicUsers, form.eic_user_id), 'EIC')
    return opts
  }, [picUsers, psoUsers, eicUsers, form.pic_user_id, form.pso_user_id, form.eic_user_id])

  useEffect(() => {
    if (existing && !loadedRef.current) {
      loadedRef.current = true
      setForm({
        project_id: existing.project_id?.toString() || '', other_permits: existing.other_permits || '',
        receiver_user_ids: existing.receiver_user_ids || [],
        issued_date: existing.issued_date || '', work_location: existing.work_location || '', area: existing.area || '',
        starts_at: existing.starts_at || '', expires_at: existing.expires_at || '', work_description: existing.work_description || '',
        pre_job_discussion: !!existing.pre_job_discussion,
        pic_user_id: existing.pic_user_id?.toString() || '', pso_user_id: existing.pso_user_id?.toString() || '', eic_user_id: existing.eic_user_id?.toString() || '',
      })
      const cats: string[] = existing.hazard_categories || []
      setSelectedCats(cats)
      setExpanded(Object.fromEntries(cats.map(c => [c, true])))
      setAnswers(existing.precautions || {})
    }
  }, [existing])

  const byCode = useMemo(() => Object.fromEntries((config || []).map(w => [w.code, w])), [config])

  const toggleCat = (code: string) => {
    setSelectedCats(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
    setExpanded(e => ({ ...e, [code]: true }))
    setAnswers(a => a[code] ? a : { ...a, [code]: {} })
  }
  const getVal = (code: string, key: string) => answers[code]?.[key]
  const setVal = (code: string, key: string, val: any) => setAnswers(a => ({ ...a, [code]: { ...(a[code] || {}), [key]: val } }))
  const getGas = (code: string): any[] => answers[code]?.__gas || Array.from({ length: 5 }, emptyGasRow)
  const setGas = (code: string, rows: any[]) => setAnswers(a => ({ ...a, [code]: { ...(a[code] || {}), __gas: rows } }))

  async function save(submit: boolean) {
    if (savingRef.current) return
    if (!form.work_description.trim()) { setError('Description of work is required'); return }
    if (submit) {
      const missing: string[] = []
      if (!form.project_id) missing.push('Project')
      if (!form.pic_user_id) missing.push('PIC')
      if (!form.pso_user_id) missing.push('PSO')
      if (!form.eic_user_id) missing.push('EIC')
      if (!selectedCats.length) missing.push('at least one hazardous work type')
      if (missing.length) { setError(`To submit for approval, please provide: ${missing.join(', ')}`); return }
    }
    savingRef.current = true; setSaving(submit ? 'submit' : 'draft'); setError('')

    const prec: Record<string, any> = {}
    selectedCats.forEach(c => { prec[c] = answers[c] || {} })

    const payload = {
      project_id: form.project_id ? Number(form.project_id) : null,
      other_permits: form.other_permits.trim() || null,
      receiver_user_ids: form.receiver_user_ids,
      issued_date: form.issued_date || null,
      work_location: form.work_location.trim() || null,
      area: form.area.trim() || null,
      starts_at: form.starts_at || null, expires_at: form.expires_at || null,
      work_description: form.work_description.trim() || null,
      pre_job_discussion: !!form.pre_job_discussion,
      hazard_categories: selectedCats, precautions: prec,
      pic_user_id: form.pic_user_id ? Number(form.pic_user_id) : null,
      pso_user_id: form.pso_user_id ? Number(form.pso_user_id) : null,
      eic_user_id: form.eic_user_id ? Number(form.eic_user_id) : null,
      submit,
    }
    try {
      if (isEdit) await api.put(`/work-permits/${existing?.id}`, payload)
      else await api.post('/work-permits/', payload)
      qc.invalidateQueries({ queryKey: ['work-permits'] })
      if (isEdit) qc.invalidateQueries({ queryKey: ['work-permit', id] })
      toast.success(submit ? 'Permit submitted for approval' : 'Draft saved')
      navigate('/work-permits')
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to save permit'
      setError(msg); toast.error(msg)
    } finally { setSaving(''); savingRef.current = false }
  }

  const G3 = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/work-permits')} className="btn-ghost btn-sm !p-1.5"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Work Permit' : 'New Work Permit'}</h1>
            <p className="text-xs text-gray-400 mt-0.5">Construction Hazardous Work Permit (CHWP)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate('/work-permits')} className="btn-secondary btn-sm">Cancel</button>
          <button type="button" onClick={() => save(false)} disabled={!!saving} className="btn-secondary btn-sm">
            {saving === 'draft' ? <><span className="animate-spin w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full" /> Saving…</> : <><Save className="w-3.5 h-3.5" /> Save Draft</>}
          </button>
          <button type="button" onClick={() => save(true)} disabled={!!saving} className="btn-primary btn-sm">
            {saving === 'submit' ? <><span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> Submitting…</> : <><Send className="w-3.5 h-3.5" /> Submit for Approval</>}
          </button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}</div>}

      <SectionCard title="Permit Details" icon={<FileText className="w-3.5 h-3.5" />}>
        <div className={G3}>
          <Field label="Project" required>
            <select className="select" value={form.project_id} onChange={e => { const v = e.target.value; setForm((f: any) => ({ ...f, project_id: v, area: '', pic_user_id: '', pso_user_id: '', eic_user_id: '', receiver_user_ids: [] })) }}>
              <option value="">Select project…</option>
              {(projects || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Other Associated Permit(s)"><input className="input" value={form.other_permits} onChange={e => set('other_permits', e.target.value)} placeholder="Permit no(s)…" /></Field>
          <Field label="Issued Date"><input type="date" className="input" value={form.issued_date} onChange={e => set('issued_date', e.target.value)} /></Field>

          {/* Approvers — assigned here; all three are notified on submit, any one can approve/decline */}
          <Field label="PIC" required>
            <select className="select" value={form.pic_user_id} onChange={e => setApprover('pic_user_id', e.target.value)} disabled={!form.project_id}>
              <option value="">{form.project_id ? 'Select PIC…' : 'Select project first…'}</option>
              {(picUsers || []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="PSO" required>
            <select className="select" value={form.pso_user_id} onChange={e => setApprover('pso_user_id', e.target.value)} disabled={!form.project_id}>
              <option value="">{form.project_id ? 'Select PSO…' : 'Select project first…'}</option>
              {(psoUsers || []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="EIC" required>
            <select className="select" value={form.eic_user_id} onChange={e => setApprover('eic_user_id', e.target.value)} disabled={!form.project_id}>
              <option value="">{form.project_id ? 'Select EIC…' : 'Select project first…'}</option>
              {(eicUsers || []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>

          <Field label="Issued To — Name (Receiver)" hint="Choose from the assigned PIC / PSO / EIC above.">
            <MultiSelectFilter size="md"
              options={receiverOptions}
              value={form.receiver_user_ids}
              onChange={sel => set('receiver_user_ids', sel as number[])}
              placeholder={receiverOptions.length ? 'Select receiver(s)…' : 'Assign PIC / PSO / EIC first…'}
              className="w-full" disabled={!receiverOptions.length} />
          </Field>
          <Field label="Area">
            <select className="select" value={form.area} onChange={e => set('area', e.target.value)} disabled={!form.project_id}>
              <option value="">{form.project_id ? (buildings?.length ? 'Select area / building…' : 'No buildings for project') : 'Select project first…'}</option>
              {(buildings || []).map((b: any) => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="For Work In — Equipment / Location"><input className="input" value={form.work_location} onChange={e => set('work_location', e.target.value)} /></Field>
          <Field label="Starts At"><input type="datetime-local" className="input" value={form.starts_at} onChange={e => set('starts_at', e.target.value)} /></Field>
          <Field label="Expires At"><input type="datetime-local" className="input" value={form.expires_at} onChange={e => set('expires_at', e.target.value)} /></Field>
          <div className="lg:col-span-3">
            <Field label="Description of Work to be Done" required><textarea rows={2} className="input resize-none" value={form.work_description} onChange={e => set('work_description', e.target.value)} /></Field>
          </div>
          <div className="lg:col-span-3">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={form.pre_job_discussion} onChange={e => set('pre_job_discussion', e.target.checked)} />
              <span className="text-sm text-gray-700">Held pre-job discussion with personnel assigned for the task</span>
            </label>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Hazardous Work Types" icon={<ShieldAlert className="w-3.5 h-3.5" />}>
        <p className="text-xs text-gray-400 mb-3">Select each type of work that applies. The relevant precautions checklist expands for you to complete.</p>
        {!config ? <p className="text-sm text-gray-400">Loading work types…</p> : (
          <div className="space-y-2">
            {config.map((wt, i) => (
              <CategoryBlock key={wt.code} wt={wt} index={i + 1}
                selected={selectedCats.includes(wt.code)} expanded={!!expanded[wt.code]}
                onToggleSelect={() => toggleCat(wt.code)} onToggleExpand={() => setExpanded(e => ({ ...e, [wt.code]: !e[wt.code] }))}
                getVal={(k) => getVal(wt.code, k)} setVal={(k, v) => setVal(wt.code, k, v)}
                gas={getGas(wt.code)} setGas={(rows) => setGas(wt.code, rows)} />
            ))}
          </div>
        )}
      </SectionCard>

      <div className="flex items-center justify-end gap-3 pb-4 flex-wrap">
        <button type="button" onClick={() => navigate('/work-permits')} className="btn-secondary">Cancel</button>
        <button type="button" onClick={() => save(false)} disabled={!!saving} className="btn-secondary"><Save className="w-4 h-4" /> Save Draft</button>
        <button type="button" onClick={() => save(true)} disabled={!!saving} className="btn-primary px-6"><Send className="w-4 h-4" /> Submit for Approval</button>
      </div>
    </div>
  )
}

function YesNo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
      {['YES', 'NO'].map(v => (
        <button key={v} type="button" onClick={() => onChange(value === v ? '' : v)}
          className={`px-3 py-1 font-medium transition-colors ${value === v ? (v === 'YES' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white') : 'bg-white text-gray-500 hover:bg-gray-50'}`}>{v}</button>
      ))}
    </div>
  )
}

function CategoryBlock({ wt, index, selected, expanded, onToggleSelect, onToggleExpand, getVal, setVal, gas, setGas }: {
  wt: WorkType; index: number; selected: boolean; expanded: boolean
  onToggleSelect: () => void; onToggleExpand: () => void
  getVal: (k: string) => any; setVal: (k: string, v: any) => void
  gas: any[]; setGas: (rows: any[]) => void
}) {
  // group precautions by section, preserving order
  const groups: { section: string; items: Precaution[] }[] = []
  wt.precautions.forEach(pr => {
    const sec = pr.section || 'General'
    let g = groups.find(x => x.section === sec)
    if (!g) { g = { section: sec, items: [] }; groups.push(g) }
    g.items.push(pr)
  })

  return (
    <div className={`rounded-xl border ${selected ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200'}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <input type="checkbox" className="w-4 h-4 accent-indigo-600 flex-shrink-0" checked={selected} onChange={onToggleSelect} />
        <span className="text-xs font-semibold text-gray-400 flex-shrink-0 w-6">{index}.</span>
        <span className="text-sm text-gray-800 flex-1 cursor-pointer" onClick={onToggleSelect}>{wt.name}</span>
        {selected && (wt.precautions.length > 0 || wt.has_gas_table) && (
          <button type="button" onClick={onToggleExpand} className="btn-ghost btn-sm !p-1 text-gray-400 flex-shrink-0">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
      </div>

      {selected && expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-4">
          {groups.map(g => (
            <div key={g.section}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{g.section}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                {g.items.map(pr => {
                  if (pr.input_type === 'toggle') {
                    return (
                      <div key={pr.id} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-gray-700">{pr.label}</span>
                        <YesNo value={getVal(pr.item_key) || ''} onChange={v => setVal(pr.item_key, v)} />
                      </div>
                    )
                  }
                  if (pr.input_type === 'text') {
                    return (
                      <div key={pr.id}>
                        <label className="text-xs text-gray-500">{pr.label}</label>
                        <input className="input !py-1.5 text-sm mt-0.5" value={getVal(pr.item_key) || ''} onChange={e => setVal(pr.item_key, e.target.value)} />
                      </div>
                    )
                  }
                  return (
                    <label key={pr.id} className="inline-flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" className="w-3.5 h-3.5 accent-indigo-600 mt-0.5 flex-shrink-0" checked={!!getVal(pr.item_key)} onChange={e => setVal(pr.item_key, e.target.checked)} />
                      <span>{pr.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}

          {wt.has_gas_table && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Oxygen, Combustible & Toxic Gas Test Results</p>
              <p className="text-[11px] text-gray-400 mb-2">Safe limits: 19.5–22.0% O₂. Flammable gas 10% below LEL. Toxic gas below PEL. Record every 60 min.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-gray-200 rounded-lg">
                  <thead className="bg-gray-50 text-gray-500"><tr>{['Test', 'Time', 'O₂', 'LEL', 'PEL', 'Location', 'Tested By'].map(h => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                  <tbody>
                    {gas.map((row: any, i: number) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                        {['time', 'o2', 'lel', 'pel', 'location', 'testedBy'].map(fk => (
                          <td key={fk} className="px-1 py-1">
                            <input className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-indigo-400"
                              value={row[fk] || ''} onChange={e => setGas(gas.map((r: any, idx: number) => idx === i ? { ...r, [fk]: e.target.value } : r))} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
