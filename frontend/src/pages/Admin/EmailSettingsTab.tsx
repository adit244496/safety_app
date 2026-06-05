import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Save, Send, Eye, EyeOff, Mail, CheckCircle, XCircle,
  Server, Lock, AtSign, Tag, Info, Bell, BellOff, Wifi
} from 'lucide-react'
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

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-3 border-b border-gray-100 mb-4">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100">
        <Icon className="w-3.5 h-3.5 text-gray-500" />
      </div>
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</span>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Mail className="w-8 h-8 animate-pulse" />
          <span className="text-sm">Loading email settings…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Page header + enable toggle — full width */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-6 py-5">
        <div className="flex items-center gap-4">
          <div className={`flex items-center justify-center w-11 h-11 rounded-xl border transition-colors ${
            form.enabled ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200'
          }`}>
            <Mail className={`w-5 h-5 ${form.enabled ? 'text-indigo-600' : 'text-gray-400'}`} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Email Notification Settings</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Automatically notify contractors and admins when observations are submitted.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0 ml-6">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
            form.enabled
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-gray-100 text-gray-500 border-gray-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${form.enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            {form.enabled ? 'Notifications Active' : 'Notifications Off'}
          </span>

          <div className="flex items-center gap-3">
            {form.enabled
              ? <Bell className="w-4 h-4 text-indigo-500" />
              : <BellOff className="w-4 h-4 text-gray-400" />
            }
            <button
              type="button"
              role="switch"
              aria-checked={form.enabled}
              onClick={() => set('enabled', !form.enabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                form.enabled ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                form.enabled ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Two-column main config */}
      <div className="grid grid-cols-2 gap-5">

        {/* Left: SMTP Server */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <SectionHeader icon={Server} title="SMTP Server" />

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="SMTP Host">
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Server className="w-3.5 h-3.5 text-gray-400" />
                  </span>
                  <input
                    className="input w-full pl-8"
                    placeholder="smtp.gmail.com"
                    value={form.smtp_host}
                    onChange={e => set('smtp_host', e.target.value)}
                  />
                </div>
              </Field>
            </div>
            <Field label="Port">
              <input
                className="input w-full"
                type="number"
                placeholder="587"
                value={form.smtp_port}
                onChange={e => set('smtp_port', parseInt(e.target.value) || 587)}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none group py-1">
            <input
              type="checkbox"
              checked={form.smtp_use_tls}
              onChange={e => set('smtp_use_tls', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div className="flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">Use STARTTLS</span>
              <span className="text-xs text-gray-400">(recommended for port 587)</span>
            </div>
          </label>

          <div className="h-px bg-gray-100" />

          <Field label="Username / Email">
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <AtSign className="w-3.5 h-3.5 text-gray-400" />
              </span>
              <input
                className="input w-full pl-8"
                placeholder="you@gmail.com"
                value={form.smtp_username}
                onChange={e => set('smtp_username', e.target.value)}
              />
            </div>
          </Field>

          <Field label="Password / App Password" hint="Leave blank to keep existing">
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Lock className="w-3.5 h-3.5 text-gray-400" />
              </span>
              <input
                className="input w-full pl-8 pr-10"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••••••"
                value={form.smtp_password}
                onChange={e => set('smtp_password', e.target.value)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-2.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                onClick={() => setShowPass(v => !v)}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>
        </div>

        {/* Right column: Sender Details + Info */}
        <div className="space-y-5">

          {/* Sender Details */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <SectionHeader icon={AtSign} title="Sender Details" />

            <Field label="From Email">
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <AtSign className="w-3.5 h-3.5 text-gray-400" />
                </span>
                <input
                  className="input w-full pl-8"
                  placeholder="safety@yourcompany.com"
                  value={form.from_email}
                  onChange={e => set('from_email', e.target.value)}
                />
              </div>
            </Field>

            <Field label="From Name">
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Tag className="w-3.5 h-3.5 text-gray-400" />
                </span>
                <input
                  className="input w-full pl-8"
                  placeholder="Safety Observation System"
                  value={form.from_name}
                  onChange={e => set('from_name', e.target.value)}
                />
              </div>
            </Field>
          </div>

          {/* How it works */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">How Notifications Work</p>
            </div>
            <ul className="space-y-2 text-xs text-blue-700">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-[10px] font-bold">T</span>
                <span><strong>TO:</strong> The contractor assigned to the observation</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-[10px] font-bold">C</span>
                <span><strong>CC:</strong> All HO users on the same project + all Admin users</span>
              </li>
            </ul>
            <div className="mt-3 pt-3 border-t border-blue-200 space-y-1.5 text-xs text-blue-600">
              <p>• Emails are sent automatically on new observation submissions</p>
              <p>• For Gmail, use an App Password (requires 2FA on the account)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions + feedback — full width */}
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
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
              className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!form.enabled ? 'Enable notifications first to send a test' : 'Send a test email to verify your configuration'}
            >
              <Send className="w-4 h-4" />
              {testing ? 'Sending…' : 'Send Test Email'}
            </button>
            {!form.enabled && (
              <span className="text-xs text-gray-400 italic">Enable notifications to send a test</span>
            )}
          </div>

          <div className="flex flex-col gap-2 min-w-0">
            {saveMsg && (
              <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg border ${
                saveMsg.ok
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {saveMsg.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
                {saveMsg.text}
              </div>
            )}
            {testMsg && (
              <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg border ${
                testMsg.ok
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {testMsg.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
                {testMsg.text}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
