import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  NotebookPen, FileText, Upload, Plus, Sparkles, Trash2, X,
  Calendar, Loader2, ExternalLink, RefreshCw, FileUp, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '../../lib/api'
import { useAuth } from '../../store/authStore'
import { usePageTitle } from '../../store/pageTitleContext'
import { fmtDate, fmtDateTime } from '../../lib/utils'

const WRITE_ROLES = ['SuperAdmin', 'Admin', 'PSO']

interface Mom {
  id: number
  title: string
  meeting_date: string | null
  project_id: number | null
  project_name: string | null
  attendees: string | null
  entry_type: 'text' | 'pdf'
  content: string | null
  file_path: string | null
  file_name: string | null
  ai_summary: string | null
  ai_summary_at: string | null
  ai_summary_by_name: string | null
  created_by: number
  created_by_name: string | null
  created_at: string | null
}

function TypeBadge({ type }: { type: string }) {
  const pdf = type === 'pdf'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
      pdf ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
    }`}>
      {pdf ? <FileText className="w-3 h-3" /> : <NotebookPen className="w-3 h-3" />}
      {pdf ? 'PDF' : 'Written'}
    </span>
  )
}

// ── Create modal ────────────────────────────────────────────────────────────
function CreateModal({ projects, onClose }: { projects: any[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'text' | 'pdf'>('text')
  const [title, setTitle] = useState('')
  const [meetingDate, setMeetingDate] = useState('')
  const [projectId, setProjectId] = useState('')
  const [attendees, setAttendees] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!title.trim()) { toast.error('Title is required'); return }
    if (mode === 'text' && !content.trim()) { toast.error('Please type the minutes'); return }
    if (mode === 'pdf' && !file) { toast.error('Please choose a PDF file'); return }
    setSaving(true)
    try {
      if (mode === 'text') {
        await api.post('/meeting-minutes/', {
          title: title.trim(),
          meeting_date: meetingDate || null,
          project_id: projectId ? Number(projectId) : null,
          attendees: attendees || null,
          content: content.trim(),
        })
      } else {
        const fd = new FormData()
        fd.append('title', title.trim())
        if (meetingDate) fd.append('meeting_date', meetingDate)
        if (projectId) fd.append('project_id', projectId)
        if (attendees) fd.append('attendees', attendees)
        fd.append('file', file as File)
        await api.post('/meeting-minutes/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      qc.invalidateQueries({ queryKey: ['meeting-minutes'] })
      toast.success('Meeting minutes saved')
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save meeting minutes')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-base font-semibold text-gray-900">New Meeting Minutes</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode toggle */}
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            <button onClick={() => setMode('text')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'text' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
              <NotebookPen className="w-4 h-4" /> Write in app
            </button>
            <button onClick={() => setMode('pdf')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'pdf' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
              <Upload className="w-4 h-4" /> Upload PDF
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label">Title <span className="text-red-500">*</span></label>
              <input className="input" placeholder="e.g. Weekly Site Safety Review" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Meeting date</label>
              <input type="date" className="input" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Project</label>
              <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">General (no project)</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Attendees <span className="text-gray-400 font-normal">(optional)</span></label>
              <input className="input" placeholder="Comma-separated names" value={attendees} onChange={e => setAttendees(e.target.value)} />
            </div>
          </div>

          {mode === 'text' ? (
            <div>
              <label className="label">Minutes <span className="text-red-500">*</span></label>
              <textarea className="input min-h-[200px] resize-y font-mono text-sm leading-relaxed"
                placeholder={'Agenda, discussion points, decisions and action items…'}
                value={content} onChange={e => setContent(e.target.value)} />
            </div>
          ) : (
            <div>
              <label className="label">PDF file <span className="text-red-500">*</span></label>
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-8 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors">
                <FileUp className="w-7 h-7 text-gray-400" />
                {file ? (
                  <span className="text-sm font-medium text-indigo-600">{file.name}</span>
                ) : (
                  <span className="text-sm text-gray-500">Click to choose a PDF (max 25&nbsp;MB)</span>
                )}
                <input type="file" accept="application/pdf" className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
              <p className="text-xs text-gray-400 mt-2">
                After saving, you can generate a crisp AI summary from the PDF.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary btn-sm">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detail modal ──────────────────────────────────────────────────────────
function DetailModal({ mom, canDelete, onClose }: { mom: Mom; canDelete: boolean; onClose: () => void }) {
  const qc = useQueryClient()

  const genSummary = useMutation({
    mutationFn: () => api.post(`/meeting-minutes/${mom.id}/ai-summary`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting-minutes'] })
      toast.success('AI summary generated')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to generate AI summary'),
  })

  const del = useMutation({
    mutationFn: () => api.delete(`/meeting-minutes/${mom.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meeting-minutes'] }); toast.success('Deleted'); onClose() },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to delete'),
  })

  const busy = genSummary.isPending
  const hasSummary = !!mom.ai_summary

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-gray-900 truncate">{mom.title}</h2>
              <TypeBadge type={mom.entry_type} />
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 flex-wrap">
              {mom.meeting_date && <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(mom.meeting_date)}</span>}
              {mom.project_name && <span>{mom.project_name}</span>}
              {mom.created_by_name && <span>Added by {mom.created_by_name}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {mom.attendees && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Attendees</p>
              <p className="text-sm text-gray-700">{mom.attendees}</p>
            </div>
          )}

          {/* Body: PDF link or typed content */}
          {mom.entry_type === 'pdf' ? (
            <a href={`/uploads/${mom.file_path}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-rose-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{mom.file_name || 'Minutes.pdf'}</p>
                <p className="text-xs text-gray-400">Open the uploaded PDF</p>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </a>
          ) : (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Minutes</p>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 border border-gray-100 rounded-xl p-4 max-h-[40vh] overflow-y-auto">
                {mom.content}
              </div>
            </div>
          )}

          {/* AI summary */}
          <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50/40 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-violet-100">
              <Sparkles className="w-3.5 h-3.5 text-violet-600" />
              <span className="text-xs font-semibold tracking-wide text-violet-800 uppercase">AI Summary</span>
              <button onClick={() => genSummary.mutate()} disabled={busy}
                className="btn-sm ml-auto gap-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : hasSummary ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                <span className="text-xs">{busy ? 'Generating…' : hasSummary ? 'Regenerate' : 'Generate'}</span>
              </button>
            </div>
            <div className="px-4 py-3">
              {hasSummary ? (
                <>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{mom.ai_summary}</p>
                  <p className="mt-2.5 text-[11px] text-violet-500/90">
                    Generated{mom.ai_summary_by_name ? ` by ${mom.ai_summary_by_name}` : ''}
                    {mom.ai_summary_at ? ` · ${fmtDateTime(mom.ai_summary_at)}` : ''}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400 italic">
                  {busy ? 'Reading the minutes and writing a crisp summary…'
                        : 'No AI summary yet. Generate a crisp, concise summary of these minutes.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {canDelete && (
          <div className="flex items-center justify-end px-5 py-4 border-t border-gray-100">
            <button onClick={() => { if (confirm('Delete these meeting minutes? This cannot be undone.')) del.mutate() }}
              disabled={del.isPending}
              className="btn-sm gap-1.5 rounded-lg text-red-600 hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function MeetingMinutes() {
  usePageTitle('Meeting Minutes', 'Minutes of meeting (MoM) records & summaries')
  const { user } = useAuth()
  const canWrite = WRITE_ROLES.includes(user?.role || '')

  const [projectId, setProjectId] = useState('')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detail, setDetail] = useState<Mom | null>(null)

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => api.get('/projects/').then(r => r.data) })
  const { data, isLoading } = useQuery({
    queryKey: ['meeting-minutes', projectId, search],
    queryFn: () => api.get('/meeting-minutes/', {
      params: { project_id: projectId ? [Number(projectId)] : undefined, search: search || undefined },
    }).then(r => r.data),
  })

  const minutes: Mom[] = data?.minutes || []
  const canDelete = (m: Mom) => user?.role === 'SuperAdmin' || user?.role === 'Admin' || (m.created_by === user?.id && canWrite)

  return (
    <div className="space-y-4">
      {createOpen && <CreateModal projects={projects || []} onClose={() => setCreateOpen(false)} />}
      {detail && <DetailModal mom={detail} canDelete={canDelete(detail)} onClose={() => setDetail(null)} />}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <NotebookPen className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Meeting Minutes</h1>
            <p className="text-xs text-gray-400">Record MoM in the app or upload a PDF, then generate an AI summary</p>
          </div>
        </div>
        {canWrite && (
          <button onClick={() => setCreateOpen(true)} className="btn-primary btn-sm">
            <Plus className="w-3.5 h-3.5" /> New Minutes
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px]">
            <label className="label">Project</label>
            <select className="input !py-1.5 text-sm" value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">All projects</option>
              {(projects || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="label">Search</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input className="input !py-1.5 pl-8 text-sm" placeholder="Title, attendees or content…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : minutes.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
            <NotebookPen className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-600">No meeting minutes yet</p>
          <p className="text-xs text-gray-400 mt-1">
            {canWrite ? 'Add minutes directly or upload a PDF to get started.' : 'Minutes added by PSO / Admin will appear here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {minutes.map(m => (
            <button key={m.id} onClick={() => setDetail(m)}
              className="card p-4 text-left hover:shadow-md hover:border-indigo-200 transition-all flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{m.title}</h3>
                <TypeBadge type={m.entry_type} />
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                {m.meeting_date && <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(m.meeting_date)}</span>}
                {m.project_name && <span className="truncate">· {m.project_name}</span>}
              </div>
              <div className="mt-auto flex items-center justify-between pt-1">
                <span className="text-[11px] text-gray-400 truncate">{m.created_by_name}</span>
                {m.ai_summary && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600">
                    <Sparkles className="w-3 h-3" /> Summary
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
