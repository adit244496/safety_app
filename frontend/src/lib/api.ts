import axios from 'axios'

// Serialize array params as repeated keys: [1,2] → "id=1&id=2" (FastAPI List[T] style)
function serializeParams(params: Record<string, unknown>): string {
  const sp = new URLSearchParams()
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === null) continue
    if (Array.isArray(val)) {
      val.forEach(v => { if (v !== undefined && v !== null) sp.append(key, String(v)) })
    } else {
      sp.append(key, String(val))
    }
  }
  return sp.toString()
}

const api = axios.create({
  baseURL: '/api',
  paramsSerializer: { serialize: serializeParams },
})

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
