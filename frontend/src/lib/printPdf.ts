import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ProjectManpower {
  name: string
  manHours: number
  avgPersons: number
}

export interface SheReportStats {
  projectRectification: Array<{
    project_name: string
    raised: number
    rectified: number
    not_rectified: number
    timely: number
    delayed: number
    total_delay_days: number
    avg_delay: number
  }>
  consequenceDistribution: Array<{ name: string; count: number; pct: number }>
  rootCauseDistribution: Array<{ name: string; count: number; pct: number }>
  violationAreaDistribution: Array<{ name: string; count: number; pct: number }>
  projectRiskAnalysis: Array<{ project_name: string; total: number; high: number; medium: number; low: number }>
  avgDelayOverall: number
  totalObservations: number
}

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
  // New for 7-page report
  quarterLabel?: string
  sheReport?: SheReportStats
  projectSheHistory?: Array<{ name: string; quarters: Array<{ label: string; score: number }> }>
  manpower?: ProjectManpower[]
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
  overdue_1_7:    'Overdue <=7d',
  overdue_8_30:   'Overdue 8-30d',
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
  pdf.text('Confidential - For internal distribution only', M, H - 2)
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

// ── Portrait helpers ───────────────────────────────────────────────────────────
function headerP(pdf: jsPDF, W: number, M: number, date: string, filter: string) {
  fc(pdf, C.navy); pdf.rect(0, 0, W, 12, 'F')
  tc(pdf, C.white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5)
  pdf.text('SHE Performance Report', M, 8.5)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6); tc(pdf, [180, 190, 210] as RGB)
  pdf.text(`Generated: ${date}`, W - M, 8.5, { align: 'right' })

  fc(pdf, C.gray100); pdf.rect(0, 12, W, 5.5, 'F')
  dc(pdf, C.gray200); pdf.line(0, 12, W, 12); pdf.line(0, 17.5, W, 17.5)
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(5); tc(pdf, C.gray500)
  const f = filter.length > 100 ? filter.slice(0, 97) + '…' : filter
  pdf.text(f, M, 16)
}

function footerP(pdf: jsPDF, page: number, total: number, W: number, H: number, M: number, quarter?: string) {
  dc(pdf, C.gray200); pdf.line(M, H - 8, W - M, H - 8)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5); tc(pdf, C.gray400)
  pdf.text(quarter || 'Confidential — For internal distribution only', M, H - 3.5)
  pdf.text(`Page ${page} of ${total}`, W - M, H - 3.5, { align: 'right' })
}

function noData(pdf: jsPDF, cx: number, cy: number) {
  tc(pdf, C.gray400); pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7)
  pdf.text('No data available', cx, cy, { align: 'center' })
}

// ── Vertical bar chart ─────────────────────────────────────────────────────────
// h = total height including axis labels and value labels (6mm)
// rotateLabels: auto-enabled when >7 items; adds 18mm for diagonal label area
function drawVertBars(
  pdf: jsPDF,
  data: Array<{ label: string; value: number; color?: RGB }>,
  x: number, y: number, w: number, h: number,
  opts: { maxVal?: number; suffix?: string; defaultColor?: RGB; rotateLabels?: boolean } = {},
): void {
  const n = data.length
  if (n === 0) { noData(pdf, x + w / 2, y + h / 2); return }

  const ROTATE   = opts.rotateLabels ?? n > 7
  const VAL_H    = 6
  const AXIS_H   = ROTATE ? 18 : 10
  const barAreaH = Math.max(h - VAL_H - AXIS_H, 1)
  const maxVal   = opts.maxVal ?? Math.max(...data.map(d => d.value), 1)
  const defColor = opts.defaultColor ?? C.blue
  const suffix   = opts.suffix ?? ''
  const groupW   = w / n

  data.forEach((d, i) => {
    const barW = Math.max(groupW * 0.55, 1)
    const bx   = x + i * groupW + (groupW - barW) / 2
    const bh   = maxVal > 0 ? Math.max((d.value / maxVal) * barAreaH, d.value > 0 ? 0.5 : 0) : 0
    const by   = y + VAL_H + barAreaH - bh

    const col = d.color ?? defColor
    fc(pdf, col); pdf.rect(bx, by, barW, bh, 'F')

    if (d.value > 0) {
      tc(pdf, col); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6)
      pdf.text(`${d.value}${suffix}`, bx + barW / 2, by - 1.5, { align: 'center' })
    }

    tc(pdf, C.gray500); pdf.setFont('helvetica', 'normal')
    if (ROTATE) {
      pdf.setFontSize(4.5)
      const lbl = d.label.length > 20 ? d.label.slice(0, 18) + '…' : d.label
      // angle:45 = 45° CCW; align:'right' anchors right end at (bx+barW/2, baseline)
      pdf.text(lbl, bx + barW / 2, y + VAL_H + barAreaH + 2, { angle: 45, align: 'right' })
    } else {
      pdf.setFontSize(5)
      const lbl = d.label.length > 10 ? d.label.slice(0, 9) + '…' : d.label
      pdf.text(lbl, x + i * groupW + groupW / 2, y + VAL_H + barAreaH + 6.5, { align: 'center' })
    }
  })

  dc(pdf, C.gray400); pdf.line(x, y + VAL_H + barAreaH, x + w, y + VAL_H + barAreaH)
}

