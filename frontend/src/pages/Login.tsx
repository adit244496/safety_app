import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../store/authStore'
import api from '../lib/api'
import logoUrl from '../assets/logo.png'

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
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0d2740 0%, #1a3a5c 45%, #0f2d1f 100%)' }}
      >
        {/* Subtle dot grid */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '48px 48px' }}
        />

        {/* Logo */}
        <div className="relative flex flex-col items-center gap-6">
          <img
            src={logoUrl}
            alt="Neo SHE"
            className="w-64 drop-shadow-2xl"
            style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.4))' }}
          />
          <div className="text-center">
            <p className="text-blue-200 text-lg leading-relaxed max-w-sm">
              Capture, track and resolve safety observations across all your construction sites in real time.
            </p>
          </div>
        </div>

        {/* Feature list */}
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
      <div className="flex-1 flex flex-col lg:items-center lg:justify-center lg:p-8 bg-slate-50">

        {/* Mobile top branding bar */}
        <div
          className="lg:hidden flex items-center justify-center px-5 py-4 shadow-md flex-shrink-0"
          style={{ background: 'linear-gradient(160deg, #0d2740 0%, #1a3a5c 100%)' }}
        >
          <img
            src={logoUrl}
            alt="Neo SHE"
            className="h-16 w-auto object-contain"
            style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))' }}
          />
        </div>

        {/* Form area */}
        <div className="flex-1 flex flex-col lg:block w-full lg:max-w-sm px-5 pt-6 pb-4 lg:px-0 lg:pt-0 lg:pb-0">

          {/* Heading */}
          <div className="mb-5 lg:mb-8">
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 mt-0.5 text-sm">Sign in to your Neo SHE account</p>
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
                className="w-full flex items-center justify-center gap-2 py-2.5 mt-1 text-base font-semibold text-white rounded-xl transition-opacity disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #1a3a5c 0%, #0d2740 100%)' }}
              >
                {loading
                  ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Signing in…</>
                  : 'Sign In'
                }
              </button>
            </form>
          </div>

          {/* Spacer pushes tagline to bottom on mobile */}
          <div className="flex-1 lg:hidden" />

          {/* Tagline */}
          <div className="flex flex-col items-center pt-2 pb-8 lg:mt-8 gap-1">
            <p className="text-xs text-gray-400 tracking-widest uppercase">
              Safety &nbsp;|&nbsp; Health &nbsp;|&nbsp; Environment
            </p>
            <p className="text-xs text-gray-400">An initiative by <span className="font-semibold text-gray-500">Ambuja Neotia</span></p>
          </div>
        </div>
      </div>

    </div>
  )
}
