import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

// ── Types ──────────────────────────────────────────────────────────────────────
export interface DashboardPdfParams {
  cards: Array<{ label: string; value: number }>
  statusPie: Array<{ name: string; value: number }>
  riskBars: Array<{ risk_level: string; count: number }>
  ageingData: Record<string, number>
  filterDesc: string
  sheScoreByProject: Array<{ name: string; avgScore: number }>
  sheScoreByCategory: Array<{ name: string; avgScore: number }>
  complianceData?: {
    projectRows: any[]
    contractorRows: any[]
    topObservers: any[]
  }
}

export interface SummaryPdfParams {
  projectRows: any[]
  contractorRows: any[]
  filterDesc: string
  dateRange: string
}

export interface EasePdfParams {
  overallScore: number | null
  overallGrade: string
  filterDesc: string
  projectCount: number
  periodCount: number
}

// ── Colour palette (minimal — colour only where it signals meaning) ─────────────
type RGB = [number, number, number]

const C = {
  navy:    [22,  36,  71]  as RGB,   // header, table headers
  slate:   [51,  65,  85]  as RGB,   // section titles
  gray900: [17,  24,  39]  as RGB,
  gray700: [55,  65,  81]  as RGB,
  gray500: [107, 114, 128] as RGB,
  gray400: [156, 163, 175] as RGB,
  gray200: [229, 231, 235] as RGB,
  gray100: [243, 244, 246] as RGB,   // alternating row tint
  white:   [255, 255, 255] as RGB,
  green:   [16,  185, 129] as RGB,   // Closed / Low / Good
  amber:   [217, 119, 6]   as RGB,   // Medium risk / Average
  red:     [220, 38,  38]  as RGB,   // High risk / Below avg
  blue:    [59,  130, 246] as RGB,   // neutral accent (Open)
}

const RISK_RGB: Record<string, RGB> = { High: C.red, Medium: C.amber, Low: C.green }

const AGEING_LABELS: Record<string, string> = {
  on_time:        'On Time',
  overdue_1_7:    'Overdue ≤7d',
  overdue_8_30:   'Overdue 8–30d',
  overdue_30_plus:'Overdue 30+d',
  no_target:      'No Target Set',
}
const AGEING_COLORS: Record<string, RGB> = {
  on_time: C.green, overdue_1_7: C.amber, overdue_8_30: [249,115,22] as RGB,
  overdue_30_plus: C.red, no_target: C.gray400,
}

function gradeOf(score: number | null): string {
  if (score == null) return 'N/A'
  if (score >= 90) return 'EXCL'
  if (score >= 75) return 'GOOD'
  if (score >= 60) return 'AVG'
  return 'POOR'
}
function gradeColor(score: number | null): RGB {
  if (score == null) return C.gray400
  if (score >= 90) return C.green
  if (score >= 75) return [34, 197, 94] as RGB
  if (score >= 60) return C.amber
  return C.red
}

// ── jsPDF micro-helpers ────────────────────────────────────────────────────────
function fc(p: jsPDF, c: RGB) { p.setFillColor(c[0], c[1], c[2]) }
function tc(p: jsPDF, c: RGB) { p.setTextColor(c[0], c[1], c[2]) }
function dc(p: jsPDF, c: RGB) { p.setDrawColor(c[0], c[1], c[2]) }

// ── Chrome ─────────────────────────────────────────────────────────────────────
function header(pdf: jsPDF, W: number, M: number, date: string, filter: string) {
  // Thin navy top bar
  fc(pdf, C.navy); pdf.rect(0, 0, W, 12, 'F')
  tc(pdf, C.white)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9)
  pdf.text('Safety Performance Report', M, 8)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); tc(pdf, [180, 190, 210] as RGB)
  pdf.text(`Generated: ${date}`, W - M, 8, { align: 'right' })

  // Filter strip
  fc(pdf, C.gray100); pdf.rect(0, 12, W, 5.5, 'F')
  dc(pdf, C.gray200); pdf.line(0, 12, W, 12); pdf.line(0, 17.5, W, 17.5)
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(5.5); tc(pdf, C.gray500)
  const f = filter.length > 180 ? filter.slice(0, 177) + '…' : filter
  pdf.text(f, M, 16)
}

