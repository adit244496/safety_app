import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, PlusCircle,
  Settings, X, ChevronRight, ChevronsLeft, ChevronRightSquare,
  LogOut, FileBarChart2, BarChart3,
} from 'lucide-react'
import { useAuth } from '../store/authStore'
import { useNavigate } from 'react-router-dom'

interface Props {
  mobileOpen: boolean
  onMobileClose: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true, roles: null },
  { to: '/observations', icon: ClipboardList, label: 'Observations', exact: false, roles: null },
  { to: '/observations/new', icon: PlusCircle, label: 'New Observation', exact: true, roles: ['SuperAdmin', 'Admin', 'HO', 'PSO', 'Observer'] },
  { to: '/report', icon: FileBarChart2, label: 'SHE Report', exact: true, roles: ['SuperAdmin', 'Admin', 'PIC', 'EIC', 'HO', 'PSO', 'Observer'] },
  { to: '/summary', icon: BarChart3, label: 'Summary', exact: true, roles: ['SuperAdmin', 'Admin', 'PIC', 'EIC', 'HO', 'PSO', 'Observer'] },
]

export default function Sidebar({ mobileOpen, onMobileClose, collapsed, onToggleCollapse }: Props) {
  const { user, isAdminOrPC, logout } = useAuth()
  const navigate = useNavigate()
  const loc = useLocation()

  const active = (to: string, exact?: boolean) => {
    if (exact || to === '/observations/new') return loc.pathname === to
    if (to === '/observations') {
      return loc.pathname === '/observations' ||
        (loc.pathname.startsWith('/observations/') &&
          !loc.pathname.startsWith('/observations/new') &&
          !loc.pathname.endsWith('/edit'))
    }
    return loc.pathname === to || (to !== '/' && loc.pathname.startsWith(to))
  }

  const w = collapsed ? 'lg:w-[68px]' : 'lg:w-[260px]'

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={onMobileClose} />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30 flex flex-col flex-shrink-0
          shadow-2xl
          transition-all duration-300 ease-in-out overflow-hidden
          w-[260px] ${w}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{ background: 'linear-gradient(175deg, #0f0d2a 0%, #1a1050 55%, #12102a 100%)' }}
      >
        {/* Logo / Brand */}
        <div className={`relative flex items-center border-b border-white/8 flex-shrink-0 h-16 ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
          <div className={`flex items-center gap-3 min-w-0 flex-1 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-11 h-11 rounded-xl overflow-hidden shadow-lg flex-shrink-0 bg-white flex items-center justify-center p-0.5">
              <img src="/logo_small.png" alt="Neo SHE" className="w-full h-full object-contain" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-white font-bold text-sm leading-tight tracking-tight">Neo SHE</p>
                <p className="text-indigo-300/80 text-xs">Safety App</p>
              </div>
            )}
          </div>
          {/* Mobile close */}
          <button onClick={onMobileClose} className="lg:hidden text-slate-400 hover:text-white p-1 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav className={`flex-1 py-4 overflow-y-auto thin-scroll overflow-x-hidden ${collapsed ? 'px-2' : 'px-3'}`}>
          {!collapsed && (
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">Menu</p>
          )}

          <div className="space-y-0.5">
            {NAV.filter(({ roles }) => !roles || roles.includes(user?.role || '')).map(({ to, icon: Icon, label, exact }) => {
              const isActive = active(to, exact)
              return (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onMobileClose}
                  title={collapsed ? label : undefined}
                  className={`
                    flex items-center rounded-xl text-sm font-medium transition-all duration-150
                    ${collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'}
                    ${isActive
                      ? 'text-white shadow-sm'
                      : 'text-slate-400 hover:bg-white/8 hover:text-white'
                    }
                  `}
                  style={isActive ? { background: 'linear-gradient(135deg, rgba(99,102,241,0.35) 0%, rgba(79,70,229,0.25) 100%)', boxShadow: 'inset 0 0 0 1px rgba(99,102,241,0.3)' } : {}}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-indigo-300' : ''}`} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{label}</span>
                      {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-50 flex-shrink-0 text-indigo-300" />}
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>

          {isAdminOrPC() && (
            <>
              {!collapsed && (
                <div className="pt-4 pb-2 px-3">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Administration</p>
                </div>
              )}
              {collapsed && <div className="my-3 border-t border-white/8" />}
              <NavLink
                to="/admin"
                onClick={onMobileClose}
                title={collapsed ? 'Admin Panel' : undefined}
                className={`
                  flex items-center rounded-xl text-sm font-medium transition-all duration-150
                  ${collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'}
                  ${active('/admin')
                    ? 'text-white shadow-sm'
                    : 'text-slate-400 hover:bg-white/8 hover:text-white'
                  }
                `}
                style={active('/admin') ? { background: 'linear-gradient(135deg, rgba(99,102,241,0.35) 0%, rgba(79,70,229,0.25) 100%)', boxShadow: 'inset 0 0 0 1px rgba(99,102,241,0.3)' } : {}}
              >
                <Settings className={`w-4 h-4 flex-shrink-0 ${active('/admin') ? 'text-indigo-300' : ''}`} />
                {!collapsed && (
                  <>
                    <span className="flex-1">Admin Panel</span>
                    {active('/admin') && <ChevronRight className="w-3.5 h-3.5 opacity-50 flex-shrink-0 text-indigo-300" />}
                  </>
                )}
              </NavLink>
            </>
          )}
        </nav>

        {/* ── Bottom: user info + collapse toggle ────── */}
        <div className="border-t border-white/8 flex-shrink-0">
          {/* User info row */}
          <div className={`${collapsed ? 'py-3 flex justify-center' : 'px-3 pt-3 pb-2'}`}>
            {collapsed ? (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md cursor-default"
                title={user?.name}
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}
              >
                {user?.name?.charAt(0).toUpperCase()}
              </div>
            ) : (
              <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors group">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}
                >
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-xs font-semibold truncate">{user?.name}</p>
                  <p className="text-indigo-300/70 text-[11px]">{user?.role}</p>
                </div>
                <button
                  onClick={() => { logout(); navigate('/login') }}
                  title="Sign out"
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Collapse / Expand toggle */}
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`
              hidden lg:flex w-full items-center justify-center gap-2
              py-2.5 border-t border-white/8
              text-slate-500 hover:text-indigo-300 hover:bg-white/5
              transition-all duration-150 text-xs font-medium
              ${collapsed ? 'px-2' : 'px-4'}
            `}
          >
            {collapsed ? (
              <ChevronRightSquare className="w-4 h-4" />
            ) : (
              <>
                <ChevronsLeft className="w-4 h-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  )
}
