import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export async function captureAndPrint(
  elementId: string,
  filename: string,
  title: string,
  subtitle?: string,
) {
  const el = document.getElementById(elementId)
  if (!el) return

  // Temporarily scroll el into full view and expand it
  el.style.height = 'auto'
  el.style.overflow = 'visible'

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#f8fafc',
    logging: false,
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  })

  const imgWidth  = canvas.width
  const imgHeight = canvas.height

  // A4 landscape: 297 × 210 mm  →  at 96dpi ≈ 1123 × 794 px
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()   // 297
  const pageH = pdf.internal.pageSize.getHeight()  // 210

  const margin   = 10
  const headerH  = 14                               // reserved for title
  const usableW  = pageW - margin * 2
  const usableH  = pageH - margin * 2 - headerH

  // Title header
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(31, 41, 55)
  pdf.text(title, margin, margin + 7)
  if (subtitle) {
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(107, 114, 128)
    pdf.text(subtitle, margin, margin + 12)
  }

  // Fit image across pages
  const sliceH   = Math.round((usableH / usableW) * imgWidth) // px height per page
  let offsetY    = 0
  let firstPage  = true

  while (offsetY < imgHeight) {
    if (!firstPage) pdf.addPage()

    // Crop a horizontal strip from the source canvas
    const stripH    = Math.min(sliceH, imgHeight - offsetY)
    const strip     = document.createElement('canvas')
    strip.width     = imgWidth
    strip.height    = stripH
    const ctx       = strip.getContext('2d')!
    ctx.drawImage(canvas, 0, -offsetY)
    const stripData = strip.toDataURL('image/png')

    const printH = (stripH / imgWidth) * usableW
    const topY   = firstPage ? margin + headerH : margin
    pdf.addImage(stripData, 'PNG', margin, topY, usableW, printH)

    offsetY   += sliceH
    firstPage  = false
  }

  pdf.save(filename)
}
