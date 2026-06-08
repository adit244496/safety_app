import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Edit, Send, Camera, X, Paperclip,
  ImageIcon, MessageSquare, ClipboardCheck,
  ChevronDown, ChevronUp, Maximize2, Minimize2,
  AlertTriangle, CheckCircle2, ShieldAlert,
  MapPin, Target, RefreshCw,
} from 'lucide-react'
import api from '../../lib/api'
import { fmtDateTime, getStatusClass } from '../../lib/utils'
import { useAuth } from '../../store/authStore'

// ── Role colour tokens ────────────────────────────────────────────────────
const ROLE: Record<string, { avatarBg: string; badgeBg: string; badgeText: string; borderColor: string }> = {
  Admin:      { avatarBg: 'bg-rose-500',   badgeBg: 'bg-rose-100',   badgeText: 'text-rose-800',   borderColor: '#f43f5e' },
  PIC:        { avatarBg: 'bg-indigo-500', badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-800', borderColor: '#6366f1' },
  AIC:        { avatarBg: 'bg-blue-500',   badgeBg: 'bg-blue-100',   badgeText: 'text-blue-800',   borderColor: '#3b82f6' },
  HO:         { avatarBg: 'bg-violet-500', badgeBg: 'bg-violet-100', badgeText: 'text-violet-800', borderColor: '#8b5cf6' },
  Contractor: { avatarBg: 'bg-amber-500',  badgeBg: 'bg-amber-100',  badgeText: 'text-amber-800',  borderColor: '#f59e0b' },
  Observer:   { avatarBg: 'bg-teal-500',   badgeBg: 'bg-teal-100',   badgeText: 'text-teal-800',   borderColor: '#14b8a6' },
}
const DEF_ROLE = { avatarBg: 'bg-slate-400', badgeBg: 'bg-gray-100', badgeText: 'text-gray-700', borderColor: '#94a3b8' }
const roleStyle = (r?: string | null) => ROLE[r || ''] ?? DEF_ROLE

// ── Timeline helpers ──────────────────────────────────────────────────────
type TLItem =
  | { kind: 'created'; name: string; role: string; ts: string }
  | { kind: 'comment'; id: number; name: string; role: string; ts: string; text: string }
  | { kind: 'photos';  key: string; name: string; role: string; ts: string; images: any[] }

function buildTimeline(obs: any): TLItem[] {
  const items: TLItem[] = []
  items.push({ kind: 'created', name: obs.created_by_name || 'Unknown', role: obs.creator_role || '', ts: obs.created_at || '' })
  for (const c of obs.comments ?? []) {
    items.push({ kind: 'comment', id: c.id, name: c.user_name || 'Unknown', role: c.user_role || '', ts: c.created_at || '', text: c.comment })
  }
  const byKey = new Map<string, any[]>()
  for (const img of obs.images ?? []) {
    const minute = (img.created_at || '').slice(0, 16)
    const key = `${img.uploaded_by ?? 'anon'}-${minute}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(img)
  }
  for (const [key, imgs] of byKey) {
    const f = imgs[0]
    items.push({ kind: 'photos', key, name: f.uploader_name || 'Unknown', role: f.uploader_role || '', ts: f.created_at || '', images: imgs })
  }
  return items.sort((a, b) => a.ts.localeCompare(b.ts))
}

function relTime(iso?: string) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return fmtDateTime(iso)
}

// ── Avatar ────────────────────────────────────────────────────────────────
function Avatar({ name, role }: { name: string; role?: string }) {
  const s = roleStyle(role)
  return (
    <div className={`w-8 h-8 ${s.avatarBg} rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm`}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// ── Lightbox ──────────────────────────────────────────────────────────────
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white bg-white/20 hover:bg-white/30 rounded-full p-2 transition-colors">
        <X className="w-5 h-5" />
      </button>
      <img src={src} alt="" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
    </div>
  )
}

// ── Photo strip ───────────────────────────────────────────────────────────
function PhotoStrip({ images, onOpen }: { images: any[]; onOpen: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {images.map((img: any) => (
        <button key={img.id} onClick={() => onOpen(`/uploads/${img.file_path}`)}
          className="relative group rounded-lg overflow-hidden border-2 border-white shadow ring-1 ring-gray-200 hover:ring-indigo-400 transition-all"
          title={`${img.image_type} — click to enlarge`}>
          <img src={`/uploads/${img.file_path}`} alt="" className="w-11 h-11 object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <ImageIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] font-semibold bg-black/50 text-white py-0.5 capitalize">
            {img.image_type}
          </span>
        </button>
      ))}
    </div>
  )
}

// ── Timeline message ──────────────────────────────────────────────────────
function TLMessage({ item, onOpen }: { item: TLItem; onOpen: (s: string) => void }) {
  const s = roleStyle(item.role)
  const header = (
    <div className="flex items-center gap-2 flex-wrap mb-1">
      <span className="text-xs font-semibold text-gray-900">{item.name}</span>
      {item.role && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.badgeBg} ${s.badgeText}`}>{item.role}</span>}
      <span className="text-[10px] text-gray-400">{relTime(item.ts)}</span>
    </div>
  )
  const bubbleBase = 'rounded-xl rounded-tl-none px-3 py-2.5 bg-white border border-gray-100 shadow-sm'

  if (item.kind === 'created') return (
    <div className="flex items-start gap-2.5">
      <Avatar name={item.name} role={item.role} />
      <div className="flex-1 min-w-0">
        {header}
        <div className={`${bubbleBase} bg-gray-50`} style={{ borderLeftColor: s.borderColor, borderLeftWidth: 3 }}>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <ClipboardCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: s.borderColor }} />
            Observation submitted
          </span>
        </div>
      </div>
    </div>
  )

  if (item.kind === 'comment') return (
    <div className="flex items-start gap-2.5">
      <Avatar name={item.name} role={item.role} />
      <div className="flex-1 min-w-0">
        {header}
        <div className={bubbleBase} style={{ borderLeftColor: s.borderColor, borderLeftWidth: 3 }}>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{item.text}</p>
        </div>
      </div>
    </div>
  )

  if (item.kind === 'photos') {
    const typeLabel = [...new Set(item.images.map((i: any) => i.image_type))].join(', ')
    return (
      <div className="flex items-start gap-2.5">
        <Avatar name={item.name} role={item.role} />
        <div className="flex-1 min-w-0">
          {header}
          <div className={bubbleBase} style={{ borderLeftColor: s.borderColor, borderLeftWidth: 3 }}>
            <span className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <ImageIcon className="w-3 h-3" style={{ color: s.borderColor }} />
              {item.images.length === 1 ? '1 photo' : `${item.images.length} photos`} uploaded
              {typeLabel && <span className="capitalize text-[10px] bg-gray-100 px-1.5 py-0.5 rounded-full">{typeLabel}</span>}
            </span>
            <PhotoStrip images={item.images} onOpen={onOpen} />
          </div>
        </div>
      </div>
    )
  }
  return null
}

