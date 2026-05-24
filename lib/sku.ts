// SKU format: [CAT_PREFIX]-[SUPPLIER_CODE]-[YYMM]-[SEQUENCE]-[CHECK]
// Example:    ELEC-BAK-2605-0001-4

// ── Category prefix map ─────────────────────────────────────────────────────

const CATEGORY_RULES: [string[], string][] = [
  [['Electronics', 'Elektronika', 'Electronic', 'IT', 'Technology'],    'ELEC'],
  [['Office', 'Ofis', 'Stationery'],                                    'OFIS'],
  [['Construction', 'Tikinti', 'Building', 'Material', 'Inşaat'],       'CONS'],
  [['Food', 'Ərzaq', 'Grocery', 'Beverage', 'Qida'],                    'FOOD'],
  [['Medical', 'Tibb', 'Medicine', 'Healthcare', 'Pharma'],             'MEDC'],
  [['Clothing', 'Geyim', 'Apparel', 'Textile', 'Fashion'],              'GEYG'],
  [['Furniture', 'Mebel', 'Furnishing'],                                'MEBEL'],
  [['Auto', 'Avtomobil', 'Automotive', 'Vehicle', 'Car', 'Nəqliyyat'], 'AUTO'],
  [['Chemical', 'Kimya', 'Chemicals', 'Kimyəvi'],                       'KIMY'],
]

export function getCategoryPrefix(categoryName: string): string {
  if (!categoryName?.trim()) return 'DIGR'
  const lower = categoryName.trim().toLowerCase()
  for (const [keywords, prefix] of CATEGORY_RULES) {
    if (keywords.some(k => lower === k.toLowerCase() || lower.includes(k.toLowerCase()))) {
      return prefix
    }
  }
  // Fallback: first 4 uppercase alphanum chars of the category
  const clean = categoryName.trim().replace(/[^A-Za-z]/g, '').toUpperCase()
  return clean.slice(0, 4).padEnd(4, 'X') || 'DIGR'
}

// ── Supplier code ────────────────────────────────────────────────────────────

export function getSupplierCode(vendorName?: string | null): string {
  if (!vendorName?.trim()) return 'DIG'
  const clean = vendorName.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return clean.slice(0, 3).padEnd(3, 'X') || 'DIG'
}

// ── Date part ────────────────────────────────────────────────────────────────

export function getDatePart(): string {
  const now = new Date()
  const yy  = String(now.getFullYear()).slice(2)
  const mm  = String(now.getMonth() + 1).padStart(2, '0')
  return yy + mm
}

// ── Sequence ─────────────────────────────────────────────────────────────────
// Finds the highest existing sequence for the same category prefix,
// returns next value zero-padded to 4 digits.

export function getNextSequence(existingSkus: string[], categoryPrefix: string): string {
  const prefix = categoryPrefix + '-'
  let max = 0
  for (const sku of existingSkus) {
    if (!sku.startsWith(prefix)) continue
    const parts = sku.split('-')
    // Format: CAT-SUP-YYMM-SEQ-CHECK → SEQ is index 3
    if (parts.length >= 5) {
      const seq = parseInt(parts[3], 10)
      if (!isNaN(seq) && seq > max) max = seq
    }
  }
  return String(max + 1).padStart(4, '0')
}

// ── Luhn check digit ─────────────────────────────────────────────────────────
// Applied to the 8-digit numeric core: YYMM + SEQSEQ (e.g. "26050001")

export function luhnCheckDigit(digitStr: string): number {
  const digits = digitStr.replace(/\D/g, '')
  let sum = 0
  let isDouble = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10)
    if (isDouble) { d *= 2; if (d > 9) d -= 9 }
    sum += d
    isDouble = !isDouble
  }
  return (10 - (sum % 10)) % 10
}

// ── Full SKU generation ───────────────────────────────────────────────────────

export function generateSKU(
  category:     string,
  vendorName:   string | null | undefined,
  existingSkus: string[],
): string {
  const cat   = getCategoryPrefix(category)
  const sup   = getSupplierCode(vendorName)
  const date  = getDatePart()
  const seq   = getNextSequence(existingSkus, cat)
  const check = luhnCheckDigit(date + seq)
  return `${cat}-${sup}-${date}-${seq}-${check}`
}

// ── Validation ────────────────────────────────────────────────────────────────
// CAT(2-6) - SUP(2-4) - YYMM(4) - SEQ(4) - CHECK(1)
const SKU_REGEX = /^[A-Z]{2,6}-[A-Z0-9]{2,4}-\d{4}-\d{4}-\d$/

export function validateSKU(sku: string): boolean {
  return SKU_REGEX.test((sku ?? '').trim())
}

// ── Parse ─────────────────────────────────────────────────────────────────────

export interface ParsedSKU {
  category: string
  supplier: string
  date:     string
  sequence: string
  check:    string
}

export function parseSKU(sku: string): ParsedSKU | null {
  if (!validateSKU(sku)) return null
  const parts = sku.trim().split('-')
  return {
    category: parts[0],
    supplier: parts[1],
    date:     parts[2],
    sequence: parts[3],
    check:    parts[4],
  }
}
