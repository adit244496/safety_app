import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import api from '../../lib/api'

const LEVELS = [1, 2, 3, 4, 5]

function LabelEditor({
  title,
  hint,
  queryKey,
  getUrl,
  putUrl,
}: {
  title: string
  hint: string
  queryKey: string
  getUrl: string
  putUrl: (level: number) => string
}) {
  const qc = useQueryClient()
  const { data: labels = [] as any[] } = useQuery<any[]>({
    queryKey: [queryKey],
    queryFn: () => api.get(getUrl).then(r => r.data),
    staleTime: 60_000,
  })
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<number | null>(null)

  function currentLabel(level: number): string {
    const found = labels.find((l: any) => l.level === level)
    return found ? found.label : ''
  }

  function draft(level: number): string {
    return drafts[level] ?? currentLabel(level)
  }

  async function save(level: number) {
    const label = (drafts[level] ?? currentLabel(level)).trim()
    if (!label) return
    setSaving(level)
    await api.put(putUrl(level), { label })
    qc.invalidateQueries({ queryKey: [queryKey] })
    setDrafts(d => { const c = { ...d }; delete c[level]; return c })
    setSaving(null)
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
      </div>
      <div className="space-y-2">
        {LEVELS.map(level => {
          const isDirty = drafts[level] !== undefined && drafts[level] !== currentLabel(level)
          return (
            <div key={level} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{
                  background: level === 5 ? '#fef2f2' : level === 4 ? '#fff7ed' : level === 3 ? '#fefce8' : level === 2 ? '#f0fdf4' : '#f0f9ff',
                  color: level === 5 ? '#dc2626' : level === 4 ? '#ea580c' : level === 3 ? '#ca8a04' : level === 2 ? '#16a34a' : '#0284c7',
                }}>
                {level}
              </div>
              <input
                className="input flex-1 text-sm py-1.5"
                value={draft(level)}
                onChange={e => setDrafts(d => ({ ...d, [level]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') save(level) }}
                placeholder={`Label for level ${level}…`}
              />
              {isDirty && (
                <button
                  onClick={() => save(level)}
                  disabled={saving === level}
                  className="flex-shrink-0 flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {saving === level
                    ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                    : <Save className="w-3 h-3" />}
                  Save
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function RiskLabelsTab() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <LabelEditor
        title="Severity of Consequence"
        hint="Labels shown in the risk assessment dropdown (1 = least severe, 5 = fatal)."
        queryKey="severity-labels"
        getUrl="/admin/severity-labels"
        putUrl={level => `/admin/severity-labels/${level}`}
      />
      <LabelEditor
        title="Probability of Occurrence"
        hint="Labels shown in the risk assessment dropdown (1 = very unlikely, 5 = almost certain)."
        queryKey="probability-labels"
        getUrl="/admin/probability-labels"
        putUrl={level => `/admin/probability-labels/${level}`}
      />
    </div>
  )
}