function footer(pdf: jsPDF, page: number, total: number, W: number, H: number, M: number) {
  dc(pdf, C.gray200); pdf.line(M, H - 6, W - M, H - 6)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5); tc(pdf, C.gray400)
  pdf.text('Confidential — For internal distribution only', M, H - 2)
  pdf.text(`Page ${page} of ${total}`, W - M, H - 2, { align: 'right' })
}

// ── Section label ──────────────────────────────────────────────────────────────
function sectionLabel(pdf: jsPDF, text: string, x: number, y: number, w: number) {
  fc(pdf, C.navy); pdf.rect(x, y, 2, 5, 'F')          // left accent bar
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); tc(pdf, C.slate)
  pdf.text(text.toUpperCase(), x + 4, y + 4)
  dc(pdf, C.gray200); pdf.line(x + 4 + pdf.getTextWidth(text.toUpperCase()) + 2, y + 2.5, x + w, y + 2.5)
}

// ── Compact table ──────────────────────────────────────────────────────────────
// cols: Array<{ header, w, align? }>
// rows: Array<Array<{ text, bold?, color? }>>
// returns y after last row
function compactTable(
  pdf: jsPDF,
  cols: Array<{ header: string; w: number; align?: 'left' | 'right' | 'center' }>,
  rows: Array<Array<{ text: string; bold?: boolean; color?: RGB; pill?: boolean }>>,
  x: number, y: number,
  ROW_H = 7,
): number {
  const totalW = cols.reduce((s, c) => s + c.w, 0)

  // Header
  fc(pdf, C.navy); pdf.roundedRect(x, y, totalW, ROW_H, 1, 1, 'F')
  tc(pdf, C.white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5)
  let cx = x + 2
  cols.forEach(col => {
    const align = col.align || 'left'
    const tx = align === 'right' ? cx + col.w - 4 : align === 'center' ? cx + col.w / 2 : cx
    pdf.text(col.header, tx, y + ROW_H - 2, { align })
    cx += col.w
  })
  y += ROW_H

  rows.forEach((row, ri) => {
    const rowBg: RGB = ri % 2 === 0 ? C.white : C.gray100
    fc(pdf, rowBg); pdf.rect(x, y, totalW, ROW_H, 'F')
    dc(pdf, C.gray200); pdf.line(x, y + ROW_H, x + totalW, y + ROW_H)
    cx = x + 2
    row.forEach((cell, ci) => {
      const col = cols[ci]
      const align = col.align || 'left'
      if (cell.pill && cell.color) {
        // small colored pill
        const pw = Math.min(col.w - 4, 18)
        const px = align === 'center' ? cx + (col.w - pw) / 2 : cx
        fc(pdf, cell.color); pdf.roundedRect(px, y + 1.5, pw, ROW_H - 3, 1, 1, 'F')
        tc(pdf, C.white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.5)
        pdf.text(cell.text, px + pw / 2, y + ROW_H - 2, { align: 'center' })
      } else {
        const rgb = cell.color || C.gray700
        tc(pdf, rgb)
        pdf.setFont('helvetica', cell.bold ? 'bold' : 'normal')
        pdf.setFontSize(6.5)
        const tx = align === 'right' ? cx + col.w - 4 : align === 'center' ? cx + col.w / 2 - 2 : cx
        pdf.text(cell.text, tx, y + ROW_H - 2)
      }
      cx += col.w
    })
    y += ROW_H
  })

  // Bottom border
  dc(pdf, C.gray200); pdf.line(x, y, x + totalW, y)
  return y
}

