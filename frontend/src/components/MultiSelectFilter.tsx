import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X, Search } from 'lucide-react'

export interface MSOption {
  value: string | number
  label: string
}

interface Props {
  options: MSOption[]
  value: (string | number)[]
  onChange: (vals: (string | number)[]) => void
  placeholder?: string
  /** 'sm' uses text-xs padding; 'md' (default) uses text-sm padding */
  size?: 'sm' | 'md'
  className?: string
  disabled?: boolean
}

export function MultiSelectFilter({
  options, value, onChange,
  placeholder = 'All',
  size = 'md',
  className = '',
  disabled = false,
}: Props) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (v: string | number) =>
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])

  const labelText =
    value.length === 0   ? placeholder
    : value.length === 1 ? (options.find(o => o.value === value[0])?.label ?? String(value[0]))
    :                      `${value.length} selected`

  const textCls   = size === 'sm' ? 'text-xs'  : 'text-sm'
  const padCls    = size === 'sm' ? 'px-2 py-1.5' : 'px-3 py-2'
  const optPadCls = size === 'sm' ? 'px-3 py-1.5' : 'px-3 py-2'

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`
          w-full flex items-center justify-between gap-1.5
          rounded-lg border border-slate-200 bg-white text-slate-900
          hover:border-indigo-300 transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed
          ${textCls} ${padCls}
        `}
      >
        <span className={`truncate ${value.length === 0 ? 'text-slate-400' : 'font-medium'}`}>
          {labelText}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {value.length > 0 && (
            <X
              className="w-3 h-3 text-slate-400 hover:text-red-500 transition-colors"
              onClick={e => { e.stopPropagation(); onChange([]) }}
            />
          )}
          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-full w-max max-w-xs bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {/* Search bar */}
          <div className="p-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200">
              <Search className="w-3 h-3 text-slate-400 flex-shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="flex-1 min-w-0 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
              />
              {search && (
                <X className="w-3 h-3 text-slate-400 hover:text-slate-600 cursor-pointer flex-shrink-0"
                  onClick={() => setSearch('')} />
              )}
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-400">No results</p>
            ) : (
              filtered.map(opt => {
                const checked = value.includes(opt.value)
                return (
                  <div
                    key={opt.value}
                    className={`flex items-center gap-2 cursor-pointer hover:bg-indigo-50 transition-colors ${optPadCls}`}
                    onClick={() => toggle(opt.value)}
                  >
                    <input
                      type="checkbox"
                      readOnly
                      checked={checked}
                      className="w-3.5 h-3.5 rounded border-slate-300 accent-indigo-600 pointer-events-none flex-shrink-0"
                    />
                    <span className={`${textCls} text-slate-700 truncate`}>{opt.label}</span>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer actions */}
          <div className="flex justify-between items-center px-3 py-1.5 border-t border-slate-100 bg-slate-50">
            <button
              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
              onClick={() => onChange(options.map(o => o.value))}
            >
              Select all
            </button>
            <span className="text-[10px] text-slate-300">|</span>
            <button
              className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
              onClick={() => onChange([])}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
