import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface LineItem {
  description: string
  quantity:    number
  unit_price:  number
}

export interface InvoiceForPDF {
  number:        string
  date:          string
  due_date:      string
  status:        string
  client:        string
  clientAddress: string
  clientEmail:   string
  line_items:    LineItem[]
  amount:        number
  vat_applied?:  boolean
}

export interface CompanyForPDF {
  company_name:    string
  company_address: string
  city:            string
  tax_id:          string
  phone:           string
  email:           string
  bank_name:       string
  bank_account:    string
  swift_code:      string
  vat_registered:  boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

function money(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₼'
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
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

function labeledLine(
  doc: jsPDF, label: string, value: string, x: number, y: number,
  labelColor: [number, number, number] = [107, 114, 128],
  valueColor: [number, number, number] = [55,  65,  81],
): number {
  if (!value) return y
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(...labelColor)
  doc.text(label, x, y)
  const lw = doc.getTextWidth(label)
  doc.setFont('Roboto', 'normal')
  doc.setTextColor(...valueColor)
  doc.text(value, x + lw + 1, y)
  return y + 5.5
}

// ── Main export ────────────────────────────────────────────────────────────

export async function generateInvoicePDF(invoice: InvoiceForPDF, company: CompanyForPDF): Promise<void> {
  const doc    = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const W      = 210
  const H      = 297
  const MARGIN = 15

  // ── Register Unicode font ─────────────────────────────────────────────
  const [regB64, boldB64] = await Promise.all([
    loadFont('/fonts/Roboto-Regular.ttf'),
    loadFont('/fonts/Roboto-Bold.ttf'),
  ])
  doc.addFileToVFS('Roboto-Regular.ttf', regB64)
  doc.addFileToVFS('Roboto-Bold.ttf',    boldB64)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFont('Roboto-Bold.ttf',    'Roboto', 'bold')
  doc.setFont('Roboto', 'normal')

  const items: LineItem[] =
    invoice.line_items?.length > 0
      ? invoice.line_items
      : [{ description: 'Professional Services', quantity: 1, unit_price: invoice.amount }]

  const subtotal   = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const showVat    = invoice.vat_applied ?? company.vat_registered
  const vatAmount  = showVat ? subtotal * 0.18 : 0
  const grandTotal = subtotal + vatAmount

  // ── Column boundary shared by dates row and FROM/BILL TO ──────────────
  //   Left column : X = MARGIN … MID_X - 5
  //   Right column: X = MID_X  … W - MARGIN
  const MID_X = 108

  // ── 1. Header bar (54 mm tall) ────────────────────────────────────────
  //   Status badge lives here — completely inside the blue band.

  const HEADER_H = 54
  doc.setFillColor(30, 58, 138)
  doc.rect(0, 0, W, HEADER_H, 'F')

  // Logo left
  doc.setFontSize(30)
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Az', MARGIN, 23)
  const azW = doc.getTextWidth('Az')
  doc.setTextColor(147, 197, 253)
  doc.text('Finance', MARGIN + azW, 23)

  doc.setFontSize(8.5)
  doc.setFont('Roboto', 'normal')
  doc.setTextColor(147, 197, 253)
  doc.text('Financial Management Platform', MARGIN, 32)

  // "INVOICE" + number right
  doc.setFontSize(28)
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('INVOICE', W - MARGIN, 22, { align: 'right' })

  doc.setFontSize(9.5)
  doc.setFont('Roboto', 'normal')
  doc.setTextColor(219, 234, 254)
  doc.text(invoice.number, W - MARGIN, 32, { align: 'right' })

  // Status badge — below invoice number, right-aligned, inside header
  const statusFill: Record<string, [number, number, number]> = {
    Paid:   [22, 163, 74],
    Unpaid: [220, 38, 38],
    Draft:  [107, 114, 128],
  }
  const [sr, sg, sb] = statusFill[invoice.status] ?? [107, 114, 128]
  const BADGE_W = 34
  const badgeX  = W - MARGIN - BADGE_W        // right-aligned
  doc.setFillColor(sr, sg, sb)
  doc.roundedRect(badgeX, 38, BADGE_W, 9, 2, 2, 'F')
  doc.setFontSize(8)
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(invoice.status.toUpperCase(), badgeX + BADGE_W / 2, 44, { align: 'center' })

  // ── 2. Dates row ──────────────────────────────────────────────────────
  //   Left column  = invoice date (aligned with FROM below)
  //   Right column = due date     (aligned with BILL TO below)
  //   No status badge here — it's in the header.

  const datesY = HEADER_H + 10   // 64

  doc.setFontSize(7.5)
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(107, 114, 128)
  doc.text('INVOICE DATE', MARGIN, datesY)
  doc.text('DUE DATE',     MID_X,  datesY)

  doc.setFontSize(10.5)
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(17, 24, 39)
  doc.text(fmtDate(invoice.date),     MARGIN, datesY + 7)
  doc.text(fmtDate(invoice.due_date), MID_X,  datesY + 7)

  // ── 3. FROM / BILL TO ─────────────────────────────────────────────────
  //   Starts well below the dates row.
  //   Left column and right column share MID_X with the dates above.

  const partyY = datesY + 20   // 84

  // Thin rule between dates and party section
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, partyY - 5, W - MARGIN, partyY - 5)

  // ── FROM ─────────────────────────────────────────────────────────────

  doc.setFontSize(7.5)
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(107, 114, 128)
  doc.text('FROM', MARGIN, partyY)

  doc.setFontSize(11)
  doc.setFont('Roboto', 'bold')

  if (company.company_name) {
    doc.setTextColor(17, 24, 39)
    doc.text(company.company_name, MARGIN, partyY + 7)
  } else {
    doc.setTextColor(185, 28, 28)
    doc.text('Please complete Company Settings', MARGIN, partyY + 7)
  }

  doc.setFontSize(9)
  let fromY = partyY + 13.5

  if (company.company_address) {
    doc.setFont('Roboto', 'normal')
    doc.setTextColor(75, 85, 99)
    for (const line of company.company_address.split('\n')) {
      if (line.trim()) { doc.text(line.trim(), MARGIN, fromY); fromY += 5 }
    }
  }
  if (company.city) {
    doc.setFont('Roboto', 'normal')
    doc.setTextColor(75, 85, 99)
    doc.text(company.city, MARGIN, fromY)
    fromY += 5
  }
  if (company.tax_id) {
    fromY = labeledLine(doc, 'VÖEN: ',  company.tax_id, MARGIN, fromY)
  }
  if (company.phone) {
    fromY = labeledLine(doc, 'Tel: ',   company.phone,  MARGIN, fromY)
  }
  if (company.email) {
    fromY = labeledLine(doc, 'Email: ', company.email,  MARGIN, fromY)
  }

  // ── BILL TO ──────────────────────────────────────────────────────────

  doc.setFontSize(7.5)
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(107, 114, 128)
  doc.text('BILL TO', MID_X, partyY)

  doc.setFontSize(11)
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(17, 24, 39)
  doc.text(invoice.client, MID_X, partyY + 7)

  doc.setFontSize(9)
  let toY = partyY + 13.5

  if (invoice.clientAddress) {
    doc.setFont('Roboto', 'normal')
    doc.setTextColor(75, 85, 99)
    for (const part of invoice.clientAddress.split(',')) {
      if (part.trim()) { doc.text(part.trim(), MID_X, toY); toY += 5 }
    }
  }
  if (invoice.clientEmail) {
    toY = labeledLine(doc, 'Email: ', invoice.clientEmail, MID_X, toY)
  }

  // ── 4. Divider (after both party columns finish) ──────────────────────

  const dividerY = Math.max(fromY, toY) + 6
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.4)
  doc.line(MARGIN, dividerY, W - MARGIN, dividerY)

