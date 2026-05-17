#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Aytaç — AzFinance Avtomatik Test Agenti                    ║
 * ║  Bakı MMC mühasibi kimi AzFinance-i sınaqdan keçirir        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * .env.local tələbləri:
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...   ← Supabase → Settings → API → service_role
 *   (alternativ) TEST_USER_EMAIL + TEST_USER_PASSWORD
 *
 * İstifadə:
 *   npx tsx scripts/aytac-test-agent.ts
 *   npx tsx scripts/aytac-test-agent.ts --no-cleanup
 */

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

// ── Guards ────────────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY          = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const TEST_EMAIL        = process.env.TEST_USER_EMAIL
const TEST_PASSWORD     = process.env.TEST_USER_PASSWORD
const NO_CLEANUP        = process.argv.includes('--no-cleanup')

if (!ANTHROPIC_API_KEY) {
  console.error('\n❌  ANTHROPIC_API_KEY tapılmadı.')
  console.error('   .env.local faylına ANTHROPIC_API_KEY=sk-ant-... əlavə edin.\n')
  process.exit(1)
}
if (!SUPABASE_URL || (!SERVICE_KEY && !ANON_KEY)) {
  console.error('\n❌  Supabase konfiqurasiyası tapılmadı.\n')
  process.exit(1)
}
if (!SERVICE_KEY && !TEST_EMAIL) {
  console.warn('\n⚠️  SUPABASE_SERVICE_ROLE_KEY yoxdur.')
  console.warn('   Insert əməliyyatları RLS səbəbindən uğursuz ola bilər.')
  console.warn('   Həll: .env.local-a SUPABASE_SERVICE_ROLE_KEY əlavə edin')
  console.warn('   (Supabase Dashboard → Settings → API → service_role)\n')
}

// ── Clients ───────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
const supabase  = createClient(SUPABASE_URL!, SERVICE_KEY ?? ANON_KEY!)

// Unique tag stamped onto every test record so cleanup is safe
const TEST_RUN_ID = `aytac_${Date.now()}`

// IDs of records created during this run (for cleanup)
const created: Record<string, number[]> = {
  invoices:  [],
  expenses:  [],
  employees: [],
  vendors:   [],
}

// ── Azerbaijan payroll reference calculator ───────────────────────────────────

function r2(n: number) { return Math.round(n * 100) / 100 }

