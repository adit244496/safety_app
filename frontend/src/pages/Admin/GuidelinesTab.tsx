import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, Trash2, FileText, ExternalLink, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import api from '../../lib/api'
import { fmtDate } from '../../lib/utils'

export default function GuidelinesTab() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: rows = [] } = useQuery<any[]>({ queryKey: ['guidelines'], queryFn: () => api.get('/guidelines/').then(r => r.data) })

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  async function upload() {
    if (!title.trim()) { toast.error('Title is required'); return }
    if (!file) { toast.error('Choose a PDF file'); return }
    if (!/\.pdf$/i.test(file.name)) { toast.error('Only PDF files are allowed'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      if (category.trim()) fd.append('category', category.trim())
      if (description.trim()) fd.append('description', description.trim())
      fd.append('file', file)
      await api.post('/guidelines/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries({ queryKey: ['guidelines'] })
      setTitle(''); setCategory(''); setDescription(''); setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      toast.success('Guideline uploaded')
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Upload failed') } finally { setUploading(false) }
  }

  async function remove(id: number) {
    if (!confirm('Delete this guideline? This removes the PDF permanently.')) return
    try { await api.delete(`/guidelines/${id}`); qc.invalidateQueries({ queryKey: ['guidelines'] }); toast.success('Deleted') }
    catch (e: any) { toast.error(e.response?.data?.detail || 'Failed') }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      {/* Upload form */}
      <div className="card p-5 h-fit space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-800">Upload Guideline (PDF)</h3>
        </div>
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Working at Height SOP" />
        </div>
        <div>
          <label className="label">Category (optional)</label>
          <input className="input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. SOP, Policy, Checklist" />
        </div>
        <div>
          <label className="label">Description (optional)</label>
          <textarea rows={2} className="input resize-none" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label">PDF file</label>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:text-sm file:font-medium hover:file:bg-indigo-100" />
          {file && <p className="text-xs text-gray-400 mt-1">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
        </div>
        <button onClick={upload} disabled={uploading} className="btn-primary w-full justify-center">
          {uploading ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Uploading…</> : <><Upload className="w-4 h-4" /> Upload</>}
        </button>
      </div>

      {/* List */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-700">Published Guidelines ({rows.length})</h3></div>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">No guidelines uploaded yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map(g => (
              <div key={g.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0"><FileText className="w-4 h-4 text-rose-500" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{g.title}</p>
                  <p className="text-xs text-gray-400 truncate">{g.category ? `${g.category} · ` : ''}{g.file_name} · {fmtDate(g.created_at)}</p>
                </div>
                <a href={g.url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm !p-1.5 text-gray-400 hover:text-indigo-600" title="View"><ExternalLink className="w-4 h-4" /></a>
                <button onClick={() => remove(g.id)} className="btn-ghost btn-sm !p-1.5 text-gray-400 hover:text-red-500" title="Delete"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
