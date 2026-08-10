import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer, ArrowLeft } from 'lucide-react'
import api from '../../lib/api'

const DOC_CSS = `
.chwp-wrap { background:#e5e7eb; min-height:100vh; padding:16px 8px 48px; }
.chwp {
  width:210mm; max-width:100%; margin:0 auto; background:#fff; color:#000;
  font-family:'Times New Roman', Times, serif; font-size:10.5pt; line-height:1.28;
  padding:10mm 9mm; box-shadow:0 2px 12px rgba(0,0,0,0.15);
}
.chwp * { box-sizing:border-box; }
.chwp .title { text-align:center; font-weight:bold; font-size:14pt; letter-spacing:0.3px; }
.chwp .docno { text-align:right; font-size:8.5pt; margin-top:-14px; }
.chwp .rule { border:none; border-top:1px solid #000; margin:4px 0; }
.chwp .legal { font-weight:bold; font-size:9pt; text-align:justify; margin:6px 0; }
.chwp .fill { border-bottom:1px solid #000; display:inline-block; min-width:40px; }
.chwp .lbl { font-weight:bold; }
.chwp .cap { text-align:center; font-size:7.5pt; color:#000; }
.chwp table { width:100%; border-collapse:collapse; }
.chwp .cert { font-size:9pt; text-align:justify; margin:8px 0; }
.chwp .cb { display:inline-block; width:11px; height:11px; border:1.3px solid #000; margin-right:5px; vertical-align:-1px; text-align:center; line-height:9px; font-size:9px; font-weight:bold; }
.chwp .box { border:1px solid #000; }
.chwp .box2 { border:2px solid #000; }
.chwp .banner { background:#ffff00; border:1px solid #000; text-align:center; font-weight:bold; font-size:9.5pt; padding:5px; margin:8px 0; }
.chwp .wt { display:flex; gap:6px; align-items:flex-start; margin:2px 0; font-size:9pt; }
.chwp .sec-title { text-align:center; font-weight:bold; font-size:11pt; border:2px solid #000; padding:4px; margin-bottom:6px; }
.chwp .prec-cat { border:1px solid #000; padding:6px 8px; margin-bottom:6px; break-inside:avoid; }
.chwp .prec-cat h4 { margin:0 0 3px; font-size:9.5pt; }
.chwp .prec-sec { font-weight:bold; text-decoration:underline; font-size:8.5pt; margin-top:4px; }
.chwp .prec-item { font-size:8.5pt; margin:1px 0; }
.chwp .pagebreak { break-before:page; page-break-before:always; }
.chwp .gas th, .chwp .gas td { border:1px solid #000; font-size:8pt; padding:1px 3px; text-align:center; }

.chwp-toolbar { position:sticky; top:0; z-index:10; display:flex; gap:8px; justify-content:center; padding:10px; background:#e5e7eb; }

@media print {
  @page { size:A4 portrait; margin:8mm; }
  body { background:#fff !important; }
  .chwp-wrap { background:#fff !important; padding:0 !important; }
  .no-print { display:none !important; }
  .chwp { width:auto; box-shadow:none; padding:0; margin:0; font-size:9.5pt; }
  .chwp * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
}
`

const FILLED = '#1d4ed8'  // blue — user-entered / filled-in values

function Cb({ checked }: { checked?: boolean }) {
  return <span className="cb" style={checked ? { color: FILLED, borderColor: FILLED } : undefined}>{checked ? '✔' : ''}</span>
}

function line(v?: string | null) {
  return v ? <span style={{ fontWeight: 400, color: FILLED }}>{v}</span> : <span style={{ display: 'inline-block', minWidth: 120, borderBottom: '1px solid #000' }}>&nbsp;</span>
}