// Draw a dashed horizontal line (target / average)
function drawDashedLine(pdf: jsPDF, x: number, y: number, w: number, color: RGB, label?: string) {
  dc(pdf, color); pdf.setLineDashPattern([2.5, 1.5], 0)
  pdf.line(x, y, x + w, y)
  pdf.setLineDashPattern([], 0)
  if (label) {
    tc(pdf, color); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.5)
    pdf.text(label, x + w + 1, y + 1.5)
  }
}

// ── Grouped vertical bar chart ─────────────────────────────────────────────────
function drawGroupedBars(
  pdf: jsPDF,
  groups: string[],
  series: Array<{ name: string; values: number[]; color: RGB }>,
  x: number, y: number, w: number, h: number,
): void {
  const nG = groups.length
  const nS = series.length
  if (nG === 0 || nS === 0) { noData(pdf, x + w / 2, y + h / 2); return }

  const VAL_H  = 5
  const AXIS_H = 10
  const barAreaH = Math.max(h - VAL_H - AXIS_H, 1)
  const maxVal = Math.max(...series.flatMap(s => s.values), 1)

  const groupW = w / nG
  const innerPad = groupW * 0.1
  const barsW = groupW - innerPad * 2
  const barW = Math.max((barsW - (nS - 1) * 0.8) / nS, 1)

  groups.forEach((grp, gi) => {
    const gx = x + gi * groupW + innerPad
    series.forEach((ser, si) => {
      const bx  = gx + si * (barW + 0.8)
      const val = ser.values[gi] ?? 0
      const bh  = maxVal > 0 ? Math.max((val / maxVal) * barAreaH, val > 0 ? 0.5 : 0) : 0
      const by  = y + VAL_H + barAreaH - bh

      fc(pdf, ser.color); pdf.rect(bx, by, barW, bh, 'F')
      if (val > 0 && barW > 4) {
        tc(pdf, ser.color); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(4.5)
        pdf.text(String(val), bx + barW / 2, by - 1, { align: 'center' })
      }
    })
    tc(pdf, C.gray500); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5)
    const lbl = grp.length > 9 ? grp.slice(0, 8) + '…' : grp
    pdf.text(lbl, x + gi * groupW + groupW / 2, y + VAL_H + barAreaH + 6.5, { align: 'center' })
  })

  dc(pdf, C.gray400); pdf.line(x, y + VAL_H + barAreaH, x + w, y + VAL_H + barAreaH)
}

// ── Legend row ─────────────────────────────────────────────────────────────────
function drawLegend(
  pdf: jsPDF,
  items: Array<{ name: string; color: RGB }>,
  x: number, y: number,
): void {
  let cx = x
  items.forEach(item => {
    fc(pdf, item.color); pdf.rect(cx, y, 4, 3, 'F')
    tc(pdf, C.gray700); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5)
    pdf.text(item.name, cx + 5, y + 3)
    cx += 5 + pdf.getTextWidth(item.name) + 6
  })
}


