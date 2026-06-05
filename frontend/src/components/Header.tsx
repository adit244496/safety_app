import { Menu, LogOut, ChevronDown, Bell } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../store/authStore'
import { getRoleClass, fmtDateTime } from '../lib/utils'
import api from '../lib/api'

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications/').then(r => r.data),
    refetchInterval: 30_000,
  })

  const notifs: any[] = data?.notifications || []

  const markAllRead = async () => {
    await api.patch('/notifications/read-all')
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  const handleClick = async (n: any) => {
    if (!n.is_read) {
      await api.patch(`/notifications/${n.id}/read`)
      qc.invalidateQueries({ queryKey: ['notifications'] })
    }
    onClose()
    if (n.obs_ref) navigate(`/observations/${n.obs_ref}`)
  }

  return (
    <div className="absolute right-0 top-full mt-1.5 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="font-semibold text-gray-900 text-sm">Notifications</p>
        {notifs.some(n => !n.is_read) && (
          <button onClick={markAllRead} className="text-xs text-indigo-600 hover:underline">
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto thin-scroll">
        {notifs.length === 0 ? (
          <p className="text-center text-gray-400 text-xs py-6">No notifications</p>
        ) : (
          notifs.map((n: any) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${!n.is_read ? 'bg-indigo-50/60' : ''}`}
            >
              <div className="flex items-start gap-2">
                {!n.is_read && (
                  <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />
                )}
                <div className={!n.is_read ? '' : 'pl-4'}>
                  <p className="text-xs text-gray-800 leading-snug">{n.message}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{fmtDateTime(n.created_at)}</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export default function Header({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications/').then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
  const unread: number = notifData?.unread ?? 0

  return (
    <header className="bg-white border-b border-gray-100 h-16 flex items-center justify-between px-4 md:px-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] z-10 flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button onClick={onMenu} className="btn-icon lg:hidden">
          <Menu className="w-5 h-5" />
        </button>
        <div className="hidden sm:block">
          <p className="text-sm font-semibold text-gray-800 leading-tight">Neo SHE</p>
          <p className="text-xs text-gray-400">Safety App</p>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Ambuja logo - desktop only */}
        <img
          src="/ambuja-logo.png"
          alt="Ambuja"
          className="hidden lg:block h-6 w-auto object-contain"
        />
        <div className="hidden lg:block w-px h-6 bg-gray-200" />
        {/* Notification bell */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(o => !o); setProfileOpen(false) }}
            className="btn-icon relative"
          >
            <Bell className="w-[18px] h-[18px]" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div className="relative z-20">
                <NotificationPanel onClose={() => setNotifOpen(false)} />
              </div>
            </>
          )}
        </div>

        {/* Profile dropdown */}
        <div className="relative">
          <button
            onClick={() => { setProfileOpen(o => !o); setNotifOpen(false) }}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}>
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-gray-900 leading-snug">{user?.name}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${getRoleClass(user?.role)}`}>
                {user?.role}
              </span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 z-20 py-1.5 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{user?.email}</p>
                </div>
                <button
                  onClick={() => { logout(); navigate('/login') }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors mt-0.5"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
