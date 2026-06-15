import { useState, useEffect, useMemo } from 'react'
import { usePageTitle } from '../../store/pageTitleContext'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../store/authStore'
import { FileText, AlertTriangle, ZoomIn, ZoomOut, X, Download, LayoutList } from 'lucide-react'
import ExcelJS from 'exceljs'
import api from '../../lib/api'
import { MultiSelectFilter, type MSOption } from '../../components/MultiSelectFilter'

const STALE = { staleTime: 5 * 60 * 1000 } as const

function sevText(n?: number | null) {
  if (!n) return '—'
  if (n <= 2) return 'Low'
  if (n === 3) return 'Medium'
  return 'High'
}

function fmtD(s?: string | null) {
  if (!s) return ''
  try {
    const d = s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00')
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
  } catch { return s }
}

// ── SHE Tracker helpers ───────────────────────────────────────────────────
function getFYInfo(dateStr?: string | null) {
  if (!dateStr) return { fyYear: '', quarter: '', monthInQ: '' }
  try {
    const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00')
    const yr = d.getFullYear()
    const mo = d.getMonth() + 1
    const fyStart = mo >= 4 ? yr : yr - 1
    const fyYear = String(fyStart + 1).slice(-2) // "26" = FY25-26
    let quarter = '', monthInQ = 1
    if      (mo >= 4  && mo <= 6)  { quarter = 'Q-I';   monthInQ = mo - 3  }
    else if (mo >= 7  && mo <= 9)  { quarter = 'Q-II';  monthInQ = mo - 6  }
    else if (mo >= 10 && mo <= 12) { quarter = 'Q-III'; monthInQ = mo - 9  }
    else                           { quarter = 'Q-IV';  monthInQ = mo === 1 ? 1 : mo === 2 ? 2 : 3 }
    return { fyYear, quarter, monthInQ: `M${monthInQ}` }
  } catch { return { fyYear: '', quarter: '', monthInQ: '' } }
}

function getTargetDays(name?: string | null): number {
  if (!name) return 0
  const n = name.toLowerCase()
  if (n.includes('immediate') || n.includes('job starts') || n.includes('before job')) return 0
  const m = n.match(/(\d+)\s*(day|week|month)/)
  if (m) {
    const val = parseInt(m[1])
    if (m[2].startsWith('day'))   return val
    if (m[2].startsWith('week'))  return val * 7
    if (m[2].startsWith('month')) return val * 30
  }
  return 7
}

function computeTrackerStatus(obs: any): 'Overdue' | 'Due' | 'Closed' {
  if (obs.status === 'Closed') return 'Closed'
  if (!obs.obs_date) return 'Due'
  const deadline = new Date(obs.obs_date + 'T00:00:00')
  deadline.setDate(deadline.getDate() + getTargetDays(obs.target_date_name))
  return new Date() > deadline ? 'Overdue' : 'Due'
}

function computeDelay(obs: any): number {
  if (!obs.obs_date) return 0
  const deadline = new Date(obs.obs_date + 'T00:00:00')
  deadline.setDate(deadline.getDate() + getTargetDays(obs.target_date_name))
  const endDate = obs.status === 'Closed' && obs.updated_at
    ? new Date(obs.updated_at)
    : new Date()
  return Math.max(0, Math.floor((endDate.getTime() - deadline.getTime()) / 86400000))
}

function buildFRef(observations: any[]): Map<number, string> {
  const sorted = [...observations].sort((a, b) =>
    (a.obs_date || a.created_at || '').localeCompare(b.obs_date || b.created_at || '')
  )
  const fyCount = new Map<string, number>()
  const result  = new Map<number, string>()
  for (const obs of sorted) {
    const { fyYear } = getFYInfo(obs.obs_date || obs.created_at)
    const seq = (fyCount.get(fyYear) || 0) + 1
    fyCount.set(fyYear, seq)
    result.set(obs.id, `${fyYear}-${seq}`)
  }
  return result
}

