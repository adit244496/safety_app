import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle2, XCircle, Ban, DoorClosed, Pencil, Trash2, AlertTriangle, X,
  FileText, ShieldAlert, UserCheck, History, Clock,
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

  const [modal, setModal] = useState<'' | 'decline' | 'cancel' | 'closure'>('')
  const [reason, setReason] = useState('')
  const [closureType, setClosureType] = useState('')
  const [busy, setBusy] = useState('')

  const { data: p, isLoading } = useQuery({ queryKey: ['work-permit', id], queryFn: () => api.get(`/work-permits/${id}`).then(r => r.data) })
  const { data: config } = useQuery<any[]>({ queryKey: ['permit-config-all'], queryFn: () => api.get('/work-permits/config', { params: { include_inactive: true } }).then(r => r.data), staleTime: 300_000 })

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
  const requestClosure = () => act(async () => { await api.post(`/work-permits/${p.id}/request-closure`, { closure_type: closureType, note: reason }); toast.success('Closure requested') }, 'closure')
  const approveClosure = () => act(async () => { await api.post(`/work-permits/${p.id}/approve-closure`); toast.success('Permit closed') }, 'approve-closure')
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

      {/* History */}
      {p.history?.length > 0 && (
        <Card title="History" icon={<History className="w-3.5 h-3.5" />}>
          <ol className="space-y-2.5">
            {p.history.map((h: any, i: number) => (
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
        </ActionModal>
      )}
    </div>
  )
}
