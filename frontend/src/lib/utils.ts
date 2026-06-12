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
    case 'Pending': return 'badge-pending'
    case 'Under Review': return 'badge-review'
    case 'Partially Closed': return 'badge-partial'
    case 'Closed': return 'badge-closed'
    case 'Draft': return 'badge-draft'
    default: return 'badge-gray'
  }
}

export const getRoleClass = (role?: string) => {
  const map: Record<string, string> = {
    SuperAdmin: 'bg-red-100 text-red-800',
    Admin: 'bg-purple-100 text-purple-800',
    PIC: 'bg-indigo-100 text-indigo-800',
    AIC: 'bg-blue-100 text-blue-800',
    HO: 'bg-cyan-100 text-cyan-800',
    PSO: 'bg-sky-100 text-sky-800',
    Contractor: 'bg-orange-100 text-orange-800',
    Observer: 'bg-teal-100 text-teal-800',
  }
  return map[role || ''] || 'bg-gray-100 text-gray-700'
}

export const fmtDate = (s?: string | null) => {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const fmtDateTime = (s?: string | null) => {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const calcRisk = (s: number, p: number) => {
  const f = s * p
  return { factor: f, level: f <= 4 ? 'Low' : f <= 12 ? 'Medium' : 'High' }
}

export const STATUSES = ['Draft', 'Open', 'Pending', 'Under Review', 'Partially Closed', 'Closed']
export const ROLES = ['SuperAdmin', 'Admin', 'PIC', 'AIC', 'HO', 'PSO', 'Contractor', 'Observer']
