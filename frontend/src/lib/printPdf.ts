export function printPdf(title: string, bodyHtml: string) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head>
<meta charset="UTF-8"/>
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1f2937; padding: 24px; }
  h1 { font-size: 18px; font-weight: 700; color: #1f2937; margin-bottom: 2px; }
  .subtitle { font-size: 11px; color: #6b7280; margin-bottom: 20px; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 13px; font-weight: 700; color: #4f46e5; margin-bottom: 8px; border-bottom: 2px solid #e0e7ff; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { background: #4f46e5; color: #fff; font-weight: 700; font-size: 10px; padding: 6px 8px; text-align: left; }
  td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; font-size: 10px; }
  tr:nth-child(even) td { background: #f5f5ff; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-weight: 700; font-size: 9px; }
  .badge-high   { background: #fee2e2; color: #991b1b; }
  .badge-medium { background: #fef9c3; color: #92400e; }
  .badge-low    { background: #dcfce7; color: #166534; }
  .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 16px; }
  .kpi-card { background: #f5f5ff; border-left: 3px solid #4f46e5; padding: 10px 12px; border-radius: 6px; }
  .kpi-label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
  .kpi-value { font-size: 22px; font-weight: 800; color: #1f2937; }
  .meta { font-size: 10px; color: #9ca3af; margin-bottom: 16px; }
  @media print {
    body { padding: 12px; }
    @page { margin: 15mm; size: A4 landscape; }
  }
</style>
</head><body>
<h1>${title}</h1>
<p class="subtitle">Generated on ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</p>
${bodyHtml}
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`)
  win.document.close()
}
