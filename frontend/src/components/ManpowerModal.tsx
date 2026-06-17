import { useState } from 'react'
import { X } from 'lucide-react'

export interface ProjectManpower {
  name: string
  manHours: number
  avgPersons: number
}

interface ManpowerModalProps {
  projects: string[]
  onConfirm: (data: ProjectManpower[]) => void
  onClose: () => void
  isLoading?: boolean
}

export function ManpowerModal({ projects, onConfirm, onClose, isLoading }: ManpowerModalProps) {
  const [rows, setRows] = useState<ProjectManpower[]>(
    projects.map(name => ({ name, manHours: 0, avgPersons: 0 }))
  )

  const update = (idx: number, field: 'manHours' | 'avgPersons', val: string) => {
    const num = parseFloat(val) || 0
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: num } : r))
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Manpower Data (Page 7)</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Enter manpower for the report period. Leave blank to skip.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-2 pt-3 overflow-y-auto max-h-72">
          <div className="grid grid-cols-[1fr_110px_110px] gap-x-3 items-center mb-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Project</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 text-right">
              Man-Hours
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 text-right">
              Avg Persons
            </span>
          </div>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={row.name} className="grid grid-cols-[1fr_110px_110px] gap-x-3 items-center">
                <span className="text-sm text-gray-700 truncate" title={row.name}>
                  {row.name}
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.manHours || ''}
                  onChange={e => update(i, 'manHours', e.target.value)}
                  placeholder="0"
                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-right"
                />
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.avgPersons || ''}
                  onChange={e => update(i, 'avgPersons', e.target.value)}
                  placeholder="0"
                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-right"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 leading-tight">
            Man-hours are used to compute observation &amp; delay rates on page 6.
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(rows)}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              {isLoading ? 'Generating PDF…' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
