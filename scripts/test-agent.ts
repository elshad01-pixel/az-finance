#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Aytaç — AzFinance ERP Professional AI Test Agent              ║
 * ║  Senior ERP Auditor · Azerbaijan Accounting Specialist          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * .env.local tələbləri:
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...   ← Supabase → Settings → API
 *
 * İstifadə:
 *   npx tsx scripts/test-agent.ts
 *   npx tsx scripts/test-agent.ts --no-cleanup
 */

import dotenv from 'dotenv'
import path   from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

// ── Guards ────────────────────────────────────────────────────────────────────

const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY       = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const TEST_EMAIL     = process.env.TEST_USER_EMAIL
const TEST_PASSWORD  = process.env.TEST_USER_PASSWORD
const NO_CLEANUP     = process.argv.includes('--no-cleanup')

if (!ANTHROPIC_KEY)                  { console.error('❌ ANTHROPIC_API_KEY not in .env.local');  process.exit(1) }
if (!SUPABASE_URL || (!SERVICE_KEY && !ANON_KEY)) { console.error('❌ Supabase credentials missing'); process.exit(1) }
if (!SERVICE_KEY && !TEST_EMAIL)     { console.warn('⚠️  No SERVICE_KEY — insert ops may fail due to RLS') }

// ── Clients ───────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })
const db        = createClient(SUPABASE_URL!, SERVICE_KEY ?? ANON_KEY!)

const RUN_ID = `aytac_${Date.now()}`

// ── Scoring state ─────────────────────────────────────────────────────────────

type Status = 'PASS' | 'WARN' | 'FAIL' | 'CRITICAL_FAIL'
interface Result { phase: string; test: string; status: Status; message: string; details?: string }

const log: Result[]                       = []
const cleanup: Map<string, (string|number)[]> = new Map()
const SCORE: Record<Status, number>       = { PASS: 2, WARN: 1, FAIL: 0, CRITICAL_FAIL: -1 }
const ICON:  Record<Status, string>       = { PASS: '✅', WARN: '⚠️', FAIL: '❌', CRITICAL_FAIL: '🚨' }

// ── Azerbaijan payroll reference (matches user spec exactly) ──────────────────

function r2(n: number) { return Math.round(n * 100) / 100 }

function refPayroll(gross: number) {
  // PIT: 14% on ≤8,000 AZN; 25% on excess
  const pit         = gross <= 8_000
    ? r2(gross * 0.14)
    : r2(8_000 * 0.14 + (gross - 8_000) * 0.25)

  const empSocial   = r2(gross * 0.03)    // Employee SI  3%
  const emplrSocial = r2(gross * 0.22)    // Employer SI 22%
  const empHealth   = r2(gross * 0.005)   // Employee HI  0.5%
  const emplrHealth = r2(gross * 0.005)   // Employer HI  0.5%
  const empUnemp    = r2(gross * 0.005)   // Unemployment 0.5% (employee)

  const totalDed  = r2(pit + empSocial + empHealth + empUnemp)
  const net       = r2(gross - totalDed)
  const totalCost = r2(gross + emplrSocial + emplrHealth)

  return { gross, pit, empSocial, emplrSocial, empHealth, emplrHealth, empUnemp, totalDed, net, totalCost }
}

// ── Simplified tax reference ──────────────────────────────────────────────────

