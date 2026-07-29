import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts'
import {
  GraduationCap, Users, Clock, Award, Plus, Pencil, Trash2, Download,
  ChevronRight, Search, LayoutList, BarChart3, X, ClipboardCheck, CheckCircle2, XCircle, MinusCircle, CircleDashed,
} from 'lucide-react'
import { toast } from 'sonner'
import ExcelJS from 'exceljs'
import { usePageTitle } from '../../store/pageTitleContext'
import { useAuth } from '../../store/authStore'
import api from '../../lib/api'
import { fmtDate } from '../../lib/utils'
import { MultiSelectFilter, type MSOption } from '../../components/MultiSelectFilter'

const STALE = { staleTime: 5 * 60 * 1000 } as const
const WRITE_ROLES = ['SuperAdmin', 'Admin', 'HO', 'PSO', 'Observer']

const TYPE_OPTIONS: MSOption[] = [
  { value: 'Technical', label: 'Technical' },
  { value: 'Refresher', label: 'Refresher' },
  { value: 'Post-Incident', label: 'Post-Incident' },
  { value: 'Corrective', label: 'Corrective' },
]

const TYPE_COLORS: Record<string, string> = {
  Technical: '#6366f1', Refresher: '#0ea5e9', 'Post-Incident': '#f43f5e', Corrective: '#f59e0b',
}
const BAR_PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#ec4899']

const STATUS_META: Record<string, { color: string; bg: string; label: string }> = {
  Passed: { color: '#059669', bg: '#ecfdf5', label: 'Passed' },
  Failed: { color: '#dc2626', bg: '#fef2f2', label: 'Failed' },
  Pending: { color: '#d97706', bg: '#fffbeb', label: 'Pending' },
  NA: { color: '#64748b', bg: '#f8fafc', label: 'N/A' },
}

function fmtDuration(mins?: number | null) {
  if (!mins) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h ? `${h}h ${m ? `${m}m` : ''}`.trim() : `${m}m`
}

function projectsLabel(t: any): string {
  const names: string[] = t.project_names || (t.project_name ? [t.project_name] : [])
  if (!names.length) return '—'
  if (names.length === 1) return names[0]
  return `${names[0]} +${names.length - 1}`
}

function StatCard({ icon, label, value, tint }: { icon: React.ReactNode; label: string; value: React.ReactNode; tint: string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${tint}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-xs text-gray-500 truncate">{label}</p>
      </div>
    </div>
  )
}

