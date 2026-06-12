import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './store/authStore'
import api from './lib/api'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ObservationsList from './pages/Observations/List'
import ObservationForm from './pages/Observations/Form'
import ObservationDetail from './pages/Observations/Detail'
import Admin from './pages/Admin/index'
import ReportPage from './pages/Report/index'
import Summary from './pages/Summary'

function Guard({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (!user) return (
    <div className="flex h-screen items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
    </div>
  )
  return <>{children}</>
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user) return null
  if (!['SuperAdmin', 'Admin'].includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

// Redirects users who can only access Observations away from other pages
function ContractorGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user) return null
  return <>{children}</>
}

export default function App() {
  const { token, setAuth, logout } = useAuth()

  useEffect(() => {
    if (!token) return
    api.get('/auth/me').then(r => setAuth(r.data, token)).catch(() => logout())
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Guard><Layout /></Guard>}>
          <Route index element={<ContractorGuard><Dashboard /></ContractorGuard>} />
          <Route path="observations" element={<ObservationsList />} />
          <Route path="observations/new" element={<ObservationForm />} />
          <Route path="observations/:id" element={<ObservationDetail />} />
          <Route path="observations/:id/edit" element={<ObservationForm />} />
          <Route path="summary" element={<ContractorGuard><Summary /></ContractorGuard>} />
          <Route path="report" element={<ContractorGuard><ReportPage /></ContractorGuard>} />
          <Route path="admin/*" element={<AdminGuard><Admin /></AdminGuard>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
