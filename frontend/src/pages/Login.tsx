import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../store/authStore'
import api from '../lib/api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setAuth } = useAuth()
  const navigate = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      setAuth(data.user, data.token)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Desktop left panel ───────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-blue-900 to-blue-800 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '60px 60px' }}
        />
        <div className="relative">
          <div className="flex items-center justify-between mb-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <span className="text-white font-bold text-lg">Neo SHE</span>
            </div>
            <img src="/ambuja-logo.png" alt="Ambuja" className="h-10 w-auto object-contain" />
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Neo SHE<br />Safety App
          </h1>
          <p className="text-blue-200 text-lg leading-relaxed">
            Capture, track and resolve safety observations across all your construction sites in real time.
          </p>
        </div>
        <div className="relative space-y-4">
          {[
            { icon: '📸', text: 'Capture photos from site instantly' },
            { icon: '📊', text: 'Real-time risk assessment and dashboard' },
            { icon: '🔔', text: 'Track observations from open to closure' },
          ].map(f => (
            <div key={f.text} className="flex items-center gap-3 text-blue-100">
              <span className="text-xl">{f.icon}</span>
              <span className="text-sm">{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      {/* Desktop: centered card. Mobile: full-screen column layout */}
      <div className="flex-1 flex flex-col lg:items-center lg:justify-center lg:p-8 bg-slate-50">

        {/* Mobile top branding bar */}
        <div
          className="lg:hidden flex items-center gap-3 px-5 py-4 shadow-md flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #0f0d2a 0%, #1a1050 100%)' }}
        >
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}>
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Neo SHE</p>
            <p className="text-indigo-300 text-xs">Safety Observation App</p>
          </div>
        </div>

        {/* Form area */}
        <div className="flex-1 flex flex-col lg:block w-full lg:max-w-sm px-5 pt-6 pb-4 lg:px-0 lg:pt-0 lg:pb-0">

          {/* Heading */}
          <div className="mb-5 lg:mb-8">
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 mt-0.5 text-sm">Sign in to continue</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 lg:p-8">
            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-700 rounded-xl px-3 py-2.5 mb-4 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">Email Address</label>
                <input
                  type="email" className="input" placeholder="you@company.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                  required autoFocus
                />
              </div>

              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'} className="input pr-10"
                    placeholder="Enter your password"
                    value={password} onChange={e => setPassword(e.target.value)} required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit" disabled={loading}
                className="btn-primary w-full justify-center py-2.5 mt-1 text-base"
              >
                {loading
                  ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Signing in…</>
                  : 'Sign In'
                }
              </button>
            </form>
          </div>

          {/* Spacer pushes logo to bottom on mobile */}
          <div className="flex-1 lg:hidden" />

          {/* Ambuja logo */}
          <div className="flex justify-center py-4 lg:mt-6">
            <img src="/ambuja-logo.png" alt="Ambuja" className="h-6 w-auto object-contain opacity-60" />
          </div>
        </div>
      </div>

    </div>
  )
}
