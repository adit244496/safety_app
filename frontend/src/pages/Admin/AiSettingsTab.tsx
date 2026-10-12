import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Save, Eye, EyeOff, Sparkles, CheckCircle, XCircle,
  KeyRound, Cpu, Info, Zap, ZapOff, Wand2,
} from 'lucide-react'
import api from '../../lib/api'

interface AiForm {
  provider: string
  api_key: string
  model: string
  openai_api_key: string
  openai_model: string
  enabled: boolean
}

const EMPTY: AiForm = { provider: 'anthropic', api_key: '', model: 'claude-haiku-4-5-20251001', openai_api_key: '', openai_model: 'gpt-4o-mini', enabled: false }

export default function AiSettingsTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState<AiForm>(EMPTY)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => api.get('/admin/ai-settings').then(r => r.data),
  })

  const models: Record<string, string> = data?.models || {
    'claude-haiku-4-5-20251001': 'Claude Haiku 4.5 (fast, low cost)',
    'claude-sonnet-5': 'Claude Sonnet 5 (higher quality)',
  }
  const openaiModels: Record<string, string> = data?.openai_models || {
    'gpt-4o-mini': 'GPT-4o mini (fast, low cost)',
    'gpt-4o': 'GPT-4o (higher quality)',
  }
  const hasKey: boolean = data?.has_key ?? false
  const hasOpenaiKey: boolean = data?.has_openai_key ?? false
  const isOpenai = form.provider === 'openai'

  useEffect(() => {
    if (!data) return
    setForm({
      provider: data.provider || 'anthropic',
      api_key: '', model: data.model || 'claude-haiku-4-5-20251001',
      openai_api_key: '', openai_model: data.openai_model || 'gpt-4o-mini',
      enabled: data.enabled ?? false,
    })
  }, [data])

  const set = (k: keyof AiForm, v: any) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true); setSaveMsg(null)
    try {
      await api.put('/admin/ai-settings', form)
      qc.invalidateQueries({ queryKey: ['ai-settings'] })
      setSaveMsg({ ok: true, text: 'AI settings saved successfully.' })
    } catch (err: any) {
      setSaveMsg({ ok: false, text: err.response?.data?.detail || 'Failed to save settings.' })
    } finally { setSaving(false) }
  }

  async function testKey() {
    setTesting(true); setTestMsg(null)
    try {
      const res = await api.post('/admin/ai-settings/test')
      const label = models[res.data.model] || openaiModels[res.data.model] || res.data.model
      setTestMsg({ ok: true, text: `Connection OK — ${label} replied “${res.data.reply}”.` })
    } catch (err: any) {
      setTestMsg({ ok: false, text: err.response?.data?.detail || 'Test failed. Check the API key.' })
    } finally { setTesting(false) }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Sparkles className="w-8 h-8 animate-pulse" />
          <span className="text-sm">Loading AI settings…</span>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={e => e.preventDefault()} autoComplete="off" className="space-y-5">

      {/* Header + enable toggle */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-6 py-5">
        <div className="flex items-center gap-4">
          <div className={`flex items-center justify-center w-11 h-11 rounded-xl border transition-colors ${
            form.enabled ? 'bg-violet-50 border-violet-200' : 'bg-gray-50 border-gray-200'
          }`}>
            <Sparkles className={`w-5 h-5 ${form.enabled ? 'text-violet-600' : 'text-gray-400'}`} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">AI Summary Settings</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Configure the Anthropic API key and model used to generate observation summaries.
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
            {form.enabled ? 'AI Summaries Enabled' : 'AI Summaries Off'}
          </span>

          <div className="flex items-center gap-3">
            {form.enabled ? <Zap className="w-4 h-4 text-violet-500" /> : <ZapOff className="w-4 h-4 text-gray-400" />}
            <button
              type="button"
              role="switch"
              aria-checked={form.enabled}
              onClick={() => set('enabled', !form.enabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                form.enabled ? 'bg-violet-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                form.enabled ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Left: credentials + model */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100">
              <KeyRound className="w-3.5 h-3.5 text-gray-500" />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">API Configuration</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Provider</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Cpu className="w-3.5 h-3.5 text-gray-400" />
              </span>
              <select className="input w-full pl-8 appearance-none" value={form.provider} onChange={e => set('provider', e.target.value)}>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (GPT)</option>
              </select>
            </div>
            <p className="text-xs text-gray-400">Summaries are generated using the selected provider's key & model.</p>
          </div>

          <div className="h-px bg-gray-100" />

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <label className="text-sm font-medium text-gray-700">{isOpenai ? 'OpenAI API Key' : 'Anthropic API Key'}</label>
              <span className="text-xs text-gray-400">{(isOpenai ? hasOpenaiKey : hasKey) ? 'Leave blank to keep existing' : 'Required'}</span>
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <KeyRound className="w-3.5 h-3.5 text-gray-400" />
              </span>
              <input
                className="input w-full pl-8 pr-10"
                type={showKey ? 'text' : 'password'}
                placeholder={(isOpenai ? hasOpenaiKey : hasKey) ? '•••••••••• (saved)' : (isOpenai ? 'sk-…' : 'sk-ant-…')}
                value={isOpenai ? form.openai_api_key : form.api_key}
                onChange={e => set(isOpenai ? 'openai_api_key' : 'api_key', e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-2.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                onClick={() => setShowKey(v => !v)}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              The key is stored on the server and never shown again after saving.
            </p>
          </div>

          <div className="h-px bg-gray-100" />

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Model</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Cpu className="w-3.5 h-3.5 text-gray-400" />
              </span>
              <select
                className="input w-full pl-8 appearance-none"
                value={isOpenai ? form.openai_model : form.model}
                onChange={e => set(isOpenai ? 'openai_model' : 'model', e.target.value)}
              >
                {Object.entries(isOpenai ? openaiModels : models).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-400">
              The "mini / Haiku" model is cheapest and fastest; the larger model gives higher-quality summaries at a higher cost.
            </p>
          </div>
        </div>

        {/* Right: info */}
        <div className="rounded-xl border border-violet-100 bg-violet-50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-violet-500 flex-shrink-0" />
            <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">How AI Summaries Work</p>
          </div>
          <ul className="space-y-2 text-xs text-violet-700">
            <li className="flex items-start gap-2">
              <Wand2 className="mt-0.5 w-3.5 h-3.5 flex-shrink-0" />
              <span>Each observation's details and photos are sent to the selected AI provider to produce a short plain-text summary.</span>
            </li>
            <li className="flex items-start gap-2">
              <Sparkles className="mt-0.5 w-3.5 h-3.5 flex-shrink-0" />
              <span>Summaries are cached on the observation until someone regenerates them, with the author and timestamp shown.</span>
            </li>
          </ul>
          <div className="mt-3 pt-3 border-t border-violet-200 space-y-1.5 text-xs text-violet-600">
            <p>• Enable the toggle and save a key to turn the feature on.</p>
            <p>• Get an API key from console.anthropic.com (Anthropic) or platform.openai.com (OpenAI).</p>
          </div>
        </div>
      </div>

      {/* Actions + feedback */}
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
            <button
              type="button"
              onClick={testKey}
              disabled={testing}
              className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Send a tiny test request to verify the API key and model"
            >
              <Sparkles className="w-4 h-4" />
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
          </div>

          <div className="flex flex-col gap-2 min-w-0">
            {saveMsg && (
              <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg border ${
                saveMsg.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {saveMsg.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
                {saveMsg.text}
              </div>
            )}
            {testMsg && (
              <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg border ${
                testMsg.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {testMsg.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
                {testMsg.text}
              </div>
            )}
          </div>
        </div>
      </div>

    </form>
  )
}