function CategoryPrecautions({ wt, index, data }: { wt: any; index: number; data: any }) {
  const d = data || {}
  const groups: { section: string; items: any[] }[] = []
  ;(wt.precautions || []).forEach((pr: any) => {
    const sec = pr.section || 'General'
    let g = groups.find(x => x.section === sec)
    if (!g) { g = { section: sec, items: [] }; groups.push(g) }
    g.items.push(pr)
  })
  const gas: any[] = d.__gas || []
  return (
    <div className="prec-cat">
      <h4>{index}. {wt.name}</h4>
      {groups.map(g => (
        <div key={g.section}>
          <div className="prec-sec">{g.section}</div>
          {g.items.map((pr: any) => {
            const v = d[pr.item_key]
            if (pr.input_type === 'toggle') return <div key={pr.id} className="prec-item"><Cb checked={v === 'YES'} /> {pr.label}: <b style={v ? { color: FILLED } : undefined}>{v || '—'}</b></div>
            if (pr.input_type === 'text') return <div key={pr.id} className="prec-item">{pr.label}: <span style={v ? { color: FILLED } : undefined}>{v || '—'}</span></div>
            return <div key={pr.id} className="prec-item"><Cb checked={!!v} /> {pr.label}</div>
          })}
        </div>
      ))}
      {gas.some((r: any) => r.time || r.o2 || r.lel || r.pel || r.location || r.testedBy) && (
        <table className="gas" style={{ marginTop: 4 }}>
          <thead><tr>{['#', 'Time', 'O₂', 'LEL', 'PEL', 'Location', 'Tested By'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {gas.map((r: any, i: number) => (r.time || r.o2 || r.lel || r.pel || r.location || r.testedBy) ? (
              <tr key={i}><td>{i + 1}</td><td>{r.time}</td><td>{r.o2}</td><td>{r.lel}</td><td>{r.pel}</td><td>{r.location}</td><td>{r.testedBy}</td></tr>
            ) : null)}
          </tbody>
        </table>
      )}
    </div>
  )
}

const CLOSURE_OPTS = [
  'Work satisfactorily completed',
  'Work not finished this shift',
  'CHWP area and equipment released in proper condition for normal use',
  'CHWP conditions not met - CHWP cancelled. Job withheld',
]

export default function PermitDocument() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: p, isLoading } = useQuery({ queryKey: ['work-permit', id], queryFn: () => api.get(`/work-permits/${id}`).then(r => r.data) })
  const { data: config } = useQuery<any[]>({ queryKey: ['permit-config-all'], queryFn: () => api.get('/work-permits/config', { params: { include_inactive: true } }).then(r => r.data), staleTime: 300_000 })

  if (isLoading || !config) return <div className="p-10 text-center text-gray-400">Loading…</div>
  if (!p) return <div className="p-10 text-center text-gray-400">Permit not found.</div>

  const selectedCodes: string[] = p.hazard_categories || []
  const dt = (s?: string | null) => s ? s.replace('T', ' ') : ''
  const fmtDate = (iso?: string) => iso ? iso.slice(0, 10) : ''
  const fmtTime = (iso?: string) => (iso && iso.includes('T')) ? iso.slice(11, 16) : ''
  const histOf = (a: string) => (p.history || []).find((h: any) => h.action === a)
  const approvedH = histOf('approved')
  const closeByH = histOf('closed') || histOf('cancelled')
  const slot = (v?: string | null, w = 110) => (
    <span style={{ display: 'inline-block', minWidth: w, borderBottom: '1px solid #000', textAlign: 'center', fontWeight: 400, padding: '0 3px', color: v && v.trim() ? FILLED : undefined }}>{v || ' '}</span>
  )

  return (
    <div className="chwp-wrap">
      <style>{DOC_CSS}</style>

      {/* Toolbar (hidden in print) */}
      <div className="chwp-toolbar no-print">
        <button onClick={() => navigate(`/work-permits/${id}`)} className="btn-secondary btn-sm"><ArrowLeft className="w-4 h-4" /> Back</button>
        <button onClick={() => window.print()} className="btn-primary btn-sm"><Printer className="w-4 h-4" /> Print / Save as PDF</button>
      </div>

      <div className="chwp">
        {/* ── Title ── */}
        <div className="title">CONSTRUCTION HAZARDOUS WORK PERMIT</div>
        <div className="docno"><b>Doc. No:</b> AN/OHS-006/Ver1.0</div>

        <div style={{ marginTop: 6 }}>Permit No. {line(p.permit_no)}</div>
        <div>Other associated Permit(s): {line(p.other_permits)}</div>

        <p className="legal">
          Valid only when signed by an authorized issuer, delegated by management. This permit must be issued before specified work is started;
          it must be closed immediately after completion of the work or at the end of the shift as agreed by parties identified on this permit.
          Canceled/closed permits shall be filed in the site construction file and at the conclusion of the day will be returned to Ambuja Neotia
          for retention. A representative sample (two or three) will be sent to Head Office for review by management to ensure the process is followed.
          Maintaining a CHWP register is mandatory.
        </p>

        {/* ── Issued to ── */}
        <table style={{ marginTop: 4 }}>
          <tbody>
            <tr>
              <td style={{ whiteSpace: 'nowrap', verticalAlign: 'bottom', paddingRight: 8 }}><span className="lbl">ISSUED TO:</span></td>
              <td style={{ textAlign: 'center' }}>{line(p.created_by_name)}</td>
              <td style={{ textAlign: 'left', fontSize: '8.5pt', paddingLeft: 10 }}>
                <div><b>Email ID:</b> {line(p.created_by_email)}</div>
                <div><b>Phone:</b> {line(p.created_by_mobile)}</div>
              </td>
              <td style={{ width: '15%', textAlign: 'center' }}>{line(p.issued_date)}</td>
            </tr>
            <tr>
              <td></td>
              <td className="cap">NAME (CONTRACTOR)</td>
              <td className="cap">EMAIL ID / PHONE (CONTRACTOR)</td>
              <td className="cap">DATE</td>
            </tr>
            <tr>
              <td style={{ whiteSpace: 'nowrap', verticalAlign: 'bottom', paddingRight: 8 }}><span className="lbl">FOR WORK IN:</span></td>
              <td colSpan={2} style={{ textAlign: 'center' }}>{line(p.work_location)}</td>
              <td style={{ textAlign: 'center' }}>{line([p.area, p.floor].filter(Boolean).join(' — ') || null)}</td>
            </tr>
            <tr>
              <td></td>
              <td colSpan={2} className="cap">EQUIPMENT / LOCATION</td>
              <td className="cap">AREA / FLOOR</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 2 }}>
          <span className="lbl">STARTS AT:</span> {line(dt(p.starts_at))} &nbsp;&nbsp;
          <span className="lbl">EXPIRES AT:</span> {line(dt(p.expires_at))}
        </div>
        <div style={{ marginTop: 2 }}><span className="lbl">DESCRIPTION OF WORK TO BE DONE:</span> {line(p.work_description)}</div>

        <p className="cert">
          This certifies that <b>I HAVE</b> personally completed a safety inspection of the area where this work is to be done, as well as the
          surrounding area, with specific attention to the type of work checked below. <b>I HAVE</b> reviewed the minimum precautions and equipment
          recommended in the Construction Safety requirements documents (Manual, Contractor's requirements, Contract Document and Site-Specific Safety
          requirements) and have indicated on the reverse side of this permit all necessary precautions taken to protect the personnel engaged in this
          work from accident and injury. <b>I HAVE</b> made sure that the personnel assigned for the task know the applicable safety rules and that they
          know what to do in an <b>EMERGENCY</b>.
        </p>

        {/* Pre-job discussion — signed by the approver */}
        <table style={{ marginTop: 4 }}>
          <tbody>
            <tr>
              <td style={{ whiteSpace: 'nowrap', verticalAlign: 'bottom', paddingRight: 8 }}><Cb checked={p.pre_job_discussion} /> <span className="lbl">HELD PRE-JOB DISCUSSION</span></td>
              <td style={{ textAlign: 'center' }}>{line(approvedH?.name || p.approver_name)}</td>
              <td style={{ width: '13%', textAlign: 'center' }}>{line(fmtDate(approvedH?.at))}</td>
              <td style={{ width: '11%', textAlign: 'center' }}>{line(fmtTime(approvedH?.at))}</td>
            </tr>
            <tr>
              <td></td>
              <td className="cap">Name of the Approver</td>
              <td className="cap">Date</td>
              <td className="cap">Time</td>
            </tr>
          </tbody>
        </table>

        {/* Closure box */}
        <table className="box2" style={{ marginTop: 4 }}>
          <tbody>
            <tr>
              <td style={{ width: '56%', padding: '5px 8px', borderRight: '1px solid #000', verticalAlign: 'top' }}>
                {CLOSURE_OPTS.map(opt => (
                  <div key={opt} style={{ fontSize: opt.includes('conditions not met') ? '10pt' : '9pt', fontWeight: opt.includes('conditions not met') ? 'bold' : 'normal', margin: '2px 0' }}>
                    <Cb checked={p.closure_type === opt} /> {opt}
                  </div>
                ))}
              </td>
              <td style={{ padding: '6px 8px', fontSize: '8.5pt' }}>
                <div style={{ marginBottom: 3 }}>{slot(' ', 90)} {slot(' ', 46)} {slot(' ', 40)}</div>
                <div className="cap" style={{ textAlign: 'left', marginBottom: 10 }}>
                  Responsibility accepted by <span style={{ fontSize: '6.5pt' }}>(If original receiver leaves site)</span> &nbsp;&nbsp; Date &nbsp;&nbsp; Time
                </div>
                <div style={{ marginBottom: 3 }}>{slot(closeByH?.name, 90)} {slot(fmtDate(closeByH?.at), 46)} {slot(fmtTime(closeByH?.at), 40)}</div>
                <div className="cap" style={{ textAlign: 'left' }}>Canceled/Closed at Job Site by &nbsp;&nbsp; Date &nbsp;&nbsp; Time</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="banner">This permit must be conspicuously posted in the immediate area where authorized work is being performed</div>

        {/* Work types */}
        <div style={{ fontWeight: 'bold', fontSize: '9.5pt', margin: '4px 0' }}>The following type of works are covered by this CONSTRUCTION HAZARDOUS WORK PERMIT:</div>
        {config.map((wt, i) => (
          <div key={wt.code} className="wt">
            <Cb checked={selectedCodes.includes(wt.code)} />
            <span>{i + 1}. {wt.name}</span>
          </div>
        ))}

        {/* ── Page 2: precautions ── */}
        <div className="pagebreak" />
        <div className="sec-title">PRECAUTIONS TAKEN AND EQUIPMENT PROVIDED TO PROTECT PERSONNEL FROM ACCIDENT OR INJURY</div>
        {selectedCodes.length === 0 ? (
          <p style={{ fontSize: '9pt', color: '#555' }}>No hazardous work types were selected.</p>
        ) : (
          selectedCodes.map((code, i) => {
            const wt = config.find(w => w.code === code)
            if (!wt) return null
            return <CategoryPrecautions key={code} wt={wt} index={i + 1} data={p.precautions?.[code]} />
          })
        )}

        <div style={{ marginTop: 8, fontSize: '8pt', textAlign: 'right', color: '#333' }}>
          Permit {p.permit_no} · Status: {p.status}{p.approver_name ? ` · Approved by ${p.approver_name} (${p.approver_role})` : ''}
        </div>
      </div>
    </div>
  )
}