function TypeBadge({ type }: { type?: string | null }) {
  if (!type) return <span className="text-gray-400">—</span>
  const color = TYPE_COLORS[type] || '#64748b'
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${color}1a`, color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{type}
    </span>
  )
}

function StatusBadge({ status }: { status?: string | null }) {
  const m = STATUS_META[status || 'Pending'] || STATUS_META.Pending
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: m.bg, color: m.color }}>
      {m.label}
    </span>
  )
}

async function exportExcel(trainings: any[]) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Trainings')
  const headers = [
    'Date', 'Topic', 'Type', 'Trainer', 'Title', 'Projects', 'Department',
    'Time From', 'Time To', 'Duration (min)', 'Assessment', 'Method',
    'Participants', 'Passed', 'Failed', 'Pending', 'Recorded By',
  ]
  const hdr = ws.addRow(headers)
  hdr.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
    c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  ws.columns = [12, 30, 14, 20, 16, 22, 14, 9, 9, 12, 11, 14, 11, 8, 8, 8, 16].map(w => ({ width: w }))

  trainings.forEach(t => {
    ws.addRow([
      t.training_date || '', t.training_topic || '', t.training_type || '',
      t.trainer_name || '', t.trainer_title || '', (t.project_names || []).join(', '), t.department || '',
      t.time_from || '', t.time_to || '', t.duration_minutes ?? '',
      t.assessment_applicable ? 'Yes' : 'No', t.assessment_method || '',
      t.participant_count ?? 0, t.passed_count ?? 0, t.failed_count ?? 0, t.pending_count ?? 0,
      t.created_by_name || '',
    ])
  })

  const ws2 = wb.addWorksheet('Participants')
  const h2 = ws2.addRow(['Training Date', 'Topic', 'Participant', 'Role', 'Category', 'Assessment Status'])
  h2.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0EA5E9' } }
    c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
  })
  ws2.columns = [12, 30, 22, 14, 12, 16].map(w => ({ width: w }))
  trainings.forEach(t => {
    (t.participants || []).forEach((p: any) => {
      ws2.addRow([t.training_date || '', t.training_topic || '', p.name || '', p.role || '', p.category || '', p.assessment_status || ''])
    })
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: `Trainings_${new Date().toISOString().slice(0, 10)}.xlsx` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Participant detail modal ──
function DetailModal({ training, onClose }: { training: any; onClose: () => void }) {
  const parts: any[] = training.participants || []
  const names: string[] = training.project_names || (training.project_name ? [training.project_name] : [])
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2 mb-1"><TypeBadge type={training.training_type} /></div>
            <h2 className="text-lg font-bold text-gray-900">{training.training_topic}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {fmtDate(training.training_date)}
              {training.time_from && ` · ${training.time_from}–${training.time_to || ''}`}
              {names.length ? ` · ${names.join(', ')}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost btn-sm !p-1.5"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div><p className="text-xs text-gray-400 uppercase tracking-wide">Trainer</p><p className="font-medium text-gray-800">{training.trainer_name || '—'}{training.trainer_title ? ` (${training.trainer_title})` : ''}{training.trainer_external ? ' · External' : ''}</p></div>
            <div><p className="text-xs text-gray-400 uppercase tracking-wide">Department</p><p className="font-medium text-gray-800">{training.department || '—'}</p></div>
            <div><p className="text-xs text-gray-400 uppercase tracking-wide">Assessment</p><p className="font-medium text-gray-800">{training.assessment_applicable ? (training.assessment_method || 'Yes') : 'Not applicable'}</p></div>
            <div><p className="text-xs text-gray-400 uppercase tracking-wide">Duration</p><p className="font-medium text-gray-800">{fmtDuration(training.duration_minutes)}</p></div>
            <div><p className="text-xs text-gray-400 uppercase tracking-wide">Recorded by</p><p className="font-medium text-gray-800">{training.created_by_name || '—'}</p></div>
          </div>
          {training.training_content && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Training Content</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{training.training_content}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Participants ({parts.length})</p>
            {parts.length === 0 ? (
              <p className="text-sm text-gray-400">No participants recorded.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Name</th>
                      <th className="text-left px-3 py-2 font-semibold">Role</th>
                      <th className="text-left px-3 py-2 font-semibold">Category</th>
                      {training.assessment_applicable && <th className="text-left px-3 py-2 font-semibold">Assessment</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parts.map((p, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-gray-800">{p.name}</td>
                        <td className="px-3 py-2 text-gray-600">{p.role || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{p.category || '—'}</td>
                        {training.assessment_applicable && <td className="px-3 py-2"><StatusBadge status={p.assessment_status} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Trainings() {
  usePageTitle('Training', 'Training records & reports')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const canWrite = WRITE_ROLES.includes(user?.role || '')

  const [view, setView] = useState<'records' | 'report' | 'assessment'>('records')
  const [projectIds, setProjectIds] = useState<(string | number)[]>([])
  const [typeFilter, setTypeFilter] = useState<(string | number)[]>([])
  const [deptFilter, setDeptFilter] = useState<(string | number)[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<any>(null)

  const filters = {
    project_id: projectIds, training_type: typeFilter, department: deptFilter,
    date_from: dateFrom || undefined, date_to: dateTo || undefined, search: search || undefined,
  }

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => api.get('/projects/').then(r => r.data), ...STALE })
  const { data: departments } = useQuery({ queryKey: ['training-departments'], queryFn: () => api.get('/trainings/departments').then(r => r.data), staleTime: 60_000 })
  const { data: listData, isLoading } = useQuery({
    queryKey: ['trainings', filters],
    queryFn: () => api.get('/trainings/', { params: { ...filters, limit: 1000 } }).then(r => r.data),
  })
  const { data: stats } = useQuery({
    queryKey: ['training-stats', projectIds, typeFilter, deptFilter, dateFrom, dateTo],
    queryFn: () => api.get('/trainings/stats', { params: { project_id: projectIds, training_type: typeFilter, department: deptFilter, date_from: dateFrom || undefined, date_to: dateTo || undefined } }).then(r => r.data),
  })

  const trainings: any[] = listData?.trainings || []
  const projectOptions: MSOption[] = useMemo(() => (projects || []).map((p: any) => ({ value: p.id, label: p.name })), [projects])
  const deptOptions: MSOption[] = useMemo(() => (departments || []).map((d: string) => ({ value: d, label: d })), [departments])

  const hasFilters = projectIds.length || typeFilter.length || deptFilter.length || dateFrom || dateTo || search
  const clearFilters = () => { setProjectIds([]); setTypeFilter([]); setDeptFilter([]); setDateFrom(''); setDateTo(''); setSearch('') }

  async function handleDelete(t: any) {
    if (!confirm(`Delete training "${t.training_topic}"? This cannot be undone.`)) return
    try {
      await api.delete(`/trainings/${t.id}`)
      qc.invalidateQueries({ queryKey: ['trainings'] })
      qc.invalidateQueries({ queryKey: ['training-stats'] })
      toast.success('Training deleted')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to delete training')
    }
  }

  const canDelete = (t: any) => user?.role === 'SuperAdmin' || (t.created_by === user?.id && canWrite)

  return (
    <div className="space-y-4">
      {detail && <DetailModal training={detail} onClose={() => setDetail(null)} />}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Training</h1>
            <p className="text-xs text-gray-400">Log sessions, track assessments and review performance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportExcel(trainings)} disabled={!trainings.length} className="btn-secondary btn-sm disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          {canWrite && (
            <button onClick={() => navigate('/trainings/new')} className="btn-primary btn-sm">
              <Plus className="w-3.5 h-3.5" /> New Training
            </button>
          )}
        </div>
      </div>

      {/* View toggle */}
      <div className="inline-flex rounded-xl bg-gray-100 p-1 flex-wrap">
        <button onClick={() => setView('records')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'records' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
          <LayoutList className="w-4 h-4" /> Records
        </button>
        <button onClick={() => setView('report')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'report' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
          <BarChart3 className="w-4 h-4" /> Report
        </button>
        <button onClick={() => setView('assessment')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'assessment' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
          <ClipboardCheck className="w-4 h-4" /> Assessment
        </button>
      </div>

      {view === 'assessment' ? (
        <AssessmentView trainings={trainings} canWrite={canWrite} />
      ) : (
        <>
          {/* Filters */}
          <div className="card p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[160px]">
                <label className="label">Project</label>
                <MultiSelectFilter size="sm" options={projectOptions} value={projectIds} onChange={setProjectIds} placeholder="All projects" />
              </div>
              <div className="min-w-[150px]">
                <label className="label">Type</label>
                <MultiSelectFilter size="sm" options={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter} placeholder="All types" />
              </div>
              <div className="min-w-[160px]">
                <label className="label">Department</label>
                <MultiSelectFilter size="sm" options={deptOptions} value={deptFilter} onChange={setDeptFilter} placeholder="All departments" />
              </div>
              <div>
                <label className="label">From</label>
                <input type="date" className="input !py-1.5 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="label">To</label>
                <input type="date" className="input !py-1.5 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="label">Search</label>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input className="input !py-1.5 text-sm pl-8" placeholder="Topic, trainer, dept…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>
              {hasFilters ? (
                <button onClick={clearFilters} className="btn-ghost btn-sm text-gray-500"><X className="w-3.5 h-3.5" /> Clear</button>
              ) : null}
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={<GraduationCap className="w-5 h-5 text-indigo-600" />} tint="bg-indigo-100" label="Total Sessions" value={stats?.totalSessions ?? '—'} />
            <StatCard icon={<Users className="w-5 h-5 text-sky-600" />} tint="bg-sky-100" label="Participants Trained" value={stats?.totalParticipants ?? '—'} />
            <StatCard icon={<Clock className="w-5 h-5 text-amber-600" />} tint="bg-amber-100" label="Training Hours" value={stats?.totalHours ?? '—'} />
            <StatCard icon={<Award className="w-5 h-5 text-emerald-600" />} tint="bg-emerald-100" label="Pass Rate" value={stats?.passRate != null ? `${stats.passRate}%` : '—'} />
          </div>
        </>
      )}

      {view === 'records' && (
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-gray-400">Loading…</div>
          ) : trainings.length === 0 ? (
            <div className="p-10 text-center">
              <GraduationCap className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 font-medium">No trainings found</p>
              <p className="text-sm text-gray-400 mt-0.5">{hasFilters ? 'Try adjusting the filters.' : 'Record your first training session.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Date</th>
                    <th className="text-left px-4 py-3 font-semibold">Topic</th>
                    <th className="text-left px-4 py-3 font-semibold">Type</th>
                    <th className="text-left px-4 py-3 font-semibold">Trainer</th>
                    <th className="text-left px-4 py-3 font-semibold">Project(s)</th>
                    <th className="text-center px-4 py-3 font-semibold">Duration</th>
                    <th className="text-center px-4 py-3 font-semibold">Participants</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {trainings.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50/60 cursor-pointer" onClick={() => setDetail(t)}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(t.training_date)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{t.training_topic}</p>
                        {t.department && <p className="text-xs text-gray-400">{t.department}</p>}
                      </td>
                      <td className="px-4 py-3"><TypeBadge type={t.training_type} /></td>
                      <td className="px-4 py-3 text-gray-600">
                        {t.trainer_name || '—'}
                        {t.trainer_title && <span className="block text-xs text-gray-400">{t.trainer_title}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600" title={(t.project_names || []).join(', ')}>{projectsLabel(t)}</td>
                      <td className="px-4 py-3 text-center text-gray-600 whitespace-nowrap">{fmtDuration(t.duration_minutes)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-gray-700"><Users className="w-3.5 h-3.5 text-gray-400" />{t.participant_count}</span>
                        {t.assessment_applicable && (t.passed_count + t.failed_count > 0) && (
                          <span className="block text-[11px] text-gray-400">{t.passed_count} pass / {t.failed_count} fail</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setDetail(t)} className="btn-ghost btn-sm !p-1.5 text-gray-400 hover:text-indigo-600" title="View details"><ChevronRight className="w-4 h-4" /></button>
                          {canWrite && (
                            <button onClick={() => navigate(`/trainings/${t.id}/edit`)} className="btn-ghost btn-sm !p-1.5 text-gray-400 hover:text-indigo-600" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                          )}
                          {canDelete(t) && (
                            <button onClick={() => handleDelete(t)} className="btn-ghost btn-sm !p-1.5 text-gray-400 hover:text-red-500" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'report' && <ReportView stats={stats} />}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      {children}
    </div>
  )
}

const ASSESS_ORDER: { key: string; label: string }[] = [
  { key: 'Passed', label: 'Passed' },
  { key: 'Failed', label: 'Failed' },
  { key: 'Pending', label: 'Pending' },
  { key: 'NA', label: 'N/A' },
]

function AssessmentMatrix({ stats }: { stats: any }) {
  const sc = stats.assessmentStatus || { Passed: 0, Failed: 0, Pending: 0, NA: 0 }
  const total = ASSESS_ORDER.reduce((s, o) => s + (sc[o.key] || 0), 0)
  const assessed = stats.assessedCount || 0

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Assessment Matrix</h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>Pass rate: <span className="font-semibold text-emerald-600">{stats.passRate != null ? `${stats.passRate}%` : '—'}</span></span>
          <span>Assessed: <span className="font-semibold text-gray-700">{assessed}</span></span>
          <span>Sessions w/ assessment: <span className="font-semibold text-gray-700">{stats.assessmentSessions ?? 0}</span></span>
        </div>
      </div>

      {/* Status count tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ASSESS_ORDER.map(o => {
          const m = STATUS_META[o.key]
          const count = sc[o.key] || 0
          const pct = total ? Math.round((count / total) * 100) : 0
          return (
            <div key={o.key} className="rounded-xl border border-gray-100 p-3" style={{ background: m.bg }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: m.color }}>{o.label}</span>
                <span className="text-[11px] font-medium text-gray-400">{pct}%</span>
              </div>
              <p className="text-2xl font-bold mt-1" style={{ color: m.color }}>{count}</p>
            </div>
          )
        })}
      </div>

      {/* Proportional stacked bar */}
      {total > 0 && (
        <div className="mt-4">
          <div className="flex w-full h-3 rounded-full overflow-hidden bg-gray-100">
            {ASSESS_ORDER.map(o => {
              const count = sc[o.key] || 0
              if (!count) return null
              return <div key={o.key} title={`${o.label}: ${count}`} style={{ width: `${(count / total) * 100}%`, background: STATUS_META[o.key].color }} />
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {ASSESS_ORDER.map(o => (
              <span key={o.key} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATUS_META[o.key].color }} />
                {o.label} <span className="font-medium text-gray-700">{sc[o.key] || 0}</span>
              </span>
            ))}
            <span className="ml-auto text-xs text-gray-400">Total participant records: <span className="font-medium text-gray-600">{total}</span></span>
          </div>
        </div>
      )}
    </div>
  )
}

function ReportView({ stats }: { stats: any }) {
  if (!stats) return <div className="card p-10 text-center text-gray-400">Loading report…</div>

  const byType = stats.byType || []
  const byMonth = (stats.byMonth || []).map((m: any) => ({ ...m, label: m.month }))
  const byProject = (stats.byProject || []).slice(0, 8)
  const byMethod = stats.byMethod || []
  const byCategory = stats.byCategory || []

  const empty = !stats.totalSessions
  if (empty) return <div className="card p-10 text-center text-gray-400">No data for the selected filters.</div>

  return (
    <div className="space-y-4">
      {/* Assessment status matrix — full width */}
      <AssessmentMatrix stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Sessions by Training Type">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byType} margin={{ top: 16, right: 12, left: -12, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: '#374151' }} />
                {byType.map((d: any, i: number) => <Cell key={i} fill={TYPE_COLORS[d.name] || BAR_PALETTE[i % BAR_PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Participants Trained per Month">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byMonth} margin={{ top: 16, right: 12, left: -12, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="participants" fill="#0ea5e9" radius={[6, 6, 0, 0]}>
                <LabelList dataKey="participants" position="top" style={{ fontSize: 11, fill: '#374151' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Sessions by Project">
          {byProject.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">No project data.</p> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byProject} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 0 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]}>
                  <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: '#374151' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Assessment Methods & Participant Mix">
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">By Assessment Method</p>
              {byMethod.length === 0 ? <p className="text-sm text-gray-400">—</p> : byMethod.map((m: any, i: number) => {
                const max = Math.max(...byMethod.map((x: any) => x.count))
                return (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-gray-600 w-28 truncate">{m.name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div className="h-full rounded-full flex items-center justify-end pr-1.5" style={{ width: `${(m.count / max) * 100}%`, background: BAR_PALETTE[i % BAR_PALETTE.length] }}>
                        <span className="text-[10px] text-white font-semibold">{m.count}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Participants by Category</p>
              {byCategory.length === 0 ? <p className="text-sm text-gray-400">—</p> : (
                <div className="flex gap-3">
                  {byCategory.map((c: any, i: number) => (
                    <div key={i} className="flex-1 rounded-xl border border-gray-100 p-3 text-center">
                      <p className="text-2xl font-bold text-gray-900">{c.count}</p>
                      <p className="text-xs text-gray-500">{c.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}

// ── Assessment tracking tab ──
function AssessmentView({ trainings, canWrite }: { trainings: any[]; canWrite: boolean }) {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [trSearch, setTrSearch] = useState('')
  const [pSearch, setPSearch] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  const assessable = useMemo(() => trainings.filter(t => t.assessment_applicable), [trainings])
  const filteredTrainings = useMemo(() => {
    const q = trSearch.trim().toLowerCase()
    if (!q) return assessable
    return assessable.filter(t =>
      (t.training_topic || '').toLowerCase().includes(q) ||
      (t.trainer_name || '').toLowerCase().includes(q) ||
      (t.project_names || []).join(' ').toLowerCase().includes(q))
  }, [assessable, trSearch])

  const selected = useMemo(() => assessable.find(t => t.id === selectedId) || null, [assessable, selectedId])

  const participants: any[] = useMemo(() => {
    const list = (selected?.participants || []).filter((p: any) => p.user_id)
    const q = pSearch.trim().toLowerCase()
    if (!q) return list
    return list.filter((p: any) => (p.name || '').toLowerCase().includes(q) || (p.role || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q))
  }, [selected, pSearch])

  const toggle = (uid: number) => setChecked(s => { const n = new Set(s); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  const allChecked = participants.length > 0 && participants.every((p: any) => checked.has(p.user_id))
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(participants.map((p: any) => p.user_id)))

  async function apply(status: string) {
    if (!selected || checked.size === 0) return
    setBusy(true)
    try {
      await api.patch(`/trainings/${selected.id}/assessments`, { user_ids: [...checked], status })
      qc.invalidateQueries({ queryKey: ['trainings'] })
      qc.invalidateQueries({ queryKey: ['training-stats'] })
      toast.success(`Marked ${checked.size} participant(s) as ${status}`)
      setChecked(new Set())
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update assessment')
    } finally {
      setBusy(false)
    }
  }

  const counts = selected
    ? { passed: selected.passed_count || 0, failed: selected.failed_count || 0, pending: selected.pending_count || 0, total: selected.participant_count || 0 }
    : null

  const STATUS_BTNS = [
    { status: 'Passed', icon: <CheckCircle2 className="w-3.5 h-3.5" />, cls: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    { status: 'Failed', icon: <XCircle className="w-3.5 h-3.5" />, cls: 'bg-rose-600 hover:bg-rose-700 text-white' },
    { status: 'Pending', icon: <CircleDashed className="w-3.5 h-3.5" />, cls: 'bg-amber-500 hover:bg-amber-600 text-white' },
    { status: 'NA', icon: <MinusCircle className="w-3.5 h-3.5" />, cls: 'bg-slate-500 hover:bg-slate-600 text-white' },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
      {/* Training selector */}
      <div className="card p-3 h-fit">
        <div className="relative mb-2">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input className="input !py-1.5 text-sm pl-8" placeholder="Search trainings…" value={trSearch} onChange={e => setTrSearch(e.target.value)} />
        </div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1">Trainings with assessment ({assessable.length})</p>
        <div className="max-h-[60vh] overflow-y-auto thin-scroll -mx-1 px-1 space-y-1">
          {filteredTrainings.length === 0 ? (
            <p className="text-sm text-gray-400 px-1 py-4 text-center">No trainings with assessment.</p>
          ) : filteredTrainings.map(t => (
            <button key={t.id} onClick={() => { setSelectedId(t.id); setChecked(new Set()); setPSearch('') }}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${selectedId === t.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'}`}>
              <p className={`text-sm font-medium truncate ${selectedId === t.id ? 'text-indigo-700' : 'text-gray-800'}`}>{t.training_topic}</p>
              <p className="text-[11px] text-gray-400">{fmtDate(t.training_date)} · {t.participant_count} participants</p>
            </button>
          ))}
        </div>
      </div>

      {/* Participant assessment panel */}
      <div className="card overflow-hidden">
        {!selected ? (
          <div className="p-12 text-center">
            <ClipboardCheck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">Select a training</p>
            <p className="text-sm text-gray-400 mt-0.5">Choose a training on the left to track participant assessments.</p>
          </div>
        ) : (
          <div>
            {/* Panel header */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-gray-900">{selected.training_topic}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtDate(selected.training_date)} · {(selected.project_names || []).join(', ') || '—'}</p>
                </div>
                {counts && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-1 rounded-lg" style={{ background: STATUS_META.Passed.bg, color: STATUS_META.Passed.color }}>{counts.passed} Passed</span>
                    <span className="px-2 py-1 rounded-lg" style={{ background: STATUS_META.Failed.bg, color: STATUS_META.Failed.color }}>{counts.failed} Failed</span>
                    <span className="px-2 py-1 rounded-lg" style={{ background: STATUS_META.Pending.bg, color: STATUS_META.Pending.color }}>{counts.pending} Pending</span>
                  </div>
                )}
              </div>

              {/* Toolbar: search + bulk actions */}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input className="input !py-1.5 text-sm pl-8" placeholder="Search participants…" value={pSearch} onChange={e => setPSearch(e.target.value)} />
                </div>
                {canWrite && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400 mr-1">{checked.size} selected →</span>
                    {STATUS_BTNS.map(b => (
                      <button key={b.status} onClick={() => apply(b.status)} disabled={busy || checked.size === 0}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${b.cls}`}>
                        {b.icon} {b.status}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Participant table */}
            {participants.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">{selected.participant_count ? 'No participants match your search.' : 'No participants in this training.'}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <input type="checkbox" className="w-4 h-4 accent-indigo-600 align-middle" checked={allChecked} onChange={toggleAll} disabled={!canWrite} />
                      </th>
                      <th className="text-left px-4 py-3 font-semibold">Participant</th>
                      <th className="text-left px-4 py-3 font-semibold">Role</th>
                      <th className="text-left px-4 py-3 font-semibold">Category</th>
                      <th className="text-left px-4 py-3 font-semibold">Assessment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {participants.map((p: any) => (
                      <tr key={p.user_id} className={`hover:bg-gray-50/60 ${checked.has(p.user_id) ? 'bg-indigo-50/40' : ''}`}>
                        <td className="px-4 py-2.5">
                          <input type="checkbox" className="w-4 h-4 accent-indigo-600 align-middle" checked={checked.has(p.user_id)} onChange={() => toggle(p.user_id)} disabled={!canWrite} />
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                        <td className="px-4 py-2.5 text-gray-600">{p.role || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{p.category || '—'}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={p.assessment_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