// ── Pie chart (polygon approximation) ─────────────────────────────────────────
function drawPie(
  pdf: jsPDF,
  data: Array<{ name: string; value: number; color: RGB }>,
  cx: number, cy: number, r: number,
): void {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) { noData(pdf, cx, cy); return }

  let startA = -Math.PI / 2

  for (const d of data) {
    if (d.value === 0) continue
    const sweep = (d.value / total) * Math.PI * 2
    const STEPS = Math.max(6, Math.ceil(sweep * 10))

    const segs: number[][] = []
    const ax0 = cx + r * Math.cos(startA)
    const ay0 = cy + r * Math.sin(startA)
    segs.push([ax0 - cx, ay0 - cy])

    let px = ax0, py = ay0
    for (let i = 1; i <= STEPS; i++) {
      const a  = startA + sweep * i / STEPS
      const nx = cx + r * Math.cos(a)
      const ny = cy + r * Math.sin(a)
      segs.push([nx - px, ny - py])
      px = nx; py = ny
    }
    segs.push([cx - px, cy - py])

    fc(pdf, d.color)
    pdf.lines(segs, cx, cy, [1, 1], 'F', false)
    startA += sweep
  }
}

// ── Mini project SHE quarterly chart ──────────────────────────────────────────
function drawMiniChart(
  pdf: jsPDF,
  name: string,
  quarters: Array<{ label: string; score: number }>,
  x: number, y: number, w: number, h: number,
): void {
  // Dark header
  fc(pdf, C.navy); pdf.rect(x, y, w, 9, 'F')
  tc(pdf, C.white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5)
  const nm = name.length > 18 ? name.slice(0, 16) + '…' : name
  pdf.text(nm, x + w / 2, y + 6.5, { align: 'center' })

  const chartY = y + 9
  const chartH = h - 9

  if (quarters.length === 0) {
    noData(pdf, x + w / 2, chartY + chartH / 2)
    return
  }

  const VAL_H   = 5
  const AXIS_H  = 8
  const barAreaH = Math.max(chartH - VAL_H - AXIS_H, 1)
  const n = quarters.length
  const groupW = (w - 4) / n

  quarters.forEach((q, i) => {
    const barW = Math.max(groupW * 0.5, 1)
    const bx   = x + 2 + i * groupW + (groupW - barW) / 2
    const bh   = Math.max((q.score / 100) * barAreaH, 0.5)
    const by   = chartY + VAL_H + barAreaH - bh
    const col: RGB = i === n - 1 ? [234, 179, 8] : C.blue

    fc(pdf, col); pdf.rect(bx, by, barW, bh, 'F')

    tc(pdf, col); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.5)
    pdf.text(`${q.score}%`, bx + barW / 2, by - 1, { align: 'center' })

    tc(pdf, C.gray400); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(4.5)
    const ql = q.label.replace(/Q-(\d)\s*\((\d{2})-(\d{2})\)/, 'Q$1 ($2-$3)')
    pdf.text(ql, x + 2 + i * groupW + groupW / 2, chartY + VAL_H + barAreaH + 5.5, { align: 'center' })
  })

  dc(pdf, C.gray400)
  pdf.line(x + 2, chartY + VAL_H + barAreaH, x + w - 2, chartY + VAL_H + barAreaH)
}

// ── Color palette for pie segments ────────────────────────────────────────────
const PIE_COLORS: RGB[] = [
  [59, 130, 246], [16, 185, 129], [245, 158, 11], [239, 68, 68],
  [139, 92, 246], [236, 72, 153], [6, 182, 212], [234, 179, 8],
]