// ── Horizontal score bars (page 3) ────────────────────────────────────────────
function scoreSection(
  pdf: jsPDF,
  items: Array<{ name: string; avgScore: number }>,
  x: number, y: number, w: number, maxH: number,
) {
  if (items.length === 0) {
    tc(pdf, C.gray400); pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7)
    pdf.text('No data available', x + w / 2, y + 20, { align: 'center' })
    return
  }
  const nameW = Math.min(w * 0.38, 72)
  const scoreW = 18
  const barW = w - nameW - scoreW - 4
  const rowH = 9
  const maxRows = Math.floor(maxH / rowH)
  const shown = items.slice(0, maxRows)

  shown.forEach((item, i) => {
    const pct = Math.min(item.avgScore / 100, 1)
    const color: RGB = item.avgScore >= 75 ? C.green : item.avgScore >= 60 ? C.amber : C.red
    const rowBg: RGB = i % 2 === 0 ? C.white : C.gray100
    fc(pdf, rowBg); pdf.rect(x, y, w, rowH, 'F')

    tc(pdf, C.gray700); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5)
    const nm = item.name.length > 28 ? item.name.slice(0, 25) + '…' : item.name
    pdf.text(nm, x + 2, y + 6.5)

    fc(pdf, C.gray200); pdf.roundedRect(x + nameW, y + 2, barW, rowH - 4, 1.5, 1.5, 'F')
    if (pct > 0.01) {
      fc(pdf, color); pdf.roundedRect(x + nameW, y + 2, Math.max(pct * barW, 3), rowH - 4, 1.5, 1.5, 'F')
    }
    tc(pdf, color); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5)
    pdf.text(`${item.avgScore}%`, x + nameW + barW + 3, y + 6.5)
    y += rowH
  })
}

// ── Capture helper (for SHE Score PDF only) ────────────────────────────────────
async function captureChart(id: string): Promise<{ dataUrl: string; pw: number; ph: number } | null> {
  const el = document.getElementById(id)
  if (!el) return null
  await new Promise<void>(r => setTimeout(r, 150))
  const canvas = await html2canvas(el, { scale: 2.5, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false })
  return { dataUrl: canvas.toDataURL('image/png'), pw: canvas.width, ph: canvas.height }
}
function fitImage(pdf: jsPDF, img: { dataUrl: string; pw: number; ph: number }, x: number, y: number, maxW: number, maxH: number) {
  const ratio = img.ph / img.pw
  let w = maxW, h = maxW * ratio
  if (h > maxH) { h = maxH; w = maxH / ratio }
  pdf.addImage(img.dataUrl, 'PNG', x, y, w, h)
  return { w, h }
}

