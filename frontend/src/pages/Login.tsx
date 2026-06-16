import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
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
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between p-14 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0d2740 0%, #1a3a5c 50%, #0f2d1f 100%)' }}
      >
        {/* Subtle dot grid */}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        />
        {/* Radial glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(79,138,255,0.12) 0%, transparent 70%)' }}
        />

        {/* Logo + headline */}
        <div className="relative flex flex-col items-center gap-8 mt-4">
          <img
            src="/logo.png"
            alt="Neo SHE"
            className="w-72 drop-shadow-2xl"
            style={{ filter: 'drop-shadow(0 12px 32px rgba(0,0,0,0.5))' }}
          />
          <div className="text-center space-y-2">
            <p className="text-blue-200/80 text-base leading-relaxed max-w-xs">
              Capture, track and resolve safety observations across all your construction sites in real time.
            </p>
          </div>
        </div>

        {/* Feature list */}
        <div className="relative space-y-5">
          {[
            { icon: '📸', title: 'Instant Capture', desc: 'Photos and observations from the field' },
            { icon: '📊', title: 'Live Dashboard', desc: 'Real-time risk tracking and analytics' },
            { icon: '🔔', title: 'Full Lifecycle', desc: 'From open to closure, nothing slips through' },
          ].map(f => (
            <div key={f.title} className="flex items-center gap-4">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)' }}
              >
                {f.icon}
              </div>
              <div>
                <p className="text-white text-sm font-semibold">{f.title}</p>
                <p className="text-blue-300/70 text-xs mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-slate-50">

        {/* Mobile top bar */}
        <div
          className="lg:hidden flex items-center justify-center px-5 py-5 flex-shrink-0 shadow-md"
          style={{ background: 'linear-gradient(160deg, #0d2740 0%, #1a3a5c 100%)' }}
        >
          <img
            src="/logo.png"
            alt="Neo SHE"
            className="h-20 w-auto object-contain"
            style={{ filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.4))' }}
          />
        </div>

        {/* Center the form */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-[400px] space-y-6">

            {/* Ambuja logo + heading */}
            <div>
              <div className="hidden lg:flex items-center gap-3 mb-6">
                <img src="/ambuja-logo.png" alt="Ambuja Neotia" className="h-8 w-auto object-contain" />
                <div className="w-px h-6 bg-gray-200" />
                <span className="text-sm text-gray-500 font-medium">Ambuja Neotia</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
              <p className="text-gray-500 mt-1 text-sm">Sign in to your Neo SHE account</p>
            </div>

            {/* Form card */}
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-8 space-y-5">
              {error && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-700 rounded-xl px-3.5 py-3 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 block">Email Address</label>
                  <input
                    type="email" className="input" placeholder="you@company.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    required autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 block">Password</label>
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
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white rounded-xl transition-opacity disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #1a3a5c 0%, #0d2740 100%)' }}
                >
                  {loading
                    ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Signing in…</>
                    : 'Sign In'
                  }
                </button>
              </form>
            </div>

            {/* Footer */}
            <div className="flex flex-col items-center gap-2 pt-1">
              <div className="lg:hidden flex items-center gap-2.5 mb-1">
                <img src="/ambuja-logo.png" alt="Ambuja Neotia" className="h-5 w-auto object-contain opacity-70" />
                <span className="text-xs text-gray-400 font-medium">Ambuja Neotia</span>
              </div>
              <p className="text-[11px] text-gray-400 tracking-widest uppercase">
                Safety &nbsp;|&nbsp; Health &nbsp;|&nbsp; Environment
              </p>
              <p className="text-xs text-gray-400">
                An initiative by <span className="font-semibold text-gray-500">Ambuja Neotia</span>
              </p>
            </div>

          </div>
        </div>
      </div>

    </div>
  )
}