  // ── 5. Line items table ───────────────────────────────────────────────

  autoTable(doc, {
    startY: dividerY + 6,
    head: [['Təsvir / Description', 'Miq.', 'Vahid Qiymət (₼)', 'Cəmi (₼)']],
    body: items.map(item => [
      item.description,
      String(item.quantity),
      money(item.unit_price),
      money(item.quantity * item.unit_price),
    ]),
    styles: {
      fontSize:    9,
      cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
      textColor:   [17, 24, 39],
      font:        'Roboto',
    },
    headStyles: {
      fillColor:  [30, 58, 138],
      textColor:  [255, 255, 255],
      fontStyle:  'bold',
      fontSize:   9,
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 44, halign: 'right' },
      3: { cellWidth: 44, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: MARGIN, right: MARGIN },
  })

  // ── 6. Totals ─────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableBottom: number = (doc as any).lastAutoTable.finalY
  const totX = W - MARGIN - 80
  let   totY = tableBottom + 10

  doc.setFontSize(9)
  doc.setFont('Roboto', 'normal')
  doc.setTextColor(107, 114, 128)
  doc.text('Cəmi (Subtotal):', totX, totY)
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(17, 24, 39)
  doc.text(money(subtotal), W - MARGIN, totY, { align: 'right' })
  totY += 7