// ── Dashboard PDF — 6-page portrait SHE Performance Report ────────────────────
export async function generateDashboardPdf(p: DashboardPdfParams) {
  const PAGES = 6
  const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, H = 297, M = 12, CW = W - 2 * M
  const TOP = 19, BOT = H - 9
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const ql = p.quarterLabel || ''

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 1 — SHE Scores of the Organization and Individual Projects
  // ══════════════════════════════════════════════════════════════════════
  headerP(pdf, W, M, dateStr, p.filterDesc)

  let y = TOP

  // Page title
  fc(pdf, [255, 251, 230] as RGB); pdf.roundedRect(M, y, CW, 7, 1, 1, 'F')
  dc(pdf, [234, 179, 8] as RGB); pdf.roundedRect(M, y, CW, 7, 1, 1, 'D')
  tc(pdf, C.slate); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5)
  pdf.text('SHE scores of the organization and the individual projects', W / 2, y + 5, { align: 'center' })
  y += 9

  // Org overall score banner
  if (p.sheScoreByProject.length > 0) {
    const orgScore = Math.round(
      p.sheScoreByProject.reduce((s, d) => s + d.avgScore, 0) / p.sheScoreByProject.length
    )
    const gc = gradeColor(orgScore)
    fc(pdf, [255, 251, 230] as RGB); pdf.roundedRect(M, y, CW, 8, 1, 1, 'F')
    dc(pdf, [234, 179, 8] as RGB); pdf.roundedRect(M, y, CW, 8, 1, 1, 'D')
    tc(pdf, gc); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8)
    pdf.text(`${orgScore}% is the overall SHE Score`, M + 4, y + 5.5)
    tc(pdf, C.red); pdf.setFontSize(6.5)
    pdf.text(`Grade: ${gradeOf(orgScore)}  |  Period: ${ql || 'Current'}`, W - M - 4, y + 5.5, { align: 'right' })
    y += 10
  }

  // SHE score by project — vertical bar chart
  sectionLabel(pdf, 'SHE Score by Project', M, y, CW)
  y += 6

  const projBars = p.sheScoreByProject.map(d => ({
    label: d.name,
    value: d.avgScore,
    color: gradeColor(d.avgScore),
  }))
  const CHART1_H = 78
  drawVertBars(pdf, projBars, M, y, CW, CHART1_H, { maxVal: 100, suffix: '%' })

  // Org avg dashed line — AXIS_H must match drawVertBars' auto-computed value
  if (projBars.length > 0) {
    const avg = Math.round(projBars.reduce((s, d) => s + d.value, 0) / projBars.length)
    const VAL_H = 6, AXIS_H = projBars.length > 7 ? 18 : 10
    const barAreaH = CHART1_H - VAL_H - AXIS_H
    const lineY = y + VAL_H + barAreaH - (avg / 100) * barAreaH
    drawDashedLine(pdf, M, lineY, CW, C.red as RGB, `Org Avg: ${avg}%`)
  }
  y += CHART1_H + 3

  // Category scores — vertical bars (rotated labels for 14 categories)
  sectionLabel(pdf, `Marks Achieved in Various Fields by Organization, ${ql || 'Current Period'}`, M, y, CW)
  y += 6

  const catBars = p.sheScoreByCategory.map(d => ({
    label: d.name,
    value: Math.round(d.avgScore),
    color: gradeColor(d.avgScore),
  }))

  const catH = Math.max(BOT - y - 2, 40)
  drawVertBars(pdf, catBars, M, y, CW, catH, { maxVal: 100, suffix: '%' })

  footerP(pdf, 1, PAGES, W, H, M, ql)

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 2 — Individual Project SHE Scores (last 4 quarters) + Cumulative
  // ══════════════════════════════════════════════════════════════════════
  pdf.addPage()
  headerP(pdf, W, M, dateStr, p.filterDesc)

  y = TOP
  sectionLabel(pdf, `Individual Project SHE Score${ql ? ', ' + ql : ''}`, M, y, CW)
  y += 7

  const history = p.projectSheHistory || []
  const nProjects = history.length

  if (nProjects === 0) {
    noData(pdf, W / 2, y + 30)
    y += 55
  } else {
    const COLS = nProjects <= 4 ? 2 : 3
    const CELL_W = (CW - (COLS - 1) * 3) / COLS
    const CELL_H = 42
    const CELL_GAP_V = 3

    history.forEach((proj, idx) => {
      const col = idx % COLS
      const row = Math.floor(idx / COLS)
      const cx = M + col * (CELL_W + 3)
      const cy = y + row * (CELL_H + CELL_GAP_V)
      fc(pdf, C.gray100); pdf.roundedRect(cx, cy, CELL_W, CELL_H, 1.5, 1.5, 'F')
      drawMiniChart(pdf, proj.name, proj.quarters, cx, cy, CELL_W, CELL_H)
    })

    const rows = Math.ceil(nProjects / COLS)
    y += rows * (CELL_H + CELL_GAP_V) + 3
  }

  // Cumulative observations per project
  if (y < BOT - 45 && p.sheReport && p.sheReport.projectRectification.length > 0) {
    sectionLabel(pdf, 'Cumulative Noteworthy Observations by Project', M, y, CW)
    y += 6
    const obsData = p.sheReport.projectRectification.map(r => ({
      label: r.project_name,
      value: r.raised,
    }))
    const obsH = Math.max(Math.min(BOT - y - 2, 58), 28)
    drawVertBars(pdf, obsData, M, y, CW, obsH)
  }

  footerP(pdf, 2, PAGES, W, H, M, ql)

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 3 — Observations Vs Rectifications
  // ══════════════════════════════════════════════════════════════════════
  pdf.addPage()
  headerP(pdf, W, M, dateStr, p.filterDesc)

  y = TOP
  const rec = p.sheReport?.projectRectification || []
  const recGroups = rec.map(r => r.project_name)
  const CHART_H4 = 64
  const LEGEND_H  = 5

  // Chart 1: Obs raised vs rectified vs not rectified
  sectionLabel(pdf, `Observations Vs Rectifications${ql ? ', ' + ql : ''}`, M, y, CW)
  y += 6
  if (rec.length > 0) {
    drawGroupedBars(pdf, recGroups, [
      { name: 'No of Observations raised', values: rec.map(r => r.raised),        color: C.blue  },
      { name: 'Rectified',                 values: rec.map(r => r.rectified),     color: C.red   },
      { name: 'Not Rectified',             values: rec.map(r => r.not_rectified), color: C.green },
    ], M, y, CW, CHART_H4)
    y += CHART_H4 + 1
    drawLegend(pdf, [
      { name: 'No of Observations raised', color: C.blue  },
      { name: 'Rectified',                 color: C.red   },
      { name: 'Not Rectified',             color: C.green },
    ], M, y)
    y += LEGEND_H + 4
  } else { noData(pdf, W / 2, y + CHART_H4 / 2); y += CHART_H4 + 8 }

  // Chart 2: Timely vs Delayed
  sectionLabel(pdf, 'Rectified Observations — Timely vs Delayed', M, y, CW)
  y += 6
  if (rec.length > 0) {
    drawGroupedBars(pdf, recGroups, [
      { name: 'No of Rectified Points', values: rec.map(r => r.rectified), color: C.blue  },
      { name: 'Timely Rectification',   values: rec.map(r => r.timely),    color: C.red   },
      { name: 'Delayed Rectifications', values: rec.map(r => r.delayed),   color: C.green },
    ], M, y, CW, CHART_H4)
    y += CHART_H4 + 1
    drawLegend(pdf, [
      { name: 'No of Rectified Points', color: C.blue  },
      { name: 'Timely Rectification',   color: C.red   },
      { name: 'Delayed Rectifications', color: C.green },
    ], M, y)
    y += LEGEND_H + 4
  } else { noData(pdf, W / 2, y + CHART_H4 / 2); y += CHART_H4 + 8 }

  // Chart 3: Delay days report
  sectionLabel(pdf, `Delay Days Report${ql ? ', ' + ql : ''}`, M, y, CW)
  y += 6
  if (rec.length > 0) {
    drawGroupedBars(pdf, recGroups, [
      { name: 'Number of Observations',        values: rec.map(r => r.raised),                    color: C.blue  },
      { name: 'Total Delay Days till Rect.',   values: rec.map(r => r.total_delay_days),           color: C.red   },
      { name: 'Avg Delay per Obs',             values: rec.map(r => Math.round(r.avg_delay)),      color: C.green },
    ], M, y, CW, CHART_H4)
    y += CHART_H4 + 1
    drawLegend(pdf, [
      { name: 'Number of Observations', color: C.blue  },
      { name: 'Total Delay Days',       color: C.red   },
      { name: 'Avg Delay/Obs',          color: C.green },
    ], M, y)
    y += LEGEND_H + 4

    if (p.sheReport && y < BOT - 12) {
      fc(pdf, [255, 251, 230] as RGB); pdf.roundedRect(M, y, CW, 9, 1, 1, 'F')
      dc(pdf, C.amber); pdf.roundedRect(M, y, CW, 9, 1, 1, 'D')
      tc(pdf, C.slate); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5)
      pdf.text(
        `Average Delay Days per Observation${ql ? ' in ' + ql : ''}: ${p.sheReport.avgDelayOverall} days  (Max 3 days allowed)`,
        W / 2, y + 5.8, { align: 'center' },
      )
    }
  }

  footerP(pdf, 3, PAGES, W, H, M, ql)

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 4 — Risk Analysis
  // ══════════════════════════════════════════════════════════════════════
  pdf.addPage()
  headerP(pdf, W, M, dateStr, p.filterDesc)

  y = TOP
  const riskData = p.sheReport?.projectRiskAnalysis || []
  const riskGroups = riskData.map(r => r.project_name)

  sectionLabel(pdf, `Risk Analysis of Each Project${ql ? ', ' + ql : ''}`, M, y, CW)
  y += 6
  const RISK_H = 64
  if (riskData.length > 0) {
    drawGroupedBars(pdf, riskGroups, [
      { name: 'Observation Points', values: riskData.map(r => r.total),  color: C.blue  },
      { name: 'Severity: High Risk',values: riskData.map(r => r.high),   color: C.red   },
      { name: 'Severity: Med Risk', values: riskData.map(r => r.medium), color: C.amber },
      { name: 'Severity: Low Risk', values: riskData.map(r => r.low),    color: C.green },
    ], M, y, CW, RISK_H)
    y += RISK_H + 1
    drawLegend(pdf, [
      { name: 'Observation Points', color: C.blue  },
      { name: 'High Risk',          color: C.red   },
      { name: 'Medium Risk',        color: C.amber },
      { name: 'Low Risk',           color: C.green },
    ], M, y)
    y += 8
  } else {
    noData(pdf, W / 2, y + RISK_H / 2); y += RISK_H + 8
  }

  // Potential consequences — full-width vertical bars
  const cons = p.sheReport?.consequenceDistribution || []
  sectionLabel(pdf, 'Potential Consequences due to Violations', M, y, CW)
  y += 6
  if (cons.length > 0) {
    const consH = 52
    drawVertBars(pdf, cons.map(c => ({ label: c.name, value: Math.round(c.pct), color: C.blue as RGB })), M, y, CW, consH, { maxVal: 100, suffix: '%' })
    y += consH + 4
  } else {
    noData(pdf, W / 2, y + 25); y += 50
  }

  // Root causes — full-width vertical bars
  const roots = p.sheReport?.rootCauseDistribution || []
  sectionLabel(pdf, 'Root Cause of Violations', M, y, CW)
  y += 6
  if (roots.length > 0) {
    const rootsH = Math.max(BOT - y - 2, 40)
    drawVertBars(pdf, roots.map(r => ({ label: r.name, value: Math.round(r.pct), color: C.amber as RGB })), M, y, CW, rootsH, { maxVal: 100, suffix: '%' })
  } else {
    noData(pdf, W / 2, y + 25)
  }

  footerP(pdf, 4, PAGES, W, H, M, ql)

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 5 — Safety Violations & Rates
  // ══════════════════════════════════════════════════════════════════════
  pdf.addPage()
  headerP(pdf, W, M, dateStr, p.filterDesc)

  y = TOP

  // Violation areas — full-width vertical bars
  const violAreas = p.sheReport?.violationAreaDistribution || []
  sectionLabel(pdf, `Predominating Areas of Safety Violations${ql ? ', ' + ql : ''}`, M, y, CW)
  y += 6
  if (violAreas.length > 0) {
    const violH = 55
    drawVertBars(pdf, violAreas.map(v => ({ label: v.name, value: Math.round(v.pct), color: C.blue as RGB })), M, y, CW, violH, { maxVal: 100, suffix: '%' })
    y += violH + 4
  } else {
    noData(pdf, W / 2, y + 30); y += 60
  }

  // Rate section: bar chart + table
  sectionLabel(pdf, 'Observation Rate, Delay in Rectification Rate, Incidence Rate', M, y, CW)
  y += 8

  const rateRec = p.sheReport?.projectRectification || []
  const mp = p.manpower || []

  // Rate bar chart (Obs Rate + Delay Rate per project)
  if (rateRec.length > 0) {
    const rateChartData = rateRec.map(r => {
      const mpRow = mp.find(m => m.name === r.project_name)
      const mh = mpRow?.manHours || 0
      return {
        obsRate:   mh > 0 ? Math.round(r.raised / mh * 100000) : 0,
        delayRate: mh > 0 ? Math.round(r.total_delay_days / mh * 100000) : 0,
      }
    })
    const rateGroups = rateRec.map(r => r.project_name)
    const RATE_H = 46
    drawGroupedBars(pdf, rateGroups, [
      { name: 'Observation Rate (per 100k man-hrs)', values: rateChartData.map(r => r.obsRate),   color: C.blue },
      { name: 'Delay Rate (per 100k man-hrs)',       values: rateChartData.map(r => r.delayRate), color: C.red  },
    ], M, y, CW, RATE_H)
    y += RATE_H + 1
    drawLegend(pdf, [
      { name: 'Observation Rate (per 100k man-hrs)', color: C.blue },
      { name: 'Delay Rate (per 100k man-hrs)',       color: C.red  },
    ], M, y)
    y += LEGEND_H + 4
  }

  if (rateRec.length > 0) {
    const nameW = CW - 8 - 38 - 38 - 30
    const rateCols = [
      { header: '#',           w: 8,     align: 'left'   as const },
      { header: 'Project',     w: nameW, align: 'left'   as const },
      { header: 'Obs Rate',    w: 38,    align: 'right'  as const },
      { header: 'Delay Rate',  w: 38,    align: 'right'  as const },
      { header: 'Incid. Rate', w: 30,    align: 'center' as const },
    ]
    const rateRows = rateRec.map((r, i) => {
      const mpRow = mp.find(m => m.name === r.project_name)
      const mh = mpRow?.manHours || 0
      const obsRate   = mh > 0 ? (r.raised / mh * 100000).toFixed(2) : 'N/A'
      const delayRate = mh > 0 ? (r.total_delay_days / mh * 100000).toFixed(2) : 'N/A'
      return [
        { text: String(i + 1),                        color: C.gray400 },
        { text: (r.project_name || '-').slice(0, 30), bold: true, color: C.gray900 },
        { text: obsRate,                               color: C.gray700 },
        { text: delayRate,                             color: C.amber   },
        { text: '0',                                   color: C.gray400 },
      ] as any[]
    })
    y = compactTable(pdf, rateCols, rateRows, M, y) + 5
  } else {
    noData(pdf, W / 2, y + 20); y += 45
  }

  // Summary text
  if (y < BOT - 28) {
    tc(pdf, C.gray700); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5)
    const lines6 = [
      'In our SHE observation system, we correlate "Delay in Rectification" to the number of days spent',
      'to rectify and close the unsafe observations. A higher "Delay in rectification" rate means that',
      'a particular project is staying with risks for a greater number of days.',
    ]
    lines6.forEach((ln, li) => { pdf.text(ln, M, y + li * 5); })
    y += lines6.length * 5 + 3

    tc(pdf, C.green); pdf.setFont('helvetica', 'bold')
    pdf.text('Increase', M, y)
    tc(pdf, C.gray700); pdf.setFont('helvetica', 'normal')
    pdf.text(' the Observation rate by increasing the number of SHE observations and ', M + pdf.getTextWidth('Increase'), y)

    y += 5
    tc(pdf, C.red); pdf.setFont('helvetica', 'bold')
    pdf.text('decreasing', M, y)
    tc(pdf, C.gray700); pdf.setFont('helvetica', 'normal')
    pdf.text(' the severity rate through timely rectification of the observations.', M + pdf.getTextWidth('decreasing'), y)
  }

  footerP(pdf, 5, PAGES, W, H, M, ql)

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 6 — Manpower
  // ══════════════════════════════════════════════════════════════════════
  pdf.addPage()
  headerP(pdf, W, M, dateStr, p.filterDesc)

  y = TOP
  const mpData = p.manpower || []

  if (mpData.length === 0) {
    noData(pdf, W / 2, H / 2)
  } else {
    // Chart 1: Man-hours by project
    sectionLabel(pdf, `Man-Hours Worked in Projects${ql ? ', ' + ql : ''}`, M, y, CW)
    y += 6
    const MH_H = 62
    drawVertBars(pdf, mpData.map(m => ({ label: m.name, value: Math.round(m.manHours) })), M, y, CW, MH_H)
    y += MH_H + 6

    // Chart 2: Avg persons by project
    sectionLabel(pdf, `Average No of Persons Worked in Project Sites${ql ? ', ' + ql : ''}`, M, y, CW)
    y += 6
    const AP_H = 62
    drawVertBars(pdf, mpData.map(m => ({ label: m.name, value: Math.round(m.avgPersons) })), M, y, CW, AP_H, { defaultColor: C.blue })
    y += AP_H + 6

    // Chart 3: % distribution pie + legend
    sectionLabel(pdf, 'Percentage of Man Power Worked in the Project Sites', M, y, CW)
    y += 6

    const mpTotal = mpData.reduce((s, m) => s + m.avgPersons, 0)
    if (mpTotal > 0) {
      const pieData = mpData.map((m, i) => ({
        name: m.name,
        value: m.avgPersons,
        color: PIE_COLORS[i % PIE_COLORS.length],
      }))

      const PIE_R = 26
      const pieCX = M + PIE_R + 5
      const pieCY = y + PIE_R + 3
      drawPie(pdf, pieData, pieCX, pieCY, PIE_R)

      // Legend to the right of pie
      let lx = pieCX + PIE_R + 10, ly = pieCY - PIE_R + 2
      pieData.forEach(d => {
        const pct = Math.round((d.value / mpTotal) * 100)
        fc(pdf, d.color); pdf.rect(lx, ly, 3.5, 3, 'F')
        tc(pdf, C.gray700); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5)
        pdf.text(`${d.name.slice(0, 20)} — ${pct}%`, lx + 5, ly + 2.5)
        ly += 5.5
      })
      y += PIE_R * 2 + 8
    }

    if (y < BOT - 10) {
      tc(pdf, C.gray400); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8)
      pdf.text('— End of Report —', W / 2, Math.max(y + 8, BOT - 12), { align: 'center' })
    }
  }

  footerP(pdf, 6, PAGES, W, H, M, ql)

  pdf.save(`she-performance-report-${new Date().toISOString().slice(0, 10)}.pdf`)
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
        { text: (row[nameKey] || '-').slice(0, 38), bold: true, color: C.gray900 },
        { text: String(row.total       ?? 0), color: C.gray700 },
        { text: String(row.open        ?? 0), color: (row.open ?? 0) > 0 ? C.red : C.gray700 },
        { text: String(row.closed      ?? 0), color: (row.closed ?? 0) > 0 ? C.green : C.gray700 },
        { text: String(row.high_risk   ?? 0), color: (row.high_risk ?? 0) > 0 ? C.red : C.gray700, bold: (row.high_risk ?? 0) > 0 },
        { text: String(row.medium_risk ?? 0), color: C.gray700 },
        { text: String(row.low_risk    ?? 0), color: C.gray700 },
        { text: sc != null ? `${sc}%` : 'N/A', bold: true, color: gc },
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
