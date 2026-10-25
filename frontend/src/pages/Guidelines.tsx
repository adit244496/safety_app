import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Library as LibraryIcon, FileText, Download, ExternalLink, Search, X, Link2 } from 'lucide-react'
import { usePageTitle } from '../store/pageTitleContext'
import api from '../lib/api'
import { fmtDate } from '../lib/utils'

// "Library" page — documents (PDFs) and web links published by the SHE team.
export default function Guidelines() {
  usePageTitle('Library', 'Documents and links published by the SHE team')
  const [search, setSearch] = useState('')
  const { data: guidelines = [], isLoading } = useQuery<any[]>({
    queryKey: ['guidelines'],
    queryFn: () => api.get('/guidelines/').then(r => r.data),
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return guidelines
    return guidelines.filter(g =>
      (g.title || '').toLowerCase().includes(q) ||
      (g.description || '').toLowerCase().includes(q) ||
      (g.category || '').toLowerCase().includes(q))
  }, [guidelines, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><LibraryIcon className="w-5 h-5 text-indigo-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Library</h1>
            <p className="text-xs text-gray-400">Documents and links published by the SHE team</p>
          </div>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input className="input !py-1.5 text-sm pl-8" placeholder="Search library…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="w-4 h-4" /></button>}
        </div>
      </div>

      {isLoading ? (
        <div className="card p-10 text-center text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <LibraryIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 font-medium">{search ? 'Nothing matches your search' : 'Nothing in the library yet'}</p>
          {!search && <p className="text-sm text-gray-400 mt-0.5">An administrator can add PDFs and links under Admin → Library.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(g => {
            const isLink = g.kind === 'link'
            return (
              <div key={g.id} className="card p-4 flex flex-col">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isLink ? 'bg-sky-50' : 'bg-rose-50'}`}>
                    {isLink ? <Link2 className="w-5 h-5 text-sky-500" /> : <FileText className="w-5 h-5 text-rose-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 leading-snug line-clamp-2">{g.title}</h3>
                    {g.category && <span className="inline-block mt-1 text-[11px] font-medium bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{g.category}</span>}
                  </div>
                </div>
                {g.description && <p className="text-sm text-gray-500 mt-2 line-clamp-3">{g.description}</p>}
                {isLink && <p className="text-[11px] text-sky-600 mt-2 truncate">{g.link_url}</p>}
                <div className="text-[11px] text-gray-400 mt-2">{g.uploaded_by_name ? `By ${g.uploaded_by_name} · ` : ''}{fmtDate(g.created_at)}</div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  <a href={g.url} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm flex-1 justify-center">
                    <ExternalLink className="w-3.5 h-3.5" /> {isLink ? 'Open link' : 'View'}
                  </a>
                  {!isLink && <a href={g.url} download={g.file_name} className="btn-secondary btn-sm justify-center" title="Download"><Download className="w-4 h-4" /></a>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
