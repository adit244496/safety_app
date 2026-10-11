import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle2, XCircle, Ban, DoorClosed, Pencil, Trash2, AlertTriangle, X,
  FileText, ShieldAlert, UserCheck, History, Clock, Camera, MessageSquare, Send,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '../../lib/api'
import { useAuth } from '../../store/authStore'
import { fmtDateTime } from '../../lib/utils'
import { CLOSURE_OPTIONS } from '../../lib/permitConfig'
import { PermitStatusBadge } from './index'

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value || '—'}</p>
    </div>
  )
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-indigo-500">{icon}</span>}
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// Render one hazard category's captured answers read-only, driven by the admin config
function CategoryAnswers({ wt, index, data }: { wt: any; index: number; data: any }) {
  const d = data || {}
  // group precautions by section
  const groups: { section: string; items: any[] }[] = []
  ;(wt.precautions || []).forEach((pr: any) => {
    const sec = pr.section || 'General'
    let g = groups.find(x => x.section === sec)
    if (!g) { g = { section: sec, items: [] }; groups.push(g) }
    g.items.push(pr)
  })
  const gas: any[] = d.__gas || []

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="flex items-start gap-2 mb-2">
        <span className="text-xs font-bold text-indigo-500 flex-shrink-0">{index}.</span>
        <p className="text-sm font-medium text-gray-800">{wt.name}</p>
      </div>
      <div className="pl-5 space-y-2 text-sm">
        {groups.map(g => {
          const rendered = g.items.map((pr: any) => {
            const v = d[pr.item_key]
            if (pr.input_type === 'toggle') {
              if (!v) return null
              return <li key={pr.id} className="text-xs text-gray-600">{pr.label}: <span className={`font-semibold ${v === 'YES' ? 'text-emerald-600' : 'text-rose-600'}`}>{v}</span></li>
            }
            if (pr.input_type === 'text') {
              if (!v) return null
              return <li key={pr.id} className="text-xs text-gray-600">{pr.label}: <span className="text-gray-800">{v}</span></li>
            }
            if (!v) return null
            return <li key={pr.id} className="flex items-start gap-1.5 text-xs text-gray-700"><CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />{pr.label}</li>
          }).filter(Boolean)
          if (!rendered.length) return null
          return (
            <div key={g.section}>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{g.section}</p>
              <ul className="mt-0.5 space-y-0.5">{rendered}</ul>
            </div>
          )
        })}
        {gas.some((r: any) => r.time || r.o2 || r.lel || r.pel || r.location || r.testedBy) && (
          <div className="overflow-x-auto">
            <table className="text-xs border border-gray-200 rounded mt-1">
              <thead className="bg-gray-50 text-gray-500"><tr>{['#', 'Time', 'O₂', 'LEL', 'PEL', 'Location', 'Tested By'].map(h => <th key={h} className="px-2 py-1 text-left font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {gas.map((r: any, i: number) => (r.time || r.o2 || r.lel || r.pel || r.location || r.testedBy) ? (
                  <tr key={i} className="border-t border-gray-100"><td className="px-2 py-0.5 text-gray-400">{i + 1}</td><td className="px-2 py-0.5">{r.time}</td><td className="px-2 py-0.5">{r.o2}</td><td className="px-2 py-0.5">{r.lel}</td><td className="px-2 py-0.5">{r.pel}</td><td className="px-2 py-0.5">{r.location}</td><td className="px-2 py-0.5">{r.testedBy}</td></tr>
                ) : null)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// Simple reason/closure modal
function ActionModal({ title, children, confirmLabel, confirmClass, onConfirm, onClose, busy, disabled }: {
  title: string; children: React.ReactNode; confirmLabel: string; confirmClass: string
  onConfirm: () => void; onClose: () => void; busy: boolean; disabled?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="btn-ghost btn-sm !p-1.5"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4">{children}</div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button onClick={onConfirm} disabled={busy || disabled} className={`btn-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white font-medium disabled:opacity-50 ${confirmClass}`}>
            {busy ? <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> : null}{confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function WorkPermitDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()

  const [modal, setModal] = useState<'' | 'decline' | 'cancel' | 'closure' | 'extension'>('')
  const [reason, setReason] = useState('')
  const [closureType, setClosureType] = useState('')
  const [closurePhotos, setClosurePhotos] = useState<File[]>([])
  const [extHours, setExtHours] = useState('2')
  const [busy, setBusy] = useState('')

  const { data: p, isLoading } = useQuery({ queryKey: ['work-permit', id], queryFn: () => api.get(`/work-permits/${id}`).then(r => r.data) })
  const { data: config } = useQuery<any[]>({ queryKey: ['permit-config-all'], queryFn: () => api.get('/work-permits/config', { params: { include_inactive: true } }).then(r => r.data), staleTime: 300_000 })
  const { data: comments } = useQuery<any[]>({ queryKey: ['permit-comments', id], queryFn: () => api.get(`/work-permits/${id}/comments`).then(r => r.data), refetchInterval: 20_000 })
  const [commentText, setCommentText] = useState('')
  const [commentPhotos, setCommentPhotos] = useState<File[]>([])
  const [posting, setPosting] = useState(false)
  async function postComment() {
    const msg = commentText.trim()
    if (!msg && commentPhotos.length === 0) return
    setPosting(true)
    try {
      const res = await api.post(`/work-permits/${id}/comments`, { message: msg || '(photo)' })
      const cid = res.data?.id
      if (cid && commentPhotos.length) {
        const fd = new FormData()
        fd.append('category', `comment:${cid}`)
        commentPhotos.forEach(f => fd.append('files', f))
        try { await api.post(`/work-permits/${id}/images`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }) } catch { /* non-fatal */ }
      }
      setCommentText(''); setCommentPhotos([])
      qc.invalidateQueries({ queryKey: ['permit-comments', id] })
    }
    catch (e: any) { toast.error(e.response?.data?.detail || 'Failed to post comment') }
    finally { setPosting(false) }
  }

  if (isLoading) return <div className="card p-10 text-center text-gray-400">Loading…</div>
  if (!p) return <div className="card p-10 text-center text-gray-400">Permit not found.</div>

  const uid = user?.id
  const isSuper = user?.role === 'SuperAdmin'
  const isAdmin = ['SuperAdmin', 'Admin'].includes(user?.role || '')
  const isCreator = p.created_by === uid
  const isApprover = [p.pic_user_id, p.pso_user_id, p.eic_user_id].includes(uid) || isAdmin

  // SuperAdmin has full access to every permit action
  const canEdit = (isCreator || isSuper) && ['Draft', 'Declined'].includes(p.status)
  const canDelete = isSuper || (isCreator && ['Draft', 'Declined'].includes(p.status))
  const canApprove = (isApprover || isSuper) && p.status === 'Pending Approval'
  const canRequestClosure = (isCreator || isAdmin || isSuper) && p.status === 'Approved'
  const canApproveClosure = (isApprover || isSuper) && p.status === 'Closure Requested'
  const canRequestExtension = (isCreator || isSuper) && p.status === 'Approved' && p.extension_status !== 'Requested'
  const canApproveExtension = (uid === p.eic_user_id || isSuper) && p.extension_status === 'Requested'
  const canCancel = (isCreator || isApprover || isSuper) && !['Closed', 'Cancelled'].includes(p.status)

  async function act(fn: () => Promise<any>, label: string) {
    setBusy(label)
    try {
      await fn()
      qc.invalidateQueries({ queryKey: ['work-permit', id] })
      qc.invalidateQueries({ queryKey: ['work-permits'] })
      setModal(''); setReason(''); setClosureType('')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Action failed')
    } finally { setBusy('') }
  }

  const approve = () => act(async () => { await api.post(`/work-permits/${p.id}/approve`); toast.success('Permit approved') }, 'approve')
  const decline = () => act(async () => { await api.post(`/work-permits/${p.id}/decline`, { reason }); toast.success('Permit declined') }, 'decline')
  const cancel = () => act(async () => { await api.post(`/work-permits/${p.id}/cancel`, { reason }); toast.success('Permit cancelled') }, 'cancel')
  const requestClosure = () => act(async () => {
    await api.post(`/work-permits/${p.id}/request-closure`, { closure_type: closureType, note: reason })
    if (closurePhotos.length) {
      const fd = new FormData(); fd.append('category', 'closure'); closurePhotos.forEach(f => fd.append('files', f))
      try { await api.post(`/work-permits/${p.id}/images`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }) } catch { /* non-fatal */ }
    }
    setClosurePhotos([])
    toast.success('Closure requested')
  }, 'closure')
  const approveClosure = () => act(async () => { await api.post(`/work-permits/${p.id}/approve-closure`); toast.success('Permit closed') }, 'approve-closure')
  const requestExtension = () => act(async () => { await api.post(`/work-permits/${p.id}/request-extension`, { hours: Number(extHours), reason }); toast.success('Extension requested') }, 'extension')
  const approveExtension = () => act(async () => { await api.post(`/work-permits/${p.id}/approve-extension`); toast.success('Extension approved') }, 'approve-extension')
  const declineExtension = () => act(async () => { await api.post(`/work-permits/${p.id}/decline-extension`, { reason: '' }); toast.success('Extension declined') }, 'decline-extension')
  const del = () => { if (!confirm('Delete this permit? This cannot be undone.')) return; act(async () => { await api.delete(`/work-permits/${p.id}`); toast.success('Permit deleted'); navigate('/work-permits') }, 'delete') }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate('/work-permits')} className="btn-ghost btn-sm !p-1.5 mt-0.5"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 font-mono">{p.permit_no}</h1>
              <PermitStatusBadge status={p.status} />
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{p.project_name || '—'} · Created by {p.created_by_name} · {fmtDateTime(p.created_at)}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate(`/work-permits/${p.id}/print`)} className="btn-secondary btn-sm"><FileText className="w-3.5 h-3.5" /> PDF View</button>
          {canEdit && <button onClick={() => navigate(`/work-permits/${p.id}/edit`)} className="btn-secondary btn-sm"><Pencil className="w-3.5 h-3.5" /> Edit</button>}
          {canApprove && <>
            <button onClick={() => setModal('decline')} className="btn-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium"><XCircle className="w-3.5 h-3.5" /> Decline</button>
            <button onClick={approve} disabled={busy === 'approve'} className="btn-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50"><CheckCircle2 className="w-3.5 h-3.5" /> Approve</button>
          </>}
          {canRequestClosure && <button onClick={() => setModal('closure')} className="btn-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium"><DoorClosed className="w-3.5 h-3.5" /> Request Closure</button>}
          {canApproveClosure && <button onClick={approveClosure} disabled={busy === 'approve-closure'} className="btn-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50"><CheckCircle2 className="w-3.5 h-3.5" /> Approve Closure</button>}
          {canRequestExtension && <button onClick={() => setModal('extension')} className="btn-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium"><Clock className="w-3.5 h-3.5" /> Request Extension</button>}
          {canApproveExtension && <>
            <button onClick={declineExtension} disabled={busy === 'decline-extension'} className="btn-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium disabled:opacity-50"><XCircle className="w-3.5 h-3.5" /> Decline Ext.</button>
            <button onClick={approveExtension} disabled={busy === 'approve-extension'} className="btn-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50"><CheckCircle2 className="w-3.5 h-3.5" /> Approve Ext.</button>
          </>}
          {canCancel && <button onClick={() => setModal('cancel')} className="btn-secondary btn-sm text-rose-600"><Ban className="w-3.5 h-3.5" /> Cancel Permit</button>}
          {canDelete && <button onClick={del} className="btn-ghost btn-sm !p-1.5 text-gray-400 hover:text-red-500" title="Delete"><Trash2 className="w-4 h-4" /></button>}
        </div>
      </div>

      {/* Status callouts */}
      {p.status === 'Declined' && p.decline_reason && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /><div><span className="font-semibold">Declined:</span> {p.decline_reason}</div>
        </div>
      )}
      {p.status === 'Approved' && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-2.5 text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Approved by {p.approver_name} ({p.approver_role}) on {fmtDateTime(p.approved_at)}
        </div>
      )}
      {p.status === 'Closure Requested' && (
        <div className="flex items-start gap-2 bg-violet-50 border border-violet-200 text-violet-700 rounded-xl px-4 py-2.5 text-sm">
          <DoorClosed className="w-4 h-4 flex-shrink-0 mt-0.5" /><div><span className="font-semibold">Closure requested:</span> {p.closure_type}{p.closure_note ? ` — ${p.closure_note}` : ''}</div>
        </div>
      )}
      {p.extension_status === 'Requested' && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-2.5 text-sm">
          <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" /><div><span className="font-semibold">Extension requested:</span> +{p.extension_hours} hrs → new expiry {p.extension_new_expiry} <span className="text-amber-600">(awaiting EIC approval)</span></div>
        </div>
      )}
      {p.extension_status === 'Approved' && (
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-2.5 text-sm">
          <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" /><div><span className="font-semibold">Extension approved:</span> +{p.extension_hours} hrs · expiry now {p.expires_at}</div>
        </div>
      )}
      {p.status === 'Closed' && (
        <div className="flex items-start gap-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl px-4 py-2.5 text-sm">
          <DoorClosed className="w-4 h-4 flex-shrink-0 mt-0.5" /><div><span className="font-semibold">Closed:</span> {p.closure_type}{p.closure_note ? ` — ${p.closure_note}` : ''} · {fmtDateTime(p.closed_at)}</div>
        </div>
      )}
      {p.status === 'Cancelled' && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm">
          <Ban className="w-4 h-4 flex-shrink-0 mt-0.5" /><div><span className="font-semibold">Cancelled.</span> {p.cancel_reason || ''}</div>
        </div>
      )}

      {/* Details */}
      <Card title="Permit Details" icon={<FileText className="w-3.5 h-3.5" />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <InfoRow label="Project" value={p.project_name} />
          <InfoRow label="Issued To (Receiver)" value={p.created_by_name} />
          <InfoRow label="Receiver Email" value={p.created_by_email} />
          <InfoRow label="Receiver Phone" value={p.created_by_mobile} />
          <InfoRow label="Issued Date" value={p.issued_date} />
          <InfoRow label="Equipment / Location" value={p.work_location} />
          <InfoRow label="Area" value={p.area} />
          <InfoRow label="Floor" value={p.floor} />
          <InfoRow label="Starts At" value={p.starts_at?.replace('T', ' ')} />
          <InfoRow label="Expires At" value={p.expires_at?.replace('T', ' ')} />
          <InfoRow label="Other Permits" value={p.other_permits} />
          <InfoRow label="Pre-job discussion" value={p.pre_job_discussion ? 'Held' : 'No'} />
        </div>
        <div className="mt-4"><InfoRow label="Description of Work" value={p.work_description} /></div>
      </Card>

      {/* Approvers — a green tick marks whoever approved */}
      <Card title="Approvers" icon={<UserCheck className="w-3.5 h-3.5" />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[{ role: 'PIC', u: p.pic_user }, { role: 'PSO', u: p.pso_user }, { role: 'EIC', u: p.eic_user }].map(({ role, u }) => {
            const approved = !!u && p.approved_by === u.id
            return (
              <div key={role}>
                <p className="text-xs text-gray-400 uppercase tracking-wide">{role}</p>
                <p className="text-sm font-medium text-gray-800 mt-0.5 flex items-center gap-1.5">
                  {approved && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                  <span>{u?.name || '—'}</span>
                  {approved && <span className="text-[11px] font-semibold text-emerald-600">Approved</span>}
                </p>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Hazard categories */}
      <Card title="Hazardous Work & Precautions" icon={<ShieldAlert className="w-3.5 h-3.5" />}>
        {(!p.hazard_categories || p.hazard_categories.length === 0) ? (
          <p className="text-sm text-gray-400">No hazardous work types selected.</p>
        ) : (
          <div className="space-y-3">
            {p.hazard_categories.map((code: string, i: number) => {
              const wt = (config || []).find((w: any) => w.code === code)
              if (!wt) return <div key={code} className="rounded-xl border border-gray-200 p-3 text-sm text-gray-500">Work type <span className="font-mono">{code}</span> (removed from catalogue)</div>
              return <CategoryAnswers key={code} wt={wt} index={i + 1} data={p.precautions?.[code]} />
            })}
          </div>
        )}
      </Card>

      {/* Photos */}
      {p.images?.length > 0 && (
        <Card title="Photos" icon={<Camera className="w-3.5 h-3.5" />}>
          <div className="space-y-3">
            {(() => {
              const labelFor = (cat: string) => cat === 'prejob' ? 'Pre-Job Discussion'
                : cat === 'closure' ? 'Closure (work status & housekeeping)'
                : (config || []).find((w: any) => `hazard:${w.code}` === cat)?.name || cat.replace('hazard:', '')
              const groups: Record<string, any[]> = {}
              for (const im of p.images) { (groups[im.category] ||= []).push(im) }
              return Object.entries(groups).map(([cat, imgs]) => (
                <div key={cat}>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">{labelFor(cat)}</p>
                  <div className="flex flex-wrap gap-2">
                    {imgs.map((im: any) => (
                      <a key={im.id} href={`/uploads/${im.file_path}`} target="_blank" rel="noreferrer" className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-indigo-300">
                        <img src={`/uploads/${im.file_path}`} alt="" className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              ))
            })()}
          </div>
        </Card>
      )}

      {/* Discussion / chat thread */}
      <Card title="Discussion" icon={<MessageSquare className="w-3.5 h-3.5" />}>
        <div className="space-y-3">
          {(comments || []).length === 0 ? (
            <p className="text-sm text-gray-400">No comments yet. Start the conversation — all involved roles can follow the thread.</p>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {comments!.map((c: any) => {
                const mine = c.user_id === uid
                return (
                  <div key={c.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                      <div className={`flex items-center gap-1.5 text-[11px] mb-0.5 ${mine ? 'text-indigo-200' : 'text-gray-400'}`}>
                        <span className="font-semibold">{c.user_name || 'Unknown'}</span>
                        {c.user_role && <span>· {c.user_role}</span>}
                        <span>· {fmtDateTime(c.created_at)}</span>
                      </div>
                      {c.message && c.message !== '(photo)' && <p className="whitespace-pre-wrap leading-snug">{c.message}</p>}
                      {c.images?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {c.images.map((im: any) => (
                            <a key={im.id} href={`/uploads/${im.file_path}`} target="_blank" rel="noreferrer" className="block w-16 h-16 rounded-lg overflow-hidden border border-white/30">
                              <img src={`/uploads/${im.file_path}`} alt="" className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {commentPhotos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {commentPhotos.map((f, i) => (
                <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-indigo-200 group">
                  <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setCommentPhotos(ps => ps.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100"><X className="w-2.5 h-2.5" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 pt-1">
            <label className="btn-secondary btn-sm flex-shrink-0 h-[38px] cursor-pointer" title="Attach photos">
              <Camera className="w-3.5 h-3.5" />
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => { const fs = Array.from(e.target.files || []).slice(0, 6 - commentPhotos.length); setCommentPhotos(ps => [...ps, ...fs]); e.currentTarget.value = '' }} />
            </label>
            <textarea rows={1} className="input resize-none flex-1 min-h-[38px]" placeholder="Write a comment…" value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); postComment() } }} />
            <button onClick={postComment} disabled={posting || (!commentText.trim() && commentPhotos.length === 0)} className="btn-primary btn-sm flex-shrink-0 h-[38px]">
              <Send className="w-3.5 h-3.5" /> Send
            </button>
          </div>
        </div>
      </Card>

      {/* History */}
      {p.history?.length > 0 && (
        <Card title="History" icon={<History className="w-3.5 h-3.5" />}>
          <ol className="space-y-2.5">
            {[...p.history].sort((a: any, b: any) => String(b.at || '').localeCompare(String(a.at || ''))).map((h: any, i: number) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <Clock className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-medium text-gray-800 capitalize">{h.action.replace('_', ' ')}</span>
                  <span className="text-gray-500"> by {h.name} ({h.role})</span>
                  {h.note && <span className="text-gray-500"> — {h.note}</span>}
                  <span className="block text-xs text-gray-400">{fmtDateTime(h.at)}</span>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Modals */}
      {modal === 'decline' && (
        <ActionModal title="Decline Permit" confirmLabel="Decline" confirmClass="bg-rose-600 hover:bg-rose-700" busy={busy === 'decline'} onClose={() => setModal('')} onConfirm={decline}>
          <label className="label">Reason (optional)</label>
          <textarea rows={3} className="input resize-none" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this permit being declined?" />
        </ActionModal>
      )}
      {modal === 'extension' && (
        <ActionModal title="Request Work Extension" confirmLabel="Request Extension" confirmClass="bg-amber-500 hover:bg-amber-600" busy={busy === 'extension'} disabled={!(Number(extHours) > 0 && Number(extHours) <= 4)} onClose={() => setModal('')} onConfirm={requestExtension}>
          <p className="text-xs text-gray-500 mb-2">A permit may be extended by up to <strong>4 hours</strong> beyond its window (max 12 hours total). The assigned EIC must approve.</p>
          <label className="label">Extension (hours, max 4)</label>
          <input type="number" min="0.5" max="4" step="0.5" className="input" value={extHours} onChange={e => setExtHours(e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">Current expiry: {p.expires_at || '—'}</p>
          <label className="label mt-3">Reason (optional)</label>
          <textarea rows={2} className="input resize-none" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is more time needed?" />
        </ActionModal>
      )}
      {modal === 'cancel' && (
        <ActionModal title="Cancel Permit" confirmLabel="Cancel Permit" confirmClass="bg-rose-600 hover:bg-rose-700" busy={busy === 'cancel'} onClose={() => setModal('')} onConfirm={cancel}>
          <label className="label">Reason (optional)</label>
          <textarea rows={3} className="input resize-none" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for cancellation…" />
        </ActionModal>
      )}
      {modal === 'closure' && (
        <ActionModal title="Request Permit Closure" confirmLabel="Request Closure" confirmClass="bg-violet-600 hover:bg-violet-700" busy={busy === 'closure'} disabled={!closureType} onClose={() => setModal('')} onConfirm={requestClosure}>
          <label className="label">Closure status</label>
          <div className="space-y-1.5 mb-3">
            {CLOSURE_OPTIONS.map(opt => (
              <label key={opt} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="closure" className="mt-0.5 accent-indigo-600" checked={closureType === opt} onChange={() => setClosureType(opt)} />
                <span>{opt}</span>
              </label>
            ))}
          </div>
          <label className="label">Note (optional)</label>
          <textarea rows={2} className="input resize-none" value={reason} onChange={e => setReason(e.target.value)} />
          <label className="label mt-3">Closure photos <span className="text-gray-400 font-normal">(work status & housekeeping — up to 2, optional)</span></label>
          <div className="flex flex-wrap gap-2 items-center">
            {closurePhotos.map((f, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-indigo-200 group">
                <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setClosurePhotos(ps => ps.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100"><X className="w-2.5 h-2.5" /></button>
              </div>
            ))}
            {closurePhotos.length < 2 && (
              <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-300 text-gray-400">
                <Camera className="w-4 h-4" /><span className="text-[9px] mt-0.5">{closurePhotos.length}/2</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => { const fs = Array.from(e.target.files || []).slice(0, 2 - closurePhotos.length); setClosurePhotos(ps => [...ps, ...fs]); e.currentTarget.value = '' }} />
              </label>
            )}
          </div>
        </ActionModal>
      )}
    </div>
  )
}
