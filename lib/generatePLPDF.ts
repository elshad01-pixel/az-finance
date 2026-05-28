import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface PLPDFData {
  period:      string
  companyName: string
  revenue: {
    totalInvoiced:     number
    collected:         number
    outstanding:       number
    prevTotalInvoiced: number
    prevCollected:     number
    prevOutstanding:   number
  }
  cogs: {
    amount:    number
    prevAmount: number
  }
  opex: {
    byCategory: { category: string; amount: number; prevAmount: number }[]
    total:      number
    prevTotal:  number
  }
  profit: {
    grossProfit:     number
    prevGrossProfit: number
    gross:           number   // net before tax
    taxLabel:        string
    taxAmount:       number
    net:             number
    prevGross:       number
    prevTaxAmount:   number
    prevNet:         number
  }
}

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₼'
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

export async function generatePLPDF(data: PLPDFData): Promise<void> {
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
  doc.text('PROFIT & LOSS', W - MARGIN, 20, { align: 'right' })

  doc.setFontSize(9.5); doc.setFont('Roboto', 'normal'); doc.setTextColor(219, 234, 254)
  doc.text(data.period, W - MARGIN, 29, { align: 'right' })

  if (data.companyName) {
    doc.setFontSize(8); doc.setTextColor(147, 197, 253)
    doc.text(data.companyName, W - MARGIN, 38, { align: 'right' })
  }

  // ── Table helpers ──────────────────────────────────────────────────────────
  const GRAY: [number, number, number]        = [107, 114, 128]
  const GREEN_FILL: [number, number, number]  = [220, 252, 231]
  const GREEN_TEXT: [number, number, number]  = [21,  128, 61 ]
  const RED_FILL: [number, number, number]    = [254, 226, 226]
  const RED_TEXT: [number, number, number]    = [185, 28,  28 ]

  function sectionHead(
    label: string,
    fill:  [number, number, number],
    color: [number, number, number],
  ) {
    return [{
      content: label, colSpan: 3,
      styles: {
        fillColor: fill, textColor: color,
        fontStyle: 'bold' as const, fontSize: 8,
        cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
      },
    }]
  }

  function dataRow(label: string, prev: number, curr: number, bold = false) {
    return [
      { content: label,       styles: { fontStyle: bold ? 'bold' as const : 'normal' as const } },
      { content: money(prev), styles: { halign: 'right' as const, textColor: GRAY, fontStyle: bold ? 'bold' as const : 'normal' as const } },
      { content: money(curr), styles: { halign: 'right' as const, fontStyle: bold ? 'bold' as const : 'normal' as const } },
    ]
  }

  function hlRow(label: string, prev: number, curr: number, positive: boolean) {
    const fill  = positive ? GREEN_FILL : RED_FILL
    const color = positive ? GREEN_TEXT : RED_TEXT
    return [
      { content: label,       styles: { fillColor: fill, textColor: color, fontStyle: 'bold' as const } },
      { content: money(prev), styles: { halign: 'right' as const, fillColor: fill, textColor: GRAY,  fontStyle: 'bold' as const } },
      { content: money(curr), styles: { halign: 'right' as const, fillColor: fill, textColor: color, fontStyle: 'bold' as const } },
    ]
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[][] = [
    // ── REVENUE ────────────────────────────────────────────────────────────
    sectionHead('REVENUE', [239, 246, 255], [30, 58, 138]),
    dataRow('Total Invoiced',   data.revenue.prevTotalInvoiced, data.revenue.totalInvoiced),
    dataRow('Collected (Paid)', data.revenue.prevCollected,     data.revenue.collected),
    dataRow('Outstanding',      data.revenue.prevOutstanding,   data.revenue.outstanding),

    // ── COST OF GOODS SOLD ─────────────────────────────────────────────────
    sectionHead('COST OF GOODS SOLD', [255, 237, 213], [154, 52, 18]),
    ...(data.cogs.amount === 0 && data.cogs.prevAmount === 0
      ? [[{ content: 'No deliveries in this period', colSpan: 3, styles: { textColor: GRAY, fontStyle: 'italic' as const } }]]
      : [dataRow('Cost of Goods Sold (deliveries)', data.cogs.prevAmount, data.cogs.amount, true)]
    ),

    // ── GROSS PROFIT ───────────────────────────────────────────────────────
    hlRow('GROSS PROFIT', data.profit.prevGrossProfit, data.profit.grossProfit, data.profit.grossProfit >= 0),

    // ── OPERATING EXPENSES ─────────────────────────────────────────────────
    sectionHead('OPERATING EXPENSES', [254, 242, 242], [185, 28, 28]),
    ...(data.opex.byCategory.length > 0
      ? data.opex.byCategory.map(e => dataRow(e.category, e.prevAmount, e.amount))
      : [[{ content: 'No operating expenses in this period', colSpan: 3, styles: { textColor: GRAY, fontStyle: 'italic' as const } }]]
    ),
    dataRow('Total Operating Expenses', data.opex.prevTotal, data.opex.total, true),

    // ── NET PROFIT ─────────────────────────────────────────────────────────
    sectionHead('NET PROFIT', [240, 253, 244], [21, 128, 61]),
    hlRow('Net Before Tax', data.profit.prevGross, data.profit.gross, data.profit.gross >= 0),
    dataRow(data.profit.taxLabel, data.profit.prevTaxAmount, data.profit.taxAmount),
    hlRow('NET PROFIT AFTER TAX', data.profit.prevNet, data.profit.net, data.profit.net >= 0),
  ]

  autoTable(doc, {
    startY: HEADER_H + 10,
    head:   [['', 'Previous Period', 'Current Period']],
    body,
    styles: {
      font:        'Roboto',
      fontSize:    9,
      cellPadding: { top: 3.5, bottom: 3.5, left: 6, right: 6 },
      textColor:   [17, 24, 39],
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize:  8.5,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 48, halign: 'right' },
      2: { cellWidth: 48, halign: 'right' },
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
    `AzFinance · Profit & Loss Report · ${new Intl.DateTimeFormat('az-AZ').format(new Date())}`,
    W / 2, H - 11,
    { align: 'center' },
  )

  doc.save(`PL-Report-${data.period.replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`)
}
