import { create } from 'zustand'

interface Project { id: number; name: string }
export interface AuthUser { id: number; name: string; email: string; role: string; projects: Project[] }

interface AuthState {
  user: AuthUser | null
  token: string | null
  setAuth: (user: AuthUser, token: string) => void
  logout: () => void
  isAdminOrPC: () => boolean
  isSuperAdmin: () => boolean
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  setAuth: (user, token) => { localStorage.setItem('token', token); set({ user, token }) },
  logout: () => { localStorage.removeItem('token'); set({ user: null, token: null }) },
  isAdminOrPC: () => ['SuperAdmin', 'Admin', 'PC'].includes(get().user?.role || ''),
  isSuperAdmin: () => get().user?.role === 'SuperAdmin',
}))
