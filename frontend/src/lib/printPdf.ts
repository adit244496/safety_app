import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

// ── Types ──────────────────────────────────────────────────────────────────────
export interface DashboardPdfParams {
  cards: Array<{ label: string; value: number }>
  statusPie: Array<{ name: string; value: number }>
  riskBars: Array<{ risk_level: string; count: number }>
  recent: any[]
  filterDesc: string
  viewMode: 'monthly' | 'quarterly'
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

// ── Colour constants ───────────────────────────────────────────────────────────
type RGB = [number, number, number]

const C = {
  indigo:   [79,  70,  229] as RGB,
  indigo50: [238, 240, 254] as RGB,
  gray900:  [17,  24,  39]  as RGB,
  gray700:  [55,  65,  81]  as RGB,
  gray500:  [107, 114, 128] as RGB,
  gray200:  [229, 231, 235] as RGB,
  white:    [255, 255, 255] as RGB,
  riskHigh: [244, 63,  94]  as RGB,
  riskMed:  [245, 158, 11]  as RGB,
  riskLow:  [16,  185, 129] as RGB,
}

const RISK_RGB: Record<string, RGB> = {
  High: C.riskHigh, Medium: C.riskMed, Low: C.riskLow,
}

function cc(score: number | null): RGB {
  if (score == null) return [148, 163, 184]
  if (score >= 90) return [16, 185, 129]
  if (score >= 75) return [34, 197, 94]
  if (score >= 60) return [245, 158, 11]
  return [239, 68, 68]
}
function cg(score: number | null): string {
  if (score == null) return 'N/A'
  if (score >= 90) return 'EXCELLENT'
  if (score >= 75) return 'GOOD'
  if (score >= 60) return 'AVERAGE'
  return 'BELOW AVG'
}

// ── jsPDF colour helpers ───────────────────────────────────────────────────────
function fc(pdf: jsPDF, c: RGB) { pdf.setFillColor(c[0], c[1], c[2]) }
function tc(pdf: jsPDF, c: RGB) { pdf.setTextColor(c[0], c[1], c[2]) }
function dc(pdf: jsPDF, c: RGB) { pdf.setDrawColor(c[0], c[1], c[2]) }

// ── Page chrome ────────────────────────────────────────────────────────────────
function drawHeader(pdf: jsPDF, title: string, W: number, M: number, date: string, filterDesc: string) {
  fc(pdf, C.indigo); pdf.rect(0, 0, W, 14, 'F')
  tc(pdf, C.white)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9.5)
  pdf.text('Safety App', M, 7.5)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5)
  pdf.text('neo she | safety reporting', M, 12)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12)
  pdf.text(title, W / 2, 9, { align: 'center' })
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7)
  pdf.text(`Generated: ${date}`, W - M, 9, { align: 'right' })
  fc(pdf, C.indigo50); pdf.rect(0, 14, W, 6.5, 'F')
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(6.5); tc(pdf, C.indigo)
  const truncated = filterDesc.length > 145 ? filterDesc.slice(0, 142) + '…' : filterDesc
  pdf.text(`Filters: ${truncated}`, M, 18.5)
}

function drawFooter(pdf: jsPDF, page: number, total: number, W: number, H: number, M: number) {
  fc(pdf, C.indigo50); pdf.rect(0, H - 7, W, 7, 'F')
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6); tc(pdf, C.gray500)
  pdf.text('Safety App — Confidential | For internal distribution only', M, H - 2)
  pdf.text(`Page ${page} of ${total}`, W - M, H - 2, { align: 'right' })
}

// Returns the captured image with its original pixel dimensions for correct aspect ratio in addImage
async function captureChart(id: string): Promise<{ dataUrl: string; pw: number; ph: number } | null> {
  const el = document.getElementById(id)
  if (!el) return null
  await new Promise<void>(r => setTimeout(r, 150))
  const canvas = await html2canvas(el, {
    scale: 2.5, useCORS: true, allowTaint: true,
    backgroundColor: '#ffffff', logging: false,
  })
  return { dataUrl: canvas.toDataURL('image/png'), pw: canvas.width, ph: canvas.height }
}

// Fit image into a box (maxW × maxH) preserving aspect ratio
function fitImage(
  pdf: jsPDF, img: { dataUrl: string; pw: number; ph: number },
  x: number, y: number, maxW: number, maxH: number,
) {
  const ratio = img.ph / img.pw
  let w = maxW, h = maxW * ratio
  if (h > maxH) { h = maxH; w = maxH / ratio }
  pdf.addImage(img.dataUrl, 'PNG', x, y, w, h)
  return { w, h }
}

