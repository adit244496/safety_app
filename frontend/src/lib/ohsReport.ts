import jsPDF from 'jspdf'
import {
  OhsData, OhsFormConfig, OHS_DOC_NO, monthName,
} from './ohsConfig'

type RGB = [number, number, number]
const INK: RGB = [15, 23, 42]
const SLATE: RGB = [51, 65, 85]
const GRAY: RGB = [100, 116, 139]
const INDIGO: RGB = [67, 56, 202]
const HEADFILL: RGB = [30, 41, 59]
const ZEBRA: RGB = [247, 249, 252]
const BORDER: RGB = [203, 213, 225]
const GREEN: RGB = [22, 128, 70]
const WHITE: RGB = [255, 255, 255]

interface Col { label: string; w: number; align?: 'left' | 'center' }

export async function generateOhsStatisticsPdf(d: OhsData, config: OhsFormConfig) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const M = 12
  const CW = W - M * 2
  const BOTTOM = H - 14
  let y = M

  const setFill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2])
  const setText = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2])
  const setDraw = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2])
  const S = (v: any) => (v === null || v === undefined ? '' : String(v))

  function newPage() { pdf.addPage(); y = M }
  function ensure(space: number) { if (y + space > BOTTOM) newPage() }

  // ── Title banner ──────────────────────────────────────────────────────────
  function drawTitle() {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(19); setText(INK)
    pdf.text('Monthly OH&S Statistics', M, y + 6)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setText(GRAY)
    pdf.text('Doc. No.: ', W - M - 38, y + 2.5)
    pdf.setFont('helvetica', 'bold'); setText(SLATE); pdf.text(OHS_DOC_NO, W - M - 24, y + 2.5)
    pdf.setFont('helvetica', 'normal'); setText(GRAY)
    pdf.text(`${monthName(d.month)} ${d.year}`, W - M, y + 7, { align: 'right' })
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); setText(INDIGO)
    pdf.text('Ambuja Neotia  -  Safety, Health & Environment', M, y + 11.5)
    setDraw(INDIGO); pdf.setLineWidth(0.6); pdf.line(M, y + 14, W - M, y + 14)
    y += 19
  }

  // ── Info fields (two columns) ───────────────────────────────────────────────
  function infoPair(lx: number, label: string, value: string, labelW: number, cellW: number) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setText(GRAY)
    pdf.text(label, lx, y)
    pdf.setFont('helvetica', 'bold'); setText(INK)
    pdf.text(value || '-', lx + labelW, y)
    setDraw([226, 232, 240]); pdf.setLineWidth(0.2)
    pdf.line(lx, y + 1.6, lx + cellW, y + 1.6)
  }
  function drawInfo() {
    const colGap = 10
    const colW = (CW - colGap) / 2
    const pairs: [string, string][][] = [
      [['Project Site:', S(d.project_name)], ['Company:', S(d.company)]],
      [['Month:', monthName(d.month)], ['Year:', S(d.year)]],
      [['Expected duration:', S(d.expected_duration)], ['Current age of project:', S(d.current_age)]],
    ]
    for (const [left, right] of pairs) {
      ensure(7)
      infoPair(M, left[0], left[1], 32, colW)
      infoPair(M + colW + colGap, right[0], right[1], 34, colW)
      y += 6.5
    }
    ensure(7)
    infoPair(M, 'Contractors present:', S(d.contractors_present), 34, CW)
    y += 8
  }

  // ── Section heading band ────────────────────────────────────────────────────
  function sectionHead(letter: string, title: string) {
    ensure(9)
    const sz = 6.2
    setFill(INDIGO); pdf.roundedRect(M, y, sz, sz, 1, 1, 'F')
    setText(WHITE); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8)
    pdf.text(letter, M + sz / 2, y + sz / 2 + 1.4, { align: 'center' })
    setText(INK); pdf.setFontSize(10.5)
    pdf.text(title, M + sz + 3, y + sz / 2 + 1.4)
    y += sz + 3
  }

  // ── Generic table with row-boundary pagination & wrapping ───────────────────
  function table(cols: Col[], rows: string[][], opts: { zebra?: boolean; emptyNote?: string; emptyColor?: RGB } = {}) {
    const pad = 1.6
    const lh = 3.5
    const fs = 7.8
    const headerH = 6.2

    const drawHeader = () => {
      ensure(headerH + 8)
      setFill(HEADFILL); pdf.rect(M, y, CW, headerH, 'F')
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(fs); setText(WHITE)
      let cx = M
      for (const c of cols) {
        const tx = c.align === 'center' ? cx + c.w / 2 : cx + pad
        pdf.text(c.label, tx, y + headerH / 2 + 1.3, { align: c.align === 'center' ? 'center' : 'left', maxWidth: c.w - pad })
        cx += c.w
      }
      y += headerH
    }

    drawHeader()

    if (rows.length === 0 && opts.emptyNote) {
      const rh = 7
      ensure(rh)
      setDraw(BORDER); pdf.setLineWidth(0.2); pdf.rect(M, y, CW, rh, 'S')
      pdf.setFont('helvetica', 'italic'); pdf.setFontSize(fs); setText(opts.emptyColor || GRAY)
      pdf.text(opts.emptyNote, M + CW / 2, y + rh / 2 + 1.2, { align: 'center' })
      y += rh
      return
    }

    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(fs)
    rows.forEach((row, ri) => {
      // wrap each cell, compute row height
      const wrapped = cols.map((c, ci) => pdf.splitTextToSize(S(row[ci]), c.w - pad * 2))
      const lines = Math.max(1, ...wrapped.map(w => w.length))
      const rh = Math.max(6, lines * lh + pad * 2)

      if (y + rh > BOTTOM) { newPage(); drawHeader(); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(fs) }

      if (opts.zebra && ri % 2 === 1) { setFill(ZEBRA); pdf.rect(M, y, CW, rh, 'F') }

      let cx = M
      setText(SLATE)
      cols.forEach((c, ci) => {
        setDraw(BORDER); pdf.setLineWidth(0.2); pdf.rect(cx, y, c.w, rh, 'S')
        const txt = wrapped[ci] as string[]
        const ty = y + (rh - (txt.length - 1) * lh) / 2 + 0.4
        if (c.align === 'center') {
          pdf.text(txt, cx + c.w / 2, ty, { align: 'center' })
        } else {
          pdf.text(txt, cx + pad, ty)
        }
        cx += c.w
      })
      y += rh
    })
  }

  function gap(mm: number) { y += mm }

  // ═══════════════════════════════ BUILD ═════════════════════════════════════
  drawTitle()
  drawInfo()

  // A — Manhours
  sectionHead('A', 'Details of Manhours Worked')
  table(
    [{ label: 'Sl.', w: 12, align: 'center' }, { label: 'Description', w: 98 },
     { label: 'Avg. persons / day', w: 38, align: 'center' }, { label: 'Man-hours (Monthly)', w: 38, align: 'center' }],
    config.section_a.map((it, i) => [String(i + 1), it.label, S(d.section_a[it.item_key]?.avg_persons), S(d.section_a[it.item_key]?.man_hours)]),
    { zebra: true },
  )
  gap(5)

  // B — LTI
  sectionHead('B', 'Details of Lost Time Injury')
  const lti = (d.lti || []).filter(r => r && (r.name || r.company || r.date))
  table(
    [{ label: 'Sl.', w: 10, align: 'center' }, { label: 'Name of Injured', w: 36 }, { label: 'Company', w: 32 },
     { label: 'Date', w: 24, align: 'center' }, { label: 'Man-days lost', w: 24, align: 'center' },
     { label: 'Investigated?', w: 28, align: 'center' }, { label: 'Report to HO', w: 32, align: 'center' }],
    lti.map((r, i) => [String(i + 1), S(r.name), S(r.company), S(r.date), S(r.man_days_lost), S(r.investigated), S(r.report_sent)]),
    { zebra: true, emptyNote: 'No lost-time injuries recorded for this period.', emptyColor: GREEN },
  )
  gap(5)

  // C — General Summary
  sectionHead('C', 'General Summary')
  const cdCols: Col[] = [
    { label: 'Sl.', w: 10, align: 'center' }, { label: 'Description', w: 96 },
    { label: 'For the month', w: 26, align: 'center' }, { label: 'Cumulative', w: 26, align: 'center' },
    { label: 'Remarks', w: 28 },
  ]
  table(cdCols,
    config.general_summary.map((it, i) => [String(i + 1), it.label, S(d.general_summary[it.item_key]?.for_month), S(d.general_summary[it.item_key]?.cumulative), S(d.general_summary[it.item_key]?.remarks)]),
    { zebra: true },
  )
  gap(5)

  // D — Activities
  sectionHead('D', 'Activities')
  table(cdCols,
    config.activities.map((it, i) => [String(i + 1), it.label, S(d.activities[it.item_key]?.for_month), S(d.activities[it.item_key]?.cumulative), S(d.activities[it.item_key]?.remarks)]),
    { zebra: true },
  )
  gap(5)

  // E — Violations
  sectionHead('E', 'Violation Memo & Stop Work Notice (issued by PIC, EIC, PSO)')
  const viol = (d.violations || []).filter(r => r && (r.date || r.issued_to || r.reason))
  table(
    [{ label: 'Sl.', w: 10, align: 'center' }, { label: 'Date', w: 24, align: 'center' }, { label: 'Issued to (Contractor)', w: 40 },
     { label: 'Issued by', w: 34 }, { label: 'Memo / Stoppage', w: 30, align: 'center' }, { label: 'Reason', w: 48 }],
    viol.map((r, i) => [String(i + 1), S(r.date), S(r.issued_to), S(r.issued_by), S(r.type), S(r.reason)]),
    { zebra: true, emptyNote: 'No violation memo or stop-work notice issued.' },
  )

  // Notes
  gap(6); ensure(14)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); setText(GRAY)
  pdf.text('* Tool Box Meeting: minimum duration 5 minutes, approximately 15 heads.', M, y); y += 3.6
  pdf.text('* Training: minimum duration 30 minutes, approximately 25 heads.', M, y); y += 4

  // Signatures
  ensure(22); y += 10
  const half = CW / 2
  setDraw(SLATE); pdf.setLineWidth(0.3)
  pdf.line(M, y, M + half - 12, y)
  pdf.line(M + half + 12, y, W - M, y)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setText(GRAY)
  pdf.text('Safety Coordinator', M, y + 4)
  pdf.text('Site In-charge', W - M, y + 4, { align: 'right' })
  pdf.setFont('helvetica', 'bold'); setText(INK)
  if (d.safety_coordinator) pdf.text(S(d.safety_coordinator), M, y - 2)
  if (d.site_incharge) pdf.text(S(d.site_incharge), W - M, y - 2, { align: 'right' })

  // ── Footers (page x of y) ───────────────────────────────────────────────────
  const total = pdf.getNumberOfPages()
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p)
    setDraw([226, 232, 240]); pdf.setLineWidth(0.2); pdf.line(M, H - 10, W - M, H - 10)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); setText(GRAY)
    pdf.text(`${OHS_DOC_NO}  -  ${S(d.project_name)}  -  ${monthName(d.month)} ${d.year}`, M, H - 6)
    pdf.text(`Generated ${today}`, W / 2, H - 6, { align: 'center' })
    pdf.text(`Page ${p} of ${total}`, W - M, H - 6, { align: 'right' })
  }

  const fname = `OHS-016 ${S(d.project_name) || 'Project'} ${monthName(d.month)} ${d.year}.pdf`
  pdf.save(fname.replace(/[\\/:*?"<>|]/g, '-'))
}