// Mirrors lib/payroll.ts calcPayroll exactly — keep in sync.
function calcAzPayroll(gross: number, isMainWorkplace: boolean, sector: 'private_non_oil' | 'oil_gas_public') {
  if (sector === 'private_non_oil') {
    const pitDeduction = isMainWorkplace && gross <= 2500 ? 200 : 0
    const taxable      = Math.max(0, gross - pitDeduction)

    let pit: number
    if (taxable <= 2500)      pit = r2(taxable * 0.03)
    else if (taxable <= 8000) pit = r2(75 + (taxable - 2500) * 0.10)
    else                      pit = r2(625 + (taxable - 8000) * 0.14)

    const empSocial      = gross <= 200 ? r2(gross * 0.03) : r2(6 + (gross - 200) * 0.10)
    const empHealth      = gross <= 2500 ? r2(gross * 0.02) : r2(50 + (gross - 2500) * 0.005)
    const empUnemp       = r2(gross * 0.005)
    const totalDed       = r2(pit + empSocial + empHealth + empUnemp)
    const netSalary      = r2(gross - totalDed)

    const emplrSocial    = gross <= 200 ? r2(gross * 0.22) : r2(44 + (gross - 200) * 0.15)
    const emplrHealth    = empHealth
    const emplrUnemp     = r2(gross * 0.005)
    const totalCost      = r2(gross + emplrSocial + emplrHealth + emplrUnemp)

    return {
      gross, pit_deduction: pitDeduction, taxable, pit,
      emp_social: empSocial, emp_health: empHealth, emp_unemployment: empUnemp,
      total_deductions: totalDed, net_salary: netSalary,
      employer_social: emplrSocial, employer_health: emplrHealth, employer_unemployment: emplrUnemp,
      total_employer_cost: totalCost,
      sector, is_main_workplace: isMainWorkplace,
    }
  }

  // oil_gas_public
  const pit         = gross <= 2500 ? r2(gross * 0.14) : r2(350 + (gross - 2500) * 0.25)
  const empSocial   = r2(gross * 0.03)
  const totalDed    = r2(pit + empSocial)
  const netSalary   = r2(gross - totalDed)
  const emplrSocial = r2(gross * 0.22)
  const totalCost   = r2(gross + emplrSocial)

  return {
    gross, pit_deduction: 0, taxable: gross, pit,
    emp_social: empSocial, emp_health: 0, emp_unemployment: 0,
    total_deductions: totalDed, net_salary: netSalary,
    employer_social: emplrSocial, employer_health: 0, employer_unemployment: 0,
    total_employer_cost: totalCost,
    sector, is_main_workplace: isMainWorkplace,
  }
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dueDateStr(daysFromNow: number) {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthStartStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'db_insert',
    description:
      'Supabase cədvəlinə yeni qeyd əlavə et. ' +
      'Test qeydlərini fərqləndirmək üçün notes/description/client sahəsinin sonuna " [TEST_RUN_ID]" əlavə et.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', description: 'Cədvəl: invoices | expenses | employees | vendors' },
        data:  { type: 'object', description: 'Sahə-dəyər cütlüyü' },
      },
      required: ['table', 'data'],
    },
  },
  {
    name: 'db_select',
    description: 'Supabase cədvəlindən məlumat oxu',
    input_schema: {
      type: 'object' as const,
      properties: {
        table:   { type: 'string' },
        filters: { type: 'object', description: 'Bərabərlik filterleri { sütun: dəyər }' },
        columns: { type: 'string', description: 'Seçiləcək sütunlar (default *)' },
        order:   { type: 'string', description: 'Sıralama sahəsi' },
        limit:   { type: 'number', description: 'Maksimum nəticə sayı' },
      },
      required: ['table'],
    },
  },
  {
    name: 'db_update',
    description: 'Mövcud qeydi yenilə',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string' },
        id:    { type: 'number' },
        data:  { type: 'object' },
      },
      required: ['table', 'id', 'data'],
    },
  },
  {
    name: 'db_delete',
    description: 'Test qeydini sil (yalnız bu sessiya ərzində yaradılan qeydlər)',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string' },
        id:    { type: 'number' },
      },
      required: ['table', 'id'],
    },
  },
  {
    name: 'verify_payroll',
    description:
      'Azərbaycan vergi qanununa görə əmək haqqı hesablamasını müstəqil yoxla. ' +
      'Tətbiqin hesabladığı dəyərləri bu funksiyayla müqayisə et.',
    input_schema: {
      type: 'object' as const,
      properties: {
        gross:             { type: 'number', description: 'Ümumi (brüt) maaş AZN' },
        is_main_workplace: { type: 'boolean', description: 'Əsas iş yeri?' },
        sector:            { type: 'string', enum: ['private_non_oil', 'oil_gas_public'], description: 'private_non_oil = qeyri-neft özəl; oil_gas_public = neft/dövlət' },
      },
      required: ['gross', 'is_main_workplace', 'sector'],
    },
  },
  {
    name: 'verify_simplified_tax',
    description: 'Sadələşdirilmiş vergi hesablamasını müstəqil yoxla',
    input_schema: {
      type: 'object' as const,
      properties: {
        collected_revenue: { type: 'number', description: 'Ödənilmiş fakturalar üzrə yığılmış gəlir' },
        business_type:     { type: 'string', enum: ['general', 'trade_food'], description: 'general=2%, trade_food=8%' },
        has_relief:        { type: 'boolean', description: '75% güzəşt tətbiq edilir? (3+ işçi şərti)' },
      },
      required: ['collected_revenue', 'business_type', 'has_relief'],
    },
  },
  {
    name: 'summarise_financials',
    description: 'Cədvəllərdəki məlumatları oxuyub maliyyə xülasəsi hesabla',
    input_schema: {
      type: 'object' as const,
      properties: {
        from_date: { type: 'string', description: 'YYYY-MM-DD' },
        to_date:   { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['from_date', 'to_date'],
    },
  },
  {
    name: 'save_report',
    description: 'Yekun test hesabatını scripts/ qovluğunda Markdown faylında saxla',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'Tam hesabat mətni (Azərbaycan dilində, Markdown)' },
      },
      required: ['content'],
    },
  },
]

