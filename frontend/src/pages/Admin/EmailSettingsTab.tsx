import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, Send, Eye, EyeOff, Mail, CheckCircle, XCircle } from 'lucide-react'
import api from '../../lib/api'

interface SmtpForm {
  smtp_host: string
  smtp_port: number
  smtp_username: string
  smtp_password: string
  smtp_use_tls: boolean
  from_email: string
  from_name: string
  enabled: boolean
}

const EMPTY: SmtpForm = {
  smtp_host: '',
  smtp_port: 587,
  smtp_username: '',
  smtp_password: '',
  smtp_use_tls: true,
  from_email: '',
  from_name: 'Safety Observation System',
  enabled: false,
}

export default function EmailSettingsTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState<SmtpForm>(EMPTY)
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const { data: smtpData, isLoading } = useQuery({
    queryKey: ['smtp-settings'],
    queryFn: () => api.get('/admin/smtp-settings').then(r => r.data),
  })

  useEffect(() => {
    if (!smtpData) return
    setForm({
      smtp_host: smtpData.smtp_host || '',
      smtp_port: smtpData.smtp_port || 587,
      smtp_username: smtpData.smtp_username || '',
      smtp_password: '',
      smtp_use_tls: smtpData.smtp_use_tls ?? true,
      from_email: smtpData.from_email || '',
      from_name: smtpData.from_name || 'Safety Observation System',
      enabled: smtpData.enabled ?? false,
    })
  }, [smtpData])

  const set = (k: keyof SmtpForm, v: any) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true); setSaveMsg(null)
    try {
      await api.put('/admin/smtp-settings', form)
      qc.invalidateQueries({ queryKey: ['smtp-settings'] })
      setSaveMsg({ ok: true, text: 'Settings saved successfully.' })
    } catch (err: any) {
      setSaveMsg({ ok: false, text: err.response?.data?.detail || 'Failed to save settings.' })
    } finally { setSaving(false) }
  }

  async function testEmail() {
    setTesting(true); setTestMsg(null)
    try {
      const res = await api.post('/admin/smtp-settings/test')
      setTestMsg({ ok: true, text: `Test email sent to ${res.data.sent_to}` })
    } catch (err: any) {
      setTestMsg({ ok: false, text: err.response?.data?.detail || 'Test failed. Check SMTP settings.' })
    } finally { setTesting(false) }
  }

  if (isLoading) return <div className="text-gray-400 text-sm py-8 text-center">Loading…</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Mail className="w-5 h-5 text-indigo-600" />
        <div>
          <h2 className="text-base font-semibold text-gray-900">Email Notification Settings</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            When an observer submits an observation, an email is sent to the contractor (TO) and HO / Admin users (CC).
          </p>
        </div>
      </div>

      {/* Enable toggle */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div
          onClick={() => set('enabled', !form.enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.enabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </div>
        <span className="text-sm font-medium text-gray-700">
          {form.enabled ? 'Email notifications enabled' : 'Email notifications disabled'}
        </span>
      </label>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">SMTP Server</p>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
            <input
              className="input w-full"
              placeholder="smtp.gmail.com"
              value={form.smtp_host}
              onChange={e => set('smtp_host', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
            <input
              className="input w-full"
              type="number"
              placeholder="587"
              value={form.smtp_port}
              onChange={e => set('smtp_port', parseInt(e.target.value) || 587)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.smtp_use_tls}
            onChange={e => set('smtp_use_tls', e.target.checked)}
            className="rounded border-gray-300 text-indigo-600"
          />
          <span className="text-sm text-gray-700">Use STARTTLS (recommended for port 587)</span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username / Email</label>
            <input
              className="input w-full"
              placeholder="you@gmail.com"
              value={form.smtp_username}
              onChange={e => set('smtp_username', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password / App Password</label>
            <div className="relative">
              <input
                className="input w-full pr-10"
                type={showPass ? 'text' : 'password'}
                placeholder="Leave blank to keep existing"
                value={form.smtp_password}
                onChange={e => set('smtp_password', e.target.value)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
                onClick={() => setShowPass(v => !v)}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">Sender Details</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
            <input
              className="input w-full"
              placeholder="safety@yourcompany.com"
              value={form.from_email}
              onChange={e => set('from_email', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
            <input
              className="input w-full"
              placeholder="Safety Observation System"
              value={form.from_name}
              onChange={e => set('from_name', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        <button
          onClick={testEmail}
          disabled={testing || !form.enabled}
          className="btn-secondary flex items-center gap-2 disabled:opacity-50"
          title={!form.enabled ? 'Enable notifications first to test' : ''}
        >
          <Send className="w-4 h-4" />
          {testing ? 'Sending…' : 'Send Test Email'}
        </button>
      </div>

      {saveMsg && (
        <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-lg ${saveMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {saveMsg.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {saveMsg.text}
        </div>
      )}

      {testMsg && (
        <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-lg ${testMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {testMsg.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {testMsg.text}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">How notifications work</p>
        <p>• <strong>TO:</strong> The contractor assigned to the observation</p>
        <p>• <strong>CC:</strong> All HO users on the same project + all Admin users</p>
        <p>• Emails are sent automatically when a new observation is submitted</p>
        <p>• For Gmail, use an App Password (2FA must be enabled on the account)</p>
      </div>
    </div>
  )
}