function refSimplifiedTax(revenue: number, type: 'general' | 'trade_food', relief: boolean) {
  const rate  = type === 'trade_food' ? 0.08 : 0.02
  const gross = r2(revenue * rate)
  const pay   = relief ? r2(gross * 0.25) : gross
  return {
    rate_pct: rate * 100, gross_tax: gross, payable: pay,
    formula: `${revenue} × ${rate * 100}%${relief ? ' × 25% güzəşt' : ''} = ${pay} AZN`,
    vat_status: revenue >= 200_000
      ? '⚠️ ƏDV qeydiyyatı tələb olunur (200,000 AZN hədd keçildi)'
      : `ƏDV həddindən ${r2(200_000 - revenue).toLocaleString()} AZN aşağıdır`,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── System prompt ─────────────────────────────────────────────────────────────

const nowAz     = new Date().toLocaleDateString('az-AZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
const monthAz   = new Date().toLocaleString('az-AZ', { month: 'long', year: 'numeric' })

const SYSTEM = `
You are Aytaç, a senior ERP auditor and certified Azerbaijan accounting specialist with 15 years
of experience auditing enterprise financial systems for compliance with Azerbaijani regulations.

You are auditing AzFinance — a Next.js 15 + Supabase ERP application used by Azerbaijani SMEs.

TODAY: ${nowAz}
MONTH: ${monthAz}
RUN ID: ${RUN_ID}  ← stamp on every test record you create

══════════════════════════════════════════════════════
AZERBAIJAN TAX & ACCOUNTING STANDARDS
══════════════════════════════════════════════════════

VAT (ƏDV):
  Rate: 18% | Threshold: 200,000 AZN/year | Filing: by 20th of next month

Corporate Income Tax (Mənfəət Vergisi):
  Rate: 20% net profit | Advance payments: quarterly by 15th

Personal Income Tax (Gəlir Vergisi):
  ≤8,000 AZN/month → 14%  |  >8,000 AZN → 14% on 8,000 + 25% on excess
  Example (9,000 AZN gross): 8,000×0.14 + 1,000×0.25 = 1,120 + 250 = 1,370 AZN PIT

Social Insurance (Sosial Sığorta):
  Employer: 22%  |  Employee: 3%  (no ceiling applied in base calculation)
  Example (9,000 AZN): Employer 1,980 AZN | Employee 270 AZN

Health Insurance (Tibbi Sığorta): 0.5% employer + 0.5% employee
  Example (9,000 AZN): 45 AZN each

Unemployment (İşsizlik): 0.5% employee only
  Example (9,000 AZN): 45 AZN

Net Pay (9,000 AZN gross):
  9,000 − PIT(1,370) − SI(270) − HI(45) − UI(45) = 7,270 AZN

ERP Workflows:
  Procure-to-Pay:  PR → PO → GR (Goods Receipt) → Expense (accrual) → Payment
  Order-to-Cash:   SO → Delivery → FIFO Stock OUT → Invoice (auto) → Receipt
  Inventory:       FIFO costing, Partiya (batch/lot) tracking for controlled goods
  Payroll:         Gross → deductions → net → journal entry (accrual basis)
  Gross Margin:    Revenue − COGS, where COGS = FIFO unit cost × delivered qty

══════════════════════════════════════════════════════
YOUR AUDIT MISSION — 7 PHASES
══════════════════════════════════════════════════════

Run all 7 phases in sequence. For EVERY individual test call report_test.
After all phases, write a comprehensive bilingual report with save_report.

PHASE 1 — Procurement (Satınalma)
  □ purchase_requests table exists and has records
  □ purchase_orders created from approved PRs
  □ goods_receipts recorded against POs
  □ Confirmed GR auto-creates expense (accrual principle)
  □ warehouse_stock updated after GR

PHASE 2 — Warehouse (Anbar)
  □ products table with SKU, name, stock_qty
  □ product_batches created from GR (partiya tracking)
  □ Batch has unit_cost (FIFO basis)
  □ stock_qty on product matches sum of active batch quantities
  □ Consumption log exists after delivery confirmation

PHASE 3 — Sales (Satış)
  □ sales_orders table with SO number, client, items, status
  □ deliveries created from confirmed SOs
  □ Delivery confirmation deducts stock (FIFO)
  □ Invoice auto-created from confirmed delivery
  □ cogs_amount populated in delivery record

PHASE 4 — Accounting (Mühasibat)
  □ Invoice VAT at exactly 18% (vat_amount = subtotal × 0.18)
  □ P&L revenue = sum of non-Draft invoices
  □ Expense categorization using defined categories
  □ COGS in deliveries matches FIFO cost
  □ Delivery revenue > 0 for confirmed deliveries

PHASE 5 — Payroll (Əmək haqqı)
  □ employees / payroll_runs / payroll_entries tables exist
  □ PIT calculated correctly per Azerbaijan law
  □ Social insurance (employer + employee) correct
  □ Health insurance 0.5% each
  □ Unemployment 0.5% employee
  □ Net salary = gross − (PIT + empSI + empHI + UI)

PHASE 6 — Reports (Hesabatlar)
  □ Gross Margin Report data available (confirmed deliveries)
  □ Margin % = (Revenue − COGS) / Revenue × 100
  □ P&L period totals consistent with raw table data
  □ Products with cogs=0 identified (potential issue)

PHASE 7 — Tax Compliance Audit (Vergi Auditi)
  □ VAT threshold monitor (check if total invoiced ≥ 200,000 AZN)
  □ Invoice VAT field populated for all non-Draft invoices
  □ Payroll deductions match Azerbaijan law exactly
  □ Expense categories cover all required tax deductibles
  □ Tax settings configured (tax_settings table)

SCORING:
  PASS          +2 pts — fully correct
  WARN          +1 pt  — works but minor gap or best-practice issue
  FAIL           0 pts — broken or missing
  CRITICAL_FAIL −1 pt  — wrong tax, wrong COGS, data integrity failure
`.trim()

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'db_query',
    description: 'Query any Supabase table with optional filters, ordering, and column selection.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table:   { type: 'string', description: 'Table name' },
        columns: { type: 'string', description: 'Columns to select (default *)' },
        filters: { type: 'object', description: 'Equality filters { col: val }', additionalProperties: true },
        order:   { type: 'string', description: 'Order-by column' },
        asc:     { type: 'boolean', description: 'Ascending sort (default false)' },
        limit:   { type: 'number', description: 'Row limit (default 50)' },
      },
      required: ['table'],
    },
  },
  {
    name: 'db_insert',
    description: 'Insert a test record. Stamp RUN_ID into notes/description so cleanup works.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string' },
        data:  { type: 'object', additionalProperties: true },
      },
      required: ['table', 'data'],
    },
  },
  {
    name: 'db_update',
    description: 'Update a record by ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string' },
        id:    {},
        data:  { type: 'object', additionalProperties: true },
      },
      required: ['table', 'id', 'data'],
    },
  },
  {
    name: 'call_rpc',
    description: 'Call a Supabase/PostgreSQL RPC function (e.g. confirm_delivery, confirm_goods_receipt).',
    input_schema: {
      type: 'object' as const,
      properties: {
        fn:     { type: 'string', description: 'Function name' },
        params: { type: 'object', additionalProperties: true },
      },
      required: ['fn'],
    },
  },
  {
    name: 'verify_payroll',
    description: 'Compute reference payroll deductions per Azerbaijan law for comparison with app output.',
    input_schema: {
      type: 'object' as const,
      properties: {
        gross: { type: 'number', description: 'Gross salary in AZN' },
      },
      required: ['gross'],
    },
  },
  {
    name: 'verify_tax',
    description: 'Compute simplified tax and VAT threshold status for a given revenue figure.',
    input_schema: {
      type: 'object' as const,
      properties: {
        revenue:      { type: 'number', description: 'Collected revenue AZN' },
        business_type:{ type: 'string', enum: ['general', 'trade_food'] },
        has_relief:   { type: 'boolean', description: '75% relief applies?' },
      },
      required: ['revenue', 'business_type', 'has_relief'],
    },
  },
  {
    name: 'report_test',
    description: 'Record a single test result. Call this after every individual test check.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phase:   { type: 'string', description: 'E.g. "Phase 1: Procurement"' },
        test:    { type: 'string', description: 'Short test name' },
        status:  { type: 'string', enum: ['PASS', 'WARN', 'FAIL', 'CRITICAL_FAIL'] },
        message: { type: 'string', description: 'One-sentence finding' },
        details: { type: 'string', description: 'Evidence: numbers, row counts, discrepancies' },
      },
      required: ['phase', 'test', 'status', 'message'],
    },
  },
  {
    name: 'save_report',
    description: 'Generate and save the final audit report markdown. Call once after all 7 phases.',
    input_schema: {
      type: 'object' as const,
      properties: {
        executive_summary:  { type: 'string', description: '3-5 paragraph bilingual executive summary' },
        critical_findings:  { type: 'string', description: 'Bulleted list of critical/fail items' },
        recommendations:    { type: 'string', description: 'Numbered priority recommendations' },
        compliance_verdict: { type: 'string', description: 'Final compliance verdict sentence' },
      },
      required: ['executive_summary', 'recommendations', 'compliance_verdict'],
    },
  },
]