// ── Tool executor ─────────────────────────────────────────────────────────────

async function execTool(name: string, raw: Record<string, unknown>): Promise<unknown> {
  switch (name) {

    // ── INSERT ──────────────────────────────────────────────────────────────
    case 'db_insert': {
      const { table, data } = raw as { table: string; data: Record<string, unknown> }
      const { data: row, error } = await supabase.from(table).insert(data).select().single()
      if (error) return { error: error.message, code: error.code, hint: error.hint }
      if (row && typeof row === 'object' && 'id' in row) {
        ;(created[table] ??= []).push((row as { id: number }).id)
      }
      return { ok: true, row }
    }

    // ── SELECT ──────────────────────────────────────────────────────────────
    case 'db_select': {
      const { table, filters, columns, order, limit } = raw as {
        table: string; filters?: Record<string, unknown>
        columns?: string; order?: string; limit?: number
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase.from(table).select(columns ?? '*')
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          if (v !== null && v !== undefined) q = q.eq(k, v)
        }
      }
      if (order) q = q.order(order, { ascending: false })
      if (limit) q = q.limit(limit)
      const { data, error } = await q
      if (error) return { error: error.message }
      return { rows: data ?? [], count: (data ?? []).length }
    }

    // ── UPDATE ──────────────────────────────────────────────────────────────
    case 'db_update': {
      const { table, id, data } = raw as { table: string; id: number; data: Record<string, unknown> }
      const { data: row, error } = await supabase.from(table).update(data).eq('id', id).select().single()
      return error ? { error: error.message } : { ok: true, row }
    }

    // ── DELETE ──────────────────────────────────────────────────────────────
    case 'db_delete': {
      const { table, id } = raw as { table: string; id: number }
      const { error } = await supabase.from(table).delete().eq('id', id)
      return error ? { error: error.message } : { ok: true }
    }

    // ── PAYROLL VERIFY ──────────────────────────────────────────────────────
    case 'verify_payroll': {
      const { gross, is_main_workplace, sector } = raw as {
        gross: number; is_main_workplace: boolean; sector: 'private_non_oil' | 'oil_gas_public'
      }
      const result = calcAzPayroll(gross, is_main_workplace, sector)
      return {
        ...result,
        note: 'Bu dəyərlər müstəqil hesablanıb. Tətbiqin nəticəsiylə müqayisə et.',
      }
    }

    // ── TAX VERIFY ──────────────────────────────────────────────────────────
    case 'verify_simplified_tax': {
      const { collected_revenue, business_type, has_relief } = raw as {
        collected_revenue: number; business_type: string; has_relief: boolean
      }
      const rate     = business_type === 'trade_food' ? 0.08 : 0.02
      const grossTax = r2(collected_revenue * rate)
      const payable  = has_relief ? r2(grossTax * 0.25) : grossTax
      return {
        collected_revenue,
        rate_percent:  rate * 100,
        gross_tax:     grossTax,
        relief_75pct:  has_relief,
        payable_tax:   payable,
        formula:       `${collected_revenue} × ${rate * 100}%${has_relief ? ' × 25% (75% güzəşt)' : ''} = ${payable} AZN`,
        vat_threshold: 500_000,
        vat_note:      collected_revenue >= 500_000
          ? '⚠️ ƏDV qeydiyyatı tələb edilir!'
          : `Hələ ƏDV həddindən ${r2(500_000 - collected_revenue).toLocaleString()} AZN uzaqdır`,
      }
    }

    // ── FINANCIAL SUMMARY ───────────────────────────────────────────────────
    case 'summarise_financials': {
      const { from_date, to_date } = raw as { from_date: string; to_date: string }

      const [invRes, expRes] = await Promise.all([
        supabase.from('invoices').select('amount, status').gte('date', from_date).lte('date', to_date),
        supabase.from('expenses').select('amount').gte('date', from_date).lte('date', to_date),
      ])

      const invoices = (invRes.data ?? []) as Array<{ amount: number; status: string }>
      const expenses = (expRes.data ?? []) as Array<{ amount: number }>

      const totalInvoiced = r2(invoices.reduce((s, i) => s + Number(i.amount), 0))
      const cashCollected = r2(invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount), 0))
      const unpaidTotal   = r2(invoices.filter(i => i.status === 'Unpaid').reduce((s, i) => s + Number(i.amount), 0))
      const totalExpenses = r2(expenses.reduce((s, e) => s + Number(e.amount), 0))
      const grossProfit   = r2(cashCollected - totalExpenses)

      return {
        period:          `${from_date} – ${to_date}`,
        total_invoiced:  totalInvoiced,
        cash_collected:  cashCollected,
        unpaid_invoices: unpaidTotal,
        total_expenses:  totalExpenses,
        gross_profit:    grossProfit,
        invoice_count:   invoices.length,
        paid_count:      invoices.filter(i => i.status === 'Paid').length,
        unpaid_count:    invoices.filter(i => i.status === 'Unpaid').length,
      }
    }

    // ── SAVE REPORT ─────────────────────────────────────────────────────────
    case 'save_report': {
      const { content } = raw as { content?: string }
      if (!content) return { error: '"content" sahəsi tələb olunur — hesabat mətni boş ola bilməz' }
      const ts       = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
      const filename = `scripts/aytac-hesabat-${ts}.md`
      fs.mkdirSync('scripts', { recursive: true })
      fs.writeFileSync(filename, content, 'utf-8')
      console.log(`\n📄  Hesabat saxlanıldı: ${filename}`)
      return { ok: true, saved_to: filename }
    }

    default:
      return { error: `Naməlum alət: ${name}` }
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