  if (showVat) {
    doc.setFont('Roboto', 'normal')
    doc.setTextColor(107, 114, 128)
    doc.text('ƏDV (18%):', totX, totY)
    doc.setFont('Roboto', 'bold')
    doc.setTextColor(17, 24, 39)
    doc.text(money(vatAmount), W - MARGIN, totY, { align: 'right' })
    totY += 7
  }

  doc.setDrawColor(209, 213, 219)
  doc.setLineWidth(0.3)
  doc.line(totX, totY - 2, W - MARGIN, totY - 2)
  totY += 3

  doc.setFillColor(30, 58, 138)
  doc.roundedRect(totX - 4, totY - 1, W - MARGIN - totX + 4, 12, 2, 2, 'F')
  doc.setFontSize(10.5)
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('ÜMUMİ CƏMİ:', totX, totY + 7.5)
  doc.text(money(grandTotal), W - MARGIN - 2, totY + 7.5, { align: 'right' })
  totY += 20

  // ── 7. Bank details ───────────────────────────────────────────────────

  const hasBankDetails = company.bank_name || company.bank_account || company.swift_code

  if (hasBankDetails) {
    doc.setFillColor(239, 246, 255)
    doc.setDrawColor(191, 219, 254)
    doc.setLineWidth(0.4)
    doc.roundedRect(MARGIN, totY, W - MARGIN * 2, 28, 2, 2, 'FD')

    doc.setFontSize(7.5)
    doc.setFont('Roboto', 'bold')
    doc.setTextColor(30, 58, 138)
    doc.text('BANK REKVİZİTLƏRİ / BANK DETAILS', MARGIN + 4, totY + 7)

    doc.setFontSize(8.5)
    let bY = totY + 13
    const bX = MARGIN + 4

    if (company.bank_name)    bY = labeledLine(doc, 'Bank: ',        company.bank_name,    bX, bY, [30, 58, 138], [17, 24, 39])
    if (company.bank_account) bY = labeledLine(doc, 'Hesab / IBAN: ',company.bank_account, bX, bY, [30, 58, 138], [17, 24, 39])
    if (company.swift_code)       labeledLine(doc, 'SWIFT / BIK: ', company.swift_code,   bX, bY, [30, 58, 138], [17, 24, 39])
  }

  // ── 8. Footer ─────────────────────────────────────────────────────────

  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.4)
  doc.line(MARGIN, H - 18, W - MARGIN, H - 18)

  doc.setFontSize(7.5)
  doc.setFont('Roboto', 'normal')
  doc.setTextColor(156, 163, 175)
  doc.text(
    `AzFinance · ${new Date().toLocaleDateString('en-GB')}`,
    W / 2,
    H - 11,
    { align: 'center' },
  )

  doc.save(`${invoice.number}.pdf`)
}
