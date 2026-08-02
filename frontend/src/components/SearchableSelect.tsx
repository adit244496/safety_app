import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'

export interface SSOption { value: string | number; label: string }

interface Props {
  options: SSOption[]
  value: string | number | ''
  onChange: (v: string | number) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

// Single-select dropdown with a search box.
export default function SearchableSelect({ options, value, onChange, placeholder = 'Select…', disabled, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ('') } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const selected = options.find(o => String(o.value) === String(value))
  const filtered = q.trim() ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { setOpen(o => !o); setQ('') } }}
        className={`select w-full flex items-center justify-between gap-2 text-left ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <span className={`truncate ${selected ? 'text-gray-800' : 'text-gray-400'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <div className="absolute z-40 mt-1 w-full bg-white rounded-xl shadow-lg border border-gray-100 py-1.5">
          <div className="px-2 pb-1.5">
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
              <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <input autoFocus className="text-sm bg-transparent outline-none w-full text-gray-700 placeholder:text-gray-400"
                placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto thin-scroll">
            {filtered.length === 0 && <p className="text-sm text-gray-400 px-3 py-2 italic">No matches</p>}
            {filtered.map(o => {
              const active = String(o.value) === String(value)
              return (
                <button key={o.value} type="button"
                  onClick={() => { onChange(o.value); setOpen(false); setQ('') }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                  <span className="w-4 flex-shrink-0">{active && <Check className="w-3.5 h-3.5" />}</span>
                  <span className="truncate">{o.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