// ── Dashboard PDF ──────────────────────────────────────────────────────────────
export async function generateDashboardPdf(p: DashboardPdfParams) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297, H = 210, M = 12, PAGES = 2
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  // ── Page 1: KPIs + Trend chart + Status donut ─────────────────────────────
  drawHeader(pdf, 'Safety Dashboard Report', W, M, date, p.filterDesc)

  const KPI_PAL: Array<[RGB, RGB, RGB]> = [
    [[238, 240, 254], [79,  70,  229], [99,  102, 241]],
    [[254, 242, 242], [185, 28,  28],  [239, 68,  68]],
    [[255, 251, 235], [180, 83,  9],   [245, 158, 11]],
    [[245, 243, 255], [109, 40,  217], [139, 92,  246]],
    [[236, 253, 245], [6,   95,  70],  [16,  185, 129]],
  ]
  const kpiY = 23.5, kpiH = 20, kpiGap = 3
  const kpiW = (W - M * 2 - kpiGap * 4) / 5

  p.cards.forEach((card, i) => {
    const x = M + i * (kpiW + kpiGap)
    const [bg, fg, bar] = KPI_PAL[i % KPI_PAL.length]
    fc(pdf, bg); pdf.roundedRect(x, kpiY, kpiW, kpiH, 1.5, 1.5, 'F')
    fc(pdf, bar); pdf.roundedRect(x, kpiY, 2.5, kpiH, 1, 1, 'F')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); tc(pdf, fg)
    pdf.text(String(card.value), x + kpiW / 2, kpiY + 11.5, { align: 'center' })
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(100, 116, 139)
    pdf.text(card.label, x + kpiW / 2, kpiY + 17.5, { align: 'center', maxWidth: kpiW - 4 })
  })

  const chartsY = kpiY + kpiH + 6
  const chartsH = H - chartsY - 9

  // Capture all chart cards
  const [trendImg, donutImg, ageingDonutImg] = await Promise.all([
    captureChart('dash-trend-chart'),
    captureChart('dash-status-donut'),
    captureChart('dash-aging-donut'),
  ])

  const trendW = (W - M * 2) * 0.63
  const donutW = (W - M * 2) - trendW - 6
  const donutX = M + trendW + 6

  // Trend chart card — the card div already contains the legend row
  if (trendImg) {
    fitImage(pdf, trendImg, M, chartsY, trendW, chartsH)
  } else {
    fc(pdf, C.indigo50); pdf.roundedRect(M, chartsY, trendW, chartsH, 2, 2, 'F')
    tc(pdf, C.gray500); pdf.setFontSize(7)
    pdf.text('Chart not available', M + trendW / 2, chartsY + chartsH / 2, { align: 'center' })
  }

  // Status donut card — the card div already contains the legend list below the donut
  if (donutImg) {
    fitImage(pdf, donutImg, donutX, chartsY, donutW, chartsH)
  }

  drawFooter(pdf, 1, PAGES, W, H, M)

  // ── Page 2: Risk distribution + Recent observations ──────────────────────
  pdf.addPage()
  drawHeader(pdf, 'Safety Dashboard Report', W, M, date, p.filterDesc)

  const p2Y = 24
  // Risk column: badge must fit within riskColW
  // layout: label(18) | bar(barTrackW) | gap(3) | badge(BADGE_W) | pad(2) = riskColW
  const BADGE_W = 24
  const riskColW = (W - M * 2) * 0.38
  const barTrackW = riskColW - 18 - 3 - BADGE_W - 2   // fits everything within riskColW

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); tc(pdf, C.gray900)
  pdf.text('Risk Distribution', M, p2Y - 1.5)

  const totalRisk = p.riskBars.reduce((s, r) => s + r.count, 0)
  let rY = p2Y + 4
  const barH = 9

  for (const level of ['High', 'Medium', 'Low']) {
    const item = p.riskBars.find(r => r.risk_level === level)
    if (!item) continue
    const pct = totalRisk > 0 ? item.count / totalRisk : 0
    const rgb = RISK_RGB[level] || ([148, 163, 184] as RGB)

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); tc(pdf, rgb)
    pdf.text(level, M, rY + 6)
    fc(pdf, C.gray200); pdf.roundedRect(M + 18, rY, barTrackW, barH, 2, 2, 'F')
    if (pct > 0) {
      fc(pdf, rgb); pdf.roundedRect(M + 18, rY, Math.max(pct * barTrackW, 3), barH, 2, 2, 'F')
    }
    const badgeX = M + 18 + barTrackW + 3
    fc(pdf, rgb); pdf.roundedRect(badgeX, rY, BADGE_W, barH, 2, 2, 'F')
    tc(pdf, C.white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5)
    pdf.text(`${item.count} (${Math.round(pct * 100)}%)`, badgeX + BADGE_W / 2, rY + 6, { align: 'center' })
    rY += barH + 7
  }

  fc(pdf, C.indigo); pdf.roundedRect(M, rY + 2, riskColW, 8, 2, 2, 'F')
  tc(pdf, C.white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8)
  pdf.text(`Total: ${totalRisk} observations`, M + riskColW / 2, rY + 7.2, { align: 'center' })

  // Ageing Distribution — below Risk Distribution in the same left column
  const ageingY = rY + 14
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); tc(pdf, C.gray900)
  pdf.text('Ageing Distribution', M, ageingY - 1.5)
  if (ageingDonutImg) {
    const maxAgeingH = H - ageingY - 9
    fitImage(pdf, ageingDonutImg, M, ageingY, riskColW, maxAgeingH)
  } else {
    fc(pdf, C.indigo50); pdf.roundedRect(M, ageingY, riskColW, 50, 2, 2, 'F')
    tc(pdf, C.gray500); pdf.setFontSize(7)
    pdf.text('No ageing data', M + riskColW / 2, ageingY + 25, { align: 'center' })
  }

  // Recent observations table — starts safely after the risk column
  const tableX = M + riskColW + 10
  const tableW = W - tableX - M
  if (p.recent.length > 0) {
    const COLS = ['Obs. ID', 'Project', 'Core Concern', 'Risk', 'Status', 'Date']
    const COLW = [34, 42, 52, 20, 28, 20]
    const ROW_H = 7
    let tY = p2Y - 1.5

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); tc(pdf, C.gray900)
    pdf.text('Recent Observations', tableX, tY)
    tY += 4

    fc(pdf, C.indigo); pdf.roundedRect(tableX, tY, tableW, ROW_H, 2, 2, 'F')
    tc(pdf, C.white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5)
    let cx = tableX + 2.5
    COLS.forEach((col, i) => { pdf.text(col, cx, tY + 4.8); cx += COLW[i] })
    tY += ROW_H

    p.recent.forEach((obs, idx) => {
      const rowBg: RGB = idx % 2 === 0 ? [248, 249, 255] : [255, 255, 255]
      fc(pdf, rowBg); pdf.rect(tableX, tY, tableW, ROW_H, 'F')
      dc(pdf, C.gray200); pdf.line(tableX, tY + ROW_H, tableX + tableW, tY + ROW_H)
      cx = tableX + 2.5
      const row = [
        obs.observation_id || '—',
        (obs.project_name        || '—').slice(0, 20),
        (obs.core_concern_name   || '—').slice(0, 26),
        obs.risk_level || '—',
        obs.status     || '—',
        obs.obs_date ? obs.obs_date.slice(5).split('-').reverse().join('/') : '—',
      ]
      row.forEach((val, i) => {
        pdf.setFontSize(6.5)
        if (COLS[i] === 'Risk' && val !== '—') {
          const rgb = RISK_RGB[val] || C.gray700; tc(pdf, rgb); pdf.setFont('helvetica', 'bold')
        } else if (COLS[i] === 'Obs. ID') {
          tc(pdf, C.indigo); pdf.setFont('helvetica', 'bold')
        } else {
          tc(pdf, C.gray700); pdf.setFont('helvetica', 'normal')
        }
        pdf.text(String(val), cx, tY + 4.8)
        cx += COLW[i]
      })
      tY += ROW_H
    })
  }

  drawFooter(pdf, 2, PAGES, W, H, M)
  pdf.save(`dashboard-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ── SHE Score PDF ──────────────────────────────────────────────────────────────
export async function generateEasePdf(p: EasePdfParams) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297, H = 210, M = 12, PAGES = 2
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  const [projectImg, categoryImg] = await Promise.all([
    captureChart('ease-project-chart'),
    captureChart('ease-category-chart'),
  ])

  // ── Page 1: Overall KPI + Project chart ──────────────────────────────────
  drawHeader(pdf, 'SHE Score Report', W, M, date, p.filterDesc)

  // Overall score banner
  const kpiY = 22.5
  const scoreRgb = cc(p.overallScore)
  fc(pdf, scoreRgb); pdf.roundedRect(M, kpiY, W - M * 2, 16, 2, 2, 'F')
  tc(pdf, C.white)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22)
  pdf.text(p.overallScore != null ? `${p.overallScore}%` : 'N/A', W / 2, kpiY + 11, { align: 'center' })
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5)
  pdf.text('Overall SHE Score', M + 5, kpiY + 11)
  pdf.text(
    `${p.periodCount} period${p.periodCount !== 1 ? 's' : ''}  ·  ${p.projectCount > 0 ? `${p.projectCount} project${p.projectCount !== 1 ? 's' : ''}  ·  ` : ''}Grade: ${p.overallGrade}`,
    W - M - 5, kpiY + 11, { align: 'right' },
  )

  if (projectImg) {
    const chartY = kpiY + 16 + 5
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); tc(pdf, C.gray900)
    pdf.text('SHE Score by Project', M, chartY - 1.5)
    fitImage(pdf, projectImg, M, chartY, W - M * 2, H - chartY - 9)
  }

  drawFooter(pdf, 1, PAGES, W, H, M)

  // ── Page 2: Category scores ──────────────────────────────────────────────
  pdf.addPage()
  drawHeader(pdf, 'SHE Score Report', W, M, date, p.filterDesc)

  if (categoryImg) {
    const chartY = 23
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); tc(pdf, C.gray900)
    pdf.text('Category Scores (Aggregated)', M, chartY - 1.5)
    fitImage(pdf, categoryImg, M, chartY, W - M * 2, H - chartY - 9)
  }

  drawFooter(pdf, 2, PAGES, W, H, M)
  pdf.save(`she-score-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ── Summary / Compliance PDF ───────────────────────────────────────────────────
export async function generateSummaryPdf(p: SummaryPdfParams) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297, H = 210, M = 12, PAGES = 2
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  const TBL_COLS = ['#', 'Name', 'Total', 'Open', 'Closed', 'High Risk', 'Med Risk', 'Low Risk', 'Score', 'Grade']
  const TBL_W    = [8, 74, 18, 18, 18, 22, 22, 22, 22, 28]
  const ROW_H    = 7.5
  const tableW   = TBL_W.reduce((a, b) => a + b, 0)

  function drawTable(title: string, rows: any[], nameKey: string, pageNum: number) {
    drawHeader(pdf, 'Compliance Analysis Report', W, M, date, `${p.filterDesc}  |  Period: ${p.dateRange}`)

    // Summary KPI strip
    const kpiBandY = 22.5
    const kpiBandH = 14
    const totalObs  = rows.reduce((s: number, r: any) => s + (r.total || 0), 0)
    const avgScore  = rows.length > 0
      ? Math.round(rows.reduce((s: number, r: any) => s + (r.compliance_score || 0), 0) / rows.length)
      : 0
    const highTotal = rows.reduce((s: number, r: any) => s + (r.high_risk || 0), 0)

    const kpiItems = [
      { label: 'Total Observations',  val: String(totalObs),  color: C.indigo },
      { label: 'Avg Compliance Score', val: `${avgScore}%`,    color: cc(avgScore) },
      { label: 'Total High Risk',      val: String(highTotal), color: C.riskHigh },
      { label: pageNum === 1 ? 'Projects' : 'Contractors', val: String(rows.length), color: [99, 102, 241] as RGB },
    ]
    const kpiItemW = (W - M * 2) / kpiItems.length
    kpiItems.forEach((k, i) => {
      const x = M + i * kpiItemW
      fc(pdf, k.color); pdf.roundedRect(x, kpiBandY, kpiItemW - 2.5, kpiBandH, 1.5, 1.5, 'F')
      tc(pdf, C.white)
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12)
      pdf.text(k.val, x + (kpiItemW - 2.5) / 2, kpiBandY + 8, { align: 'center' })
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6)
      pdf.text(k.label, x + (kpiItemW - 2.5) / 2, kpiBandY + 12.5, { align: 'center' })
    })

    // Section title
    const secY = kpiBandY + kpiBandH + 4
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9.5); tc(pdf, C.gray900)
    pdf.text(title, M, secY)

    // Table header
    let tY = secY + 3
    fc(pdf, C.indigo); pdf.roundedRect(M, tY, tableW + 4, ROW_H, 2, 2, 'F')
    tc(pdf, C.white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7)
    let cx = M + 2.5
    TBL_COLS.forEach((col, i) => { pdf.text(col, cx, tY + 5.2); cx += TBL_W[i] })
    tY += ROW_H

    // Data rows
    rows.forEach((row: any, idx: number) => {
      if (tY + ROW_H > H - 15) return
      const score = row.compliance_score
      const grade = cg(score)
      const scoreRgb = cc(score)
      const priority = (row.total === 0)
        ? 'critical'
        : (row.high_risk > 0 ? 'warning' : 'normal')

      const rowBg: RGB =
        priority === 'critical' ? [254, 242, 242] :
        priority === 'warning'  ? [255, 251, 235] :
        idx % 2 === 0           ? [248, 249, 255] : [255, 255, 255]

      fc(pdf, rowBg); pdf.rect(M, tY, tableW + 4, ROW_H, 'F')
      dc(pdf, C.gray200); pdf.line(M, tY + ROW_H, M + tableW + 4, tY + ROW_H)

      cx = M + 2.5
      const vals = [
        String(idx + 1),
        (row[nameKey] || '—').slice(0, 38),
        String(row.total        ?? 0),
        String(row.open         ?? 0),
        String(row.closed       ?? 0),
        String(row.high_risk    ?? 0),
        String(row.medium_risk  ?? 0),
        String(row.low_risk     ?? 0),
        score != null ? `${score}%` : '—',
        grade,
      ]
      vals.forEach((val, i) => {
        pdf.setFontSize(7)
        if (TBL_COLS[i] === 'Grade') {
          fc(pdf, scoreRgb)
          pdf.roundedRect(cx, tY + 1.2, TBL_W[i] - 3, ROW_H - 2.4, 1.2, 1.2, 'F')
          tc(pdf, C.white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.8)
          pdf.text(val, cx + (TBL_W[i] - 3) / 2, tY + ROW_H / 2 + 1.8, { align: 'center' })
        } else if (TBL_COLS[i] === 'Score') {
          tc(pdf, scoreRgb); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7)
          pdf.text(val, cx, tY + 5.2)
        } else if (TBL_COLS[i] === 'Name') {
          tc(pdf, C.gray900); pdf.setFont('helvetica', 'bold')
          pdf.text(val, cx, tY + 5.2)
        } else if (TBL_COLS[i] === '#') {
          tc(pdf, C.gray500); pdf.setFont('helvetica', 'normal')
          pdf.text(val, cx, tY + 5.2)
        } else if (TBL_COLS[i] === 'High Risk') {
          const n = parseInt(val)
          tc(pdf, n > 0 ? C.riskHigh : C.gray700)
          pdf.setFont('helvetica', n > 0 ? 'bold' : 'normal')
          pdf.text(val, cx, tY + 5.2)
        } else {
          tc(pdf, C.gray700); pdf.setFont('helvetica', 'normal')
          pdf.text(val, cx, tY + 5.2)
        }
        cx += TBL_W[i]
      })
      tY += ROW_H
    })

    // Compliance scale legend
    const legY = H - 13
    fc(pdf, [245, 247, 250] as RGB); pdf.rect(M, legY, W - M * 2, 7, 'F')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6); tc(pdf, C.gray500)
    pdf.text('Compliance Scale:', M + 2, legY + 4.5)
    const GRADES: Array<{ label: string; color: RGB }> = [
      { label: 'EXCELLENT  ≥ 90%', color: [16,  185, 129] },
      { label: 'GOOD  ≥ 75%',      color: [34,  197, 94]  },
      { label: 'AVERAGE  ≥ 60%',   color: [245, 158, 11]  },
      { label: 'BELOW AVG  < 60%', color: [239, 68,  68]  },
    ]
    let legX = M + 38
    GRADES.forEach(g => {
      fc(pdf, g.color); pdf.roundedRect(legX, legY + 0.8, 32, 5.4, 1.2, 1.2, 'F')
      tc(pdf, C.white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.8)
      pdf.text(g.label, legX + 16, legY + 4.4, { align: 'center' })
      legX += 34
    })

    drawFooter(pdf, pageNum, PAGES, W, H, M)
  }

  drawTable('Project-wise Safety Compliance',    p.projectRows,    'project_name',    1)
  pdf.addPage()
  drawTable('Contractor-wise Safety Compliance', p.contractorRows, 'contractor_name', 2)

  pdf.save(`compliance-${new Date().toISOString().slice(0, 10)}.pdf`)
}
