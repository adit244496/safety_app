export const getRiskClass = (level?: string) => {
  switch (level) {
    case 'Low': return 'badge-low'
    case 'Medium': return 'badge-medium'
    case 'High': return 'badge-high'
    default: return 'badge-gray'
  }
}

export const getStatusClass = (status?: string) => {
  switch (status) {
    case 'Open': return 'badge-open'
    case 'Overdue': return 'badge-pending'
    case 'Under Review': return 'badge-review'
    case 'Partially Closed': return 'badge-partial'
    case 'Closed': return 'badge-closed'
    case 'Overdue & Closed': return 'badge bg-orange-100 text-orange-800 border-orange-200'
    case 'Draft': return 'badge-draft'
    case 'Positive Approach': return 'badge bg-amber-100 text-[#8a6d1a] border-amber-200'
    case 'Unresolved & Closed': return 'badge bg-violet-100 text-violet-800 border-violet-200'
    default: return 'badge-gray'
  }
}

export const getRoleClass = (role?: string) => {
  const map: Record<string, string> = {
    SuperAdmin: 'bg-red-100 text-red-800',
    Admin: 'bg-purple-100 text-purple-800',
    PIC: 'bg-indigo-100 text-indigo-800',
    EIC: 'bg-blue-100 text-blue-800',
    HO: 'bg-cyan-100 text-cyan-800',
    PSO: 'bg-sky-100 text-sky-800',
    Contractor: 'bg-orange-100 text-orange-800',
    Observer: 'bg-teal-100 text-teal-800',
  }
  return map[role || ''] || 'bg-gray-100 text-gray-700'
}

const IST = 'Asia/Kolkata'
// Parse a backend value as IST: tz-less datetimes/dates are treated as Indian time
// so display is always IST regardless of the viewer's browser timezone.
const parseIST = (s: string): Date => {
  const str = String(s)
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(str)) return new Date(str)          // already has a timezone
  if (/\d{1,2}:\d{2}/.test(str)) return new Date(str.replace(' ', 'T') + '+05:30')  // datetime → IST
  return new Date(str + 'T00:00:00+05:30')                              // date only → IST midnight
}

export const fmtDate = (s?: string | null) => {
  if (!s) return '—'
  return parseIST(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST })
}

export const fmtDateTime = (s?: string | null) => {
  if (!s) return '—'
  return parseIST(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: IST })
}

export const calcRisk = (s: number, p: number) => {
  const f = s * p
  return { factor: f, level: f <= 4 ? 'Low' : f <= 12 ? 'Medium' : 'High' }
}

export const STATUSES = ['Draft', 'Open', 'Overdue', 'Under Review', 'Partially Closed', 'Closed', 'Overdue & Closed', 'Positive Approach', 'Unresolved & Closed']
export const ROLES = ['SuperAdmin', 'Admin', 'PIC', 'EIC', 'HO', 'PSO', 'Contractor', 'Observer']
