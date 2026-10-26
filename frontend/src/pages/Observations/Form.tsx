import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Save, ArrowLeft, X, Camera, AlertTriangle, CheckCircle2, MapPin, ClipboardList, ShieldAlert, GitBranch, ImagePlus, FileEdit } from 'lucide-react'
import { toast } from 'sonner'
import api from '../../lib/api'
import { calcRisk, STATUSES, fmtDate } from '../../lib/utils'
import { useAuth } from '../../store/authStore'
import { MultiSelectFilter } from '../../components/MultiSelectFilter'

const DEFAULT_SEVERITY: Record<number, string> = {
  0: '0 – No Injury / Not Applicable',
  1: '1 – First Aid only',
  2: '2 – Medical Treatment, no lost time',
  3: '3 – Lost Time Accident',
  4: '4 – Serious Injury / hospitalisation',
  5: '5 – Fatality',
}
const DEFAULT_PROB: Record<number, string> = {
  0: '0 – Not Applicable',
  1: '1 – Very Unlikely',
  2: '2 – Unlikely',
  3: '3 – Possible',
  4: '4 – Likely',
  5: '5 – Almost Certain',
}
const RISK_LEVELS = [0, 1, 2, 3, 4, 5]

function prepareFloors(floors: any[]): any[] {
  // Drop ordinal names (e.g. "3rd") when the canonical "Floor N" already exists
  const numberedSet = new Set<number>()
  for (const f of floors) {
    const m = (f.name || '').toLowerCase().trim().match(/^floor\s+(\d+)$/)
    if (m) numberedSet.add(parseInt(m[1]))
  }
  const deduped = floors.filter(f => {
    const m = (f.name || '').toLowerCase().trim().match(/^(\d+)(st|nd|rd|th)$/)
    return !(m && numberedSet.has(parseInt(m[1])))
  })

  return [...deduped].sort((a, b) => {
    const rank = (name: string): [number, number] => {
      const s = (name || '').toLowerCase().trim()
      if (s.startsWith('basement'))  return [0, parseInt(s.replace(/\D/g, '')) || 0]
      if (s === 'terrace')           return [1, 0]
      if (s === 'ground' || s === 'ground floor' || s === 'gf') return [2, 0]
      if (s.startsWith('floor'))     return [3, parseInt(s.replace(/\D/g, '')) || 0]
      const m = s.match(/^(\d+)(st|nd|rd|th)$/)
      if (m)                         return [3, parseInt(m[1])]
      return [4, 0]
    }
    const [ra, na] = rank(a.name), [rb, nb] = rank(b.name)
    return ra !== rb ? ra - rb : na - nb
  })
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

export default function ObservationForm() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const fileRef         = useRef<HTMLInputElement>(null)
  const cameraRef       = useRef<HTMLInputElement>(null)
  const formRef         = useRef<HTMLFormElement>(null)
  const isSavingRef     = useRef(false)   // prevents double-tap double-submit on mobile
  const formLoadedRef   = useRef(false)   // prevent background-refetch from resetting user edits

  // Prevent select / input focus + change from scrolling the page.
  // Phase 1 (mousedown/touchstart): snapshot scroll before browser acts.
  // Phase 2 (focusin/change): restore it after browser's scrollIntoView runs.
  useEffect(() => {
    const form = formRef.current
    if (!form) return
    const scroller = document.querySelector('.main-scroll') as HTMLElement | null
    if (!scroller) return

    let saved = -1

    const save    = () => { saved = scroller.scrollTop }
    const restore = () => {
      if (saved < 0) return
      const top = saved
      requestAnimationFrame(() => {
        scroller.scrollTop = top
        // second frame as safety net for slow paints
        requestAnimationFrame(() => { scroller.scrollTop = top })
      })
    }

    // Also disable scrollIntoView on all selects inside the form.
    // Use MutationObserver to catch selects added after initial render.
    const noop = () => {}
    const patchSelects = (root: HTMLElement) => {
      root.querySelectorAll('select').forEach(el => {
        (el as any).__origSIV = (el as any).__origSIV ?? el.scrollIntoView.bind(el)
        el.scrollIntoView = noop
      })
    }
    patchSelects(form)

    const observer = new MutationObserver(() => patchSelects(form))
    observer.observe(form, { childList: true, subtree: true })

    form.addEventListener('mousedown',  save,    { passive: true })
    form.addEventListener('touchstart', save,    { passive: true })
    form.addEventListener('focusin',    restore, { passive: true })
    form.addEventListener('change',     restore, { passive: true })

    return () => {
      observer.disconnect()
      form.querySelectorAll('select').forEach(el => {
        if ((el as any).__origSIV) { el.scrollIntoView = (el as any).__origSIV; delete (el as any).__origSIV }
      })
      form.removeEventListener('mousedown',  save)
      form.removeEventListener('touchstart', save)
      form.removeEventListener('focusin',    restore)
      form.removeEventListener('change',     restore)
    }
  }, [])

  const now = new Date()
  const [form, setForm] = useState<any>({
    project_id: '', building_id: '', floor_id: '',
    exact_location: '',
    obs_time: now.toTimeString().slice(0, 5),          // auto HH:MM
    obs_date: now.toISOString().slice(0, 10),           // auto today
    contractor_user_ids: [] as number[], contractor_company: '', to_be_rectified_by: '', rectified_by_mobile: '', observer_name: user?.name || '',
    core_concern_id: '', specific_concern_id: '', specific_concern_text: '',
    possible_outcome: '', severity: '', probability: '',
    root_cause_category_id: '', root_cause_specific_id: '',
    violation_id: '', target_date_actual: '', eic_user_ids: [] as number[], status: 'Open',
  })
  const [pendingFiles,  setPendingFiles]  = useState<File[]>([])
  const [previewUrls,   setPreviewUrls]   = useState<string[]>([])
  const [saving,        setSaving]        = useState(false)
  const [savingDraft,   setSavingDraft]   = useState(false)
  const [error,         setError]         = useState('')

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  // staleTime prevents refetch-on-focus from causing layout shifts (scroll jumps)
  const STABLE = { staleTime: 5 * 60 * 1000 } as const

  // Target date auto-fill: the admin risk matrix gives the time to rectify (hours) for each
  // Severity × Probability; target = observation date & time + that time.
  const { data: targetMatrix = [] as any[] } = useQuery<any[]>({
    queryKey: ['target-matrix'],
    queryFn: () => api.get('/admin/target-matrix').then(r => r.data),
    ...STABLE,
  })
  const [targetAuto, setTargetAuto] = useState(false)   // current target date came from the matrix
  const matrixHours = (sev: any, prob: any): number | undefined =>
    targetMatrix.find((c: any) => c.severity === Number(sev) && c.probability === Number(prob))?.hours
  const fmtDuration = (h: number) => h % 24 === 0
    ? `${h / 24} day${h === 24 ? '' : 's'}`
    : `${h} hour${h === 1 ? '' : 's'}`
  const autoTarget = (f: any): string | null => {
    if (f.severity === '' || f.probability === '' || !f.obs_date || f.status === 'Positive Approach') return null
    const hours = matrixHours(f.severity, f.probability)
    if (hours === undefined) return null
    const [y, m, d] = f.obs_date.split('-').map(Number)
    const [hh, mm] = (f.obs_time || '00:00').split(':').map(Number)
    // Calendar arithmetic in UTC so local DST can't shift the date.
    return new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0) + hours * 3600_000).toISOString().slice(0, 10)
  }
  // Severity / probability / observation date & time changes re-derive the target date.
  const setRiskInput = (k: 'severity' | 'probability' | 'obs_date' | 'obs_time', v: string) => {
    const next = { ...form, [k]: v }
    const t = autoTarget(next)
    if (t) { next.target_date_actual = t; setTargetAuto(true) }
    setForm(next)
  }

  const { data: projects }    = useQuery({ queryKey: ['projects'],             queryFn: () => api.get('/projects/').then(r => r.data), ...STABLE })
  const { data: buildings }   = useQuery({ queryKey: ['buildings', form.project_id],  queryFn: () => api.get('/admin/buildings', { params: { project_id: form.project_id } }).then(r => r.data), enabled: !!form.project_id, staleTime: 30_000 })
  const { data: floors }      = useQuery({ queryKey: ['floors', form.building_id],    queryFn: () => api.get('/admin/floors', { params: { building_id: form.building_id } }).then(r => r.data), enabled: !!form.building_id, staleTime: 30_000 })
  const { data: coreConcerns }= useQuery({ queryKey: ['core-concerns'],        queryFn: () => api.get('/admin/core-concerns').then(r => r.data), ...STABLE })
  const { data: rootCatList } = useQuery({ queryKey: ['root-cause-categories'],queryFn: () => api.get('/admin/root-cause-categories').then(r => r.data), ...STABLE })
  const { data: violations }      = useQuery({ queryKey: ['violations'],          queryFn: () => api.get('/admin/violations').then(r => r.data), ...STABLE })
  const { data: outcomes }        = useQuery({ queryKey: ['possible-outcomes'],   queryFn: () => api.get('/admin/possible-outcomes').then(r => r.data), ...STABLE })
  const { data: eicUsers }        = useQuery({ queryKey: ['eic-users', form.project_id], queryFn: () => api.get('/users/eic', { params: { project_id: form.project_id } }).then(r => r.data), enabled: !!form.project_id, staleTime: 30_000 })
  const { data: severityLabels }  = useQuery({ queryKey: ['severity-labels'],     queryFn: () => api.get('/admin/severity-labels').then(r => r.data), ...STABLE })
  const { data: probabilityLabels } = useQuery({ queryKey: ['probability-labels'], queryFn: () => api.get('/admin/probability-labels').then(r => r.data), ...STABLE })

  const SEVERITY_LABELS: Record<number, string> = useMemo(() => {
    if (!severityLabels?.length) return DEFAULT_SEVERITY
    const m: Record<number, string> = { ...DEFAULT_SEVERITY }
    severityLabels.forEach((l: any) => { m[l.level] = `${l.level} – ${l.label}` })
    return m
  }, [severityLabels])

  const PROB_LABELS: Record<number, string> = useMemo(() => {
    if (!probabilityLabels?.length) return DEFAULT_PROB
    const m: Record<number, string> = { ...DEFAULT_PROB }
    probabilityLabels.forEach((l: any) => { m[l.level] = `${l.level} – ${l.label}` })
    return m
  }, [probabilityLabels])
  const { data: contractors } = useQuery({
    queryKey: ['contractors', form.project_id],
    queryFn: () => api.get('/users/contractors', { params: { project_id: form.project_id } }).then(r => r.data),
    enabled: !!form.project_id,
    staleTime: 30_000,
  })

  // Company names are matched loosely so spacing/case variants ("A S  ENTERPRISES"
  // vs "A S ENTERPRISES") show as one company with all its workers.
  const companyKey = (name: string) => (name || '').trim().replace(/\s+/g, ' ').toUpperCase()
  const contractorCompanies: any[] = useMemo(() => {
    const seen = new Set<string>()
    return (contractors || []).filter((c: any) => { const k = companyKey(c.name); if (seen.has(k)) return false; seen.add(k); return true })
  }, [contractors])
  const companyWorkers: any[] = useMemo(() =>
    (contractors || []).filter((c: any) => companyKey(c.name) === companyKey(form.contractor_company)),
    [contractors, form.contractor_company]
  )

  // placeholderData keeps previous data while new key fetches → prevents dropdown from going blank → no layout shift
  const { data: specificConcerns } = useQuery({
    queryKey: ['specific-concerns', form.core_concern_id],
    queryFn: () => api.get('/admin/specific-concerns', { params: { core_concern_id: form.core_concern_id } }).then(r => r.data),
    enabled: !!form.core_concern_id,
    placeholderData: keepPreviousData,
    ...STABLE,
  })
  const { data: rootSpecifics } = useQuery({
    queryKey: ['root-cause-specifics', form.root_cause_category_id],
    queryFn: () => api.get('/admin/root-cause-specifics', { params: { root_cause_category_id: form.root_cause_category_id } }).then(r => r.data),
    enabled: !!form.root_cause_category_id,
    placeholderData: keepPreviousData,
    ...STABLE,
  })

  // Load existing if editing
  const { data: existing } = useQuery({
    queryKey: ['observation', id],
    queryFn: () => api.get(`/observations/${id}`).then(r => r.data),
    enabled: isEdit,
  })

  useEffect(() => {
    // Only populate the form on first load — subsequent background refetches must NOT
    // reset the form or the user's unsaved edits will be silently wiped out.
    if (existing && !formLoadedRef.current) {
      formLoadedRef.current = true
      setForm({
        project_id: existing.project_id?.toString() || '',
        building_id: existing.building_id?.toString() || '',
        floor_id: existing.floor_id?.toString() || '',
        exact_location: existing.exact_location || '',
        obs_time: existing.obs_time || '',
        obs_date: existing.obs_date || '',
        contractor_user_ids: existing.contractor_user_ids?.length
          ? existing.contractor_user_ids
          : (existing.contractor_user_id ? [existing.contractor_user_id] : []),
        contractor_company: existing.contractor_name || '',
        to_be_rectified_by: existing.to_be_rectified_by || '',
        rectified_by_mobile: '',
        observer_name: existing.observer_name || '',
        core_concern_id: existing.core_concern_id?.toString() || '',
        specific_concern_id: existing.specific_concern_id?.toString() || '',
        specific_concern_text: existing.specific_concern_text || '',
        possible_outcome: existing.possible_outcome || '',
        severity: existing.severity?.toString() || '',
        probability: existing.probability?.toString() || '',
        root_cause_category_id: existing.root_cause_category_id?.toString() || '',
        root_cause_specific_id: existing.root_cause_specific_id?.toString() || '',
        violation_id: existing.violation_id?.toString() || '',
        target_date_actual: existing.target_date_actual || '',
        eic_user_ids: existing.eic_user_ids?.length
          ? existing.eic_user_ids
          : (existing.eic_user_id ? [existing.eic_user_id] : []),
        status: existing.stored_status || existing.status || 'Open',
      })
    }
  }, [existing])

  const risk = form.severity && form.probability
    ? calcRisk(Number(form.severity), Number(form.probability))
    : null
  const riskHours = risk ? matrixHours(form.severity, form.probability) : undefined
  // Latest allowed target date (observation date + rule days); null when no rule applies.
  const maxTarget = autoTarget(form)

  // "Praiseworthy observation" is a Core Concern (good practice) — no rectification needed,
  // so the target date is hidden for it. For "Positive Approach" status it stays optional.
  const selectedCore = (coreConcerns || []).find((c: any) => String(c.id) === String(form.core_concern_id))
  const isPraiseworthyConcern = /praiseworthy/i.test(selectedCore?.name || '')

  // Whole days from today to the chosen target date. Both ends are normalised to UTC
  // midnight so a DST boundary can't turn an exact day gap into a fractional one.
  const daysToTarget = useMemo(() => {
    const [y, m, d] = (form.target_date_actual || '').split('-').map(Number)
    if (!y || !m || !d) return null
    const now = new Date()
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    return Math.round((Date.UTC(y, m - 1, d) - today) / 86400000)
  }, [form.target_date_actual])

  const targetDayLabel =
    daysToTarget === null ? null
      : daysToTarget === 0 ? 'Due today'
        : daysToTarget === 1 ? 'In 1 day'
          : daysToTarget > 1 ? `In ${daysToTarget} days`
            : daysToTarget === -1 ? '1 day overdue'
              : `${Math.abs(daysToTarget)} days overdue`

  const targetDayTone =
    daysToTarget === null ? ''
      : daysToTarget < 0 ? 'border-rose-300 bg-rose-50 text-rose-700'
        : daysToTarget === 0 ? 'border-amber-300 bg-amber-50 text-amber-700'
          : 'border-emerald-300 bg-emerald-50 text-emerald-700'

  const MAX_IMAGES = 5

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    setPendingFiles(prev => {
      const slots = MAX_IMAGES - prev.length
      if (slots <= 0) { setError(`Maximum ${MAX_IMAGES} photos allowed`); return prev }
      const arr = Array.from(files).slice(0, slots)
      if (arr.length < files.length) setError(`Maximum ${MAX_IMAGES} photos allowed — only ${arr.length} added`)
      arr.forEach(f => setPreviewUrls(p => [...p, URL.createObjectURL(f)]))
      return [...prev, ...arr]
    })
  }

  const removeFile = (i: number) => {
    setPendingFiles(p => p.filter((_, idx) => idx !== i))
    setPreviewUrls(p => p.filter((_, idx) => idx !== i))
  }

  async function doSave(overrideStatus?: string) {
    if (isSavingRef.current) return   // block double-tap before re-render disables the button
    isSavingRef.current = true
    const isDraft = overrideStatus === 'Draft'

    // Project is the only field the backend strictly requires (all other fields are nullable).
    // For drafts: show a gentle prompt and scroll to project instead of blocking hard.
    if (!form.project_id) {
      const msg = isDraft
        ? 'Please select a Project — it is the only required field to save a draft.'
        : 'Project is required'
      setError(msg)
      isSavingRef.current = false
      return
    }

    if (!isDraft) {
      const missing: string[] = []
      if (!form.building_id)                    missing.push('Building / Tower')
      if (!form.floor_id)                       missing.push('Floor')
      if (!form.core_concern_id)                missing.push('Core Concern')
      if (!form.specific_concern_id)            missing.push('Specific Concern')
      if (!form.severity)                       missing.push('Severity of Consequence')
      if (!form.probability)                    missing.push('Probability of Occurrence')
      if (form.status !== 'Positive Approach') {
        // Rectification fields only required for non-positive (unsafe) observations
        if (!form.contractor_company)           missing.push('Contractor Company')
        if (!form.contractor_user_ids.length)   missing.push('To Be Rectified By')
        if (!form.violation_id)                 missing.push('Violation Caused Due To')
        if (!isPraiseworthyConcern && !form.target_date_actual) missing.push('Target Date for Rectification')
      }
      if (missing.length > 0) {
        setError(`Please fill in the following required fields: ${missing.join(', ')}`)
        isSavingRef.current = false
        return
      }
    }

    if (isDraft) setSavingDraft(true); else setSaving(true)
    setError('')

    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { contractor_company: _cc, rectified_by_mobile: _rbm, ...formRest } = form
      const payload = {
        ...formRest,
        status: isDraft ? 'Draft' : (overrideStatus ?? (form.status === 'Draft' ? 'Open' : form.status)),
        project_id: Number(form.project_id),
        building_id: form.building_id ? Number(form.building_id) : null,
        floor_id: form.floor_id ? Number(form.floor_id) : null,
        contractor_user_ids: form.contractor_user_ids,
        contractor_user_id: form.contractor_user_ids[0] ?? null,
        core_concern_id: form.core_concern_id ? Number(form.core_concern_id) : null,
        specific_concern_id: form.specific_concern_id ? Number(form.specific_concern_id) : null,
        root_cause_category_id: form.root_cause_category_id ? Number(form.root_cause_category_id) : null,
        root_cause_specific_id: form.root_cause_specific_id ? Number(form.root_cause_specific_id) : null,
        violation_id: form.violation_id ? Number(form.violation_id) : null,
        eic_user_ids: form.eic_user_ids,
        eic_user_id: form.eic_user_ids[0] ?? null,
        // Praiseworthy concerns hide the target date — never save a hidden (e.g. auto-filled) one.
        target_date_actual: isPraiseworthyConcern ? null : (form.target_date_actual || null),
        severity: form.severity ? Number(form.severity) : null,
        probability: form.probability ? Number(form.probability) : null,
      }

      let obsId: number
      if (isEdit) {
        const numId = existing?.id
        await api.put(`/observations/${numId}`, payload)
        obsId = numId
      } else {
        const { data } = await api.post('/observations/', payload)
        obsId = data.id
      }

      // Upload images
      if (pendingFiles.length > 0) {
        const fd = new FormData()
        pendingFiles.forEach(f => fd.append('files', f))
        fd.append('image_type', isEdit ? 'followup' : 'initial')
        await api.post(`/observations/${obsId}/images`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }

      qc.invalidateQueries({ queryKey: ['observations'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      if (isEdit) qc.invalidateQueries({ queryKey: ['observation', id] })
      if (isDraft) {
        toast.success('Draft saved successfully')
      } else {
        toast.success(isEdit ? 'Observation updated successfully' : 'Observation submitted successfully')
      }
      navigate('/observations')
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to save observation'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false); setSavingDraft(false)
      isSavingRef.current = false
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await doSave()
  }

  async function handleSaveDraft(e: React.MouseEvent) {
    e.preventDefault()
    await doSave('Draft')
  }

  const riskColor = risk?.level === 'High' ? 'border-rose-300 bg-rose-50' : risk?.level === 'Medium' ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'
  const riskTextColor = risk?.level === 'High' ? 'text-rose-700' : risk?.level === 'Medium' ? 'text-amber-700' : 'text-emerald-700'

  const G3 = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {/* Page header — stacks on mobile, inline on desktop */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost btn-sm !p-1.5 flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Observation' : 'New Observation'}</h1>
            {isEdit
              ? <p className="text-xs text-gray-400 mt-0.5">ID: <span className="font-mono font-semibold text-indigo-600">{existing?.observation_id}</span></p>
              : <p className="text-xs text-gray-400 mt-0.5">ID auto-generated on submit</p>
            }
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {isEdit && (
            <select className="select flex-1 sm:flex-none sm:w-auto text-sm py-1.5" value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          )}
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary btn-sm flex-1 sm:flex-none justify-center">
            Cancel
          </button>
          {(!isEdit || form.status === 'Draft') && (
            <button type="button" onClick={handleSaveDraft} disabled={savingDraft || saving} className="btn-secondary btn-sm flex-1 sm:flex-none justify-center">
              {savingDraft
                ? <><span className="animate-spin w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full" /> Saving…</>
                : <><FileEdit className="w-3.5 h-3.5" /><span className="sm:hidden">Draft</span><span className="hidden sm:inline">Save as Draft</span></>}
            </button>
          )}
          <button type="submit" disabled={saving || savingDraft} className="btn-primary btn-sm flex-1 sm:flex-none justify-center">
            {saving
              ? <><span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> Saving…</>
              : <><Save className="w-3.5 h-3.5" /> {isEdit ? 'Update' : 'Submit'}</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Observation Type ─────────────────────── */}
      {(() => {
        const isPositive = form.status === 'Positive Approach'
        return (
          <div
            className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
              isPositive ? 'bg-teal-50 border-teal-300' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => set('status', isPositive ? 'Open' : 'Positive Approach')}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isPositive ? 'bg-teal-500' : 'bg-gray-200'}`}>
                <CheckCircle2 className={`w-4 h-4 ${isPositive ? 'text-white' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${isPositive ? 'text-teal-800' : 'text-gray-700'}`}>
                  Positive Approach
                </p>
                <p className={`text-xs ${isPositive ? 'text-teal-600' : 'text-gray-400'}`}>
                  {isPositive ? 'Good practice observed — no rectification required' : 'Toggle on if this is a good practice / safe behaviour observation'}
                </p>
              </div>
            </div>
            <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${isPositive ? 'bg-teal-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isPositive ? 'translate-x-6' : 'translate-x-1'}`} />
            </div>
          </div>
        )
      })()}

      {/* ── Photos ───────────────────────────────── */}
      <SectionCard title="Photos" icon={<ImagePlus className="w-3.5 h-3.5" />}>
        {isEdit && existing?.images?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {existing.images.map((img: any) => (
              <div key={img.id} className="relative">
                <img src={`/uploads/${img.file_path}`} alt={img.file_name}
                  className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                <span className="absolute bottom-0.5 left-0.5 bg-black/50 text-white text-[10px] px-1 rounded">{img.image_type}</span>
              </div>
            ))}
          </div>
        )}

        {/* Two upload options */}
        <div className="grid grid-cols-2 gap-3">
          {/* Upload from device */}
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center hover:border-indigo-400 hover:bg-indigo-50/20 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
          >
            <ImagePlus className="w-6 h-6 text-gray-400 mx-auto mb-1.5" />
            <p className="text-sm font-medium text-gray-600">Upload from device</p>
            <p className="text-xs text-gray-400 mt-0.5">Click or drag & drop</p>
            <input ref={fileRef} type="file" multiple accept="image/*" className="hidden"
              onChange={e => handleFiles(e.target.files)} />
          </div>

          {/* Capture from camera */}
          <div
            className="border-2 border-dashed border-indigo-200 rounded-xl p-5 text-center hover:border-indigo-500 hover:bg-indigo-50/30 transition-colors cursor-pointer"
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="w-6 h-6 text-indigo-400 mx-auto mb-1.5" />
            <p className="text-sm font-medium text-indigo-600">Take a photo</p>
            <p className="text-xs text-gray-400 mt-0.5">Opens device camera</p>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => handleFiles(e.target.files)} />
          </div>
        </div>

        {previewUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {previewUrls.map((url, i) => (
              <div key={i} className="relative group">
                <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                <button type="button" onClick={() => removeFile(i)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Site Information ─────────────────────── */}
      <SectionCard title="Site Information" icon={<MapPin className="w-3.5 h-3.5" />}>
        <div className={G3}>
          <Field label="Project" required>
            <select className="select" value={form.project_id} onChange={e => { set('project_id', e.target.value); set('building_id', ''); set('floor_id', ''); set('contractor_company', ''); set('contractor_user_id', '') }} required>
              <option value="">Select project…</option>
              {(projects || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Building / Tower" required>
            <select className="select" value={form.building_id} onChange={e => { set('building_id', e.target.value); set('floor_id', '') }} disabled={!form.project_id}>
              <option value="">{form.project_id ? 'Select building…' : 'Select project first…'}</option>
              {(buildings || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Floor" required>
            <select className="select" value={form.floor_id} onChange={e => set('floor_id', e.target.value)} disabled={!form.building_id || !(floors?.length)}>
              <option value="">
                {!form.building_id ? 'Select building first…' : !(floors?.length) ? 'No floors configured' : 'Select floor…'}
              </option>
              {prepareFloors(floors || []).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          <Field label="Exact Location">
            <input className="input" placeholder="e.g. Near Gate 3, Basement" value={form.exact_location} onChange={e => set('exact_location', e.target.value)} />
          </Field>
          <Field label="Observer Name">
            <input className="input" value={form.observer_name} onChange={e => set('observer_name', e.target.value)} />
          </Field>
          <Field label="Contractor Company" required={form.status !== 'Positive Approach'}>
            <select
              className="select"
              value={form.contractor_company}
              disabled={!form.project_id}
              onChange={e => {
                const name = e.target.value
                set('contractor_company', name)
                set('contractor_user_ids', [])
                set('to_be_rectified_by', '')
                set('rectified_by_mobile', '')
              }}
            >
              <option value="">
                {form.project_id ? 'Select contractor company…' : 'Select project first…'}
              </option>
              {contractorCompanies.map((c: any) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </Field>
          {/* Date + Time on same row */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="label">Date</label>
              <input type="date" className="input" value={form.obs_date} onChange={e => setRiskInput('obs_date', e.target.value)} />
            </div>
            <div className="w-32">
              <label className="label">Time</label>
              <input type="time" className="input" value={form.obs_time} onChange={e => setRiskInput('obs_time', e.target.value)} />
            </div>
          </div>
          <Field label="To Be Rectified By" required={form.status !== 'Positive Approach'}>
            {form.contractor_company ? (
              <MultiSelectFilter
                size="md"
                options={companyWorkers.map((c: any) => ({
                  value: c.id,
                  label: [c.name, c.email].filter(Boolean).join(' · '),
                }))}
                value={form.contractor_user_ids}
                onChange={selected => {
                  const ids = selected as number[]
                  set('contractor_user_ids', ids)
                  const selected_workers = (contractors || []).filter((c: any) => ids.includes(c.id))
                  const contacts = selected_workers.map((c: any) => [c.mobile, c.email].filter(Boolean).join(' / '))
                  set('to_be_rectified_by', contacts.join(', '))
                  const mobiles = selected_workers.map((c: any) => c.mobile).filter(Boolean)
                  set('rectified_by_mobile', mobiles.join(', '))
                }}
                placeholder="Select individual(s)…"
                className="w-full"
              />
            ) : (
              <input
                className="input text-gray-400"
                placeholder="Select contractor company first"
                readOnly
                value=""
              />
            )}
          </Field>
          <Field label="Mobile Number">
            <input
              className="input"
              placeholder="Auto-filled from selection"
              value={form.rectified_by_mobile}
              onChange={e => set('rectified_by_mobile', e.target.value)}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── Observation Details ──────────────────── */}
      <SectionCard title="Observation Details" icon={<ClipboardList className="w-3.5 h-3.5" />}>
        <div className={G3}>
          <Field label="Core Concern" required>
            <select className="select" value={form.core_concern_id} onChange={e => { set('core_concern_id', e.target.value); set('specific_concern_id', '') }}>
              <option value="">Select core concern…</option>
              {(coreConcerns || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Specific Concern" required>
            <select className="select" value={form.specific_concern_id} onChange={e => set('specific_concern_id', e.target.value)} disabled={!form.core_concern_id}>
              <option value="">Select specific concern…</option>
              {(specificConcerns || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Possible Outcome">
            <select className="select" value={form.possible_outcome} onChange={e => set('possible_outcome', e.target.value)}>
              <option value="">Select outcome…</option>
              {(outcomes || []).map((o: any) => <option key={o.id} value={o.name}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Violation Caused Due To" required={form.status !== 'Positive Approach'}>
            <select className="select" value={form.violation_id} onChange={e => set('violation_id', e.target.value)}>
              <option value="">Select cause…</option>
              {(violations || []).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Concerned EIC">
            {form.project_id ? (
              <MultiSelectFilter
                size="md"
                options={(eicUsers || []).map((u: any) => ({ value: u.id, label: u.name }))}
                value={form.eic_user_ids}
                onChange={selected => set('eic_user_ids', selected as number[])}
                placeholder="Select EIC…"
              />
            ) : (
              <input className="input" disabled placeholder="Select project first…" />
            )}
          </Field>
          <div className="lg:col-span-3">
            <Field label="Additional Details">
              <textarea
                rows={2}
                className="input resize-none"
                placeholder="Describe the specific concern in detail…"
                value={form.specific_concern_text}
                onChange={e => set('specific_concern_text', e.target.value)}
              />
            </Field>
          </div>
        </div>
      </SectionCard>

      {/* ── Risk Assessment ──────────────────────── */}
      <SectionCard title="Risk Assessment" icon={<ShieldAlert className="w-3.5 h-3.5" />}>
        <p className="text-xs text-gray-400 mb-4">
          Risk Factor = Severity × Probability. Select 1 (lowest) to 5 (highest) for each.
        </p>
        <div className={G3}>
          <Field label="Severity of Consequence" required hint="1 = First Aid only  →  5 = Fatality">
            <select className="select" value={form.severity} onChange={e => setRiskInput('severity', e.target.value)}>
              <option value="">Select severity…</option>
              {RISK_LEVELS.map(n => <option key={n} value={n}>{SEVERITY_LABELS[n]}</option>)}
            </select>
          </Field>
          <Field label="Probability of Occurrence" required hint="1 = Very Unlikely  →  5 = Almost Certain">
            <select className="select" value={form.probability} onChange={e => setRiskInput('probability', e.target.value)}>
              <option value="">Select probability…</option>
              {RISK_LEVELS.map(n => <option key={n} value={n}>{PROB_LABELS[n]}</option>)}
            </select>
          </Field>
          {risk ? (
            <div className={`flex items-center gap-3 p-4 rounded-xl border ${riskColor} self-end`}>
              {risk.level === 'High'
                ? <AlertTriangle className={`w-5 h-5 ${riskTextColor} flex-shrink-0`} />
                : <CheckCircle2 className={`w-5 h-5 ${riskTextColor} flex-shrink-0`} />}
              <div>
                <p className={`font-bold text-sm ${riskTextColor}`}>Factor: {risk.factor} — {risk.level}</p>
                <p className="text-xs text-gray-600 mt-0.5 leading-tight">
                  {risk.level === 'Low' && 'No immediate action required.'}
                  {risk.level === 'Medium' && 'Interim controls required.'}
                  {risk.level === 'High' && 'Immediate intervention required.'}
                </p>
                <p className={`text-xs font-semibold mt-1 leading-tight ${riskTextColor}`}>
                  {riskHours !== undefined
                    ? <>Target: within {fmtDuration(riskHours)} of the observation</>
                    : 'No matrix entry for this combination — set the date manually'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-4 rounded-xl border border-dashed border-gray-200 self-end">
              <p className="text-xs text-gray-400">Risk result will appear here</p>
            </div>
          )}
          {!isPraiseworthyConcern && (
            <Field label="Target Date for Rectification" required={form.status !== 'Positive Approach'}>
              <div className="flex items-center gap-2">
                <input type="date" className="input flex-1 min-w-0" value={form.target_date_actual}
                  max={maxTarget || undefined}
                  onChange={e => {
                    const v = e.target.value
                    // Earlier is fine; later than the rule allows is not.
                    if (maxTarget && v > maxTarget) {
                      toast.error(`Target date can't be later than ${fmtDate(maxTarget)} (Severity ${form.severity} × Probability ${form.probability})`)
                      set('target_date_actual', maxTarget); setTargetAuto(true); return
                    }
                    set('target_date_actual', v); setTargetAuto(v === maxTarget)
                  }} />
                {targetDayLabel && (
                  <span className={`flex-shrink-0 whitespace-nowrap text-xs font-semibold px-2.5 py-2 rounded-lg border ${targetDayTone}`}>
                    {targetDayLabel}
                  </span>
                )}
              </div>
              {riskHours !== undefined && risk && (
                targetAuto ? (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Auto-filled: Severity {form.severity} × Probability {form.probability} → {fmtDuration(riskHours)} (risk matrix). You can choose an earlier date, not a later one.
                  </p>
                ) : autoTarget(form) && autoTarget(form) !== form.target_date_actual ? (
                  <button type="button" onClick={() => { set('target_date_actual', autoTarget(form)); setTargetAuto(true) }}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 mt-1">
                    Use auto date ({fmtDuration(riskHours)} for {form.severity} × {form.probability})
                  </button>
                ) : null
              )}
            </Field>
          )}
        </div>
      </SectionCard>

      {/* ── Root Cause ───────────────────────────── */}
      <SectionCard title="Root Cause Analysis" icon={<GitBranch className="w-3.5 h-3.5" />}>
        <div className={G3}>
          <Field label="Root Cause Category">
            <select className="select" value={form.root_cause_category_id} onChange={e => { set('root_cause_category_id', e.target.value); set('root_cause_specific_id', '') }}>
              <option value="">Select root cause…</option>
              {(rootCatList || []).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Specific Root Cause">
            <select className="select" value={form.root_cause_specific_id} onChange={e => set('root_cause_specific_id', e.target.value)} disabled={!form.root_cause_category_id}>
              <option value="">Select specific root cause…</option>
              {(rootSpecifics || []).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        </div>
      </SectionCard>

      {/* Bottom actions */}
      <div className="flex items-center justify-end gap-3 pb-4 flex-wrap">
        <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
        {(!isEdit || form.status === 'Draft') && (
          <button type="button" onClick={handleSaveDraft} disabled={savingDraft || saving} className="btn-secondary">
            {savingDraft
              ? <><span className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full" /> Saving Draft…</>
              : <><FileEdit className="w-4 h-4" /> Save as Draft</>}
          </button>
        )}
        <button type="submit" disabled={saving || savingDraft} className="btn-primary px-6">
          {saving
            ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Saving…</>
            : <><Save className="w-4 h-4" /> {isEdit ? 'Update Observation' : 'Submit Observation'}</>}
        </button>
      </div>
    </form>
  )
}