// ── Dashboard PDF — compact 2–3 page CEO report ───────────────────────────────
export async function generateDashboardPdf(p: DashboardPdfParams) {
  const hasShe = p.sheScoreByProject.length > 0 || p.sheScoreByCategory.length > 0
  const TOTAL  = hasShe ? 3 : 2

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297, H = 210, M = 14, CW = W - 2 * M
  const TOP = 20   // content start Y (after header strip)
  const BOT = H - 8 // content end Y (before footer)
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 1 — Overview: KPIs + Status | Ageing | Risk tables
  // ══════════════════════════════════════════════════════════════════════
  header(pdf, W, M, date, p.filterDesc)

  // ── KPI strip ──────────────────────────────────────────────────────────
  let y = TOP
  const kpiW = CW / 5
  const kpiH = 18
  const kpiColors: RGB[] = [C.slate, C.red, C.amber, [109,40,217] as RGB, C.green]
  p.cards.forEach((card, i) => {
    const kx = M + i * kpiW
    fc(pdf, C.gray100); pdf.roundedRect(kx, y, kpiW - 2, kpiH, 1, 1, 'F')
    // color accent top strip
    fc(pdf, kpiColors[i]); pdf.roundedRect(kx, y, kpiW - 2, 2, 0.5, 0.5, 'F')
    tc(pdf, kpiColors[i]); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16)
    pdf.text(String(card.value), kx + (kpiW - 2) / 2, y + 13, { align: 'center' })
    tc(pdf, C.gray500); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5)
    pdf.text(card.label, kx + (kpiW - 2) / 2, y + kpiH - 1, { align: 'center', maxWidth: kpiW - 5 })
  })
  y += kpiH + 5

  // ── Three-column tables ────────────────────────────────────────────────
  const gap = 6
  const colW = (CW - gap * 2) / 3    // ~85.7mm each
  const c1x = M, c2x = M + colW + gap, c3x = M + (colW + gap) * 2

  // Status table
  sectionLabel(pdf, 'Observations By Status', c1x, y, colW)
  const statusTotal = p.statusPie.reduce((s, x) => s + x.value, 0)
  const statusRows = [
    ...p.statusPie.map(s => [
      { text: s.name, bold: true, color: C.gray900 },
      { text: String(s.value), color: C.gray700, align: 'right' },
      { text: statusTotal > 0 ? `${Math.round(s.value / statusTotal * 100)}%` : '—', color: C.gray500 },
    ]),
    [
      { text: 'Total', bold: true, color: C.slate },
      { text: String(statusTotal), bold: true, color: C.slate },
      { text: '100%', color: C.gray400 },
    ],
  ] as any[]
  const statusCols = [
    { header: 'Status', w: colW - 28 },
    { header: '#',      w: 14, align: 'right' as const },
    { header: '%',      w: 14 },
  ]
  compactTable(pdf, statusCols, statusRows, c1x, y + 7)

  // Ageing table
  sectionLabel(pdf, 'Ageing Distribution', c2x, y, colW)
  const agingTotal = Object.values(p.ageingData).reduce((s, v) => s + v, 0)
  const agingRows = [
    ...['on_time','overdue_1_7','overdue_8_30','overdue_30_plus','no_target']
      .map(k => {
        const v = p.ageingData[k] || 0
        const color = AGEING_COLORS[k]
        return [
          { text: AGEING_LABELS[k], bold: true, color },
          { text: String(v), color: C.gray700 },
          { text: agingTotal > 0 ? `${Math.round(v / agingTotal * 100)}%` : '—', color: C.gray500 },
        ]
      }),
    [
      { text: 'Total', bold: true, color: C.slate },
      { text: String(agingTotal), bold: true, color: C.slate },
      { text: '100%', color: C.gray400 },
    ],
  ] as any[]
  const agingCols = [
    { header: 'Bucket', w: colW - 26 },
    { header: '#',      w: 12, align: 'right' as const },
    { header: '%',      w: 14 },
  ]
  compactTable(pdf, agingCols, agingRows, c2x, y + 7)

  // Risk table
  sectionLabel(pdf, 'Risk Distribution', c3x, y, colW)
  const riskTotal = p.riskBars.reduce((s, r) => s + r.count, 0)
  const riskRows = [
    ...(['High','Medium','Low'] as const)
      .map(level => {
        const item = p.riskBars.find(r => r.risk_level === level)
        const v = item?.count || 0
        return [
          { text: `${level} Risk`, bold: true, color: RISK_RGB[level] },
          { text: String(v), color: C.gray700 },
          { text: riskTotal > 0 ? `${Math.round(v / riskTotal * 100)}%` : '—', color: C.gray500 },
        ]
      }),
    [
      { text: 'Total', bold: true, color: C.slate },
      { text: String(riskTotal), bold: true, color: C.slate },
      { text: '100%', color: C.gray400 },
    ],
  ] as any[]
  const riskCols = [
    { header: 'Risk Level', w: colW - 26 },
    { header: '#',          w: 12, align: 'right' as const },
    { header: '%',          w: 14 },
  ]
  compactTable(pdf, riskCols, riskRows, c3x, y + 7)

  footer(pdf, 1, TOTAL, W, H, M)

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 2 — Compliance & Observers
  // ══════════════════════════════════════════════════════════════════════
  pdf.addPage()
  header(pdf, W, M, date, p.filterDesc)

  const projRows   = p.complianceData?.projectRows    || []
  const ctrRows    = p.complianceData?.contractorRows || []
  const obsRows    = p.complianceData?.topObservers   || []

  // Left column: Project-wise compliance (58% width)
  const leftW  = Math.round(CW * 0.58)
  const rightW = CW - leftW - 6
  const rightX = M + leftW + 6

  y = TOP
  sectionLabel(pdf, 'Project-wise Safety Compliance', M, y, leftW)
  y += 8

  if (projRows.length === 0) {
    tc(pdf, C.gray400); pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7)
    pdf.text('No data available', M + leftW / 2, y + 10, { align: 'center' })
  } else {
    const pCols = [
      { header: '#',       w: 8  },
      { header: 'Project', w: leftW - 8 - 16 - 16 - 18 - 20 - 20 },
      { header: 'Total',   w: 16, align: 'right' as const },
      { header: 'Open',    w: 16, align: 'right' as const },
      { header: 'Closed',  w: 18, align: 'right' as const },
      { header: 'H.Risk',  w: 20, align: 'right' as const },
      { header: 'Score',   w: 20, align: 'center' as const },
    ]
    const maxProjRows = Math.floor((BOT - y) / 7)
    const pRows = projRows.slice(0, maxProjRows).map((r: any, i: number) => {
      const sc = r.compliance_score
      const gc = gradeColor(sc)
      return [
        { text: String(i + 1), color: C.gray400 },
        { text: (r.project_name || '—').slice(0, 32), bold: true, color: C.gray900 },
        { text: String(r.total   ?? 0), color: C.gray700 },
        { text: String(r.open    ?? 0), color: r.open > 0 ? C.red : C.gray700 },
        { text: String(r.closed  ?? 0), color: r.closed > 0 ? C.green : C.gray700 },
        { text: String(r.high_risk ?? 0), color: r.high_risk > 0 ? C.red : C.gray700, bold: r.high_risk > 0 },
        { text: sc != null ? `${sc}%` : '—', bold: true, color: gc, pill: false },
      ]
    }) as any[]
    compactTable(pdf, pCols, pRows, M, y, 7)
  }

  // Right column top: Contractor-wise compliance
  y = TOP
  sectionLabel(pdf, 'Contractor-wise Safety Compliance', rightX, y, rightW)
  y += 8

  const halfH = Math.round((BOT - y) * 0.52)
  if (ctrRows.length === 0) {
    tc(pdf, C.gray400); pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7)
    pdf.text('No data available', rightX + rightW / 2, y + 10, { align: 'center' })
  } else {
    const cCols = [
      { header: '#',          w: 8 },
      { header: 'Contractor', w: rightW - 8 - 16 - 18 - 20 },
      { header: 'Total',      w: 16, align: 'right' as const },
      { header: 'Closed',     w: 18, align: 'right' as const },
      { header: 'Score',      w: 20, align: 'center' as const },
    ]
    const maxCtrRows = Math.floor(halfH / 7)
    const cRows = ctrRows.slice(0, maxCtrRows).map((r: any, i: number) => {
      const sc = r.compliance_score
      const gc = gradeColor(sc)
      return [
        { text: String(i + 1), color: C.gray400 },
        { text: (r.contractor_name || '—').slice(0, 22), bold: true, color: C.gray900 },
        { text: String(r.total  ?? 0), color: C.gray700 },
        { text: String(r.closed ?? 0), color: r.closed > 0 ? C.green : C.gray700 },
        { text: sc != null ? `${sc}%` : '—', bold: true, color: gc },
      ]
    }) as any[]
    compactTable(pdf, cCols, cRows, rightX, y, 7)
  }

  // Right column bottom: Top Observers
  y = TOP + halfH + 8
  sectionLabel(pdf, 'Top Observers', rightX, y, rightW)
  y += 8

  if (obsRows.length === 0) {
    tc(pdf, C.gray400); pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7)
    pdf.text('No data available', rightX + rightW / 2, y + 10, { align: 'center' })
  } else {
    const oCols = [
      { header: '#',        w: 8 },
      { header: 'Observer', w: rightW - 8 - 22 },
      { header: 'Count',    w: 22, align: 'right' as const },
    ]
    const maxObsRows = Math.floor((BOT - y) / 7)
    const oRows = obsRows.slice(0, maxObsRows).map((r: any, i: number) => [
      { text: String(i + 1), color: i < 3 ? C.amber : C.gray400 },
      { text: (r.observer_name || 'Unknown').slice(0, 30), bold: i < 3, color: i < 3 ? C.gray900 : C.gray700 },
      { text: String(r.count), bold: true, color: C.blue },
    ]) as any[]
    compactTable(pdf, oCols, oRows, rightX, y, 7)
  }

  footer(pdf, 2, TOTAL, W, H, M)

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 3 — SHE Score (only when data exists)
  // ══════════════════════════════════════════════════════════════════════
  if (hasShe) {
    pdf.addPage()
    header(pdf, W, M, date, p.filterDesc)

    const half = (CW - 8) / 2
    y = TOP

    // Left: by project
    sectionLabel(pdf, 'SHE Score by Project', M, y, half)
    y += 8
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6); tc(pdf, C.gray400)
    pdf.text('Last 3 months average', M, y); y += 5
    scoreSection(pdf, p.sheScoreByProject, M, y, half, BOT - y)

    // Right: by category
    y = TOP
    const rx = M + half + 8
    sectionLabel(pdf, 'Category Scores (Aggregated)', rx, y, half)
    y += 8
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6); tc(pdf, C.gray400)
    pdf.text('Last 3 months average', rx, y); y += 5
    scoreSection(pdf, p.sheScoreByCategory, rx, y, half, BOT - y)

    // Legend strip at bottom
    const legY = BOT - 5
    dc(pdf, C.gray200); pdf.line(M, legY, W - M, legY)
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.5); tc(pdf, C.gray500)
    pdf.text('Score: ', M, legY + 4)
    const lg = [
      { t: '≥90% Excellent', c: C.green },
      { t: '≥75% Good',      c: [34,197,94] as RGB },
      { t: '≥60% Average',   c: C.amber },
      { t: '<60% Poor',      c: C.red },
    ]
    let lx = M + 14
    lg.forEach(g => {
      fc(pdf, g.c); pdf.roundedRect(lx, legY + 0.5, 28, 4, 0.8, 0.8, 'F')
      tc(pdf, C.white); pdf.text(g.t, lx + 14, legY + 3.5, { align: 'center' })
      lx += 30
    })

    footer(pdf, 3, TOTAL, W, H, M)
  }

  pdf.save(`safety-report-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ── SHE Score standalone PDF ───────────────────────────────────────────────────
export async function generateEasePdf(p: EasePdfParams) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297, H = 210, M = 14, PAGES = 2
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  const [projectImg, categoryImg] = await Promise.all([
    captureChart('ease-project-chart'),
    captureChart('ease-category-chart'),
  ])

  header(pdf, W, M, date, p.filterDesc)

  const kpiY = 22
  const sr = gradeColor(p.overallScore)
  fc(pdf, C.navy); pdf.roundedRect(M, kpiY, W - M * 2, 15, 2, 2, 'F')
  tc(pdf, C.white)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20)
  pdf.text(p.overallScore != null ? `${p.overallScore}%` : 'N/A', W / 2, kpiY + 10.5, { align: 'center' })
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7)
  pdf.text('Overall SHE Score', M + 5, kpiY + 10.5)
  fc(pdf, sr); pdf.roundedRect(W - M - 48, kpiY + 3, 44, 9, 1.5, 1.5, 'F')
  tc(pdf, C.white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5)
  pdf.text(
    `${p.periodCount} period${p.periodCount !== 1 ? 's' : ''}  ·  Grade: ${gradeOf(p.overallScore)}`,
    W - M - 26, kpiY + 8.5, { align: 'center' },
  )

  if (projectImg) {
    const chartY = kpiY + 15 + 6
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); tc(pdf, C.navy)
    pdf.text('SHE Score by Project', M, chartY - 1.5)
    const { w, h } = fitImage(pdf, projectImg, M, chartY, W - M * 2, H - chartY - 10)
    void w; void h
  }

  footer(pdf, 1, PAGES, W, H, M)

  pdf.addPage()
  header(pdf, W, M, date, p.filterDesc)
  if (categoryImg) {
    const chartY = 24
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); tc(pdf, C.navy)
    pdf.text('Category Scores (Aggregated)', M, chartY - 1.5)
    fitImage(pdf, categoryImg, M, chartY, W - M * 2, H - chartY - 10)
  }
  footer(pdf, 2, PAGES, W, H, M)
  pdf.save(`she-score-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ── Summary / Compliance PDF ───────────────────────────────────────────────────
export async function generateSummaryPdf(p: SummaryPdfParams) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297, H = 210, M = 14
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const filterText = `${p.filterDesc}  |  Period: ${p.dateRange}`

  function drawCompPage(rows: any[], nameKey: string, title: string, pageNum: number) {
    header(pdf, W, M, date, filterText)
    const y0 = 22
    sectionLabel(pdf, title, M, y0, W - 2 * M)
    const TBL_COLS = [
      { header: '#',       w: 8 },
      { header: 'Name',    w: 72 },
      { header: 'Total',   w: 18, align: 'right' as const },
      { header: 'Open',    w: 18, align: 'right' as const },
      { header: 'Closed',  w: 18, align: 'right' as const },
      { header: 'H.Risk',  w: 22, align: 'right' as const },
      { header: 'M.Risk',  w: 22, align: 'right' as const },
      { header: 'L.Risk',  w: 22, align: 'right' as const },
      { header: 'Score',   w: 22, align: 'center' as const },
      { header: 'Grade',   w: 25, align: 'center' as const },
    ]
    const tRows = rows.map((row: any, i: number) => {
      const sc = row.compliance_score
      const gc = gradeColor(sc)
      return [
        { text: String(i + 1), color: C.gray400 },
        { text: (row[nameKey] || '—').slice(0, 38), bold: true, color: C.gray900 },
        { text: String(row.total       ?? 0), color: C.gray700 },
        { text: String(row.open        ?? 0), color: (row.open ?? 0) > 0 ? C.red : C.gray700 },
        { text: String(row.closed      ?? 0), color: (row.closed ?? 0) > 0 ? C.green : C.gray700 },
        { text: String(row.high_risk   ?? 0), color: (row.high_risk ?? 0) > 0 ? C.red : C.gray700, bold: (row.high_risk ?? 0) > 0 },
        { text: String(row.medium_risk ?? 0), color: C.gray700 },
        { text: String(row.low_risk    ?? 0), color: C.gray700 },
        { text: sc != null ? `${sc}%` : '—', bold: true, color: gc },
        { text: gradeOf(sc), bold: true, color: gc, pill: true },
      ]
    }) as any[]
    compactTable(pdf, TBL_COLS, tRows, M, y0 + 9, 7)
    footer(pdf, pageNum, 2, W, H, M)
  }

  drawCompPage(p.projectRows,    'project_name',    'Project-wise Safety Compliance',    1)
  pdf.addPage()
  drawCompPage(p.contractorRows, 'contractor_name', 'Contractor-wise Safety Compliance', 2)

  pdf.save(`compliance-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ── Generic HTML-to-PDF (SHE Inspection / Tracker reports) ────────────────────
export async function generateHtmlReportPdf(
  elementId: string,
  filename: string,
  pageSize: 'a4' | 'a3' = 'a4',
  onBeforeCapture?: (el: HTMLElement) => void,
  onAfterCapture?: (el: HTMLElement) => void,
  rowSeparatorSelector?: string,
) {
  const el = document.getElementById(elementId)
  if (!el) return

  onBeforeCapture?.(el)

  const prevOverflowX = el.style.overflowX
  const prevWidth     = el.style.width
  const contentW      = el.scrollWidth
  const contentH      = el.scrollHeight

  el.style.overflowX = 'visible'
  el.style.width     = `${contentW}px`

  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))

  const elTop = el.getBoundingClientRect().top
  const sepBottomsPx: number[] = rowSeparatorSelector
    ? Array.from(el.querySelectorAll(rowSeparatorSelector)).map(sep => {
        const r = (sep as HTMLElement).getBoundingClientRect()
        return r.bottom - elTop
      })
    : []

  const canvas = await html2canvas(el, {
    scale: 1.5, useCORS: true, allowTaint: true,
    backgroundColor: '#ffffff', logging: false,
    width: contentW, height: contentH, windowWidth: contentW, windowHeight: contentH,
  })

  el.style.overflowX = prevOverflowX
  el.style.width     = prevWidth
  onAfterCapture?.(el)

  const imgData = canvas.toDataURL('image/png')
  const [pageW, pageH] = pageSize === 'a3' ? [420, 297] : [297, 210]
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: pageSize })

  const pdfImgW = pageW
  const pdfImgH = pdfImgW * (canvas.height / canvas.width)

  const sepBottomsMm = sepBottomsPx.map(px => (px * 1.5 / canvas.height) * pdfImgH)

  const pageOffsets: number[] = [0]
  let pageEnd = pageH
  while (pageEnd < pdfImgH) {
    const candidates = sepBottomsMm.filter(y => y <= pageEnd && y > pageOffsets[pageOffsets.length - 1])
    const breakAt = candidates.length > 0 ? candidates[candidates.length - 1] : pageEnd
    pageOffsets.push(breakAt)
    pageEnd = breakAt + pageH
  }

  for (let i = 0; i < pageOffsets.length; i++) {
    if (i > 0) pdf.addPage()
    pdf.addImage(imgData, 'PNG', 0, -pageOffsets[i], pdfImgW, pdfImgH)
  }

  pdf.save(filename)
}