// ── Tool executor ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exec(name: string, raw: Record<string, any>): Promise<unknown> {
  switch (name) {

    case 'db_query': {
      const { table, columns = '*', filters, order, asc = false, limit = 50 } = raw
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from(table).select(columns)
      if (filters) for (const [k, v] of Object.entries(filters)) q = q.eq(k, v)
      if (order)   q = q.order(order, { ascending: asc })
      q = q.limit(limit)
      const { data, error } = await q
      if (error) return { error: error.message, table }
      return { count: (data ?? []).length, rows: data ?? [] }
    }

    case 'db_insert': {
      const { table, data } = raw
      const { data: row, error } = await db.from(table).insert(data).select().single()
      if (error) return { error: error.message, hint: error.hint }
      const id = (row as Record<string, unknown>)?.id
      if (id != null) {
        if (!cleanup.has(table)) cleanup.set(table, [])
        cleanup.get(table)!.push(id as string | number)
      }
      return { ok: true, row }
    }

    case 'db_update': {
      const { table, id, data } = raw
      const { data: row, error } = await db.from(table).update(data).eq('id', id).select().single()
      return error ? { error: error.message } : { ok: true, row }
    }

    case 'call_rpc': {
      const { fn, params = {} } = raw
      const { data, error } = await db.rpc(fn, params)
      return error ? { error: error.message } : { data }
    }

    case 'verify_payroll': {
      const result = refPayroll(Number(raw.gross))
      const checks = raw.gross === 9000 ? {
        pit_expected:  '1,370 AZN (8,000×14% + 1,000×25%)',
        pit_actual:    `${result.pit} AZN`,
        net_expected:  '7,270 AZN',
        net_actual:    `${result.net} AZN`,
        match:         result.pit === 1370 && result.net === 7270,
      } : undefined
      return { ...result, checks }
    }

    case 'verify_tax': {
      return refSimplifiedTax(Number(raw.revenue), raw.business_type, Boolean(raw.has_relief))
    }

    case 'report_test': {
      const r = raw as Result
      log.push(r)
      const pts = SCORE[r.status]
      console.log(`  ${ICON[r.status]} [${r.status.padEnd(13)}] ${r.test}   (${pts >= 0 ? '+' : ''}${pts}pts)`)
      if (r.details) console.log(`                    ${String(r.details).slice(0, 110)}`)
      return { recorded: true }
    }

    case 'save_report': {
      const { executive_summary, critical_findings = '', recommendations, compliance_verdict } = raw
      const filename = buildReport(executive_summary, critical_findings, recommendations, compliance_verdict)
      return { ok: true, filename }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ── Report builder ────────────────────────────────────────────────────────────

function buildReport(summary: string, critical: string, recs: string, verdict: string): string {
  const total    = log.reduce((s, r) => s + SCORE[r.status], 0)
  const maxPts   = log.length * 2
  const pct      = maxPts > 0 ? Math.round((total / maxPts) * 100) : 0
  const grade    = pct >= 90 ? 'A' : pct >= 75 ? 'B+' : pct >= 60 ? 'B' : pct >= 45 ? 'C' : 'D'

  const counts = { PASS: 0, WARN: 0, FAIL: 0, CRITICAL_FAIL: 0 } as Record<Status, number>
  log.forEach(r => counts[r.status]++)

  const byPhase = new Map<string, Result[]>()
  log.forEach(r => { if (!byPhase.has(r.phase)) byPhase.set(r.phase, []); byPhase.get(r.phase)!.push(r) })

  const now    = new Date()
  const dateFmt = now.toLocaleDateString('az-AZ', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeFmt = now.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })

  let md = `# 🏛️ AzFinance ERP — Audit Hesabatı\n\n`
  md += `> **Auditor:** Aytaç — Baş ERP Auditor, Azərbaycan Mühasibatlığı Mütəxəssisi  \n`
  md += `> **Tarix:** ${dateFmt}, saat ${timeFmt}  \n`
  md += `> **Sistem:** AzFinance ERP (Next.js 15 + Supabase)  \n`
  md += `> **Run ID:** \`${RUN_ID}\`  \n`
  md += `> **Standartlar:** MNAS · Azərbaycan Vergi Məcəlləsi · IFRS\n\n`
  md += `---\n\n`

  // Score dashboard
  md += `## 📊 Audit Nəticəsi\n\n`
  md += `| Göstərici | Nəticə |\n|:---|:---|\n`
  md += `| 🏆 Ümumi Xal | **${total} / ${maxPts} (${pct}%)** |\n`
  md += `| 🎓 Qiymət | **${grade}** |\n`
  md += `| 📝 Test Sayı | ${log.length} |\n`
  md += `| ✅ PASS | ${counts.PASS} |\n`
  md += `| ⚠️ WARN | ${counts.WARN} |\n`
  md += `| ❌ FAIL | ${counts.FAIL} |\n`
  md += `| 🚨 CRITICAL_FAIL | ${counts.CRITICAL_FAIL} |\n\n`

  // Verdict + summary
  md += `## ⚖️ Uyğunluq Hökmü\n\n${verdict}\n\n`
  md += `## 📋 İcra Xülasəsi\n\n${summary}\n\n`

  if (critical.trim()) {
    md += `## 🚨 Kritik Tapıntılar\n\n${critical}\n\n`
  }

  // Phase tables
  md += `## 📁 Faza Nəticələri\n\n`
  for (const [phase, phaseResults] of byPhase) {
    const pts = phaseResults.reduce((s, r) => s + SCORE[r.status], 0)
    const max = phaseResults.length * 2
    const pp  = max > 0 ? Math.round((pts / max) * 100) : 0
    md += `### ${phase} — ${pts}/${max} xal (${pp}%)\n\n`
    md += `| | Test | Tapıntı |\n|:---|:---|:---|\n`
    phaseResults.forEach(r => {
      md += `| ${ICON[r.status]} | **${r.test}** | ${r.message} |\n`
    })
    const detailed = phaseResults.filter(r => r.details)
    if (detailed.length) {
      md += '\n'
      detailed.forEach(r => { md += `> **${r.test}:** ${r.details}\n\n` })
    }
    md += '\n'
  }

  // Recommendations
  md += `## 💡 Prioritet Tövsiyələr\n\n${recs}\n\n`
  md += `---\n\n`
  md += `*Bu hesabat **Aytaç** AI Audit Agent tərəfindən avtomatik olaraq hazırlanmışdır.*  \n`
  md += `*AzFinance ERP · ${dateFmt} · claude-sonnet-4-6*\n`

  const ts       = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
  const filename = `scripts/aytac-hesabat-${ts}.md`
  fs.mkdirSync('scripts', { recursive: true })
  fs.writeFileSync(filename, md, 'utf-8')
  console.log(`\n📄 Hesabat saxlandı: ${filename}`)
  return filename
}

// ── Agent loop ────────────────────────────────────────────────────────────────

async function runAgent() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  🧮  Aytaç — AzFinance ERP Professional Audit Agent         ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`\n   Run ID  : ${RUN_ID}`)
  console.log(`   Tarix   : ${nowAz}`)
  console.log(`   Auth    : ${SERVICE_KEY ? 'Service Role Key ✓' : 'Anon Key (RLS aktiv)'}`)
  console.log(`   Cleanup : ${NO_CLEANUP ? 'Söndürülüb (--no-cleanup)' : 'Aktiv'}\n`)
  console.log('─'.repeat(64))

  // Authenticate if needed
  if (!SERVICE_KEY && TEST_EMAIL && TEST_PASSWORD) {
    process.stdout.write('\n🔐 Daxil olunur...')
    const { error } = await db.auth.signInWithPassword({ email: TEST_EMAIL!, password: TEST_PASSWORD! })
    if (error) { console.error(`\n❌ Giriş xətası: ${error.message}`); process.exit(1) }
    console.log(` ✓ (${TEST_EMAIL})`)
  }

  const userMsg = `
Salam Aytaç! AzFinance ERP-nin tam 7 fazalı auditini aparın.

Run ID: ${RUN_ID}  ← yaratdığınız hər test qeydinə bu etiket əlavə edin
Tarix: ${nowAz}

Hər test üçün db_query ilə real məlumatları sorğulayın, nəticəni report_test ilə qeyd edin.
Vergi hesablamaları üçün verify_payroll / verify_tax alətlərindən istifadə edin.
Bütün 7 faza başa çatdıqdan sonra save_report ilə ətraflı hesabat yazın.

Başlayın — Phase 1: Procurement ilə.
`.trim()

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMsg }]
  let iter = 0

  while (iter++ < 80) {
    const res = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 8192,
      system:     SYSTEM,
      tools:      TOOLS,
      messages,
    })

    // Surface phase headers from agent narrative
    for (const b of res.content) {
      if (b.type === 'text') {
        for (const line of b.text.split('\n')) {
          if (/^#{1,3}\s|Phase \d|Faza \d/i.test(line.trim()) && line.trim().length > 3) {
            console.log(`\n${line.trim()}`)
          }
        }
      }
    }

    messages.push({ role: 'assistant', content: res.content })

    if (res.stop_reason === 'end_turn') {
      console.log('\n✅ Agent bütün fazaları tamamladı.')
      break
    }
    if (res.stop_reason !== 'tool_use') break

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const b of res.content) {
      if (b.type !== 'tool_use') continue
      const preview = JSON.stringify(b.input).slice(0, 90)
      process.stdout.write(`\n  🔧 ${b.name}(${preview}${preview.length >= 90 ? '…' : ''})`)
      const out = await exec(b.name, b.input as Record<string, unknown>)
      const outPrev = JSON.stringify(out).slice(0, 130)
      process.stdout.write(`\n     → ${outPrev}${outPrev.length >= 130 ? '…' : ''}\n`)
      toolResults.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) })
    }
    if (!toolResults.length) break
    messages.push({ role: 'user', content: toolResults })
  }

  // Final score summary
  const total  = log.reduce((s, r) => s + SCORE[r.status], 0)
  const maxPts = log.length * 2
  const pct    = maxPts > 0 ? Math.round((total / maxPts) * 100) : 0
  const counts = { PASS: 0, WARN: 0, FAIL: 0, CRITICAL_FAIL: 0 } as Record<Status, number>
  log.forEach(r => counts[r.status]++)

  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log(`║  Audit Tamamlandı   ${String(total).padStart(3)}/${String(maxPts).padEnd(3)} xal  (${String(pct).padStart(3)}%)               ║`)
  console.log(`║  ✅ ${String(counts.PASS).padStart(2)} PASS  ⚠️ ${String(counts.WARN).padStart(2)} WARN  ❌ ${String(counts.FAIL).padStart(2)} FAIL  🚨 ${String(counts.CRITICAL_FAIL).padStart(2)} CRITICAL  ║`)
  console.log('╚══════════════════════════════════════════════════════════════╝')
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function doCleanup() {
  const total = Array.from(cleanup.values()).flat().length
  if (NO_CLEANUP) {
    if (total) {
      console.log('\n⚠️  --no-cleanup: test qeydləri saxlanıldı:')
      cleanup.forEach((ids, tbl) => ids.length && console.log(`   ${tbl}: ${ids.join(', ')}`))
    }
    return
  }
  if (!total) { console.log('\nℹ️  Silinəcək test qeydi yoxdur.'); return }
  console.log('\n🧹 Test qeydləri silinir...')
  for (const [table, ids] of cleanup) {
    let del = 0
    for (const id of ids) {
      const { error } = await db.from(table).delete().eq('id', id)
      if (!error) del++
    }
    if (del) console.log(`   ✓ ${table}: ${del}/${ids.length} qeyd silindi`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  try {
    await runAgent()
  } catch (e) {
    console.error('\n❌ Agent xətası:', e)
  } finally {
    await doCleanup()
    console.log('\n' + '─'.repeat(64) + '\n')
  }
}

main()
