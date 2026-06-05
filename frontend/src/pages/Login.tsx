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
      {/* Left panel - decorative */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-blue-900 to-blue-800 flex-col justify-between p-12 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '60px 60px' }}
        />
        <div className="relative">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <span className="text-white font-bold text-lg">Neo SHE</span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Neo SHE<br />Safety App
          </h1>
          <p className="text-blue-200 text-lg leading-relaxed">
            Capture, track and resolve safety observations across all your construction sites in real time.
          </p>
        </div>

        {/* Feature highlights */}
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

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 bg-blue-700 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900">Neo SHE</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 mt-1 text-sm">Sign in to your account to continue</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 mb-5 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={submit} className="space-y-5">
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
                className="btn-primary w-full justify-center py-2.5 mt-2 text-base"
              >
                {loading
                  ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Signing in…</>
                  : 'Sign In'
                }
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-5">
            Default admin: <span className="font-mono text-gray-600">admin@safety.com</span>
            {' / '}
            <span className="font-mono text-gray-600">Admin@123</span>
          </p>
        </div>
      </div>
    </div>
  )
}
