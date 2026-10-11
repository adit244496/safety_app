import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, FileType2, Loader2, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import api from '../../lib/api'
import { generateHtmlReportPdf } from '../../lib/printPdf'

const pct = (n: any) => (n === null || n === undefined ? '—' : `${n}%`)
const val = (n: any) => (n === null || n === undefined ? '—' : String(n))

const PALETTE = ['#4f46e5', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#84cc16', '#f97316', '#06b6d4', '#a855f7']
const clip = (s: string, n = 22) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s)

function ChartCard({ title, height = 240, children }: { title?: string; height?: number; children: React.ReactElement }) {
  return (
    <div className="border border-slate-100 rounded-lg p-2 mb-3 bg-white">
      {title && <p className="text-[11px] font-semibold text-slate-600 text-center mb-1">{title}</p>}
      <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
    </div>
  )
}

// Horizontal bar for category distributions (long labels)
function HBars({ data, color = '#4f46e5' }: { data: { name: string; value: number }[]; color?: string }) {
  return (
    <ChartCard height={Math.max(160, data.length * 26 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#eef2f7" />
        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} tickFormatter={(v: string) => clip(v, 26)} />
        <Tooltip cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey="value" fill={color} radius={[0, 3, 3, 0]} barSize={14}>
          <LabelList dataKey="value" position="right" style={{ fontSize: 10, fill: '#475569' }} />
        </Bar>
      </BarChart>
    </ChartCard>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-bold text-indigo-700 border-b-2 border-indigo-100 pb-1 mb-3">{title}</h3>
      {children}
    </div>
  )
}

function Table({ headers, rows, aligns }: { headers: string[]; rows: (string | number | null)[][]; aligns?: ('l' | 'r' | 'c')[] }) {
  const a = (i: number) => (aligns?.[i] === 'r' ? 'text-right' : aligns?.[i] === 'c' ? 'text-center' : 'text-left')
  return (
    <table className="w-full text-xs border-collapse mb-2">
      <thead>
        <tr className="bg-slate-800 text-white">
          {headers.map((h, i) => <th key={i} className={`border border-slate-300 px-2 py-1.5 font-semibold ${a(i)}`}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={headers.length} className="border border-slate-200 px-2 py-2 text-center text-slate-400">No data</td></tr>
        ) : rows.map((r, ri) => (
          <tr key={ri} className={ri % 2 ? 'bg-slate-50' : ''}>
            {r.map((c, ci) => <td key={ci} className={`border border-slate-200 px-2 py-1 ${a(ci)}`}>{c === null || c === undefined ? '—' : c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function MisReport({ projectIds, dateFrom, dateTo, generated }: {
  projectIds: number[]; dateFrom: string; dateTo: string; generated: boolean
}) {
  const [dl, setDl] = useState<'' | 'word' | 'pdf'>('')

  const params = {
    project_id: projectIds.length ? projectIds : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }

  const { data, isFetching } = useQuery({
    queryKey: ['mis-report', projectIds, dateFrom, dateTo],
    queryFn: () => api.get('/observations/mis-report', { params }).then(r => r.data),
    enabled: generated,
    staleTime: 30_000,
  })

  async function downloadWord() {
    setDl('word')
    try {
      const res = await api.get('/observations/mis-report.docx', { params, responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: `SHE_Performance_Report_${data?.meta?.quarter || ''}.docx`.replace(/[^\w.-]/g, '_') })
      a.click(); URL.revokeObjectURL(url)
    } catch { toast.error('Failed to generate Word document') } finally { setDl('') }
  }
  async function downloadPdf() {
    setDl('pdf')
    try { await generateHtmlReportPdf('mis-report-root', `SHE_Performance_Report_${(data?.meta?.quarter || '').replace(/[^\w.-]/g, '_')}.pdf`, 'a4') }
    catch { toast.error('Failed to generate PDF') } finally { setDl('') }
  }

  if (!generated) {
    return <div className="card text-center py-16 text-slate-400">
      <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-40" />
      Select a period above and click <span className="font-semibold">Generate Report</span> to build the MIS SHE report.
    </div>
  }
  if (isFetching || !data) {
    return <div className="card flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
  }

  const m = data.meta
  const s = data.summary

  return (
    <div className="space-y-3">
      {/* Download bar */}
      <div className="no-print flex items-center justify-end gap-2">
        <button onClick={downloadWord} disabled={!!dl} className="btn-secondary btn-sm">
          {dl === 'word' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileType2 className="w-4 h-4" />} Word
        </button>
        <button onClick={downloadPdf} disabled={!!dl} className="btn-secondary btn-sm">
          {dl === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} PDF
        </button>
      </div>

      {/* Report body */}
      <div id="mis-report-root" className="card !p-6 bg-white">
        <div className="text-center border-b-2 border-indigo-600 pb-3 mb-5">
          <h1 className="text-xl font-extrabold text-slate-900">Project SHE Performance Report, {m.quarter}</h1>
          <p className="text-xs text-indigo-700 font-semibold mt-1">Ambuja Neotia — Safety, Health &amp; Environment</p>
          <p className="text-[11px] text-slate-400 mt-1">
            Scope: {m.project_scope} &nbsp;|&nbsp; Period: {m.date_from} to {m.date_to} &nbsp;|&nbsp; Report date: {m.generated_on}
          </p>
        </div>

        <Section title="1. SHE Scores of the Organisation & Projects">
          <p className="text-sm mb-2">Overall Ambuja Neotia SHE Score for {m.quarter}:{' '}
            <span className="font-bold text-indigo-700">{pct(data.sheScore.overall)}</span></p>
          {data.sheScore.byProject.length > 0 && (
            <ChartCard title={`Project-wise SHE Score, ${m.quarter}`}>
              <BarChart data={data.sheScore.byProject.map((p: any) => ({ name: p.project_name, value: p.score }))} margin={{ top: 16, right: 10, left: -10, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} tickFormatter={(v: string) => clip(v, 10)} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#4f46e5" radius={[3, 3, 0, 0]} barSize={28}>
                  <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: '#475569' }} />
                </Bar>
              </BarChart>
            </ChartCard>
          )}
          <Table headers={['Project', 'SHE Score (%)']} aligns={['l', 'r']}
            rows={data.sheScore.byProject.map((p: any) => [p.project_name, p.score])} />
        </Section>

        <Section title="2. SHE Observation Summary">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
            {[['Raised', s.total], ['Rectified', s.rectified], ['Not Rectified', s.not_rectified],
              ['Timely', s.timely], ['Delayed', s.delayed], ['Avg Delay (d)', s.avg_delay]].map(([l, v]) => (
              <div key={l as string} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-center">
                <p className="text-lg font-bold text-slate-900">{v as any}</p>
                <p className="text-[10px] text-slate-500">{l as string}</p>
              </div>
            ))}
          </div>
          <Table headers={['Status', 'Count']} aligns={['l', 'r']} rows={(s.byStatus || []).map((x: any) => [x[0], x[1]])} />
        </Section>

        <Section title="3. Observations & Rectifications (Project-wise)">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <ChartCard title="Observations vs Rectifications">
              <BarChart data={data.projects.map((p: any) => ({ name: p.project_name, Raised: p.raised, Rectified: p.rectified, 'Not Rectified': p.not_rectified }))} margin={{ top: 8, right: 8, left: -14, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} tickFormatter={(v: string) => clip(v, 9)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Raised" fill="#4f46e5" barSize={12} /><Bar dataKey="Rectified" fill="#22c55e" barSize={12} /><Bar dataKey="Not Rectified" fill="#ef4444" barSize={12} />
              </BarChart>
            </ChartCard>
            <ChartCard title="Timely vs Delayed Rectifications">
              <BarChart data={data.projects.map((p: any) => ({ name: p.project_name, Timely: p.timely, Delayed: p.delayed }))} margin={{ top: 8, right: 8, left: -14, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} tickFormatter={(v: string) => clip(v, 9)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Timely" fill="#22c55e" barSize={16} /><Bar dataKey="Delayed" fill="#f59e0b" barSize={16} />
              </BarChart>
            </ChartCard>
          </div>
          <Table headers={['Project', 'Raised', 'Rectified', 'Not Rect.', 'Timely', 'Delayed', 'Avg Delay']}
            aligns={['l', 'r', 'r', 'r', 'r', 'r', 'r']}
            rows={data.projects.map((p: any) => [p.project_name, p.raised, p.rectified, p.not_rectified, p.timely, p.delayed, p.avg_delay])} />
        </Section>

        <Section title="4. Analysis of SHE Observations">
          <p className="text-xs font-semibold text-slate-600 mb-1">By Area of Concern (where violations occurred)</p>
          {data.violationArea.length > 0 && <HBars data={data.violationArea.map((x: any) => ({ name: x.name, value: x.count }))} color="#4f46e5" />}
          <Table headers={['Area / Core Concern', 'Count', '%']} aligns={['l', 'r', 'r']}
            rows={data.violationArea.map((x: any) => [x.name, x.count, x.pct])} />
          <p className="text-xs font-semibold text-slate-600 mb-1 mt-3">Predicted Consequence</p>
          {data.consequence.length > 0 && <HBars data={data.consequence.map((x: any) => ({ name: x.name, value: x.count }))} color="#ef4444" />}
          <Table headers={['Consequence', 'Count', '%']} aligns={['l', 'r', 'r']}
            rows={data.consequence.map((x: any) => [x.name, x.count, x.pct])} />
          <p className="text-xs font-semibold text-slate-600 mb-1 mt-3">Root Cause</p>
          {data.rootCause.length > 0 && <HBars data={data.rootCause.map((x: any) => ({ name: x.name, value: x.count }))} color="#f59e0b" />}
          <Table headers={['Root Cause', 'Count', '%']} aligns={['l', 'r', 'r']}
            rows={data.rootCause.map((x: any) => [x.name, x.count, x.pct])} />
        </Section>

        <Section title="5. Risk Analysis (Project-wise)">
          <ChartCard title="Risk distribution by project">
            <BarChart data={data.projects.map((p: any) => ({ name: p.project_name, High: p.high, Medium: p.medium, Low: p.low }))} margin={{ top: 8, right: 8, left: -14, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} tickFormatter={(v: string) => clip(v, 10)} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="High" stackId="r" fill="#ef4444" barSize={28} /><Bar dataKey="Medium" stackId="r" fill="#f59e0b" barSize={28} /><Bar dataKey="Low" stackId="r" fill="#22c55e" barSize={28} />
            </BarChart>
          </ChartCard>
          <Table headers={['Project', 'High', 'Medium', 'Low', 'Total']} aligns={['l', 'r', 'r', 'r', 'r']}
            rows={data.projects.map((p: any) => [p.project_name, p.high, p.medium, p.low, p.raised])} />
        </Section>

        <Section title="6. Noteworthy (Praiseworthy) Observations">
          <Table headers={['Project', 'Noteworthy']} aligns={['l', 'r']}
            rows={data.projects.map((p: any) => [p.project_name, p.noteworthy])} />
        </Section>

        <Section title="7. Observation Indices">
          <p className="text-[11px] text-slate-500 mb-2">Observation Rate = observations per 1,00,000 man-hours · Delay Rate = % of rectifications delayed.</p>
          <Table headers={['Project', 'Observation Rate', 'Delay Rate (%)']} aligns={['l', 'r', 'r']}
            rows={data.projects.map((p: any) => [p.project_name, val(p.observation_rate), p.delay_rate])} />
        </Section>

        <Section title="8. Man-hours & Manpower">
          {data.manpower.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <ChartCard title="Man-hours by project">
                <BarChart data={data.manpower.map((p: any) => ({ name: p.project_name, value: p.man_hours }))} margin={{ top: 8, right: 8, left: 6, bottom: 4 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} tickFormatter={(v: string) => clip(v, 10)} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#0ea5e9" radius={[3, 3, 0, 0]} barSize={28} />
                </BarChart>
              </ChartCard>
              <ChartCard title="% Man-power share">
                <PieChart>
                  <Pie data={data.manpower.map((p: any) => ({ name: p.project_name, value: p.man_hours }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e: any) => `${clip(e.name, 8)} ${e.percent ? Math.round(e.percent * 100) : 0}%`} labelLine={false} style={{ fontSize: 10 }}>
                    {data.manpower.map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ChartCard>
            </div>
          )}
          <Table headers={['Project', 'Man-hours', 'Avg Persons/Day', '% Share']} aligns={['l', 'r', 'r', 'r']}
            rows={data.manpower.map((p: any) => [p.project_name, p.man_hours, p.avg_persons, pct(p.pct)])} />
          {data.manpower.length === 0 && <p className="text-[11px] text-slate-400 italic">Enter data under Summary → Monthly OH&amp;S Statistics to populate man-hours.</p>}
        </Section>

        <p className="text-[10px] text-slate-400 italic mt-4">
          A higher "Delay in Rectification" means a project stays with risks for more days. Increase the observation
          rate and reduce severity through timely rectification.
        </p>
        <p className="text-center text-xs text-slate-400 mt-2">-End of Report-</p>
      </div>
    </div>
  )
}
