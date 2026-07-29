import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, ArrowLeft, AlertTriangle, GraduationCap, Users, ClipboardCheck, UserPlus, HardHat, Briefcase } from 'lucide-react'
import { toast } from 'sonner'
import api from '../../lib/api'
import { MultiSelectFilter, type MSOption } from '../../components/MultiSelectFilter'

const STABLE = { staleTime: 5 * 60 * 1000 } as const

interface ParticipantEntry {
  user_id: number
  name: string
  role?: string
  category: 'Employee' | 'Contractor'
}

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
      <div className="section-card-header">
        {icon && <span className="text-indigo-500">{icon}</span>}
        <h2>{title}</h2>
      </div>
      <div className="section-card-body">{children}</div>
    </div>
  )
}

export default function TrainingForm() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isSavingRef = useRef(false)
  const formLoadedRef = useRef(false)

  const [form, setForm] = useState<any>({
    training_topic: '',
    training_date: new Date().toISOString().slice(0, 10),
    time_from: '',
    time_to: '',
    trainer_user_id: '',
    trainer_name: '',
    trainer_title: '',
    project_ids: [] as number[],
    department: '',
    training_type: '',
    training_content: '',
    assessment_applicable: false,
    assessment_method: '',
  })
  const [employeeIds, setEmployeeIds] = useState<number[]>([])
  const [contractorIds, setContractorIds] = useState<number[]>([])
  const [trainerExternal, setTrainerExternal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => api.get('/projects/').then(r => r.data), ...STABLE })
  const { data: trainers } = useQuery({ queryKey: ['trainers'], queryFn: () => api.get('/trainings/trainers').then(r => r.data), ...STABLE })
  const { data: options } = useQuery({ queryKey: ['training-options'], queryFn: () => api.get('/trainings/options').then(r => r.data), ...STABLE })

  // Participant pools — scoped to the selected projects
  const projParam = form.project_ids
  const poolEnabled = projParam.length > 0
  const { data: employeePool } = useQuery({
    queryKey: ['participants', 'Employee', projParam],
    queryFn: () => api.get('/trainings/participants', { params: { project_id: projParam, category: 'Employee' } }).then(r => r.data),
    enabled: poolEnabled, staleTime: 30_000,
  })
  const { data: contractorPool } = useQuery({
    queryKey: ['participants', 'Contractor', projParam],
    queryFn: () => api.get('/trainings/participants', { params: { project_id: projParam, category: 'Contractor' } }).then(r => r.data),
    enabled: poolEnabled, staleTime: 30_000,
  })

  const { data: existing } = useQuery({
    queryKey: ['training', id],
    queryFn: () => api.get(`/trainings/${id}`).then(r => r.data),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existing && !formLoadedRef.current) {
      formLoadedRef.current = true
      setForm({
        training_topic: existing.training_topic || '',
        training_date: existing.training_date || '',
        time_from: existing.time_from || '',
        time_to: existing.time_to || '',
        trainer_user_id: existing.trainer_user_id?.toString() || '',
        trainer_name: existing.trainer_user_id ? '' : (existing.trainer_name || ''),
        trainer_title: existing.trainer_title || '',
        project_ids: existing.project_ids?.length ? existing.project_ids : (existing.project_id ? [existing.project_id] : []),
        department: existing.department || '',
        training_type: existing.training_type || '',
        training_content: existing.training_content || '',
        assessment_applicable: !!existing.assessment_applicable,
        assessment_method: existing.assessment_method || '',
      })
      setTrainerExternal(!existing.trainer_user_id && !!existing.trainer_name)
      const parts: any[] = existing.participants || []
      setEmployeeIds(parts.filter(p => p.category === 'Employee' && p.user_id).map(p => p.user_id))
      setContractorIds(parts.filter(p => p.category === 'Contractor' && p.user_id).map(p => p.user_id))
    }
  }, [existing])

  const employeeOptions: MSOption[] = useMemo(
    () => (employeePool || []).map((u: any) => ({ value: u.id, label: `${u.name} · ${u.role}` })),
    [employeePool],
  )
  const contractorOptions: MSOption[] = useMemo(
    () => (contractorPool || []).map((u: any) => ({ value: u.id, label: [u.name, u.role].filter(Boolean).join(' · ') })),
    [contractorPool],
  )

  const totalParticipants = employeeIds.length + contractorIds.length

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isSavingRef.current) return

    if (!form.training_topic.trim()) { setError('Training Topic is required'); return }
    const missing: string[] = []
    if (!form.training_date) missing.push('Date')
    if (trainerExternal ? !form.trainer_name.trim() : !form.trainer_user_id) missing.push('Trainer')
    if (!form.training_type) missing.push('Type of Training')
    if (missing.length) { setError(`Please fill in: ${missing.join(', ')}`); return }

    isSavingRef.current = true
    setSaving(true)
    setError('')

    // Build participant entries from the two pools (preserve role for tracking)
    const empMap = new Map<number, any>((employeePool || []).map((u: any) => [u.id, u]))
    const conMap = new Map<number, any>((contractorPool || []).map((u: any) => [u.id, u]))
    const participants: ParticipantEntry[] = [
      ...employeeIds.map(uid => {
        const u = empMap.get(uid)
        return { user_id: uid, name: u?.name || `User ${uid}`, role: u?.role, category: 'Employee' as const }
      }),
      ...contractorIds.map(uid => {
        const u = conMap.get(uid)
        return { user_id: uid, name: u?.name || `User ${uid}`, role: u?.role, category: 'Contractor' as const }
      }),
    ]

    const payload = {
      training_topic: form.training_topic.trim(),
      training_date: form.training_date || null,
      time_from: form.time_from || null,
      time_to: form.time_to || null,
      trainer_user_id: trainerExternal ? null : (form.trainer_user_id ? Number(form.trainer_user_id) : null),
      trainer_name: trainerExternal ? (form.trainer_name.trim() || null) : null,
      trainer_title: form.trainer_title.trim() || null,
      project_ids: form.project_ids,
      project_id: form.project_ids[0] ?? null,
      department: form.department.trim() || null,
      training_type: form.training_type || null,
      training_content: form.training_content.trim() || null,
      assessment_applicable: !!form.assessment_applicable,
      assessment_method: form.assessment_applicable ? (form.assessment_method || null) : null,
      participants,
    }

    try {
      if (isEdit) {
        await api.put(`/trainings/${existing?.id}`, payload)
      } else {
        await api.post('/trainings/', payload)
      }
      qc.invalidateQueries({ queryKey: ['trainings'] })
      qc.invalidateQueries({ queryKey: ['training-stats'] })
      if (isEdit) qc.invalidateQueries({ queryKey: ['training', id] })
      toast.success(isEdit ? 'Training updated successfully' : 'Training recorded successfully')
      navigate('/trainings')
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to save training'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
      isSavingRef.current = false
    }
  }

  const G3 = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/trainings')} className="btn-ghost btn-sm !p-1.5 flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Training' : 'New Training'}</h1>
            <p className="text-xs text-gray-400 mt-0.5">Record a safety / SHE training session</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate('/trainings')} className="btn-secondary btn-sm flex-1 sm:flex-none justify-center">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary btn-sm flex-1 sm:flex-none justify-center">
            {saving
              ? <><span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> Saving…</>
              : <><Save className="w-3.5 h-3.5" /> {isEdit ? 'Update' : 'Save'}</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Session Details ── */}
      <SectionCard title="Session Details" icon={<GraduationCap className="w-3.5 h-3.5" />}>
        <div className={G3}>
          <div className="lg:col-span-2">
            <Field label="Training Topic" required>
              <input className="input" placeholder="e.g. Working at Height — Safe Practices" value={form.training_topic} onChange={e => set('training_topic', e.target.value)} />
            </Field>
          </div>
          <Field label="Type of Training" required>
            <select className="select" value={form.training_type} onChange={e => set('training_type', e.target.value)}>
              <option value="">Select type…</option>
              {(options?.training_types || ['Technical', 'Refresher', 'Post-Incident', 'Corrective']).map((t: string) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <div>
            <label className="label">Date<span className="text-red-500 ml-0.5">*</span></label>
            <input type="date" className="input" value={form.training_date} onChange={e => set('training_date', e.target.value)} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="label">Time From</label>
              <input type="time" className="input" value={form.time_from} onChange={e => set('time_from', e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="label">Time To</label>
              <input type="time" className="input" value={form.time_to} onChange={e => set('time_to', e.target.value)} />
            </div>
          </div>
          <Field label="Department">
            <input className="input" placeholder="e.g. Civil, Electrical, EHS" value={form.department} onChange={e => set('department', e.target.value)} />
          </Field>
          <div className="lg:col-span-3">
            <Field label="Project(s)" hint="Select one or more projects. The participant lists below are scoped to these projects.">
              <MultiSelectFilter
                size="md"
                options={(projects || []).map((p: any) => ({ value: p.id, label: p.name }))}
                value={form.project_ids}
                onChange={sel => {
                  set('project_ids', sel as number[])
                  // drop any picked participants no longer in scope is handled naturally on save via pool maps
                }}
                placeholder="Select project(s)…"
                className="w-full"
              />
            </Field>
          </div>
        </div>
      </SectionCard>

      {/* ── Trainer ── */}
      <SectionCard title="Trainer" icon={<UserPlus className="w-3.5 h-3.5" />}>
        <div className={G3}>
          {trainerExternal ? (
            <Field label="Trainer Name (External)" required>
              <input className="input" placeholder="Type external trainer name" value={form.trainer_name} onChange={e => set('trainer_name', e.target.value)} />
            </Field>
          ) : (
            <Field label="Trainer" required>
              <select className="select" value={form.trainer_user_id} onChange={e => set('trainer_user_id', e.target.value)}>
                <option value="">Select trainer…</option>
                {(trainers || []).map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </Field>
          )}
          <Field label="Trainer Title / Designation">
            <input className="input" placeholder="e.g. Safety Officer" value={form.trainer_title} onChange={e => set('trainer_title', e.target.value)} />
          </Field>
          <div className="flex items-end pb-1">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-indigo-600"
                checked={trainerExternal}
                onChange={e => {
                  setTrainerExternal(e.target.checked)
                  if (e.target.checked) set('trainer_user_id', '')
                  else set('trainer_name', '')
                }}
              />
              <span className="text-sm text-gray-700">External / outside trainer (not a system user)</span>
            </label>
          </div>
        </div>
      </SectionCard>

      {/* ── Participants ── */}
      <SectionCard title="Participants" icon={<Users className="w-3.5 h-3.5" />}>
        {!poolEnabled ? (
          <div className="text-sm text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
            Select one or more <span className="font-medium text-gray-500">projects</span> above to load participants.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="label flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5 text-indigo-500" /> Employees</label>
              <MultiSelectFilter
                size="md"
                options={employeeOptions}
                value={employeeIds}
                onChange={sel => setEmployeeIds(sel as number[])}
                placeholder={employeeOptions.length ? 'Search & select employees…' : 'No employees on selected project(s)'}
                className="w-full"
              />
              <p className="text-xs text-gray-400 mt-1">{employeeIds.length} selected</p>
            </div>
            <div>
              <label className="label flex items-center gap-1.5"><HardHat className="w-3.5 h-3.5 text-amber-500" /> Contractors</label>
              <MultiSelectFilter
                size="md"
                options={contractorOptions}
                value={contractorIds}
                onChange={sel => setContractorIds(sel as number[])}
                placeholder={contractorOptions.length ? 'Search & select contractors…' : 'No contractors on selected project(s)'}
                className="w-full"
              />
              <p className="text-xs text-gray-400 mt-1">{contractorIds.length} selected</p>
            </div>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-3">Total participants: <span className="font-semibold text-gray-700">{totalParticipants}</span></p>
      </SectionCard>

      {/* ── Content & Assessment ── */}
      <SectionCard title="Content & Assessment" icon={<ClipboardCheck className="w-3.5 h-3.5" />}>
        <div className="space-y-4">
          <Field label="Training Content">
            <textarea rows={3} className="input resize-none" placeholder="Summary of topics covered, materials used, key takeaways…" value={form.training_content} onChange={e => set('training_content', e.target.value)} />
          </Field>

          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3.5 bg-gray-50/60">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-indigo-600"
                checked={form.assessment_applicable}
                onChange={e => set('assessment_applicable', e.target.checked)}
              />
              <span className="text-sm font-medium text-gray-800">Assessment conducted for this training</span>
            </label>
            {form.assessment_applicable && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6">
                <Field label="Assessment Method">
                  <select className="select" value={form.assessment_method} onChange={e => set('assessment_method', e.target.value)}>
                    <option value="">Select method…</option>
                    {(options?.assessment_methods || ['Written Quiz', 'Practical', 'Verbal Review', 'Attendance Only']).map((m: string) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <div className="flex items-end pb-1">
                  <p className="text-xs text-gray-500">
                    Participants start as <span className="font-medium">Pending</span>. Track pass/fail per participant in the
                    <span className="font-medium text-indigo-600"> Assessment</span> tab after saving.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Bottom actions */}
      <div className="flex items-center justify-end gap-3 pb-4 flex-wrap">
        <button type="button" onClick={() => navigate('/trainings')} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary px-6">
          {saving
            ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Saving…</>
            : <><Save className="w-4 h-4" /> {isEdit ? 'Update Training' : 'Save Training'}</>}
        </button>
      </div>
    </form>
  )
}
