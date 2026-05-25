import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface MarginRow {
  name:        string
  sku:         string
  qty_sold:    number
  revenue:     number
  cogs:        number
  gross_profit: number
  margin_pct:  number
}

export interface MarginPDFData {
  period:      string
  companyName: string
  totals: {
    revenue:     number
    cogs:        number
    grossMargin: number
    marginPct:   number
  }
  rows:    MarginRow[]
}

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₼'
}

function pct(n: number): string {
  return n.toFixed(1) + '%'
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes  = new Uint8Array(buffer)
  const chunks: string[] = []
  const chunk  = 0x8000
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunk)))
  }
  return btoa(chunks.join(''))
}

async function loadFont(path: string): Promise<string> {
  const res = await fetch(path)
  return arrayBufferToBase64(await res.arrayBuffer())
}

export async function generateMarginPDF(data: MarginPDFData): Promise<void> {
  const doc    = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const W      = 210
  const H      = 297
  const MARGIN = 15

  const [regB64, boldB64] = await Promise.all([
    loadFont('/fonts/Roboto-Regular.ttf'),
    loadFont('/fonts/Roboto-Bold.ttf'),
  ])
  doc.addFileToVFS('Roboto-Regular.ttf', regB64)
  doc.addFileToVFS('Roboto-Bold.ttf',    boldB64)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFont('Roboto-Bold.ttf',    'Roboto', 'bold')
  doc.setFont('Roboto', 'normal')

  // ── Header bar ────────────────────────────────────────────────────────────
  const HEADER_H = 50
  doc.setFillColor(30, 58, 138)
  doc.rect(0, 0, W, HEADER_H, 'F')

  doc.setFontSize(28); doc.setFont('Roboto', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('Az', MARGIN, 21)
  const azW = doc.getTextWidth('Az')
  doc.setTextColor(147, 197, 253)
  doc.text('Finance', MARGIN + azW, 21)

  doc.setFontSize(8); doc.setFont('Roboto', 'normal'); doc.setTextColor(147, 197, 253)
  doc.text('Financial Management Platform', MARGIN, 29)

  doc.setFontSize(7.5); doc.setTextColor(120, 170, 230)
  doc.text(
    `Generated: ${new Intl.DateTimeFormat('az-AZ').format(new Date())}`,
    MARGIN, 37,
  )

  doc.setFontSize(20); doc.setFont('Roboto', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('GROSS MARGIN', W - MARGIN, 20, { align: 'right' })

  doc.setFontSize(9.5); doc.setFont('Roboto', 'normal'); doc.setTextColor(219, 234, 254)
  doc.text(data.period, W - MARGIN, 29, { align: 'right' })

  if (data.companyName) {
    doc.setFontSize(8); doc.setTextColor(147, 197, 253)
    doc.text(data.companyName, W - MARGIN, 38, { align: 'right' })
  }

  // ── Summary row ───────────────────────────────────────────────────────────
  const summaryY = HEADER_H + 8
  const boxW     = (W - MARGIN * 2 - 9) / 4
  const summaries = [
    { label: 'Revenue',      value: money(data.totals.revenue),     fill: [239, 246, 255] as [number,number,number], text: [30, 58, 138]  as [number,number,number] },
    { label: 'COGS',         value: money(data.totals.cogs),        fill: [254, 242, 242] as [number,number,number], text: [185, 28, 28]  as [number,number,number] },
    { label: 'Gross Margin', value: money(data.totals.grossMargin), fill: [240, 253, 244] as [number,number,number], text: [21, 128, 61]  as [number,number,number] },
    { label: 'Margin %',     value: pct(data.totals.marginPct),     fill: [248, 250, 252] as [number,number,number], text: [55, 65, 81]   as [number,number,number] },
  ]

  summaries.forEach((s, i) => {
    const x = MARGIN + i * (boxW + 3)
    doc.setFillColor(...s.fill)
    doc.roundedRect(x, summaryY, boxW, 18, 2, 2, 'F')
    doc.setFontSize(7); doc.setFont('Roboto', 'normal'); doc.setTextColor(107, 114, 128)
    doc.text(s.label, x + boxW / 2, summaryY + 6, { align: 'center' })
    doc.setFontSize(10); doc.setFont('Roboto', 'bold'); doc.setTextColor(...s.text)
    doc.text(s.value, x + boxW / 2, summaryY + 13, { align: 'center' })
  })

  // ── Product table ──────────────────────────────────────────────────────────
  const GRAY: [number, number, number]       = [107, 114, 128]
  const GREEN_FILL: [number, number, number] = [220, 252, 231]
  const GREEN_TEXT: [number, number, number] = [21,  128, 61 ]
  const RED_FILL: [number, number, number]   = [254, 226, 226]
  const RED_TEXT: [number, number, number]   = [185, 28,  28 ]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[][] = data.rows.length === 0
    ? [[{ content: 'No deliveries in this period', colSpan: 6, styles: { textColor: GRAY, fontStyle: 'italic' as const, halign: 'center' as const } }]]
    : data.rows.map(r => {
        const goodMargin = r.margin_pct >= 0
        const pctFill    = goodMargin ? GREEN_FILL : RED_FILL
        const pctColor   = goodMargin ? GREEN_TEXT : RED_TEXT
        return [
          { content: r.name,               styles: { fontStyle: 'bold' as const } },
          { content: r.sku,                styles: { textColor: GRAY } },
          { content: r.qty_sold.toLocaleString(), styles: { halign: 'right' as const } },
          { content: money(r.revenue),     styles: { halign: 'right' as const } },
          { content: money(r.cogs),        styles: { halign: 'right' as const, textColor: RED_TEXT } },
          { content: money(r.gross_profit),styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
          { content: pct(r.margin_pct),    styles: { halign: 'right' as const, fillColor: pctFill, textColor: pctColor, fontStyle: 'bold' as const } },
        ]
      })

  // Totals row
  if (data.rows.length > 0) {
    const goodTotal  = data.totals.grossMargin >= 0
    const totalFill  = goodTotal ? GREEN_FILL : RED_FILL
    const totalColor = goodTotal ? GREEN_TEXT : RED_TEXT
    body.push([
      { content: 'TOTAL', colSpan: 3, styles: { fontStyle: 'bold' as const, fillColor: [249, 250, 251] as [number,number,number] } },
      { content: money(data.totals.revenue),     styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [249, 250, 251] as [number,number,number] } },
      { content: money(data.totals.cogs),        styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: RED_TEXT, fillColor: [249, 250, 251] as [number,number,number] } },
      { content: money(data.totals.grossMargin), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: totalFill, textColor: totalColor } },
      { content: pct(data.totals.marginPct),     styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: totalFill, textColor: totalColor } },
    ])
  }

  autoTable(doc, {
    startY: summaryY + 24,
    head:   [['Product', 'SKU', 'Qty Sold', 'Revenue', 'COGS', 'Gross Profit', 'Margin %']],
    body,
    styles: {
      font:        'Roboto',
      fontSize:    8.5,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      textColor:   [17, 24, 39],
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize:  8,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 22 },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 20, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: MARGIN, right: MARGIN },
  })

  // ── Footer ─────────────────────────────────────────────────────────────────
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.4)
  doc.line(MARGIN, H - 18, W - MARGIN, H - 18)

  doc.setFontSize(7.5); doc.setFont('Roboto', 'normal'); doc.setTextColor(156, 163, 175)
  doc.text(
    `AzFinance · Gross Margin Report · ${new Intl.DateTimeFormat('az-AZ').format(new Date())}`,
    W / 2, H - 11,
    { align: 'center' },
  )

  doc.save(`Gross-Margin-${data.period.replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`)
}