// ── Section card (collapsible with gradient header) ───────────────────────
function Section({ title, icon, children, defaultOpen = true, extra }: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  extra?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="section-card">
      <div className={`section-card-header ${extra ? 'flex-wrap gap-y-2' : ''}`}>
        {icon && <span className="text-indigo-500 flex-shrink-0">{icon}</span>}
        <button
          className="flex items-center gap-2 flex-1 text-left min-w-0 group"
          onClick={() => setOpen(o => !o)}
        >
          <h2 className="flex-1 truncate">{title}</h2>
          {open
            ? <ChevronUp className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-600 transition-colors flex-shrink-0" />
            : <ChevronDown className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-600 transition-colors flex-shrink-0" />
          }
        </button>
        {extra && (
          <div
            className="flex items-center gap-2 w-full sm:w-auto sm:pl-3 sm:border-l sm:border-indigo-100 flex-shrink-0"
            onClick={e => e.stopPropagation()}
          >
            {extra}
          </div>
        )}
      </div>
      {open && <div className="section-card-body">{children}</div>}
    </div>
  )
}

// ── Info field (label + value in column) ──────────────────────────────────
function InfoField({ label, value }: { label: string; value?: string | number | null }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</span>
      <span className="text-sm text-gray-900 font-medium break-words">{value}</span>
    </div>
  )
}