const now       = new Date()
const todayAz   = now.toLocaleDateString('az-AZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
const monthAz   = now.toLocaleString('az-AZ', { month: 'long', year: 'numeric' })
const mStart    = monthStartStr()
const mEnd      = dueDateStr(30)

const SYSTEM_PROMPT = `
Sen Aytaç Əliyevasən — Bakıda fəaliyyət göstərən "Kənar Şirkət MMC"nin baş mühasibisin.
15 il mühasibat təcrübən var, Azərbaycanın vergi qanunvericiliyini mükəmməl bilirsən.
AzFinance maliyyə proqramını qiymətləndirmək üçün dəvət olunmuşsan.

BUGÜNKÜ TARİX: ${todayAz}
BU AY: ${monthAz}
TEST RUN ID: ${TEST_RUN_ID}

ƏSAS QAYDA: Hər test qeydinin description/notes/client sahəsinin sonuna " [${TEST_RUN_ID}]" əlavə et.
Bu, sınaq məlumatlarını real məlumatlardan ayırd etmək üçün lazımdır.

════════════════════════════════════════════════════
AZƏRBAYCan VERGİ BİLİKLƏRİ (istinad)
════════════════════════════════════════════════════
Sadələşdirilmiş vergi:
  • Ümumi gəlirin 2%-i (ticarət/qida: 8%)
  • 75% güzəşt: 3+ işçi, uyğun fəaliyyət növü
  • Ödəniş: hər rüb (rüb bitimindən sonra 20-ci gün)

Mənfəət vergisi:
  • Xalis mənfəətin 20%-i
  • İllik bəyannamə: 31 mart

ƏDV:
  • Dərəcə: 18%
  • Qeydiyyat həddi: 500,000 AZN illik dövriyyə

Əmək haqqı vergiləri (özəl sektor, əsas iş yeri):
  • PGV (işçi): taxable = gross - 200 AZN güzəşt
    - 8,000 AZN-ə qədər: 14%
    - 8,000 AZN-dən yuxarı hissə: 25%
  • Sosial sığorta (işçi): 3%
  • Tibbi sığorta (işçi): 0.5%
  • İşsizlik sığortası (işçi): 0.5%
  • Sosial sığorta (işəgötürən): 22%
  • Tibbi sığorta (işəgötürən): 0.5%
  • İşsizlik (işəgötürən): 0.5%

════════════════════════════════════════════════════
SSENARI 1 — Aylıq Faktura Dövrü
════════════════════════════════════════════════════
Real Bakı şirkətləri üçün 3 faktura yarat (uyğun Azərbaycan şirkət adları,
real ticari məbləğlər — 5,000–50,000 AZN arası):

  • Faktura 1: ~15,000 AZN → Paid et
  • Faktura 2: ~28,000 AZN → Paid et
  • Faktura 3: ~12,000 AZN → Unpaid saxla

Yoxla:
  ✓ Yaradılmış fakturalar DB-də görünürmü?
  ✓ Status yeniləmələri işləyirmi?
  ✓ summarise_financials ilə cash collected = Faktura1 + Faktura2 olduğunu yoxla
  ✓ Unpaid məbləğ düzgündürmü?

════════════════════════════════════════════════════
SSENARI 2 — Xərc İdarəetməsi
════════════════════════════════════════════════════
Bu ay üçün 3 xərc yarat:

  • Ofis icarəsi: 3,500 AZN, Office kateqoriyası, aylıq dövri
  • Elektrik + internet: 450 AZN, Utilities
  • Maaş xərci: 8,200 AZN, Salaries

Yoxla:
  ✓ Xərclər DB-də görünürmü?
  ✓ Cəmi xərcləri hesabla: 3500 + 450 + 8200 = 12,150 AZN
  ✓ summarise_financials ilə ümumi xərclər məntiqlidir?
  ✓ Xalis mənfəət = Cash Collected − Cəmi Xərclər

════════════════════════════════════════════════════
SSENARI 3 — Vergi Yoxlaması
════════════════════════════════════════════════════
  ✓ Vergi ayarlarını oxu (tax_settings cədvəli)
  ✓ verify_simplified_tax aləti ilə hesabla:
    - Gəlir: Ssenari 1-dəki cash collected
    - Güzəşt varmı? (ayarlara bax)
  ✓ ƏDV həddi: illik gəlir 500,000 AZN-i keçibmi?
  ✓ Hesablamalar tətbiqin göstərdiyi ilə uyğundurmu?

════════════════════════════════════════════════════
SSENARI 4 — Əmək Haqqı Yoxlaması
════════════════════════════════════════════════════
  ✓ employees cədvəlindəki işçiləri gətir
  ✓ Hər aktiv işçi üçün verify_payroll ilə müstəqil hesabla
  ✓ payroll_runs cədvəlindən mövcud runları yoxla
  ✓ payroll_entries cədvəlindən hər işçinin detallı tutulmalarını oxu
    (sütunlar: run_id, employee_id, adjusted_gross, pit, emp_social,
     emp_health, emp_unemployment, net_salary, total_employer_cost)
  ✓ Kənarlaşmalar var? (±1 AZN tolerans)
  ✓ Əsas iş yeri statusu düzgün tətbiq edilib?

════════════════════════════════════════════════════
YEKUN HESABAT
════════════════════════════════════════════════════
Bütün ssenarilər başa çatdıqdan sonra save_report aləti ilə
Azərbaycan dilində ətraflı hesabat yaz.

Aşağıdakı formatı istifadə et:

# AzFinance Test Hesabatı
**Tarix:** [bugünkü tarix]
**Mühasib:** Aytaç Əliyeva — Kənar Şirkət MMC
**Test ID:** ${TEST_RUN_ID}

---

## Ssenari 1: Aylıq Faktura Dövrü
**✅ Keçdi:** ...
**❌ Uğursuz oldu:** ...
**⚠️ Şübhəli görünür:** ...
**💡 Mühasib tövsiyəsi:** ...

## Ssenari 2: Xərc İdarəetməsi
...

## Ssenari 3: Vergi Yoxlaması
...

## Ssenari 4: Əmək Haqqı Yoxlaması
...

---

## Ümumi Maliyyə Xülasəsi
| Göstərici | Dəyər |
|-----------|-------|
| Ümumi gəlir | ... |
| Yığılmış nağd | ... |
| Ödənilməmiş | ... |
| Cəmi xərclər | ... |
| Xalis mənfəət | ... |
| Gözlənilən vergi | ... |

## Ümumi Qiymətləndirmə
[5-7 cümlə — tətbiqin ümumi keyfiyyəti haqqında peşəkar rəy]

## Prioritet Tövsiyələr
1. ...
2. ...
3. ...
`.trim()

// ── Agent runner ──────────────────────────────────────────────────────────────

async function runAgent() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  🧮  Aytaç — AzFinance Test Agenti                          ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`\n📋  Test Run ID : ${TEST_RUN_ID}`)
  console.log(`📅  Tarix       : ${todayAz}`)
  console.log(`🔑  Auth        : ${SERVICE_KEY ? 'Service Role Key ✓' : 'Anon Key (RLS aktiv)'}`)
  console.log(`🗑️   Cleanup     : ${NO_CLEANUP ? 'Söndürülüb (--no-cleanup)' : 'Aktiv'}`)
  console.log('\n' + '─'.repeat(64))

  // Authenticate if using anon key
  if (!SERVICE_KEY && TEST_EMAIL && TEST_PASSWORD) {
    process.stdout.write('\n🔐  İstifadəçi olaraq daxil olunur...')
    const { error } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD })
    if (error) {
      console.error(`\n❌  Giriş uğursuz: ${error.message}`)
      process.exit(1)
    }
    console.log(` ✓ (${TEST_EMAIL})`)
  }

  const messages: Anthropic.MessageParam[] = [
    {
      role:    'user',
      content: `Salam Aytaç! AzFinance-i test etməyin vaxtı gəldi.

Test etiketi: ${TEST_RUN_ID}
Bu etiket hər test qeydinə əlavə edilməlidir (notes/description/client sahəsinin sonuna).

Hazırki tarix: ${todayAz}
Bu ay: ${monthAz}
Ay başlanğıcı: ${mStart}

Zəhmət olmasa bütün 4 ssenaridən ardıcıl keç, hər birini diqqətlə yoxla,
sonra Azərbaycan dilində ətraflı hesabat hazırlayıb save_report ilə saxla.`,
    },
  ]

  const MAX_ITER = 50
  let   iteration = 0

  while (iteration < MAX_ITER) {
    iteration++

    const response = await anthropic.messages.create({
      model:      'claude-opus-4-7',
      max_tokens: 8192,
      system:     SYSTEM_PROMPT,
      tools:      TOOLS,
      messages,
    })

    // Show any narrative text from the agent
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        console.log('\n' + block.text.trim())
      }
    }

    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'end_turn') {
      console.log('\n\n✅  Agent bütün ssenarilər tamamladı.')
      break
    }

    // Execute tool calls
    const results: Anthropic.ToolResultBlockParam[] = []

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue

      const inputPreview = JSON.stringify(block.input).slice(0, 100)
      process.stdout.write(`\n  🔧  ${block.name}(${inputPreview}${inputPreview.length >= 100 ? '…' : ''})`)

      const result  = await execTool(block.name, block.input as Record<string, unknown>)
      const preview = JSON.stringify(result).slice(0, 150)
      process.stdout.write(`\n      → ${preview}${preview.length >= 150 ? '…' : ''}\n`)

      results.push({
        type:        'tool_result',
        tool_use_id: block.id,
        content:     JSON.stringify(result),
      })
    }

    if (results.length === 0) break
    messages.push({ role: 'user', content: results })
  }

  if (iteration >= MAX_ITER) {
    console.warn(`\n⚠️  Maksimum iterasiya həddine çatıldı (${MAX_ITER})`)
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function cleanup() {
  const totalCreated = Object.values(created).flat().length

  if (NO_CLEANUP) {
    console.log('\n' + '─'.repeat(64))
    console.log('⚠️   --no-cleanup: test qeydləri saxlanıldı:')
    for (const [table, ids] of Object.entries(created)) {
      if (ids.length) console.log(`     ${table}: ID-lər ${ids.join(', ')}`)
    }
    return
  }

  if (totalCreated === 0) {
    console.log('\n ℹ️  Silinəcək test qeydi yoxdur.')
    return
  }

  console.log('\n' + '─'.repeat(64))
  console.log('🧹  Test qeydləri silinir...')

  for (const [table, ids] of Object.entries(created)) {
    let deleted = 0
    for (const id of ids) {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (!error) deleted++
    }
    if (deleted) console.log(`   ✓  ${table}: ${deleted}/${ids.length} qeyd silindi`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  try {
    await runAgent()
  } catch (err) {
    console.error('\n❌  Gözlənilməz xəta:', err)
  } finally {
    await cleanup()
    console.log('\n' + '─'.repeat(64) + '\n')
  }
}

main()