async function exportTrackerExcel(
  observations: any[],
  fRef: Map<number, string>,
  projectLabel: string,
  reportDate: string,
  trackerNo: string
) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('SHE Tracker', {
    pageSetup: { orientation: 'landscape', paperSize: 5 /* A3 */, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  // Column widths matching the tracker table columns
  const colWidths = [3, 7, 5, 6, 4, 13, 9, 22, 10, 10, 10, 7, 7, 7, 8, 14, 13, 13, 9, 22, 9, 7, 8]
  ws.columns = colWidths.map(w => ({ width: w }))

  const fill  = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt   = (argb: string, bold = false, size = 8): Partial<ExcelJS.Font> =>
    ({ name: 'Arial', size, bold, color: { argb } })
  const brd: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFb0b0b0' } },
    left: { style: 'thin', color: { argb: 'FFb0b0b0' } },
    bottom: { style: 'thin', color: { argb: 'FFb0b0b0' } },
    right: { style: 'thin', color: { argb: 'FFb0b0b0' } },
  }
  const aCenter: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }

  const NCOLS = 23

  const mergedCell = (
    r: number, c1: number, c2: number,
    val: ExcelJS.CellValue,
    bgArgb: string, fontArgb: string,
    bold = false, size = 8,
    align: Partial<ExcelJS.Alignment> = aCenter
  ) => {
    if (c1 < c2) ws.mergeCells(r, c1, r, c2)
    const cell = ws.getRow(r).getCell(c1)
    cell.value = val; cell.fill = fill(bgArgb); cell.font = fnt(fontArgb, bold, size)
    cell.alignment = align; cell.border = brd
  }

  let rn = 1

  // ── Title row ──
  ws.mergeCells(rn, 1, rn, NCOLS)
  const t1 = ws.getRow(rn).getCell(1)
  t1.value = `Project: ${projectLabel}     Date: ${fmtD(reportDate)}`
  t1.fill = fill('FF1F3864'); t1.font = fnt('FFFFFFFF', true, 10)
  t1.alignment = { horizontal: 'left', vertical: 'middle' }; t1.border = brd
  ws.getRow(rn).height = 20; rn++

  ws.mergeCells(rn, 1, rn, NCOLS)
  const t2 = ws.getRow(rn).getCell(1)
  t2.value = 'SHE TRACKER'
  t2.fill = fill('FF1F3864'); t2.font = fnt('FFFFFFFF', true, 14)
  t2.alignment = aCenter; t2.border = brd
  ws.getRow(rn).height = 24; rn++

  mergedCell(rn, 1, NCOLS, `TRACKER NUMBER: ${trackerNo}`, 'FF1F3864', 'FFFFFFFF', true, 9,
    { horizontal: 'right', vertical: 'middle' })
  ws.getRow(rn).height = 16; rn++

  // ── Column headers ──
  const headers = [
    '#', 'Status', 'F', 'Quarter', 'Mo.', 'Report No.', 'Report Date',
    'Detailed Observations', 'Violation Category', 'Root Cause', 'Hazard Type',
    'Severity', 'Probability', 'Risk Rating', 'Risk Grade', 'Potential Consequence',
    'Concerned Contractor', 'Concerned EIC / PIC', 'Target Date',
    'Corrective Action Plan', 'Closure Date', 'Delay (Days)', 'Remarks',
  ]
  const hdrRow = ws.addRow(headers)
  hdrRow.height = 30
  hdrRow.eachCell(cell => {
    cell.fill = fill('FF2E75B6')
    cell.font = fnt('FFFFFFFF', true, 7)
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = brd
  })
  rn++

  // ── Data rows ──
  for (let i = 0; i < observations.length; i++) {
    const obs    = observations[i]
    const fy     = getFYInfo(obs.obs_date)
    const status = computeTrackerStatus(obs)
    const delay  = computeDelay(obs)
    const riskArgb  = obs.risk_level === 'High' ? 'FFFF0000' : obs.risk_level === 'Medium' ? 'FFFFC000' : 'FF92D050'
    const riskFontA = obs.risk_level === 'High' ? 'FFFFFFFF' : 'FF000000'
    const statusArgb = status === 'Overdue' ? 'FFC00000' : status === 'Due' ? 'FFFFC000' : 'FF375623'
    const statusFontA = status === 'Overdue' ? 'FFFFFFFF' : status === 'Due' ? 'FF000000' : 'FFFFFFFF'
    const action = obs.to_be_rectified_by
      ? `Ensure immediate rectification. Responsible party: ${obs.to_be_rectified_by}. Target: ${obs.target_date_name || '—'}.`
      : `Ensure immediate rectification. Target: ${obs.target_date_name || '—'}.`
    const closureDate = obs.status === 'Closed' && obs.updated_at ? fmtD(obs.updated_at) : ''
    const detailedObs = [obs.specific_concern_text, obs.specific_concern_name].filter(Boolean).join('\n')
    const remarks     = obs.status === 'Closed' ? 'Closed' : status === 'Overdue' ? 'Pending' : 'Open'
    const rowBg       = i % 2 === 0 ? 'FFFFFFFF' : 'FFF4F8FF'

    const values: ExcelJS.CellValue[] = [
      i + 1, status, fRef.get(obs.id) || '', fy.quarter, fy.monthInQ,
      obs.observation_id || '', fmtD(obs.obs_date), detailedObs,
      obs.core_concern_name || '', obs.root_cause_category_name || '', obs.possible_outcome || '',
      sevText(obs.severity), sevText(obs.probability),
      obs.risk_factor ?? '', obs.risk_level || '',
      obs.violation_name || obs.specific_concern_name || '',
      obs.to_be_rectified_by || obs.contractor_name || '',
      obs.observer_name || obs.created_by_name || '',
      obs.target_date_name || '', action, closureDate,
      delay, remarks,
    ]

    const dataRow = ws.addRow(values)
    dataRow.height = 40

    dataRow.eachCell((cell, colNum) => {
      cell.fill   = fill(rowBg)
      cell.font   = fnt('FF333333', false, 8)
      cell.alignment = { horizontal: 'center', vertical: 'top', wrapText: true }
      cell.border = brd

      // Status column (2)
      if (colNum === 2) {
        cell.fill = fill(statusArgb)
        cell.font = fnt(statusFontA, true, 8)
      }
      // Risk Rating (14) and Risk Grade (15)
      if (colNum === 14 || colNum === 15) {
        cell.fill = fill(riskArgb)
        cell.font = fnt(riskFontA, true, 8)
      }
      // Delay (22) colour
      if (colNum === 22 && typeof delay === 'number' && delay > 0) {
        cell.fill = fill('FFFF0000')
        cell.font = fnt('FFFFFFFF', true, 8)
      }
      // Left-align text-heavy columns
      if ([6, 8, 9, 10, 11, 17, 18, 20].includes(colNum)) {
        cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
      }
    })
    rn++
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const a      = Object.assign(document.createElement('a'), { href: url, download: `SHE_Tracker_${new Date().toISOString().slice(0, 10)}.xlsx` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Inspection Report Excel export ────────────────────────────────────────
async function imgToBase64(path: string): Promise<string> {
  try {
    const r = await fetch(`/uploads/${path}`)
    const blob = await r.blob()
    return await new Promise((res) => {
      const fr = new FileReader()
      fr.onload = () => res(fr.result as string)
      fr.onerror = () => res('')
      fr.readAsDataURL(blob)
    })
  } catch { return '' }
}

async function exportInspectionExcel(
  observations: any[],
  projectLabel: string,
  dateRange: string,
  reportDate: string,
  contractorLabel: string,
  priorityLabel: string
) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('SHE Inspection Report', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  // 14 columns matching PDF colgroup
  ws.columns = [
    { width: 4  },  // A  col1  3%   #
    { width: 18 },  // B  col2  10%  main text
    { width: 8  },  // C  col3  5%
    { width: 8  },  // D  col4  5%
    { width: 8  },  // E  col5  5%
    { width: 10 },  // F  col6  6%
    { width: 12 },  // G  col7  7%
    { width: 12 },  // H  col8  7%
    { width: 14 },  // I  col9  8%
    { width: 14 },  // J  col10 8%
    { width: 8  },  // K  col11 5%
    { width: 8  },  // L  col12 5%
    { width: 18 },  // M  col13 9%
    { width: 28 },  // N  col14 17%
  ]

  type ArgbStr = string
  const fill = (argb: ArgbStr): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const fnt  = (argb: ArgbStr, bold = false, size = 8): Partial<ExcelJS.Font> =>
    ({ name: 'Arial', size, bold, color: { argb } })
  const brd: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF555555' } },
    left: { style: 'thin', color: { argb: 'FF555555' } },
    bottom: { style: 'thin', color: { argb: 'FF555555' } },
    right: { style: 'thin', color: { argb: 'FF555555' } },
  }
  const aCenter: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }
  const aLeft:   Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'top',    wrapText: true }

  const mc = (r: number, c1: number, c2: number) => { if (c1 < c2) ws.mergeCells(r, c1, r, c2) }

  const styled = (
    r: number, c1: number, c2: number,
    val: ExcelJS.CellValue,
    bgArgb: ArgbStr, fontArgb: ArgbStr,
    bold = false, size = 8,
    align: Partial<ExcelJS.Alignment> = aCenter
  ) => {
    mc(r, c1, c2)
    const cell = ws.getRow(r).getCell(c1)
    cell.value    = val
    cell.fill     = fill(bgArgb)
    cell.font     = fnt(fontArgb, bold, size)
    cell.alignment = align
    cell.border   = brd
  }

  let rn = 1  // current row number (1-based)

  // ── Title ──
  styled(rn, 1, 14, 'Surveillance SHE Inspection Report', 'FF1C1C1C', 'FFFFFFFF', true, 11)
  ws.getRow(rn).height = 24; rn++

  // ── Meta row 1 ──
  styled(rn, 1, 2, 'Name of the Project:', 'FFF5F5F5', 'FF222222', true, 8, aLeft)
  styled(rn, 3, 7, projectLabel,           'FFF5F5F5', 'FF000000', true, 8, aLeft)
  styled(rn, 8, 9, 'Report Date:',         'FFF5F5F5', 'FF222222', true, 8, aLeft)
  styled(rn, 10, 11, fmtD(reportDate),     'FFF5F5F5', 'FF000000', false, 8, aCenter)
  styled(rn, 12, 14, 'COMPLIANCE TRACKER', 'FFFCE5CD', 'FF7F3F00', true, 9)
  ws.getRow(rn).height = 16; rn++

  // ── Meta row 2 ──
  styled(rn, 1, 2, 'Date Range:',   'FFF5F5F5', 'FF222222', true, 8, aLeft)
  styled(rn, 3, 5, dateRange,        'FFF5F5F5', 'FF000000', false, 8, aLeft)
  styled(rn, 6, 7, 'Contractor:',   'FFF5F5F5', 'FF222222', true, 8, aLeft)
  styled(rn, 8, 9, contractorLabel, 'FFF5F5F5', 'FF000000', false, 8, aLeft)
  styled(rn, 10, 10, 'Priority:',   'FFF5F5F5', 'FF222222', true, 8, aLeft)
  styled(rn, 11, 11, priorityLabel, 'FFF5F5F5', 'FF000000', false, 8, aCenter)
  styled(rn, 12, 14,
    'Compliance date auto-filled from contractor action.\nCompliance photos show contractor-uploaded evidence.',
    'FFFCE5CD', 'FF7F3F00', false, 7)
  ws.getRow(rn).height = 28; rn++

  // ── Per-observation blocks ──
  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i]

    const riskArgb   = obs.risk_level === 'High' ? 'FFFF0000' : obs.risk_level === 'Medium' ? 'FFFFC000' : 'FF92D050'
    const riskFontA  = obs.risk_level === 'High' ? 'FFFFFFFF' : 'FF000000'
    const contractorComments = (obs.comments || []).filter((c: any) => c.user_role === 'Contractor')
    const lastCC     = contractorComments[contractorComments.length - 1]
    const compDate   = lastCC?.created_at ? fmtD(lastCC.created_at) : null
    const xlClosingComment = obs.status === 'Closed'
      ? [...(obs.comments || [])]
          .filter((c: any) => c.comment && /Status changed to "Closed"/i.test(c.comment))
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      : null
    const xlClosedByLabel = xlClosingComment?.user_name
      ? `${xlClosingComment.user_name}${xlClosingComment.user_role ? ` (${xlClosingComment.user_role})` : ''}`
      : null
    const xlClosedDate = xlClosingComment?.created_at
      ? fmtD(xlClosingComment.created_at)
      : (obs.status === 'Closed' && obs.updated_at ? fmtD(obs.updated_at) : '')
    const action     = obs.to_be_rectified_by
      ? `Ensure immediate rectification of the identified hazard. Responsible party: ${obs.to_be_rectified_by}. Target completion: ${obs.target_date_name || 'As directed by EIC'}.`
      : `Ensure immediate rectification of the identified hazard. Target completion: ${obs.target_date_name || 'As directed'}.`

    // Fetch images
    const allImgs: any[] = obs.images || []
    const initImg  = allImgs.find((img: any) => img.image_type === 'initial')
    const compImg  = allImgs.find((img: any) => img.image_type !== 'initial')
    const initB64  = initImg ? await imgToBase64(initImg.file_path) : ''
    const compB64  = compImg ? await imgToBase64(compImg.file_path) : ''

    // ── Row A: Violation meta (she-vrow) ──
    styled(rn, 1, 2,  'Violation Category',              'FFE2EFDA', 'FF375623', true,  7, aLeft)
    styled(rn, 3, 5,  obs.core_concern_name || '—',      'FFE2EFDA', 'FF1A3A0A', false, 7, aLeft)
    styled(rn, 6, 7,  'Root Cause',                      'FFE2EFDA', 'FF375623', true,  7, aLeft)
    styled(rn, 8, 9,  obs.root_cause_category_name || '—','FFE2EFDA','FF1A3A0A', false, 7, aLeft)
    styled(rn, 10, 11,'Looking the Other Way',           'FFE2EFDA', 'FF375623', true,  7, aLeft)
    styled(rn, 12, 14, obs.violation_name || '—',        'FFE2EFDA', 'FF1A3A0A', false, 7, aLeft)
    ws.getRow(rn).height = 14; rn++

    // ── Row B: Section headers ──
    styled(rn, 1, 5,  'Detailed Observations / Findings', 'FF2E75B6', 'FFFFFFFF', true, 8)
    styled(rn, 6, 8,  'Pictorial Evidence',               'FF8EA9C1', 'FFFFFFFF', true, 8)
    styled(rn, 9, 12, 'Corrective Action Plan',           'FF538135', 'FFFFFFFF', true, 8)
    styled(rn, 13, 14,'Compliance Tracker',               'FFBF8F00', 'FFFFFFFF', true, 8)
    ws.getRow(rn).height = 14; rn++

    // ── Row C: Sub-column headers ──
    styled(rn, 1, 1,  '#',                          'FFBDD7EE', 'FF1E3F60', true, 7)
    styled(rn, 2, 2,  'Hazard Type',                'FFBDD7EE', 'FF1E3F60', true, 7)
    styled(rn, 3, 3,  'Severity',                   'FFBDD7EE', 'FF1E3F60', true, 7)
    styled(rn, 4, 4,  'Probability',                'FFBDD7EE', 'FF1E3F60', true, 7)
    styled(rn, 5, 5,  'Risk Rating',                'FFBDD7EE', 'FF1E3F60', true, 7)
    styled(rn, 6, 8,  'Risk Grade | Potential Consequence', 'FFBDD7EE', 'FF1E3F60', true, 7)
    styled(rn, 9, 9,  'Concerned Contractor',       'FFC6EFCE', 'FF375623', true, 7)
    styled(rn, 10, 10,'Concerned EIC/PIC',          'FFC6EFCE', 'FF375623', true, 7)
    styled(rn, 11, 12,'Recommended Target Date',    'FFC6EFCE', 'FF375623', true, 7)
    styled(rn, 13, 13,'Date of Compliance',         'FFFFF2CC', 'FF7F3F00', true, 7)
    styled(rn, 14, 14,'Compliance Evidence',        'FFFFF2CC', 'FF7F3F00', true, 7)
    ws.getRow(rn).height = 24; rn++

    // ── Row D: Values row (she-vrow2) — yellow background ──
    styled(rn, 1, 1,  String(i + 1),                                    'FFFFFF00', 'FF000000', true, 8)
    styled(rn, 2, 2,  obs.core_concern_name || '—',                     'FFFFFF00', 'FF000000', true, 8)
    styled(rn, 3, 3,  sevText(obs.severity),                            riskArgb,   riskFontA,  true, 8)
    styled(rn, 4, 4,  sevText(obs.probability),                         riskArgb,   riskFontA,  true, 8)
    styled(rn, 5, 5,  String(obs.risk_factor ?? '—'),                   riskArgb,   riskFontA,  true, 8)
    styled(rn, 6, 8,  `${obs.risk_level || '—'} | ${obs.possible_outcome || '—'}`, riskArgb, riskFontA, true, 8)
    styled(rn, 9, 9,  obs.contractor_name || '—',                       'FFFFFF00', 'FF000000', true, 8)
    styled(rn, 10, 10, obs.observer_name || obs.created_by_name || '—', 'FFFFFF00', 'FF000000', true, 8)
    styled(rn, 11, 12, obs.target_date_name || '—',                     'FFFFFF00', 'FF000000', true, 8)
    styled(rn, 13, 13, compDate || xlClosedDate || '—',    (compDate || xlClosedDate) ? 'FFC6EFCE' : 'FFFFFF00', 'FF000000', true, 8)
    styled(rn, 14, 14, obs.status || '—',                               'FFFFFF00', 'FF000000', true, 8)
    ws.getRow(rn).height = 14; rn++

    // ── Row E: Content row (she-crow) — tall, with images ──
    const contentRn = rn
    ws.getRow(contentRn).height = 120

    // Finding text A:E
    mc(contentRn, 1, 5)
    const findCell = ws.getRow(contentRn).getCell(1)
    const findingText = [obs.specific_concern_text, obs.specific_concern_name].filter(Boolean).join('\n')
    findCell.value = findingText || '—'
    findCell.font  = fnt('FF111111', false, 9)
    findCell.alignment = aLeft
    findCell.border    = brd

    // Pictorial evidence F:H (image placed here)
    mc(contentRn, 6, 8)
    const picCell = ws.getRow(contentRn).getCell(6)
    picCell.value     = initB64 ? '' : 'No photos uploaded'
    picCell.font      = fnt('FFaaaaaa', false, 8)
    picCell.alignment = aCenter
    picCell.border    = brd

    // Action text I:L
    mc(contentRn, 9, 12)
    const actCell = ws.getRow(contentRn).getCell(9)
    actCell.value     = action
    actCell.font      = fnt('FF111111', false, 9)
    actCell.alignment = aLeft
    actCell.border    = brd

    // Compliance info M
    const compInfoCell = ws.getRow(contentRn).getCell(13)
    const compInfoLines: string[] = []
    if (compDate) compInfoLines.push(`✓ Contractor closed:\n${compDate}`)
    if (xlClosedDate) compInfoLines.push(`Obs closed by ${xlClosedByLabel ?? 'EIC'}:\n${xlClosedDate}`)
    compInfoCell.value     = compInfoLines.length ? compInfoLines.join('\n') : 'Pending'
    compInfoCell.fill      = fill('FFFFFFF0')
    compInfoCell.font      = fnt(compInfoLines.length ? 'FF375623' : 'FFaaaaaa', !!compInfoLines.length, 8)
    compInfoCell.alignment = aLeft
    compInfoCell.border    = brd

    // Compliance evidence N (image placed here)
    const compEvCell = ws.getRow(contentRn).getCell(14)
    compEvCell.value     = compB64 ? '' : (obs.status === 'Closed' ? 'No contractor photos' : 'Awaiting compliance photo')
    compEvCell.fill      = fill('FFFFFFF0')
    compEvCell.font      = fnt('FFaaaaaa', false, 8)
    compEvCell.alignment = aCenter
    compEvCell.border    = brd

    // Embed pictorial image (cols F-H = 5-7 in 0-based)
    if (initB64) {
      const ext = initB64.startsWith('data:image/png') ? 'png' : 'jpeg'
      try {
        const imgId = wb.addImage({ base64: initB64.split(',')[1], extension: ext })
        ws.addImage(imgId, { tl: { col: 5, row: contentRn - 1 } as any, br: { col: 8, row: contentRn } as any, editAs: 'oneCell' })
      } catch { /* skip broken image */ }
    }

    // Embed compliance image (col N = 13 in 0-based)
    if (compB64) {
      const ext = compB64.startsWith('data:image/png') ? 'png' : 'jpeg'
      try {
        const imgId = wb.addImage({ base64: compB64.split(',')[1], extension: ext })
        ws.addImage(imgId, { tl: { col: 13, row: contentRn - 1 } as any, br: { col: 14, row: contentRn } as any, editAs: 'oneCell' })
      } catch { /* skip broken image */ }
    }
    rn++

    // ── Row F: Separator ──
    mc(rn, 1, 14)
    const sepCell = ws.getRow(rn).getCell(1)
    sepCell.fill   = fill('FF1C1C1C')
    sepCell.border = brd
    ws.getRow(rn).height = 4; rn++
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const a      = Object.assign(document.createElement('a'), { href: url, download: `SHE_Inspection_${new Date().toISOString().slice(0, 10)}.xlsx` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Lightbox with zoom ────────────────────────────────────────────────────
function LightboxZoom({ src, label, onClose }: { src: string; label?: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(0) // 0=fit, 1,2,3

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '=' || e.key === '+') setZoom(z => Math.min(3, z + 1))
      if (e.key === '-') setZoom(z => Math.max(0, z - 1))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const widths = ['80vw', '130vw', '200vw', '300vw']
  const maxH   = zoom === 0 ? '80vh' : 'none'

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center" onClick={onClose}>
      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button onClick={e => { e.stopPropagation(); setZoom(z => Math.max(0, z - 1)) }}
          disabled={zoom === 0}
          className="text-white bg-white/20 hover:bg-white/30 rounded-full p-2 transition disabled:opacity-30">
          <ZoomOut className="w-5 h-5" />
        </button>
        <span className="text-white/70 text-xs font-mono w-14 text-center">{[100, 160, 250, 375][zoom]}%</span>
        <button onClick={e => { e.stopPropagation(); setZoom(z => Math.min(3, z + 1)) }}
          disabled={zoom === 3}
          className="text-white bg-white/20 hover:bg-white/30 rounded-full p-2 transition disabled:opacity-30">
          <ZoomIn className="w-5 h-5" />
        </button>
        <button onClick={onClose} className="text-white bg-white/20 hover:bg-white/30 rounded-full p-2 transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image */}
      <div
        className="overflow-auto rounded-xl cursor-default"
        style={{ maxWidth: '95vw', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <img
          src={src} alt=""
          style={{ width: widths[zoom], maxHeight: maxH, height: 'auto', display: 'block', objectFit: 'contain' }}
        />
      </div>

      {/* Label + hint */}
      <div className="absolute bottom-4 flex flex-col items-center gap-1">
        {label && <span className="text-white/70 text-xs capitalize">{label}</span>}
        <span className="text-white/40 text-[11px]">Click outside or Esc to close · +/− keys to zoom</span>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────
const STYLE = `
/* ── Screen hide/show ── */
.she-print-only { display: none !important; }

/* ── Print mode ── */
@page { size: A4 landscape; margin: 5mm; }

@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  body * { visibility: hidden !important; }
  #she-report-root, #she-report-root * { visibility: visible !important; }
  #she-report-root { position: absolute; top: 0; left: 0; width: 100%; padding: 5mm; background: #fff; }
  #she-report-root .she-table { width: 100% !important; min-width: unset !important; table-layout: fixed !important; }
  .no-print { display: none !important; }
  .she-print-only { display: block !important; }
  .she-print-grid { display: grid !important; }
  .she-carousel { display: none !important; }
  .she-table { page-break-inside: auto; font-size: 7pt !important; }
  .she-crow { break-inside: avoid; page-break-inside: avoid; }
  .she-vrow { break-inside: avoid; page-break-inside: avoid; }
  .she-vrow2 { break-inside: avoid; page-break-inside: avoid; }
}

/* ── Table base ── */
.she-table {
  width: 100%;
  border-collapse: collapse;
  font-family: Arial, sans-serif;
  font-size: 7.5pt;
  table-layout: fixed;
}
.she-table td {
  border: 1px solid #555;
  padding: 3px 5px;
  vertical-align: top;
  overflow-wrap: break-word;
  word-break: break-word;
}

/* ── Document header ── */
.she-hdr-main {
  background: #1c1c1c;
  color: #fff;
  text-align: center;
  font-weight: 900;
  font-size: 11pt;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  padding: 7px 5px;
}
.she-hdr-compliance {
  background: #fce5cd;
  text-align: center;
  font-weight: 800;
  font-size: 7.5pt;
  color: #7f3f00;
  padding: 6px 4px;
  vertical-align: middle;
}

/* ── Meta rows ── */
.she-meta td { background: #f5f5f5; font-size: 7.5pt; padding: 3px 5px; }
.she-meta .k { font-weight: 800; color: #222; }
.she-meta .v { color: #000; }

/* ── Violation row ── */
.she-vrow td { background: #e2efda; font-size: 7.5pt; padding: 3px 5px; border-top: 2.5px solid #548235; }
.she-vrow .lbl { font-weight: 800; color: #375623; font-size: 7pt; }
.she-vrow .val { color: #1a3a0a; }

/* ── Section header ── */
.she-shdr {
  font-weight: 800;
  text-transform: uppercase;
  text-align: center;
  font-size: 7.5pt;
  letter-spacing: 0.4px;
  padding: 4px 3px;
}
.she-s-findings { background: #2e75b6; color: #fff; }
.she-s-evidence { background: #8ea9c1; color: #fff; }
.she-s-action   { background: #538135; color: #fff; }
.she-s-tracker  { background: #bf8f00; color: #fff; }

/* ── Sub-column header ── */
.she-chdr { font-weight: 700; text-align: center; font-size: 6.5pt; padding: 3px 2px; line-height: 1.3; }
.she-chdr-f { background: #bdd7ee; color: #1e3f60; }
.she-chdr-a { background: #c6efce; color: #375623; }
.she-chdr-t { background: #fff2cc; color: #7f3f00; }

/* ── Values row ── */
.she-vrow2 td { font-weight: 700; font-size: 7.5pt; background: #ffff00; text-align: center; padding: 3px 2px; }
.she-risk-h  { background: #ff0000 !important; color: #fff !important; }
.she-risk-m  { background: #ffc000 !important; color: #000 !important; }
.she-risk-l  { background: #92d050 !important; color: #000 !important; }

/* ── Content row ── */
.she-crow td { vertical-align: top; padding: 6px 6px; }
.she-finding { font-size: 8.5pt; line-height: 1.45; color: #111; }
.she-finding-bold { font-weight: 800; font-style: italic; font-size: 9pt; color: #1a1a1a; margin-top: 5px; }
.she-action  { font-size: 8.5pt; line-height: 1.5; color: #111; }
.she-compl   { background: #fffff0 !important; vertical-align: top; padding: 6px !important; }
.she-compl-date { font-size: 7.5pt; font-weight: 700; color: #375623; margin-bottom: 3px; }
.she-compl-date-closed { font-size: 6.5pt; color: #7f3f00; margin-top: 2px; }

/* ── Image cell ── */
.she-img-cell { text-align: center; vertical-align: middle; padding: 5px !important; }

/* ── Screen carousel ── */
.she-carousel { cursor: pointer; }
.she-carousel img {
  max-width: 100%;
  max-height: 200px;
  border: 2.5px solid #c53030;
  border-radius: 3px;
  display: block;
  margin: 0 auto;
  object-fit: contain;
  cursor: zoom-in;
  transition: opacity 0.15s;
}
.she-carousel img:hover { opacity: 0.85; }
.she-carousel-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 6px;
}
.she-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  background: #eef2ff;
  border: 1.5px solid #6366f1;
  border-radius: 4px;
  cursor: pointer;
  color: #4338ca;
  font-weight: 700;
  font-size: 13pt;
  line-height: 1;
  padding: 0;
  user-select: none;
}
.she-nav-btn:disabled { opacity: 0.3; cursor: default; }
.she-carousel-counter { font-size: 7.5pt; color: #555; font-weight: 600; min-width: 36px; text-align: center; }
.she-img-type { font-size: 6.5pt; color: #777; text-transform: capitalize; margin-top: 3px; }
.she-zoom-hint { font-size: 6pt; color: #aaa; margin-top: 2px; }

/* ── Print image grid (hidden on screen) ── */
.she-print-grid {
  display: none;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.she-print-grid.single { grid-template-columns: 1fr; }
.she-print-grid img {
  width: 100%;
  max-height: 130px;
  object-fit: cover;
  border: 1.5px solid #c53030;
  border-radius: 2px;
  display: block;
}
.she-print-img-lbl {
  font-size: 6pt;
  color: #555;
  text-align: center;
  margin-top: 2px;
  text-transform: capitalize;
}

/* ── Compliance image (screen) ── */
.she-comp-img {
  max-width: 100%;
  max-height: 130px;
  object-fit: contain;
  border: 2px solid #538135;
  border-radius: 3px;
  display: block;
  margin: 0 auto;
  cursor: zoom-in;
}
.she-comp-img:hover { opacity: 0.85; }

/* ── Placeholder ── */
.she-placeholder {
  min-height: 80px;
  border: 2px dashed #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #aaa;
  font-size: 7pt;
  border-radius: 3px;
}

/* ── Separator ── */
.she-sep td { height: 8px; background: #1c1c1c; padding: 0; border: none; }

/* ── Screen-only scrollable finding text (prevents single-cell row bloat) ── */
@media screen {
  .she-finding-scroll { max-height: 190px; overflow-y: auto; padding-right: 3px; }
}

/* ── View details link (screen only — hidden in PDF via .no-print) ── */
.she-view-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 6.5pt;
  color: #4338ca;
  text-decoration: underline;
  font-weight: 600;
  cursor: pointer;
  margin-top: 7px;
  padding: 2px 0;
}
.she-view-link:hover { color: #3730a3; }

/* ── Compact compliance column ── */
.she-compl-inner { display: flex; flex-direction: column; gap: 4px; }
`

// ── Observation block ──────────────────────────────────────────────────────
function ObsBlock({ obs, idx }: { obs: any; idx: number }) {
  const [imgIdx, setImgIdx] = useState(0)
  const [compImgIdx, setCompImgIdx] = useState(0)
  const [lightbox, setLightbox] = useState<{ src: string; label?: string } | null>(null)

  const allImgs: any[] = obs.images || []

  // Pictorial Evidence = initial observation photos; Compliance Tracker = closure/rectification photos
  const findingImgs    = allImgs.filter((i: any) => i.image_type === 'initial')
  const complianceImgs = allImgs.filter((i: any) => i.image_type !== 'initial')

  const nF = findingImgs.length
  const nC = complianceImgs.length
  const safeF = Math.min(imgIdx, Math.max(0, nF - 1))
  const safeC = Math.min(compImgIdx, Math.max(0, nC - 1))
  const curF = findingImgs[safeF]
  const curC = complianceImgs[safeC]

  // Compliance date: last comment from Contractor role
  const contractorComments = (obs.comments || []).filter((c: any) => c.user_role === 'Contractor')
  const lastContractorComment = contractorComments.length
    ? contractorComments[contractorComments.length - 1]
    : null
  const complianceDate = lastContractorComment?.created_at
    ? fmtD(lastContractorComment.created_at)
    : null

  // Obs closed date: updated_at when status is Closed
  const obsClosedDate = obs.status === 'Closed' && obs.updated_at ? fmtD(obs.updated_at) : null

  // Who closed the observation — look for a status-change comment
  const closingComment = obs.status === 'Closed'
    ? [...(obs.comments || [])]
        .filter((c: any) => c.comment && /Status changed to "Closed"/i.test(c.comment))
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : null
  const closedByLabel = closingComment?.user_name
    ? `${closingComment.user_name}${closingComment.user_role ? ` (${closingComment.user_role})` : ''}`
    : null
  const closedByDate = closingComment?.created_at ? fmtD(closingComment.created_at) : obsClosedDate

  const riskCls = obs.risk_level === 'High' ? 'she-risk-h' : obs.risk_level === 'Medium' ? 'she-risk-m' : obs.risk_level ? 'she-risk-l' : ''

  const finding     = obs.specific_concern_text || ''
  const findingBold = obs.specific_concern_name  || ''
  const action = obs.to_be_rectified_by
    ? `Ensure immediate rectification of the identified hazard. Responsible party: ${obs.to_be_rectified_by}. Target completion: ${obs.target_date_name || 'As directed by EIC'}.`
    : `Ensure immediate rectification of the identified hazard. Target completion: ${obs.target_date_name || 'As directed'}.`

  return (
    <>
      {lightbox && (
        <LightboxZoom src={lightbox.src} label={lightbox.label} onClose={() => setLightbox(null)} />
      )}

      {/* Violation meta row */}
      <tr className="she-vrow">
        <td colSpan={2}><span className="lbl">Violation Category</span></td>
        <td colSpan={3}><span className="val">{obs.core_concern_name || '—'}</span></td>
        <td colSpan={2}><span className="lbl">Root Cause</span></td>
        <td colSpan={2}><span className="val">{obs.root_cause_category_name || '—'}</span></td>
        <td colSpan={2}><span className="lbl">Looking the Other Way</span></td>
        <td colSpan={3}><span className="val">{obs.violation_name || '—'}</span></td>
      </tr>

      {/* Section headers */}
      <tr>
        <td colSpan={5} className="she-shdr she-s-findings">Detailed Observations / Findings</td>
        <td colSpan={3} className="she-shdr she-s-evidence">Pictorial Evidence</td>
        <td colSpan={4} className="she-shdr she-s-action">Corrective Action Plan</td>
        <td colSpan={2} className="she-shdr she-s-tracker">Compliance Tracker</td>
      </tr>

      {/* Sub-column headers */}
      <tr>
        <td className="she-chdr she-chdr-f">#</td>
        <td className="she-chdr she-chdr-f">Hazard Type</td>
        <td className="she-chdr she-chdr-f">Severity</td>
        <td className="she-chdr she-chdr-f">Probability</td>
        <td className="she-chdr she-chdr-f">Risk Rating</td>
        <td className="she-chdr she-chdr-f" colSpan={3}>Risk Grade | Potential Consequence</td>
        <td className="she-chdr she-chdr-a">Concerned Contractor</td>
        <td className="she-chdr she-chdr-a">Concerned EIC/PIC</td>
        <td className="she-chdr she-chdr-a" colSpan={2}>Recommended Target Date</td>
        <td className="she-chdr she-chdr-t">Date of Compliance</td>
        <td className="she-chdr she-chdr-t">Compliance Evidence</td>
      </tr>

      {/* Values row */}
      <tr className="she-vrow2">
        <td>{idx}</td>
        <td>{obs.core_concern_name || '—'}</td>
        <td>{sevText(obs.severity)}</td>
        <td>{sevText(obs.probability)}</td>
        <td className={riskCls}>{obs.risk_factor ?? '—'}</td>
        <td className={riskCls} colSpan={3}>{obs.risk_level || '—'} | {obs.possible_outcome || '—'}</td>
        <td>{obs.contractor_name || '—'}</td>
        <td>{obs.observer_name || obs.created_by_name || '—'}</td>
        <td colSpan={2}>{obs.target_date_name || '—'}</td>
        <td style={{ background: complianceDate ? '#c6efce' : '#ffff00', color: '#000' }}>
          {complianceDate || (obs.status === 'Closed' ? obsClosedDate || '—' : '—')}
        </td>
        <td>{obs.status || '—'}</td>
      </tr>

      {/* Content row */}
      <tr className="she-crow">
        {/* Finding text */}
        <td colSpan={5} className="she-finding" style={{ minHeight: 100 }}>
          <div className="she-finding-scroll">
            {finding && <p style={{ margin: '0 0 4px 0' }}>{finding}</p>}
            {findingBold && <p className="she-finding-bold" style={{ margin: '4px 0 0 0' }}>{findingBold}</p>}
            {!finding && !findingBold && <p style={{ color: '#999', margin: 0 }}>—</p>}
          </div>
          <div className="no-print">
            <Link to={`/observations/${obs.id}`} className="she-view-link" target="_blank" rel="noopener noreferrer">
              View details / conversation ↗
            </Link>
          </div>
        </td>

        {/* Observation/initial images (non-contractor) */}
        <td colSpan={3} className="she-img-cell">
          {nF === 0 ? (
            <div className="she-placeholder">No photos uploaded</div>
          ) : (
            <>
              {/* Screen: carousel */}
              <div className="she-carousel">
                <img
                  src={`/uploads/${curF.file_path}`}
                  alt="Evidence"
                  onClick={() => setLightbox({ src: `/uploads/${curF.file_path}`, label: curF.image_type })}
                  title="Click to zoom"
                />
                <p className="she-img-type">{curF.image_type}</p>
                <p className="she-zoom-hint">Click image to zoom</p>
                {nF > 1 && (
                  <div className="she-carousel-nav">
                    <button className="she-nav-btn" onClick={() => setImgIdx(i => Math.max(0, i - 1))} disabled={safeF === 0}>‹</button>
                    <span className="she-carousel-counter">{safeF + 1} / {nF}</span>
                    <button className="she-nav-btn" onClick={() => setImgIdx(i => Math.min(nF - 1, i + 1))} disabled={safeF === nF - 1}>›</button>
                  </div>
                )}
              </div>
              {/* Print: all in grid */}
              <div className={`she-print-grid${nF === 1 ? ' single' : ''}`}>
                {findingImgs.map((img: any) => (
                  <div key={img.id}>
                    <img src={`/uploads/${img.file_path}`} alt="" />
                    <p className="she-print-img-lbl">{img.image_type}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </td>

        {/* Corrective action */}
        <td colSpan={4} className="she-action">{action}</td>

        {/* Compliance date + info */}
        <td className="she-compl">
          <div className="she-compl-inner">
            {complianceDate && (
              <div className="she-compl-date">✓ Contractor closed:<br />{complianceDate}</div>
            )}
            {closedByDate && (
              <div className="she-compl-date-closed">
                Obs closed by {closedByLabel ?? 'EIC'}:<br />{closedByDate}
              </div>
            )}
            {!complianceDate && !closedByDate && (
              <div style={{ color: '#aaa', fontSize: '7pt', fontStyle: 'italic' }}>Pending</div>
            )}
          </div>
        </td>

        {/* Compliance evidence — contractor-uploaded images */}
        <td className="she-compl she-img-cell">
          {nC === 0 ? (
            <div className="she-placeholder" style={{ minHeight: 80 }}>
              {obs.status === 'Closed' ? 'No contractor photos' : 'Awaiting compliance photo'}
            </div>
          ) : (
            <>
              {/* Screen: carousel */}
              <div className="she-carousel">
                <img
                  src={`/uploads/${curC.file_path}`}
                  alt="Compliance"
                  className="she-comp-img"
                  onClick={() => setLightbox({ src: `/uploads/${curC.file_path}`, label: `Compliance — ${curC.image_type}` })}
                  title="Click to zoom"
                />
                <p className="she-img-type">{curC.image_type}</p>
                <p className="she-zoom-hint">Click to zoom</p>
                {nC > 1 && (
                  <div className="she-carousel-nav">
                    <button className="she-nav-btn" onClick={() => setCompImgIdx(i => Math.max(0, i - 1))} disabled={safeC === 0}>‹</button>
                    <span className="she-carousel-counter">{safeC + 1} / {nC}</span>
                    <button className="she-nav-btn" onClick={() => setCompImgIdx(i => Math.min(nC - 1, i + 1))} disabled={safeC === nC - 1}>›</button>
                  </div>
                )}
              </div>
              {/* Print: all in grid */}
              <div className={`she-print-grid${nC === 1 ? ' single' : ''}`}>
                {complianceImgs.map((img: any) => (
                  <div key={img.id}>
                    <img src={`/uploads/${img.file_path}`} alt="" />
                    <p className="she-print-img-lbl">{img.image_type}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </td>
      </tr>

      {/* Row separator */}
      <tr className="she-sep"><td colSpan={14}></td></tr>
    </>
  )
}

// ── SHE Tracker print styles ──────────────────────────────────────────────
const TRACKER_STYLE = `
@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  body * { visibility: hidden !important; }
  #tracker-print-root, #tracker-print-root * { visibility: visible !important; }
  #tracker-print-root { position: absolute; top: 0; left: 0; width: 100%; padding: 5mm; background: #fff; }
  .trk-no-print { display: none !important; }
  .trk-table { min-width: unset !important; width: 100% !important; table-layout: fixed !important; font-size: 6.5pt !important; }
  .trk-table th, .trk-table td { padding: 2px 3px !important; font-size: 6.5pt !important; }
  .trk-hdr-col { white-space: normal !important; font-size: 6pt !important; }
  @page { size: A3 landscape; margin: 5mm; }
}
.trk-table { width:100%; border-collapse:collapse; font-family:Arial,sans-serif; font-size:7.5pt; table-layout:auto; }
.trk-table th, .trk-table td { border:1px solid #b0b0b0; padding:3px 5px; vertical-align:top; overflow-wrap:break-word; word-break:break-word; }
.trk-hdr-top { background:#1f3864; color:#fff; font-weight:900; font-size:10pt; padding:6px 8px; }
.trk-hdr-col { background:#2e75b6; color:#fff; font-weight:700; font-size:7pt; text-align:center; padding:4px 3px; white-space:nowrap; }
.trk-status-overdue { background:#c00000 !important; color:#fff !important; font-weight:700; text-align:center; }
.trk-status-due      { background:#ffc000 !important; color:#000 !important; font-weight:700; text-align:center; }
.trk-status-closed   { background:#375623 !important; color:#fff !important; font-weight:700; text-align:center; }
.trk-risk-h { background:#ff0000 !important; color:#fff !important; font-weight:700; text-align:center; }
.trk-risk-m { background:#ffc000 !important; color:#000 !important; font-weight:700; text-align:center; }
.trk-risk-l { background:#92d050 !important; color:#000 !important; font-weight:700; text-align:center; }
.trk-obs-text { font-size:7.5pt; line-height:1.4; }
.trk-obs-bold { font-weight:800; font-style:italic; font-size:8pt; display:block; margin-top:3px; }
.trk-row-even { background:#ffffff; }
.trk-row-odd  { background:#f4f8ff; }
.trk-center { text-align:center; }
.trk-num { text-align:center; font-weight:700; }
`

// ── SHE Tracker table component ───────────────────────────────────────────
function SHETrackerTab({
  observations, projectLabel, contractorLabel, priorityLabel, dateRange, reportDate, trackerNo,
}: {
  observations: any[]; projectLabel: string; contractorLabel: string; priorityLabel: string
  dateRange: string; reportDate: string; trackerNo: string
}) {
  const fRef = buildFRef(observations)

  const cols = [
    { label: '#',                     w: '1.5%' },
    { label: 'Status',                w: '4.5%' },
    { label: 'F',                     w: '3%'   },
    { label: 'Quarter',               w: '3.5%' },
    { label: 'Mo.',                   w: '2%'   },
    { label: 'Report No.',            w: '7%'   },
    { label: 'Report Date',           w: '4%'   },
    { label: 'Detailed Observations', w: '11%'  },
    { label: 'Violation Category',    w: '4.5%' },
    { label: 'Root Cause',            w: '4.5%' },
    { label: 'Hazard Type',           w: '4%'   },
    { label: 'Severity',              w: '2.5%' },
    { label: 'Probability',           w: '2.5%' },
    { label: 'Risk Rating',           w: '2.5%' },
    { label: 'Risk Grade',            w: '3.5%' },
    { label: 'Potential Consequence', w: '5.5%' },
    { label: 'Concerned Contractor',  w: '5%'   },
    { label: 'Concerned EIC / PIC',   w: '5%'   },
    { label: 'Target Date',           w: '4%'   },
    { label: 'Corrective Action Plan',w: '10%'  },
    { label: 'Closure Date',          w: '4%'   },
    { label: 'Delay (Days)',          w: '2.5%' },
    { label: 'Remarks',               w: '3.5%' },
  ]

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: TRACKER_STYLE }} />

      {/* ── Action bar (no-print) ── */}
      <div className="trk-no-print flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <p className="text-sm font-semibold text-gray-700">
            {observations.length} observation{observations.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
            <span className="text-red-600 font-bold">{observations.filter(o => computeTrackerStatus(o) === 'Overdue').length} overdue</span>
            &nbsp;·&nbsp;
            <span className="text-emerald-600 font-bold">{observations.filter(o => computeTrackerStatus(o) === 'Closed').length} closed</span>
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Tracker No: <span className="font-mono font-semibold">{trackerNo}</span></p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { exportTrackerExcel(observations, fRef, projectLabel, reportDate, trackerNo) }}
            className="btn-secondary btn-sm"
          >
            <Download className="w-4 h-4" /> Download Excel
          </button>
          <button onClick={() => window.print()} className="btn-primary btn-sm">
            <Download className="w-4 h-4" /> Download PDF
          </button>
        </div>
      </div>

      {/* ── Tracker table ── */}
      <div id="tracker-print-root" style={{ overflowX: 'auto' }}>
        <table className="trk-table" style={{ minWidth: 1600 }}>
          <colgroup>
            {cols.map((c, i) => <col key={i} style={{ width: c.w }} />)}
          </colgroup>
          <thead>
            {/* Title row */}
            <tr>
              <td colSpan={7} className="trk-hdr-top">
                Project: {projectLabel} &nbsp;|&nbsp; Date: {fmtD(reportDate)} &nbsp;|&nbsp; Period: {dateRange}
              </td>
              <td colSpan={9} className="trk-hdr-top" style={{ textAlign: 'center', letterSpacing: 2, fontSize: '13pt' }}>
                SHE TRACKER
              </td>
              <td colSpan={7} className="trk-hdr-top" style={{ textAlign: 'right' }}>
                TRACKER NUMBER: {trackerNo}
              </td>
            </tr>
            {/* Filter row */}
            <tr>
              <td colSpan={7} style={{ background: '#e9ecef', fontSize: '7pt', padding: '3px 6px', borderTop: '2px solid #1f3864' }}>
                Contractor: {contractorLabel} &nbsp;|&nbsp; Priority: {priorityLabel}
              </td>
              <td colSpan={16} style={{ background: '#e9ecef', fontSize: '7pt', padding: '3px 6px', borderTop: '2px solid #1f3864' }} />
            </tr>
            {/* Column headers */}
            <tr>
              {cols.map((c, i) => <th key={i} className="trk-hdr-col">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {observations.map((obs, idx) => {
              const fy     = getFYInfo(obs.obs_date)
              const status = computeTrackerStatus(obs)
              const delay  = computeDelay(obs)
              const riskCls = obs.risk_level === 'High' ? 'trk-risk-h'
                : obs.risk_level === 'Medium' ? 'trk-risk-m'
                : obs.risk_level ? 'trk-risk-l' : ''
              const statusCls = status === 'Overdue' ? 'trk-status-overdue'
                : status === 'Due' ? 'trk-status-due' : 'trk-status-closed'
              const rowCls = idx % 2 === 0 ? 'trk-row-even' : 'trk-row-odd'
              const action = obs.to_be_rectified_by
                ? `Ensure immediate rectification. Responsible party: ${obs.to_be_rectified_by}. Target: ${obs.target_date_name || '—'}.`
                : `Ensure immediate rectification. Target: ${obs.target_date_name || '—'}.`

              return (
                <tr key={obs.id} className={rowCls}>
                  <td className="trk-num">{idx + 1}</td>
                  <td className={statusCls}>{status}</td>
                  <td className="trk-center">{fRef.get(obs.id) || '—'}</td>
                  <td className="trk-center">{fy.quarter}</td>
                  <td className="trk-center">{fy.monthInQ}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '7pt' }}>{obs.observation_id}</td>
                  <td className="trk-center">{fmtD(obs.obs_date)}</td>
                  <td className="trk-obs-text">
                    {obs.specific_concern_text && <span>{obs.specific_concern_text}</span>}
                    {obs.specific_concern_name && <span className="trk-obs-bold">{obs.specific_concern_name}</span>}
                    {!obs.specific_concern_text && !obs.specific_concern_name && '—'}
                  </td>
                  <td>{obs.core_concern_name || '—'}</td>
                  <td>{obs.root_cause_category_name || '—'}</td>
                  <td>{obs.possible_outcome || '—'}</td>
                  <td className="trk-center">{sevText(obs.severity)}</td>
                  <td className="trk-center">{sevText(obs.probability)}</td>
                  <td className={`trk-num ${riskCls}`}>{obs.risk_factor ?? '—'}</td>
                  <td className={riskCls}>{obs.risk_level || '—'}</td>
                  <td>{obs.violation_name || obs.specific_concern_name || '—'}</td>
                  <td>{obs.to_be_rectified_by || obs.contractor_name || '—'}</td>
                  <td>{obs.observer_name || obs.created_by_name || '—'}</td>
                  <td className="trk-center">{obs.target_date_name || '—'}</td>
                  <td style={{ fontSize: '7pt' }}>{action}</td>
                  <td className="trk-center">
                    {obs.status === 'Closed' && obs.updated_at ? fmtD(obs.updated_at) : '—'}
                  </td>
                  <td className={`trk-num ${delay > 0 ? 'trk-risk-h' : 'trk-risk-l'}`}>{delay}</td>
                  <td className="trk-center" style={{ fontSize: '7pt' }}>
                    {obs.status === 'Closed' ? 'Closed' : status === 'Overdue' ? 'Pending' : 'Open'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function ReportPage() {
  usePageTitle('SHE Reports', 'Surveillance Safety, Health & Environment report generator')
  const { user } = useAuth()
  const isContractor = user?.role === 'Contractor'
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today  = new Date().toISOString().slice(0, 10)

  const [activeTab,       setActiveTab]       = useState<'inspection' | 'tracker'>('inspection')
  const [projectIds,      setProjectIds]      = useState<number[]>([])
  const [dateFrom,        setDateFrom]        = useState(last30)
  const [dateTo,          setDateTo]          = useState(today)
  const [selectedContractors, setSelectedContractors] = useState<string[]>(
    () => isContractor && user?.name ? [user.name] : []
  )
  const [riskLevels,      setRiskLevels]      = useState<string[]>([])
  const [reportDate,      setReportDate]      = useState(new Date().toISOString().slice(0, 10))
  const [trackerNo,       setTrackerNo]       = useState('')
  const [generated,       setGenerated]       = useState(false)
  const [exportingExcel,  setExportingExcel]  = useState(false)

  const { data: projects } = useQuery({
    queryKey: ['projects'], queryFn: () => api.get('/projects/').then(r => r.data), ...STALE,
  })
  const { data: contractors = [] as any[] } = useQuery({
    queryKey: ['contractors'], queryFn: () => api.get('/users/contractors').then(r => r.data), ...STALE,
  })

  const projectOptions:    MSOption[] = (projects || []).map((p: any) => ({ value: p.id, label: p.name }))
  const contractorOptions: MSOption[] = useMemo(() => {
    const seen = new Set<string>()
    return contractors
      .filter((c: any) => { if (seen.has(c.name)) return false; seen.add(c.name); return true })
      .map((c: any) => ({ value: c.name, label: c.name }))
  }, [contractors])
  const companyToUserIds = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const c of contractors) { map.set(c.name, [...(map.get(c.name) || []), c.id]) }
    return map
  }, [contractors])
  const expandedContractorIds = useMemo(() =>
    selectedContractors.flatMap(name => companyToUserIds.get(name) || []),
    [selectedContractors, companyToUserIds]
  )
  const priorityOptions:   MSOption[] = [
    { value: 'High', label: 'High' }, { value: 'Medium', label: 'Medium' }, { value: 'Low', label: 'Low' },
  ]

  const { data: reportData, isFetching } = useQuery({
    queryKey: ['report', projectIds, dateFrom, dateTo, selectedContractors, riskLevels],
    queryFn: () => api.get('/observations/report', {
      params: {
        project_id:         projectIds.length            ? projectIds            : undefined,
        date_from:          dateFrom                     || undefined,
        date_to:            dateTo                       || undefined,
        contractor_user_id: expandedContractorIds.length ? expandedContractorIds : undefined,
        risk_level:         riskLevels.length    ? riskLevels    : undefined,
      },
    }).then(r => r.data),
    enabled: generated,
    staleTime: 30_000,
  })

  // Labels for the printed report header
  const projectLabel    = projectIds.length === 0  ? 'All Projects'
    : projectIds.length === 1 ? ((projects || []).find((p: any) => p.id === projectIds[0])?.name ?? '—')
    : `${projectIds.length} projects`
  const contractorLabel = selectedContractors.length === 0 ? 'All'
    : selectedContractors.length === 1 ? selectedContractors[0]
    : `${selectedContractors.length} contractors`
  const priorityLabel   = riskLevels.length === 0 ? 'All' : riskLevels.join(', ')

  const dateRange = dateFrom && dateTo
    ? `${fmtD(dateFrom)} to ${fmtD(dateTo)}`
    : dateFrom ? `From ${fmtD(dateFrom)}` : dateTo ? `To ${fmtD(dateTo)}` : 'All dates'

  const observations: any[] = reportData || []

  // Auto-derive tracker number from selected project + current FY
  const fyNow = (() => {
    const now = new Date(); const yr = now.getFullYear(); const mo = now.getMonth() + 1
    const fyStart = mo >= 4 ? yr : yr - 1
    return `${String(fyStart).slice(-2)}-${String(fyStart + 1).slice(-2)}`
  })()
  const projectCode = projectIds.length === 1
    ? ((projects || []).find((p: any) => p.id === projectIds[0])?.name ?? 'PRJ')
        .split(/\s+/).map((w: string) => w[0]).join('').toUpperCase().slice(0, 5)
    : 'ALL'
  const defaultTrackerNo = `${projectCode}/SHE/${fyNow}`
  const effectiveTrackerNo = trackerNo.trim() || defaultTrackerNo

  const reset = () => {
    setProjectIds([]); setDateFrom(last30); setDateTo(today)
    if (!isContractor) setSelectedContractors([])
    setRiskLevels([]); setGenerated(false); setTrackerNo('')
  }

  return (
    <div className="space-y-5">
      {/* ── Control panel ── */}
      <div className="no-print trk-no-print">
        <style dangerouslySetInnerHTML={{ __html: STYLE }} />

        {/* Page header with tabs on the right */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="lg:hidden">
            <h1 className="page-title flex items-center gap-2">
              <FileText className="w-6 h-6 text-indigo-600" /> SHE Reports
            </h1>
            <p className="text-sm text-gray-400 mt-1">Surveillance Safety, Health &amp; Environment report generator</p>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 self-start sm:self-auto flex-shrink-0">
            <button
              onClick={() => setActiveTab('inspection')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'inspection'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">SHE </span>Inspection
            </button>
            <button
              onClick={() => setActiveTab('tracker')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'tracker'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">SHE </span>Tracker
            </button>
          </div>
        </div>

        {/* Shared filter panel */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-3">Report Parameters</h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div>
              <label className="label">Project</label>
              <MultiSelectFilter
                options={projectOptions}
                value={projectIds}
                onChange={v => { setProjectIds(v as number[]); setGenerated(false) }}
                placeholder="All Projects"
                className="w-full"
              />
            </div>
            <div>
              <label className="label">Contractor</label>
              {isContractor ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1.5 rounded-lg cursor-default w-full">
                  <span className="text-gray-400">Locked:</span> {user?.name}
                </span>
              ) : (
                <MultiSelectFilter
                  options={contractorOptions}
                  value={selectedContractors}
                  onChange={v => { setSelectedContractors(v as string[]); setGenerated(false) }}
                  placeholder="All Contractors"
                  className="w-full"
                />
              )}
            </div>
            <div>
              <label className="label">Issue Priority</label>
              <MultiSelectFilter
                options={priorityOptions}
                value={riskLevels}
                onChange={v => { setRiskLevels(v as string[]); setGenerated(false) }}
                placeholder="All Priorities"
                className="w-full"
              />
            </div>
            <div>
              <label className="label">Date From</label>
              <input type="date" className="input w-full" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setGenerated(false) }} />
            </div>
            <div>
              <label className="label">Date To</label>
              <input type="date" className="input w-full" value={dateTo} onChange={e => { setDateTo(e.target.value); setGenerated(false) }} />
            </div>
            <div>
              <label className="label">Report Date</label>
              <input type="date" className="input w-full" value={reportDate} onChange={e => setReportDate(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={() => setGenerated(true)} disabled={isFetching} className="btn-primary w-full sm:w-auto justify-center">
              {isFetching
                ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Generating…</>
                : <><FileText className="w-4 h-4" /> Generate {activeTab === 'tracker' ? 'Tracker' : 'Report'}</>}
            </button>
            <button onClick={reset} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition w-full sm:w-auto justify-center flex items-center">
              Reset
            </button>
            {generated && !isFetching && (
              <span className="text-sm text-gray-500 w-full sm:w-auto">{observations.length} observation{observations.length !== 1 ? 's' : ''} found</span>
            )}
            {generated && !isFetching && observations.length > 0 && activeTab === 'inspection' && (
              <div className="flex gap-2 sm:ml-auto w-full sm:w-auto">
                <button
                  onClick={async () => {
                    setExportingExcel(true)
                    try { await exportInspectionExcel(observations, projectLabel, dateRange, fmtD(reportDate), contractorLabel, priorityLabel) }
                    finally { setExportingExcel(false) }
                  }}
                  disabled={exportingExcel}
                  className="btn-secondary btn-sm flex-1 sm:flex-none justify-center"
                >
                  {exportingExcel
                    ? <><span className="animate-spin w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full" /> Exporting…</>
                    : <><Download className="w-4 h-4" /> Excel</>}
                </button>
                <button onClick={() => window.print()} className="btn-primary btn-sm flex-1 sm:flex-none justify-center">
                  <Download className="w-4 h-4" /> PDF
                </button>
              </div>
            )}
          </div>
        </div>

        {generated && !isFetching && observations.length === 0 && (
          <div className="card flex items-center gap-3 text-gray-500">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            No observations found for the selected filters.
          </div>
        )}
      </div>

      {/* ── SHE Inspection Report output ── */}
      {generated && observations.length > 0 && activeTab === 'inspection' && (
        <div id="she-report-root" style={{ overflowX: 'auto' }}>
          <table className="she-table" style={{ minWidth: 1050 }}>
            <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '17%' }} />
            </colgroup>

            <tbody>
              {/* Document header */}
              <tr>
                <td colSpan={11} className="she-hdr-main">Surveillance SHE Inspection Report</td>
                <td colSpan={3} className="she-hdr-compliance" rowSpan={3}>
                  <div style={{ fontWeight: 900, fontSize: '8.5pt', marginBottom: 4 }}>COMPLIANCE TRACKER</div>
                  <div style={{ fontWeight: 400, fontSize: '6.5pt', lineHeight: 1.4 }}>
                    Compliance date auto-filled from contractor action.<br />
                    Compliance photos show contractor-uploaded evidence.
                  </div>
                </td>
              </tr>
              <tr className="she-meta">
                <td colSpan={2} className="k">Name of the Project:</td>
                <td colSpan={5} className="v" style={{ fontWeight: 700 }}>{projectLabel}</td>
                <td colSpan={2} className="k">Report Date:</td>
                <td colSpan={2} className="v">{fmtD(reportDate)}</td>
              </tr>
              <tr className="she-meta">
                <td colSpan={2} className="k">Date Range:</td>
                <td colSpan={3} className="v">{dateRange}</td>
                <td colSpan={2} className="k">Contractor:</td>
                <td colSpan={2} className="v">{contractorLabel}</td>
                <td className="k">Priority:</td>
                <td className="v">{priorityLabel}</td>
              </tr>

              {/* Observations */}
              {observations.map((obs: any, i: number) => (
                <ObsBlock key={obs.id} obs={obs} idx={i + 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SHE Tracker output ── */}
      {generated && observations.length > 0 && activeTab === 'tracker' && (
        <SHETrackerTab
          observations={observations}
          projectLabel={projectLabel}
          contractorLabel={contractorLabel}
          priorityLabel={priorityLabel}
          dateRange={dateRange}
          reportDate={reportDate}
          trackerNo={effectiveTrackerNo}
        />
      )}
    </div>
  )
}