// ── Risk assessment card ───────────────────────────────────────────────────
function RiskCard({ obs }: { obs: any }) {
  const level: string = obs.risk_level || ''
  const factor: number | null = obs.risk_factor ?? null

  const palette =
    level === 'High'   ? { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-800',    badge: 'bg-rose-500',    bar: '#f43f5e', icon: AlertTriangle  } :
    level === 'Medium' ? { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   badge: 'bg-amber-500',   bar: '#f59e0b', icon: ShieldAlert    } :
                         { bg: 'bg-emerald-50',  border: 'border-emerald-200',  text: 'text-emerald-800',  badge: 'bg-emerald-500',  bar: '#10b981', icon: CheckCircle2 }

  const Icon = palette.icon
  const sevPct  = ((obs.severity   ?? 0) / 5) * 100
  const probPct = ((obs.probability ?? 0) / 5) * 100

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden ${palette.bg} ${palette.border}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-9 h-9 ${palette.badge} rounded-xl flex items-center justify-center shadow-sm flex-shrink-0`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${palette.text} opacity-70`}>Risk Assessment</p>
          <p className={`text-sm font-bold ${palette.text}`}>
            {level ? `${level} Risk` : 'Not assessed'}
            {factor != null && <span className="ml-2 opacity-60">· Score: {factor}</span>}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-3xl font-black ${palette.text}`}>{factor ?? '—'}</p>
          <p className={`text-[10px] ${palette.text} opacity-60`}>risk score</p>
        </div>
      </div>
      <div className={`border-t ${palette.border} px-4 py-3 grid grid-cols-2 gap-4`}>
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className={`${palette.text} font-medium`}>Severity</span>
            <span className={`${palette.text} font-bold`}>{obs.severity ?? '—'} / 5</span>
          </div>
          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${sevPct}%`, backgroundColor: palette.bar }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className={`${palette.text} font-medium`}>Probability</span>
            <span className={`${palette.text} font-bold`}>{obs.probability ?? '—'} / 5</span>
          </div>
          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${probPct}%`, backgroundColor: palette.bar }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Reply form ────────────────────────────────────────────────────────────
function ReplyForm({ onSubmit, isPending, isContractor, defaultImageType = 'followup' }: {
  onSubmit: (text: string, files: File[], imageType: string) => void
  isPending: boolean
  isContractor: boolean
  defaultImageType?: string
}) {
  const [comment, setComment] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [imgType, setImgType] = useState(defaultImageType)
  const imgRef = useRef<HTMLInputElement>(null)

  const addFiles = (fl: FileList | null) => {
    if (!fl) return
    const arr = Array.from(fl)
    setFiles(p => [...p, ...arr])
    arr.forEach(f => setPreviews(p => [...p, URL.createObjectURL(f)]))
  }
  const removeFile = (i: number) => {
    setFiles(p => p.filter((_, idx) => idx !== i))
    setPreviews(p => p.filter((_, idx) => idx !== i))
  }
  const submit = () => {
    if (!comment.trim()) return
    onSubmit(comment, files, imgType)
    setComment(''); setFiles([]); setPreviews([])
  }

  return (
    <div className="space-y-2">
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {previews.map((url, i) => (
            <div key={i} className="relative group">
              <img src={url} alt="" className="w-12 h-12 object-cover rounded-lg border border-gray-200" />
              <button type="button" onClick={() => removeFile(i)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        className="input min-h-[60px] resize-none text-sm"
        placeholder={isContractor ? 'Add compliance update or rectification note…' : 'Add a comment…'}
        value={comment}
        onChange={e => setComment(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && comment.trim()) { e.preventDefault(); submit() } }}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => imgRef.current?.click()}
          className="btn-ghost btn-sm !px-2 text-gray-500 hover:text-indigo-600 gap-1.5 flex-shrink-0">
          <Paperclip className="w-3.5 h-3.5" />
          <span className="text-xs">Photo</span>
        </button>
        {files.length > 0 && (
          <select
            className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={imgType}
            onChange={e => setImgType(e.target.value)}
          >
            <option value="initial">Initial</option>
            <option value="followup">Follow-up</option>
            <option value="closure">Closure</option>
          </select>
        )}
        <input ref={imgRef} type="file" multiple accept="image/*" className="hidden" onChange={e => addFiles(e.target.files)} />
        <span className="text-[10px] text-gray-300 ml-auto hidden sm:block">Ctrl+Enter to send</span>
        <button onClick={submit} disabled={!comment.trim() || isPending} className="btn-primary btn-sm gap-1.5 flex-shrink-0">
          {isPending
            ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
            : <><Send className="w-3 h-3" />{isContractor ? 'Reply' : 'Send'}</>}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function ObservationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const fsEndRef = useRef<HTMLDivElement>(null)
  const chatPanelRef = useRef<HTMLDivElement>(null)
  const threadScrollRef = useRef<HTMLDivElement>(null)
  const fsScrollRef = useRef<HTMLDivElement>(null)

  const [imageType, setImageType] = useState('followup')
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [convoFullscreen, setConvoFullscreen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [statusComment, setStatusComment] = useState('')

  const { data: obs, isLoading } = useQuery({
    queryKey: ['observation', id],
    queryFn: () => api.get(`/observations/${id}`).then(r => r.data),
  })

  const scrollToBottom = (el: HTMLDivElement | null, smooth = true) => {
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' })
  }

  // Jump to bottom instantly on first load, smoothly on new messages
  const prevEventCount = useRef(0)
  useEffect(() => {
    const count = (obs?.comments?.length ?? 0) + (obs?.images?.length ?? 0)
    const isFirstLoad = prevEventCount.current === 0 && count > 0
    scrollToBottom(threadScrollRef.current, !isFirstLoad)
    scrollToBottom(fsScrollRef.current, !isFirstLoad)
    prevEventCount.current = count
  }, [obs?.comments?.length, obs?.images?.length])

  useEffect(() => {
    document.body.style.overflow = convoFullscreen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [convoFullscreen])

  const addCommentMutation = useMutation({
    mutationFn: async ({ text, files, imgType }: { text: string; files: File[]; imgType: string }) => {
      await api.post(`/observations/${obs?.id}/comments`, { comment: text })
      if (files.length > 0) {
        const fd = new FormData()
        files.forEach(f => fd.append('files', f))
        fd.append('image_type', imgType)
        await api.post(`/observations/${obs!.id}/images`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
    },
    onMutate: async ({ text }: { text: string; files: File[]; imgType: string }) => {
      await qc.cancelQueries({ queryKey: ['observation', id] })
      const previous = qc.getQueryData<any>(['observation', id])
      qc.setQueryData(['observation', id], (old: any) => {
        if (!old) return old
        return {
          ...old,
          comments: [
            ...(old.comments ?? []),
            {
              id: -Date.now(),
              comment: text,
              user_id: user?.id ?? null,
              user_name: user?.name ?? '',
              user_role: user?.role ?? null,
              created_at: new Date().toISOString(),
            },
          ],
        }
      })
      return { previous }
    },
    onError: (_err: unknown, _vars: unknown, context: any) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(['observation', id], context.previous)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['observation', id] }),
  })

  const uploadImages = async (files: FileList | null) => {
    if (!files || !obs) return
    const fd = new FormData()
    Array.from(files).forEach(f => fd.append('files', f))
    fd.append('image_type', imageType)
    await api.post(`/observations/${obs.id}/images`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    qc.invalidateQueries({ queryKey: ['observation', id] })
  }

  const deleteImage = useMutation({
    mutationFn: (imgId: number) => api.delete(`/images/${imgId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['observation', id] }),
  })

  const changeStatus = useMutation({
    mutationFn: async ({ status, comment }: { status: string; comment: string }) => {
      await api.patch(`/observations/${obs?.id}/status`, { status })
      if (comment.trim()) {
        await api.post(`/observations/${obs?.id}/comments`, {
          comment: `Status changed to "${status}". ${comment}`.trim(),
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['observation', id] })
      qc.invalidateQueries({ queryKey: ['observations'] })
      setStatusOpen(false); setStatusComment(''); setNewStatus('')
    },
  })

  // Scroll chat panel into view when navigated with #conversation
  useEffect(() => {
    if (location.hash === '#conversation' && chatPanelRef.current) {
      setTimeout(() => chatPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200)
    }
  }, [location.hash, obs])

  if (isLoading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
    </div>
  )
  if (!obs) return <div className="text-center text-gray-500 py-12">Observation not found</div>

  const canEdit      = ['Admin', 'HO', 'Observer'].includes(user?.role || '')
  const canUpload    = ['Admin', 'HO', 'Observer', 'Contractor'].includes(user?.role || '')
  const canComment   = ['Admin', 'HO', 'Observer', 'Contractor'].includes(user?.role || '')
  const isContractor = user?.role === 'Contractor'

  const riskBg = obs.risk_level === 'High'   ? 'bg-rose-100 text-rose-800 border-rose-200'
    : obs.risk_level === 'Medium' ? 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-emerald-100 text-emerald-800 border-emerald-200'

  const timeline = buildTimeline(obs)

  const handleReply = (text: string, files: File[], imgType: string) =>
    addCommentMutation.mutate({ text, files, imgType })

  const ThreadItems = ({ endRef }: { endRef: React.RefObject<HTMLDivElement> }) => (
    <>
      {timeline.map(item => (
        <TLMessage
          key={item.kind === 'photos' ? item.key : `${item.kind}-${(item as any).id ?? item.ts}`}
          item={item}
          onOpen={setLightboxSrc}
        />
      ))}
      <div ref={endRef} />
    </>
  )

  return (
    <div className="space-y-4">
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {/* ── Full-screen conversation overlay ── */}
      {convoFullscreen && (
        <div className="fixed inset-0 z-40 flex flex-col" style={{ background: '#f8fafc' }}>
          <div className="bg-white border-b border-gray-100 shadow-sm flex items-center gap-3 px-5 py-3 flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-indigo-500" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">Conversation</p>
              <p className="text-xs text-gray-400 font-mono">{obs.observation_id} · {timeline.length} events</p>
            </div>
            <button onClick={() => setConvoFullscreen(false)} className="btn-ghost btn-sm gap-1.5 !text-gray-600">
              <Minimize2 className="w-4 h-4" /> Minimise
            </button>
          </div>
          <div ref={fsScrollRef} className="flex-1 overflow-y-auto thin-scroll">
            <div className="max-w-2xl mx-auto w-full px-5 py-6 space-y-5">
              <ThreadItems endRef={fsEndRef} />
            </div>
          </div>
          {canComment && (
            <div className="bg-white border-t border-gray-100 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] flex-shrink-0">
              <div className="max-w-2xl mx-auto w-full px-5 py-4">
                <ReplyForm
                  onSubmit={handleReply}
                  isPending={addCommentMutation.isPending}
                  isContractor={isContractor}
                  defaultImageType={isContractor ? 'closure' : 'followup'}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Page header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate(-1)} className="btn-ghost btn-sm flex-shrink-0 mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg tracking-wide">
                {obs.observation_id}
              </span>
              <span className={getStatusClass(obs.status)}>{obs.status}</span>
              {obs.risk_level && (
                <span className={`badge border ${riskBg}`}>{obs.risk_level} · {obs.risk_factor}</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {obs.created_by_name} &nbsp;·&nbsp; {fmtDateTime(obs.created_at)}
            </p>
          </div>
        </div>
        {canEdit && !isContractor && (
          <button onClick={() => navigate(`/observations/${obs.id}/edit`)} className="btn-secondary btn-sm self-start sm:self-auto flex-shrink-0 ml-9 sm:ml-0">
            <Edit className="w-4 h-4" />
            <span className="hidden sm:inline">Edit Observation</span>
            <span className="sm:hidden">Edit</span>
          </button>
        )}
      </div>

      {/* ── Main grid: 65 / 35 ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5 items-start">

        {/* ─── LEFT: detail sections ─── */}
        <div className="space-y-4 min-w-0">

          {/* Risk assessment */}
          {obs.risk_level && <RiskCard obs={obs} />}

          {/* Site & key information */}
          <Section title="Site Information" icon={<MapPin className="w-3.5 h-3.5" />} defaultOpen>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              <InfoField label="Project" value={obs.project_name} />
              <InfoField label="Contractor" value={obs.contractor_name} />
              <InfoField label="Observer" value={obs.observer_name} />
              <InfoField label="Observation Date" value={obs.obs_date} />
              <InfoField label="Building / Tower" value={obs.building_name} />
              <InfoField label="Floor" value={obs.floor_name} />
              <InfoField label="Time" value={obs.obs_time} />
              <InfoField label="To Be Rectified By" value={obs.to_be_rectified_by} />
              {obs.exact_location && (
                <div className="sm:col-span-2">
                  <InfoField label="Exact Location" value={obs.exact_location} />
                </div>
              )}
            </div>
          </Section>

          {/* Observation details */}
          <Section title="Observation Details" icon={<AlertTriangle className="w-3.5 h-3.5" />} defaultOpen>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                <InfoField label="Core Concern" value={obs.core_concern_name} />
                <InfoField label="Specific Concern" value={obs.specific_concern_name} />
                <InfoField label="Possible Outcome" value={obs.possible_outcome} />
                <InfoField label="Target Date" value={obs.target_date_name} />
              </div>
              {obs.specific_concern_text && (
                <div className="mt-1 p-3.5 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1.5">Additional Details</p>
                  <p className="text-sm text-gray-800 leading-relaxed">{obs.specific_concern_text}</p>
                </div>
              )}
            </div>
          </Section>

          {/* Root cause & violation */}
          <Section title="Root Cause & Violation" icon={<Target className="w-3.5 h-3.5" />} defaultOpen={false}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              <InfoField label="Root Cause Category" value={obs.root_cause_category_name} />
              <InfoField label="Specific Root Cause" value={obs.root_cause_specific_name} />
              <div className="sm:col-span-2">
                <InfoField label="Violation Caused Due To" value={obs.violation_name} />
              </div>
            </div>
          </Section>

          {/* Photos */}
          <Section
            title={`Evidence Photos (${obs.images?.length || 0})`}
            icon={<Camera className="w-3.5 h-3.5" />}
            defaultOpen
            extra={
              canUpload ? (
                <>
                  <select
                    className="flex-1 sm:flex-none text-xs border border-indigo-200 rounded-md px-2 py-1 text-indigo-700 bg-white focus:outline-none"
                    value={imageType}
                    onChange={e => setImageType(e.target.value)}
                  >
                    <option value="initial">Initial</option>
                    <option value="followup">Follow-up</option>
                    <option value="closure">Closure</option>
                  </select>
                  <button onClick={() => fileRef.current?.click()} className="btn-secondary btn-sm flex-shrink-0">
                    <Camera className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Add Photo</span>
                  </button>
                  <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={e => uploadImages(e.target.files)} />
                </>
              ) : undefined
            }
          >
            {!obs.images?.length ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <Camera className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm font-medium">No photos uploaded yet</p>
                {canUpload && <p className="text-xs mt-1 opacity-70">Use the Add Photo button above</p>}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {obs.images.map((img: any) => (
                  <div
                    key={img.id}
                    className="relative group rounded-xl overflow-hidden border border-gray-100 cursor-pointer shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
                    onClick={() => setLightboxSrc(`/uploads/${img.file_path}`)}
                  >
                    <img src={`/uploads/${img.file_path}`} alt={img.file_name} className="w-full h-28 object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full capitalize
                        ${img.image_type === 'closure' ? 'bg-emerald-500 text-white' :
                          img.image_type === 'initial' ? 'bg-rose-500 text-white' :
                          'bg-amber-500 text-white'}`}>
                        {img.image_type}
                      </span>
                      <p className="text-white/80 text-[9px] mt-0.5">{img.uploader_name}</p>
                    </div>
                    {(user?.role === 'Admin' || img.uploaded_by === user?.id) && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteImage.mutate(img.id) }}
                        className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* ─── RIGHT: sticky conversation panel ─── */}
        <div ref={chatPanelRef} id="conversation" className="h-[60vh] sm:h-[72vh] xl:sticky xl:top-6 xl:h-[calc(100vh-3.5rem)] flex flex-col rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">

          {/* Chat header — gradient */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
          >
            <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-white leading-tight">Conversation</p>
                <p className="text-[10px] text-indigo-200 font-mono flex-shrink-0">
                  {obs.observation_id} · {timeline.length} event{timeline.length !== 1 ? 's' : ''}
                </p>
              </div>
              {/* Single-line meta strip */}
              <div className="flex items-center justify-between gap-2 mt-1 min-w-0">
                <p className="text-[10px] text-indigo-200 truncate leading-relaxed">
                  {[
                    obs.contractor_name,
                    obs.project_name,
                    obs.core_concern_name,
                    obs.risk_level && obs.risk_factor != null ? `${obs.risk_level} · ${obs.risk_factor}` : obs.risk_level,
                    obs.obs_date ? `raised on ${obs.obs_date}` : null,
                  ].filter(Boolean).join(' — ')}
                </p>
                {obs.target_date_name && (
                  <p className="text-[10px] text-indigo-300 flex-shrink-0 font-medium">
                    Target: {obs.target_date_name}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setConvoFullscreen(true)}
              className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
              title="Expand conversation"
            >
              <Maximize2 className="w-3.5 h-3.5 text-white" />
            </button>
          </div>

          {/* Status sub-bar + change status */}
          <div className="border-b border-gray-100 flex-shrink-0">
            <div className="px-4 py-2 bg-slate-50 flex items-center gap-2.5">
              <span className={getStatusClass(obs.status)}>{obs.status}</span>
              {obs.updated_at && (
                <span className="text-[11px] text-gray-400">
                  Updated {relTime(obs.updated_at)}
                </span>
              )}
              {canEdit && !isContractor && (
                <button
                  onClick={() => { setStatusOpen(o => !o); setNewStatus(obs.status) }}
                  className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> Change Status
                </button>
              )}
            </div>
            {statusOpen && (
              <div className="px-4 py-3 bg-indigo-50/60 border-t border-indigo-100 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    className="text-xs border border-indigo-200 rounded-lg px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 flex-1"
                    value={newStatus}
                    onChange={e => setNewStatus(e.target.value)}
                  >
                    {['Open', 'Pending', 'Under Review', 'Partially Closed', 'Closed'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setStatusOpen(false)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  className="w-full text-xs border border-indigo-200 rounded-lg px-2.5 py-2 bg-white resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  rows={2}
                  placeholder="Add a comment (optional)…"
                  value={statusComment}
                  onChange={e => setStatusComment(e.target.value)}
                />
                <button
                  disabled={!newStatus || changeStatus.isPending}
                  onClick={() => changeStatus.mutate({ status: newStatus, comment: statusComment })}
                  className="btn-primary btn-sm w-full justify-center"
                >
                  {changeStatus.isPending
                    ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                    : <><RefreshCw className="w-3 h-3" /> Update Status</>}
                </button>
              </div>
            )}
          </div>

          {/* Contractor compliance hint + status change */}
          {isContractor && !['Closed', 'Partially Closed'].includes(obs.status) && (
            <div className="mx-3 mt-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex-shrink-0 space-y-2">
              <div className="flex items-start gap-2">
                <Camera className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  <span className="font-semibold">Action required:</span> Add a comment and attach closure photos to demonstrate rectification.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="text-xs border border-amber-200 rounded-lg px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-400 flex-1"
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value)}
                >
                  <option value="">Mark progress…</option>
                  <option value="Partially Closed">Partially Closed</option>
                  <option value="Closed">Closed</option>
                </select>
                <button
                  disabled={!newStatus || changeStatus.isPending}
                  onClick={() => changeStatus.mutate({ status: newStatus, comment: statusComment })}
                  className="btn-primary btn-sm flex-shrink-0"
                >
                  {changeStatus.isPending
                    ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                    : <RefreshCw className="w-3 h-3" />}
                </button>
              </div>
            </div>
          )}

          {/* Thread — scrollable, latest at bottom like WhatsApp */}
          <div ref={threadScrollRef} className="flex-1 overflow-y-auto thin-scroll px-4 py-4 space-y-4 bg-slate-50/50 min-h-0">
            {timeline.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-300 py-8">
                <MessageSquare className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">No activity yet</p>
              </div>
            )}
            <ThreadItems endRef={threadEndRef} />
          </div>

          {/* Reply form */}
          {canComment ? (
            <div className="border-t border-gray-100 bg-white px-4 py-3 flex-shrink-0">
              <ReplyForm
                onSubmit={handleReply}
                isPending={addCommentMutation.isPending}
                isContractor={isContractor}
                defaultImageType={isContractor ? 'closure' : 'followup'}
              />
            </div>
          ) : (
            <div className="border-t border-gray-100 bg-slate-50 px-4 py-3 text-center flex-shrink-0">
              <p className="text-xs text-gray-400">View only — comments not available for your role</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
