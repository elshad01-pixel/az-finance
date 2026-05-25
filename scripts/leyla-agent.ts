#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Leyla — AzFinance UX & Functionality Audit Agent              ║
 * ║  Senior Accountant Perspective · Azerbaijani User              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * .env.local tələbləri:
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   TEST_USER_EMAIL=...      ← optional, for login-based auth
 *   TEST_USER_PASSWORD=...   ← optional
 *
 * İstifadə:
 *   npx tsx scripts/leyla-agent.ts
 *   npx tsx scripts/leyla-agent.ts --module invoices
 *   npx tsx scripts/leyla-agent.ts --verbose
 *   LEYLA_BASE_URL=https://az-finance.vercel.app npx tsx scripts/leyla-agent.ts
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
const VERBOSE        = process.argv.includes('--verbose')
const MODULE_FILTER  = (() => {
  const idx = process.argv.indexOf('--module')
  return idx !== -1 ? (process.argv[idx + 1] ?? '').toLowerCase() : null
})()
const BASE_URL = process.env.LEYLA_BASE_URL ?? 'http://localhost:3001'

if (!ANTHROPIC_KEY)                               { console.error('❌ ANTHROPIC_API_KEY not in .env.local'); process.exit(1) }
if (!SUPABASE_URL || (!SERVICE_KEY && !ANON_KEY)) { console.error('❌ Supabase credentials missing');        process.exit(1) }

// ── Clients ───────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

// Service-role client for DB queries and admin session creation
const db = createClient(SUPABASE_URL!, SERVICE_KEY ?? ANON_KEY!)

// Anon client for signing in with test credentials
const anonClient = createClient(SUPABASE_URL!, ANON_KEY ?? SERVICE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const RUN_ID = `leyla_${Date.now()}`

// ── Session cookie ────────────────────────────────────────────────────────────

// @supabase/ssr stores the session as JSON chunks in cookies named:
//   sb-{projectRef}-auth-token       (single cookie if short enough)
//   sb-{projectRef}-auth-token.0 ... (chunked for long sessions)
const PROJECT_REF    = new URL(SUPABASE_URL!).hostname.split('.')[0]
const AUTH_COOKIE    = `sb-${PROJECT_REF}-auth-token`
const COOKIE_CHUNK   = 3180

let sessionCookie = ''   // populated by authenticate()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCookieString(session: Record<string, any>): string {
  const value = JSON.stringify(session)
  if (value.length <= COOKIE_CHUNK) {
    return `${AUTH_COOKIE}=${encodeURIComponent(value)}`
  }
  const parts: string[] = []
  for (let i = 0; i * COOKIE_CHUNK < value.length; i++) {
    parts.push(`${AUTH_COOKIE}.${i}=${encodeURIComponent(value.slice(i * COOKIE_CHUNK, (i + 1) * COOKIE_CHUNK))}`)
  }
  return parts.join('; ')
}

async function authenticate(): Promise<boolean> {
  // ── Option 1: sign in with test credentials ───────────────────────
  if (TEST_EMAIL && TEST_PASSWORD) {
    const { data, error } = await anonClient.auth.signInWithPassword({
      email:    TEST_EMAIL,
      password: TEST_PASSWORD,
    })
    if (!error && data.session) {
      sessionCookie = buildCookieString(data.session)
      console.log(`  ✓ Giriş: ${TEST_EMAIL} (test credentials)`)
      return true
    }
    console.warn(`  ⚠️  Test credentials failed: ${error?.message}`)
  }

  // ── Option 2: admin createSession for the first user ─────────────
  if (SERVICE_KEY) {
    try {
      const { data: list } = await db.auth.admin.listUsers({ perPage: 1 })
      const user = list?.users?.[0]
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (db.auth.admin as any).createSession({ userId: user.id })
        if (!error && data?.session) {
          sessionCookie = buildCookieString(data.session)
          console.log(`  ✓ Admin session: ${user.email}`)
          return true
        }
      }
    } catch {
      // createSession may not exist on older SDK builds — fall through
    }
  }

  console.warn('  ⚠️  Auth failed — protected pages will redirect to /login')
  return false
}

// ── Scoring ───────────────────────────────────────────────────────────────────

type UxScore = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'BROKEN'
type Severity = 'Critical' | 'Medium' | 'Minor' | 'None'

interface UxResult {
  phase:    string
  test:     string
  score:    UxScore
  finding:  string
  expected: string
  severity: Severity
  details?: string
}

const log: UxResult[] = []
let reportSaved = false

const SCORE_PTS:  Record<UxScore, number>  = { EXCELLENT: 3, GOOD: 2, FAIR: 1, POOR: 0, BROKEN: -1 }
const SCORE_ICON: Record<UxScore, string>  = { EXCELLENT: '🌟', GOOD: '✅', FAIR: '⚠️', POOR: '❌', BROKEN: '💀' }
const SEV_ICON:   Record<Severity, string> = { Critical: '🔴', Medium: '🟡', Minor: '🟢', None: '⚪' }

// ── HTML analysis helpers ─────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

interface PageAnalysis {
  status:               number
  ok:                   boolean
  is_authenticated:     boolean   // true = got past login redirect
  redirected_to?:       string
  title:                string
  headings:             string[]
  buttons:              string[]
  labels:               string[]
  nav_items:            string[]  // sidebar/nav link text
  has_az_text:          boolean
  has_en_text:          boolean
  has_manat:            boolean   // ₼ symbol present
  has_az_date_format:   boolean   // DD.MM.YYYY pattern in text
  has_edv_text:         boolean   // ƏDV (AZ VAT term, not "VAT") present
  has_vat_breakdown:    boolean   // VAT/ƏDV shown as separate line item
  has_overdue_highlight:boolean   // overdue invoices/expenses visually flagged
  has_required_marker:  boolean   // asterisk or "required" on form fields
  has_toast_feedback:   boolean   // success/error toast or alert present
  has_stock_indicator:  boolean   // stock level / availability shown
  has_tax_deadline:     boolean   // tax deadline or due date visible
  has_payroll_breakdown:boolean   // PIT / DSMF / işsizlik breakdown visible
  has_delete_confirm:   boolean   // confirmation dialog/modal pattern
  has_loading_ui:       boolean   // spinner/skeleton
  has_empty_state:      boolean   // empty state message
  has_form_errors:      boolean   // inline field error messages
  has_lang_switcher:    boolean   // AZ/EN toggle
  has_trial_warning:    boolean   // trial expiry banner/badge visible
  error_preview:        string
  text_preview:         string
  form_count:           number
  input_count:          number
}

async function analysePage(url: string): Promise<PageAnalysis> {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`
  const ctrl    = new AbortController()
  const timer   = setTimeout(() => ctrl.abort(), 10_000)

  const headers: Record<string, string> = {}
  if (sessionCookie) headers['Cookie'] = sessionCookie

  try {
    const res  = await fetch(fullUrl, { signal: ctrl.signal, redirect: 'follow', headers })
    clearTimeout(timer)
    const html = await res.text()

    const extract = (re: RegExp): string[] =>
      [...html.matchAll(re)].map(m => stripTags(m[1]).trim()).filter(s => s.length > 1)

    const buttons  = extract(/<button[^>]*>([\s\S]*?)<\/button>/gi).slice(0, 35)
    const labels   = extract(/<label[^>]*>([\s\S]*?)<\/label>/gi).slice(0, 25)
    const headings = [
      ...extract(/<h1[^>]*>([\s\S]*?)<\/h1>/gi),
      ...extract(/<h2[^>]*>([\s\S]*?)<\/h2>/gi),
      ...extract(/<h3[^>]*>([\s\S]*?)<\/h3>/gi),
    ].slice(0, 15)

    // Nav items — sidebar links, main nav
    const navItems = [
      ...extract(/<a[^>]*(?:nav|sidebar|menu)[^>]*>([\s\S]*?)<\/a>/gi),
      ...[...html.matchAll(/href="\/[^"]*"[^>]*>([^<]{2,40})</g)].map(m => m[1].trim()),
    ].filter(Boolean).slice(0, 30)

    const titleM   = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const errorM   = html.match(/(?:class|id)="[^"]*(?:error|alert)[^"]*"[^>]*>([\s\S]{0,200}?)</i)
    const finalUrl = res.url !== fullUrl ? res.url : undefined
    const text     = stripTags(html)

    // Is the user actually authenticated? (not redirected to login)
    const isAuth = !res.url.includes('/login') && !res.url.includes('/signin') &&
                   !html.includes('Sign in to your account') && !html.includes('Create your account')

    return {
      status:               res.status,
      ok:                   res.ok,
      is_authenticated:     isAuth,
      redirected_to:        finalUrl,
      title:                titleM ? stripTags(titleM[1]) : '',
      headings,
      buttons,
      labels,
      nav_items:            navItems,
      has_az_text:          /Azərbaycan|Faktura|Xərc|Müştəri|Hesabat|Anbar|Satış|Əmək|Ödəniş|Maaş/i.test(html),
      has_en_text:          /Dashboard|Invoice|Expense|Report|Payroll|Settings|Warehouse/i.test(html),
      has_manat:            html.includes('₼'),
      has_az_date_format:   /\d{2}\.\d{2}\.\d{4}/.test(text),
      has_edv_text:         /ƏDV/i.test(html),
      has_vat_breakdown:    /(?:ƏDV|VAT|vat)[\s\S]{0,40}(?:₼|\d)|(?:subtotal|cəm|ara cəm)[\s\S]{0,60}(?:ƏDV|VAT)/i.test(html),
      has_overdue_highlight:/gecikmiş|overdue|vaxtı keçmiş|past.due|text-red.*invoice|text-orange/i.test(html),
      has_required_marker:  /required|aria-required|before:content-\[.?\*.\]|\*\s*<\/label>|text-red.*\*|\*.*text-red/i.test(html),
      has_toast_feedback:   /toast|snackbar|Toaster|uğurla|xəta baş verdi|successfully|saved|error.*alert|alert.*success/i.test(html),
      has_stock_indicator:  /stok|stock.*level|in.stock|available.*unit|qalıq|ehtiyat|\d+\s*(?:unit|ədəd)/i.test(html),
      has_tax_deadline:     /son tarix|deadline|vergi.*tarix|ödəmə tarixi|due.*date|due.*by/i.test(html),
      has_payroll_breakdown:/(?:PIT|DSMF|MHIB|işsizlik|sığorta|işəgötürən|işçi).*(?:\d|%)|(?:\d|%).*(?:PIT|DSMF|tutma)/i.test(html),
      has_delete_confirm:   /confirm|are you sure|silmək istəyirsiniz|təsdiq|modal.*delete|delete.*modal/i.test(html),
      has_loading_ui:       /animate-spin|skeleton|loading|Yüklənir/i.test(html),
      has_empty_state:      /no records|no data|heç bir|boş|empty.*state|create your first|Əlavə et/i.test(html),
      has_form_errors:      /(?:class|id)="[^"]*(?:error|invalid|required)[^"]*"|text-red|border-red/i.test(html),
      has_lang_switcher:    /lang.*switcher|language.*toggle|AZ.*EN|EN.*AZ|az.*en.*switch/i.test(html) ||
                            (html.includes('>AZ<') && html.includes('>EN<')),
      has_trial_warning:    /trial|sınaq|trialDaysLeft|days.*left|sona çatır|billing.*warn|warn.*billing/i.test(html),
      error_preview:        errorM ? stripTags(errorM[1]).slice(0, 150) : '',
      text_preview:         text.slice(0, 800),
      form_count:           (html.match(/<form[\s\S]/gi) ?? []).length,
      input_count:          (html.match(/<input[\s\S]/gi) ?? []).length,
    }
  } catch (e: unknown) {
    clearTimeout(timer)
    const msg = e instanceof Error ? e.message : String(e)
    return {
      status: 0, ok: false, is_authenticated: false, title: '', headings: [],
      buttons: [], labels: [], nav_items: [], has_az_text: false, has_en_text: false,
      has_manat: false, has_az_date_format: false, has_edv_text: false,
      has_vat_breakdown: false, has_overdue_highlight: false, has_required_marker: false,
      has_toast_feedback: false, has_stock_indicator: false, has_tax_deadline: false,
      has_payroll_breakdown: false, has_delete_confirm: false,
      has_loading_ui: false, has_empty_state: false, has_form_errors: false,
      has_lang_switcher: false, has_trial_warning: false,
      error_preview: msg.includes('ECONNREFUSED') ? `Server not reachable at ${BASE_URL}` : msg.slice(0, 150),
      text_preview: '', form_count: 0, input_count: 0,
    }
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

const nowAz = new Date().toLocaleDateString('az-AZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

const SYSTEM = `
You are Leyla Həsənova, CPA — a senior Azerbaijani accountant with 10 years of experience.
You have worked with 1C, Excel, and some QuickBooks. You have NEVER used AzFinance before.
Today is: ${nowAz}. Base URL: ${BASE_URL}. Run ID: ${RUN_ID}.

IMPORTANT: You are already authenticated. fetch_page will include session cookies automatically.
Protected pages will render their full UI — you do NOT need to test API JSON responses.
AzFinance is a Next.js full-stack app. Pages return HTML. That is correct and expected.

DO NOT test: REST API JSON format, HTTP status codes from page routes, /api/* response structure.
DO test: what a real Azerbaijani accountant actually sees — buttons, labels, forms, text, data.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FUNCTIONALITY TESTS (use db_query to verify data integrity)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SO → DELIVERY → INVOICE CHAIN
  db_query table="sales_orders" columns="id,status,customer_id" limit=5
  db_query table="deliveries" columns="id,sales_order_id,status" limit=5
  db_query table="invoices" columns="id,sales_order_id,status,total,vat_amount" limit=5
  → Check: do confirmed SOs have linked deliveries? do delivered SOs have invoices?

PAYROLL COMPLETENESS
  db_query table="payroll_runs" columns="id,status,period,total_net,created_at" limit=5
  db_query table="payroll_entries" columns="id,employee_id,gross,net,pit,dsmf,unemployment" limit=5
  → Check: do payroll_entries have pit, dsmf, unemployment populated (not null/zero)?

GR AUTO-CREATES EXPENSE
  db_query table="goods_receipts" columns="id,status,total_cost,expense_id" limit=5
  db_query table="expenses" columns="id,category,amount,vendor_id,description" limit=5
  → Check: do confirmed GRs have a non-null expense_id? Are those expenses in the DB?

STOCK UPDATE AFTER DELIVERY
  db_query table="warehouse_stock" columns="product_id,quantity,reserved_quantity" limit=10
  db_query table="deliveries" columns="id,status,delivered_at" limit=5
  → Check: are warehouse_stock quantities realistic (>= 0)? Any negative stock?

INVOICE VAT POPULATED
  db_query table="invoices" columns="id,subtotal,vat_amount,total,vat_rate" limit=10
  → Check: is vat_amount > 0 on invoices? Does subtotal + vat_amount ≈ total?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UX TESTS — use read_source (NOT fetch_page) for content analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPORTANT: This app is client-side rendered (all 'use client' components).
fetch_page only returns a loading shell — the real UI is in TSX source files.
Always use read_source('/route') to read the actual component source code.
read_source returns: source_preview + signals (has_manat, has_edv, has_delete_confirm, etc.)

FORMS & INPUT — read_source signals:
  • has_required_marker — asterisk (*) or "required" in source?
  • has_form_errors — inline error message patterns?
  • Form inputs labeled clearly? (look for <label> in source_preview)

FEEDBACK & STATES — read_source signals:
  • has_toast — Toaster/toast/sonner/success message pattern?
  • has_loading_ui — skeleton/spinner/loading pattern?
  • has_empty_state — empty state / "Əlavə et" CTA in source?

FINANCIAL DATA DISPLAY — read_source signals:
  • has_manat — ₼ symbol in source?
  • has_az_date_format — DD.MM.YYYY or .toLocaleDateString('az-AZ')?
  • has_vat_breakdown — vat_amount / ƏDV on separate line?
  • has_overdue_highlight — overdue/gecikmiş color logic?
  • has_payroll_breakdown — PIT/DSMF/unemployment breakdown?
  • has_stock_indicator — stock level shown in SO form?

NAVIGATION — read_source('/') for Sidebar:
  • has_trial_warning — trialDaysLeft / isTrialActive in sidebar?
  • has_tax_deadline — TaxDeadlines component on dashboard?
  • Sidebar nav_items — all modules listed?

DESTRUCTIVE ACTIONS — read_source signals:
  • has_delete_confirm — confirm() / modal / "Are you sure" / "silmək istəyirsiniz"?

AZERBAIJAN COMPLIANCE — read_source signals:
  • has_edv — ƏDV in source?
  • has_manat — ₼ in source?
  • has_lang_switcher — setLang / AZ/EN toggle?
  • Azerbaijani terms: Faktura, Xərc, Anbar, Satış, Maaş, VÖEN?

WORKFLOW LOGIC — read_source + db_query:
  • /sales/orders — stock level shown when creating order? Confirm button?
  • /sales/deliveries — delivery status + confirm action?
  • /invoices — create invoice from SO?
  • /payroll — PIT/DSMF breakdown before approving? Payslip download?
  • /procurement/* — PR→PO→GR step-by-step flow?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCORING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXCELLENT (3 pts) — intuitive, no confusion, delightful
GOOD (2 pts)      — works well, minor improvement possible
FAIR (1 pt)       — works but confusing or extra steps needed
POOR (0 pts)      — very confusing, users would get stuck
BROKEN (-1 pt)    — feature is missing or does not render at all

Severity: Critical = blocks real accounting work | Medium = annoying but workaround exists |
          Minor = polish issue | None = observation only
`.trim()

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'fetch_page',
    description: [
      'Load an authenticated page and get UX analysis.',
      'Returns: buttons, labels, nav_items, has_manat (₼), has_az_date_format (DD.MM.YYYY),',
      'has_edv_text (ƏDV term), has_vat_breakdown (VAT as separate line),',
      'has_overdue_highlight (overdue invoices highlighted), has_required_marker (asterisk on fields),',
      'has_toast_feedback (success/error messages), has_stock_indicator (stock level visible),',
      'has_tax_deadline (deadlines shown), has_payroll_breakdown (PIT/DSMF visible),',
      'has_trial_warning (trial expiry banner), has_delete_confirm, has_lang_switcher.',
      'Session cookie is included automatically — protected pages will render fully.',
    ].join(' '),
    input_schema: {
      type: 'object' as const,
      properties: {
        url:  { type: 'string', description: 'Path like /invoices or /payroll' },
        note: { type: 'string', description: 'What UX element you are looking for' },
      },
      required: ['url'],
    },
  },
  {
    name: 'read_source',
    description: [
      'Read the TypeScript/TSX source code of a Next.js page component.',
      'The app is fully client-rendered — fetch_page only gives a loading shell.',
      'read_source gives the real UI: buttons, labels, ₼, ƏDV, DD.MM.YYYY, toasts, confirms, etc.',
      'Pass a route path like /invoices or /payroll, or a file path like app/invoices/InvoicesClient.tsx.',
      'Returns: file path found, source_preview (first 3500 chars), signals (has_manat, has_edv,',
      'has_az_date_format, has_delete_confirm, has_toast, has_required_marker, has_vat_breakdown,',
      'has_payroll_breakdown, has_stock_indicator, has_overdue_highlight, has_lang_switcher,',
      'has_trial_warning, has_tax_deadline, has_empty_state, has_loading_ui).',
    ].join(' '),
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Route path like /invoices or file path like app/invoices/InvoicesClient.tsx' },
        grep: { type: 'string', description: 'Optional: search this string in the source (returns matching lines)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'db_query',
    description: 'Query the database to check data completeness that impacts UX — e.g. are client emails set, do products have descriptions, are amounts populated.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table:   { type: 'string' },
        columns: { type: 'string', description: 'Columns to select (default *)' },
        filters: { type: 'object', additionalProperties: true },
        limit:   { type: 'number' },
      },
      required: ['table'],
    },
  },
  {
    name: 'report_test',
    description: 'Record one UX test result. Call this after every individual test.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phase:    { type: 'string', description: 'e.g. "Phase 2: Invoice Creation Flow"' },
        test:     { type: 'string', description: 'Short descriptive test name' },
        score:    { type: 'string', enum: ['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'BROKEN'] },
        finding:  { type: 'string', description: 'What Leyla actually found — first person, specific, reference HTML signals' },
        expected: { type: 'string', description: 'What she expected' },
        severity: { type: 'string', enum: ['Critical', 'Medium', 'Minor', 'None'] },
        details:  { type: 'string', description: 'Specific evidence: button text seen, labels found, text preview quotes' },
      },
      required: ['phase', 'test', 'score', 'finding', 'expected', 'severity'],
    },
  },
  {
    name: 'save_report',
    description: 'Generate and save the final UX audit report. Call exactly once after all phases are done.',
    input_schema: {
      type: 'object' as const,
      properties: {
        executive_summary: { type: 'string', description: 'Leyla\'s overall verdict — bilingual AZ/EN, 3–4 paragraphs' },
        top_wins:          { type: 'string', description: 'Top 5 UX things Leyla genuinely liked' },
        critical_issues:   { type: 'string', description: 'Issues that block or seriously confuse real users' },
        recommendations:   { type: 'string', description: 'Numbered priority list of UX improvements' },
        final_verdict:     { type: 'string', description: 'One sentence: would Leyla recommend AzFinance to a colleague?' },
      },
      required: ['executive_summary', 'critical_issues', 'recommendations', 'final_verdict'],
    },
  },
]

// ── Tool executor ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exec(name: string, raw: Record<string, any>): Promise<unknown> {
  switch (name) {

    case 'fetch_page':
      return await analysePage(raw.url as string)

    case 'read_source': {
      const ROUTE_MAP: Record<string, string[]> = {
        '/':                       ['app/DashboardClient.tsx', 'app/ui/Sidebar.tsx'],
        '/invoices':               ['app/invoices/InvoicesClient.tsx'],
        '/expenses':               ['app/expenses/ExpensesClient.tsx'],
        '/payroll':                ['app/payroll/PayrollClient.tsx'],
        '/reports':                ['app/reports/ReportsClient.tsx'],
        '/clients':                ['app/clients/ClientsClient.tsx'],
        '/vendors':                ['app/vendors/VendorsClient.tsx'],
        '/sales/orders':           ['app/sales/orders/SalesOrdersClient.tsx'],
        '/sales/deliveries':       ['app/sales/deliveries/DeliveriesClient.tsx'],
        '/warehouse/products':     ['app/warehouse/products/ProductsClient.tsx'],
        '/warehouse/batches':      ['app/warehouse/batches/BatchesClient.tsx'],
        '/warehouse/movements':    ['app/warehouse/movements/MovementsClient.tsx'],
        '/warehouse/settings':     ['app/warehouse/settings/WarehouseSettingsClient.tsx'],
        '/procurement/requests':   ['app/procurement/requests/RequestsClient.tsx'],
        '/procurement/orders':     ['app/procurement/orders/OrdersClient.tsx'],
        '/procurement/receipts':   ['app/procurement/receipts/ReceiptsClient.tsx'],
        '/company-settings':       ['app/company-settings/CompanySettingsClient.tsx'],
        '/tax-settings':           ['app/tax-settings/TaxSettingsClient.tsx'],
        '/billing':                ['app/billing/page.tsx'],
        '/sidebar':                ['app/ui/Sidebar.tsx'],
        '/header':                 ['app/ui/Header.tsx'],
        '/dashboard':              ['app/DashboardClient.tsx'],
      }

      const inputPath = raw.path as string
      const candidates = ROUTE_MAP[inputPath]
        ?? (inputPath.startsWith('app/') ? [inputPath] : [`app${inputPath}.tsx`, `app${inputPath}/page.tsx`])

      for (const filePath of candidates) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8')

          const signals = {
            has_manat:            content.includes('₼'),
            has_edv:              /ƏDV/.test(content),
            has_az_date_format:   /DD\.MM\.YYYY|dd\.MM\.yyyy|toLocaleDateString.*['"](az|az-AZ)/.test(content),
            has_delete_confirm:   /window\.confirm|confirm\(|modal.*[Dd]elete|[Dd]elete.*modal|Are you sure|silmək istəyirsiniz|[Ss]how[Cc]onfirm|confirm.*dialog/i.test(content),
            has_toast:            /toast|Toaster|sonner|Uğurla|uğurla saxlandı|successfully saved/i.test(content),
            has_required_marker:  /required|aria-required|\* <\/label>|<label[^>]*>\*|text-red.*\*|\*.*required/i.test(content),
            has_vat_breakdown:    /vat_amount|vatAmount|ƏDV.*məbləğ|subtotal.*vat|vat.*subtotal/i.test(content),
            has_payroll_breakdown:/\bpit\b|\bdsmf\b|işsizlik|unemployment|health_insurance|Art\.?102/i.test(content),
            has_stock_indicator:  /warehouse_stock|stock.*level|available.*qty|stok|qalıq.*məhsul|in_stock/i.test(content),
            has_overdue_highlight:/overdue|gecikmiş|vaxtı keçmiş|past.*due/i.test(content),
            has_lang_switcher:    /setLang|useLanguage|\bAZ\b.*\bEN\b|\bEN\b.*\bAZ\b|lang.*toggle/i.test(content),
            has_trial_warning:    /trialDaysLeft|isTrialActive|trial.*warn|trial.*expir/i.test(content),
            has_tax_deadline:     /TaxDeadlines|tax.*deadline|vergi.*son.*tarix|son.*ödəmə/i.test(content),
            has_empty_state:      /empty.*state|no.*records|heç bir|Əlavə et|create.*first|EmptyState/i.test(content),
            has_loading_ui:       /animate-spin|skeleton|Skeleton|loading.*spinner|\bLoading\b|Yüklənir/i.test(content),
          }

          // If grep requested, extract matching lines
          const grepResult = raw.grep
            ? content.split('\n')
                .map((l, i) => ({ ln: i + 1, line: l }))
                .filter(({ line }) => line.toLowerCase().includes((raw.grep as string).toLowerCase()))
                .slice(0, 20)
                .map(({ ln, line }) => `${String(ln).padStart(4)}: ${line}`)
                .join('\n')
            : undefined

          return {
            file:           filePath,
            found:          true,
            total_chars:    content.length,
            signals,
            grep_matches:   grepResult,
            source_preview: content.slice(0, 3500),
          }
        } catch {
          // file not found, try next candidate
        }
      }

      return { found: false, tried: candidates, error: 'No source file found for this path' }
    }

    case 'db_query': {
      const { table, columns = '*', filters, limit = 20 } = raw
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from(table).select(columns)
      if (filters) for (const [k, v] of Object.entries(filters)) q = q.eq(k, v)
      q = q.limit(limit)
      const { data, error } = await q
      if (error) return { error: error.message, table }
      return { count: (data ?? []).length, rows: data ?? [] }
    }

    case 'report_test': {
      const r = raw as unknown as UxResult
      log.push(r)
      const pts = SCORE_PTS[r.score]
      console.log(`  ${SCORE_ICON[r.score]} [${r.score.padEnd(9)}] ${SEV_ICON[r.severity]} ${r.test}  (${pts >= 0 ? '+' : ''}${pts}pts)`)
      if (r.details) console.log(`                    ${String(r.details).slice(0, 110)}`)
      return { recorded: true, pts }
    }

    case 'save_report': {
      const filename = buildReport(
        raw.executive_summary as string,
        (raw.top_wins ?? '') as string,
        raw.critical_issues as string,
        raw.recommendations as string,
        raw.final_verdict as string,
      )
      reportSaved = true
      return { ok: true, filename }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ── Report builder ────────────────────────────────────────────────────────────

function buildReport(summary: string, wins: string, issues: string, recs: string, verdict: string): string {
  const total  = log.reduce((s, r) => s + SCORE_PTS[r.score], 0)
  const maxPts = log.length * 3
  const pct    = maxPts > 0 ? Math.round((total / maxPts) * 100) : 0
  const grade  = pct >= 90 ? 'A' : pct >= 75 ? 'B+' : pct >= 60 ? 'B' : pct >= 45 ? 'C' : 'D'

  const counts: Record<UxScore, number> = { EXCELLENT: 0, GOOD: 0, FAIR: 0, POOR: 0, BROKEN: 0 }
  log.forEach(r => counts[r.score]++)

  const bySev = { Critical: 0, Medium: 0, Minor: 0, None: 0 } as Record<Severity, number>
  log.filter(r => r.score !== 'EXCELLENT' && r.score !== 'GOOD').forEach(r => bySev[r.severity]++)

  const byPhase = new Map<string, UxResult[]>()
  log.forEach(r => { if (!byPhase.has(r.phase)) byPhase.set(r.phase, []); byPhase.get(r.phase)!.push(r) })

  const now     = new Date()
  const dateFmt = now.toLocaleDateString('az-AZ', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeFmt = now.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })

  let md = `# 👩‍💼 AzFinance — Leyla UX Audit Hesabatı\n\n`
  md += `> **Auditor:** Leyla Həsənova, CPA — Baş Mühasib, 10 il təcrübə  \n`
  md += `> **Tarix:** ${dateFmt}, saat ${timeFmt}  \n`
  md += `> **Audit növü:** İstifadəçi Təcrübəsi (UX) & Funksionallıq  \n`
  md += `> **Sistem:** AzFinance (Next.js 15 + Supabase) — ${BASE_URL}  \n`
  md += `> **Run ID:** \`${RUN_ID}\`\n\n---\n\n`

  md += `## 📊 UX Audit Nəticəsi\n\n`
  md += `| Göstərici | Nəticə |\n|:---|:---|\n`
  md += `| 🏆 Ümumi Xal | **${total} / ${maxPts} (${pct}%)** |\n`
  md += `| 🎓 Qiymət | **${grade}** |\n`
  md += `| 📝 Test Sayı | ${log.length} |\n`
  md += `| 🌟 EXCELLENT | ${counts.EXCELLENT} |\n`
  md += `| ✅ GOOD | ${counts.GOOD} |\n`
  md += `| ⚠️ FAIR | ${counts.FAIR} |\n`
  md += `| ❌ POOR | ${counts.POOR} |\n`
  md += `| 💀 BROKEN | ${counts.BROKEN} |\n\n`

  md += `### Problem Ciddilik Dağılımı\n\n`
  md += `🔴 Critical: **${bySev.Critical}** | 🟡 Medium: **${bySev.Medium}** | 🟢 Minor: **${bySev.Minor}**\n\n`

  md += `## 💬 Leyla'nın Yekun Hökmü\n\n> *${verdict}*\n\n`
  md += `## 📋 Xülasə (Executive Summary)\n\n${summary}\n\n`

  if (wins.trim()) md += `## 🌟 Nə Bəyəndim (Top Wins)\n\n${wins}\n\n`
  if (issues.trim()) md += `## 🔴 Kritik Problemlər (Must-Fix Issues)\n\n${issues}\n\n`

  md += `## 📁 Faza Nəticələri (Phase Results)\n\n`
  const phaseScores: Array<{ phase: string; pts: number; max: number; pct: number }> = []

  for (const [phase, phaseResults] of byPhase) {
    const pts = phaseResults.reduce((s, r) => s + SCORE_PTS[r.score], 0)
    const max = phaseResults.length * 3
    const pp  = max > 0 ? Math.round((pts / max) * 100) : 0
    phaseScores.push({ phase, pts, max, pct: pp })

    md += `### ${phase} — ${pts}/${max} xal (${pp}%)\n\n`
    md += `| | Test | Nə Tapdım | Nə Gözləyirdim |\n|:---|:---|:---|:---|\n`
    phaseResults.forEach(r => {
      md += `| ${SCORE_ICON[r.score]} ${SEV_ICON[r.severity]} | **${r.test}** | ${r.finding} | ${r.expected} |\n`
    })
    const withDetails = phaseResults.filter(r => r.details)
    if (withDetails.length) {
      md += '\n'
      withDetails.forEach(r => { md += `> **${r.test}:** ${r.details}\n\n` })
    }
    md += '\n'
  }

  md += `### Faza Xülasəsi\n\n`
  md += `| Faza | Xal | Maks | % |\n|:---|---:|---:|---:|\n`
  phaseScores.forEach(p => {
    const bar = p.pct >= 80 ? '🟢' : p.pct >= 60 ? '🟡' : '🔴'
    md += `| ${p.phase} | ${p.pts} | ${p.max} | ${bar} ${p.pct}% |\n`
  })
  md += '\n'

  md += `## 💡 Prioritet Tövsiyələr (Recommendations)\n\n${recs}\n\n`
  md += `---\n\n`
  md += `*Bu hesabat **Leyla** AI UX Audit Agent tərəfindən avtomatik hazırlanmışdır.*  \n`
  md += `*Perspektiv: Azərbaycanlı mühasib, 10 il iş təcrübəsi, 1C / Excel / QuickBooks istifadəçisi.*  \n`
  md += `*AzFinance · ${dateFmt} · claude-haiku-4-5-20251001*\n`

  const ts       = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
  const filename = `scripts/leyla-hesabat-${ts}.md`
  fs.mkdirSync('scripts', { recursive: true })
  fs.writeFileSync(filename, md, 'utf-8')
  console.log(`\n📄 UX Hesabatı saxlandı: ${filename}`)
  return filename
}

// ── Agent loop ────────────────────────────────────────────────────────────────

async function runAgent() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  👩‍💼  Leyla — AzFinance UX & Functionality Audit Agent      ║')
  console.log('║       Senior Accountant Perspective · Azerbaijani User       ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`\n   Run ID  : ${RUN_ID}`)
  console.log(`   Tarix   : ${nowAz}`)
  console.log(`   Server  : ${BASE_URL}`)
  console.log(`   Modul   : ${MODULE_FILTER ?? 'Bütün 9 faza'}`)
  console.log(`   Verbose : ${VERBOSE ? 'Aktiv' : 'Söndürülüb'}\n`)
  console.log('─'.repeat(64))

  // ── 1. Check server ───────────────────────────────────────────────
  process.stdout.write('\n🌐 Server yoxlanılır...')
  const ping = await analysePage('/')
  if (ping.status === 0) {
    console.log(`\n❌ ${ping.error_preview}`)
    console.log('   npm run dev ilə serveri başladın.')
    process.exit(1)
  }
  console.log(` ✓ HTTP ${ping.status}`)

  // ── 2. DB connection check ────────────────────────────────────────
  process.stdout.write('\n🗄️  Verilənlər bazası yoxlanılır...')
  const { data: dbCheck, error: dbErr } = await db.from('invoices').select('id').limit(1)
  if (dbErr) {
    console.log(`\n⚠️  DB bağlantısı problemi: ${dbErr.message}`)
  } else {
    console.log(` ✓ Supabase bağlı (${dbCheck?.length ?? 0} sətir)`)
  }
  console.log('\nℹ️  App client-side rendered — mənbə kodu analizi (read_source) istifadə edilir.')

  // ── 3. Phase prompts ──────────────────────────────────────────────
  const PHASE_PROMPTS: Record<string, string> = {
    onboarding: `Leyla, yalnız Phase 1 — Onboarding & Navigation test et.
read_source('/') — DashboardClient + Sidebar mənbə kodunu oxu
read_source('/header') — Header mənbəsini oxu
Yoxla (signals-dan):
- has_trial_warning: Sidebar-da trial badge/xəbərdarlıq varmı?
- has_tax_deadline: Dashboard-da TaxDeadlines komponenti varmı?
- has_lang_switcher: AZ/EN dil dəyişdirici varmı?
- Sidebar source_preview-da nav_items: Anbar, Satış, Satınalma, Hesabat görünürmü?
- Dashboard-da Reports linki varmı?
Hər test üçün report_test çağır, sonra save_report.`,

    invoices: `Leyla, yalnız Phase 2 — Invoice & VAT test et.
read_source('/invoices') — InvoicesClient mənbəsini oxu
db_query("invoices", "id,subtotal,vat_amount,total,vat_rate", limit=10)
Yoxla:
- signals.has_manat: ₼ simvolu mənbədə varmı?
- signals.has_az_date_format: DD.MM.YYYY / toLocaleDateString('az-AZ') varmı?
- signals.has_vat_breakdown: vat_amount ayrıca sətir kimi göstərilirmi?
- DB: vat_amount 0-dan böyükdürmü?
- signals.has_overdue_highlight: gecikmiş fakturalar üçün rəng varmı?
- source_preview-da PDF yükləmə düyməsi varmı?
- source_preview-da e-poçt göndərmə düyməsi varmı?
- signals.has_delete_confirm: silmədən əvvəl təsdiq varmı?
Hər test üçün report_test çağır, sonra save_report.`,

    expenses: `Leyla, yalnız Phase 3 — Expenses & GR→Expense test et.
read_source('/expenses') — ExpensesClient mənbəsini oxu
db_query("expenses", "id,category,amount,status,paid_at", limit=10)
db_query("goods_receipts", "id,status,expense_id,total_cost", limit=5)
Yoxla:
- signals.has_overdue_highlight: gecikmiş xərclər üçün rəng varmı?
- source_preview-da "Ödənildi" / "Mark as Paid" düyməsi varmı?
- source_preview-da kateqoriya filtri varmı?
- signals.has_empty_state: boş vəziyyət mesajı varmı?
- DB (goods_receipts): confirmed GR-ların expense_id doldurulubmu? (GR→Expense chain)
- DB (expenses): kateqoriya sütunu dolu, məbləğ > 0?
Hər test üçün report_test çağır, sonra save_report.`,

    payroll: `Leyla, yalnız Phase 4 — Payroll Functionality & UX test et.
read_source('/payroll') — PayrollClient mənbəsini oxu
db_query("payroll_entries", "id,employee_id,gross,net,pit,dsmf,unemployment,health_insurance", limit=10)
db_query("payroll_runs", "id,status,period,total_gross,total_net", limit=5)
Yoxla:
- signals.has_payroll_breakdown: PIT, DSMF, işsizlik ayrıca göstərilirmi?
- DB payroll_entries: pit > 0? dsmf > 0? (real hesablama aparılıb?)
- DB payroll_runs: mövcuddur? status 'completed'mi?
- source_preview-da Art.102 endirim (200 AZN) izahı varmı?
- source_preview-da "Hesabla" / "Approve" düyməsi varmı?
- source_preview-da payslip yükləmə düyməsi varmı?
Hər test üçün report_test çağır, sonra save_report.`,

    warehouse: `Leyla, yalnız Phase 5 — Sales & Warehouse Chain test et.
read_source('/sales/orders') — SalesOrdersClient mənbəsini oxu
read_source('/sales/deliveries') — DeliveriesClient mənbəsini oxu
db_query("sales_orders", "id,status,customer_id,created_at", limit=5)
db_query("deliveries", "id,sales_order_id,status,delivered_at", limit=5)
db_query("warehouse_stock", "product_id,quantity,reserved_quantity", limit=10)
db_query("invoices", "id,sales_order_id,status,total", limit=5)
Yoxla:
- signals.has_stock_indicator (SalesOrders): SO yaradarkən stok göstərilirmi?
- DB chain: confirmed SO-ların delivery-si varmı?
- DB chain: delivered SO-ların invoice-i varmı? (SO→Delivery→Invoice tam axın!)
- DB warehouse_stock: quantity < 0 olan məhsul varmı? (kritik problem!)
- DeliveriesClient source: "Confirm" / "Çatdır" düyməsi varmı?
- signals.has_delete_confirm: silmədən əvvəl təsdiq varmı?
Hər test üçün report_test çağır, sonra save_report.`,

    procurement: `Leyla, yalnız Phase 6 — Procurement Flow (PR→PO→GR) test et.
read_source('/procurement/requests') — RequestsClient mənbəsini oxu
read_source('/procurement/orders') — OrdersClient mənbəsini oxu
read_source('/procurement/receipts') — ReceiptsClient mənbəsini oxu
db_query("goods_receipts", "id,status,expense_id,total_cost,purchase_order_id", limit=5)
Yoxla:
- RequestsClient source: "Yeni PR" düyməsi? Status göstəricisi?
- OrdersClient source: "Sifarişlər" bölməsi aydındırmı?
- ReceiptsClient source: "Qəbul et" / "Confirm" düyməsi?
- signals.has_delete_confirm (hər 3-də): silmədən əvvəl təsdiq?
- DB goods_receipts: confirmed GR-ların expense_id doldurulubmu?
- DB goods_receipts: purchase_order_id bağlantısı varmı?
Hər test üçün report_test çağır, sonra save_report.`,

    reports: `Leyla, yalnız Phase 7 — Reports & Analytics test et.
read_source('/reports') — ReportsClient mənbəsini oxu
Yoxla:
- source_preview-da P&L tabı varmı?
- source_preview-da Gross Margin tabı varmı?
- signals.has_manat: ₼ simvolu hesablarda varmı?
- signals.has_az_date_format: tarix filtrləri DD.MM.YYYY-dəmi?
- source_preview-da PDF ixrac düyməsi varmı?
- source_preview-da tarix filtrləri (Bu ay / Keçən ay) varmı?
- signals.has_empty_state: data yoxdursa boş vəziyyət mesajı varmı?
Hər test üçün report_test çağır, sonra save_report.`,

    azerbaijan: `Leyla, yalnız Phase 8 — Azerbaijan Compliance test et.
read_source('/invoices')
read_source('/tax-settings')
read_source('/payroll')
read_source('/expenses')
Yoxla:
- signals.has_edv: "ƏDV" sözü mənbədə varmı? (VAT deyil, ƏDV!)
- signals.has_manat: ₼ simvolu bütün maliyyə komponentlərindədir?
- signals.has_az_date_format: DD.MM.YYYY hər yerdə?
- signals.has_lang_switcher: AZ/EN dəyişdirici varmı?
- read_source('/tax-settings') source_preview-da: VÖEN sahəsi varmı?
- read_source('/tax-settings') source_preview-da: ƏDV qeydiyyat nömrəsi sahəsi varmı?
- signals.has_payroll_breakdown: Azerbaycan vergi terminləri (DSMF, MHIB)?
Hər test üçün report_test çağır, sonra save_report.`,

    settings: `Leyla, yalnız Phase 9 — Settings & Administration test et.
read_source('/company-settings')
read_source('/billing')
read_source('/sidebar')
Yoxla:
- CompanySettings source: komanda üzvü dəvəti forması varmı?
- CompanySettings source: Rol seçimi (Admin/Manager/Finance/Employee) varmı?
- signals.has_trial_warning (sidebar): Sidebar-da trial badge varmı?
- signals.has_trial_warning (billing): billing-də trial xəbərdarlığı varmı?
- Billing source: abunə planları aydın göstərilirmi?
- signals.has_delete_confirm: üzv silmə təsdiqi varmı?
Hər test üçün report_test çağır, sonra save_report.`,
  }

  const userMsg = MODULE_FILTER && PHASE_PROMPTS[MODULE_FILTER]
    ? PHASE_PROMPTS[MODULE_FILTER]
    : `Salam! Mən Leyla Həsənova, CPA-yam. AzFinance-i ilk dəfə sınayıram.
10 illik mühasibat təcrübəm var — 1C, Excel, QuickBooks ilə işləmişəm.
Run ID: ${RUN_ID}

VACIB: AzFinance tamamilə client-side rendered app-dır. fetch_page yalnız yüklənmə shell-i qaytarır.
Məzmun analizi üçün HƏMİŞƏ read_source istifadə et — bu real TSX komponent mənbəsini oxuyur.
Verilənlər bazası yoxlamaları üçün db_query istifadə et.

Bu gün AzFinance-in 9 fazalı tam auditini aparacağam:

FAZA 1 — Onboarding & Navigation
  read_source('/') — DashboardClient + Sidebar
  read_source('/header') — Header (AZ/EN lang switcher)
  • signals: has_trial_warning, has_tax_deadline, has_lang_switcher
  • Sidebar source: Anbar, Satış, Satınalma, Hesabat nav_items

FAZA 2 — Invoice & VAT
  read_source('/invoices')
  db_query("invoices", "id,subtotal,vat_amount,total,vat_rate", 10)
  • signals: has_manat, has_az_date_format, has_vat_breakdown, has_overdue_highlight, has_delete_confirm
  • DB: vat_amount > 0? subtotal + vat ≈ total?
  • source: PDF düyməsi, e-poçt düyməsi

FAZA 3 — Expenses & GR→Expense chain
  read_source('/expenses')
  db_query("expenses", "id,category,amount,status", 10)
  db_query("goods_receipts", "id,status,expense_id", 5)
  • signals: has_overdue_highlight, has_empty_state
  • DB: confirmed GR-ların expense_id dolu? (GR avtomatik xərc yaradır?)

FAZA 4 — Payroll Breakdown & Functionality
  read_source('/payroll')
  db_query("payroll_entries", "id,gross,net,pit,dsmf,unemployment,health_insurance", 10)
  db_query("payroll_runs", "id,status,period,total_net", 5)
  • signals: has_payroll_breakdown (PIT/DSMF/işsizlik ayrıca!)
  • DB: pit > 0? dsmf > 0? runs completed?
  • source: Art.102 izah, payslip yükləmə düyməsi

FAZA 5 — SO→Delivery→Invoice Chain + Stock
  read_source('/sales/orders') + read_source('/sales/deliveries')
  db_query("sales_orders","id,status",5) + db_query("deliveries","id,sales_order_id,status",5)
  db_query("warehouse_stock","product_id,quantity",10)
  db_query("invoices","id,sales_order_id,status",5)
  • signals: has_stock_indicator (SO yaradarkən stok görünür?)
  • DB chain: SO → delivery bağlantısı? delivery → invoice bağlantısı?
  • DB: quantity < 0 olan məhsul? (mənfi stok = kritik xəta!)

FAZA 6 — Procurement PR→PO→GR
  read_source('/procurement/requests')
  read_source('/procurement/orders')
  read_source('/procurement/receipts')
  db_query("goods_receipts","id,status,expense_id,purchase_order_id",5)
  • signals: has_delete_confirm (hər 3 source)
  • DB: expense_id dolu? (GR → Expense avtomatik?)

FAZA 7 — Reports & Analytics
  read_source('/reports')
  • source: P&L tab, Gross Margin tab, PDF ixrac, tarix filtrləri
  • signals: has_manat, has_az_date_format, has_empty_state

FAZA 8 — Azerbaijan Compliance
  read_source('/invoices') + read_source('/tax-settings') + read_source('/payroll')
  • signals: has_edv ("ƏDV" yox "VAT"), has_manat, has_az_date_format, has_lang_switcher
  • tax-settings source: VÖEN sahəsi? ƏDV qeydiyyat nömrəsi?

FAZA 9 — Settings & Admin
  read_source('/company-settings') + read_source('/billing') + read_source('/sidebar')
  • source: komanda dəvəti forması, rol seçimi (Admin/Manager/Finance/Employee)
  • signals: has_trial_warning (sidebar + billing)

Hər test üçün report_test çağırıram.
Bütün 9 faza tamamlandıqda save_report çağırıram.

FAZA 1 ilə başlayıram — read_source('/') çağırıram.`

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMsg }]
  let iter = 0

  while (iter++ < 150) {
    const res = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system:     SYSTEM,
      tools:      TOOLS,
      messages,
    })

    for (const b of res.content) {
      if (b.type === 'text') {
        if (VERBOSE) {
          console.log('\n' + b.text)
        } else {
          for (const line of b.text.split('\n')) {
            if (/^#{1,3}\s|Phase \d|Faza \d|📋|🔍|📝/i.test(line.trim()) && line.trim().length > 3) {
              console.log(`\n${line.trim()}`)
            }
          }
        }
      }
    }

    messages.push({ role: 'assistant', content: res.content })

    if (res.stop_reason === 'end_turn') {
      console.log('\n✅ Leyla bütün fazaları tamamladı.')
      break
    }
    if (res.stop_reason !== 'tool_use') break

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const b of res.content) {
      if (b.type !== 'tool_use') continue
      const preview = JSON.stringify(b.input).slice(0, 80)
      process.stdout.write(`\n  🔧 ${b.name}(${preview}${preview.length >= 80 ? '…' : ''})`)
      const out     = await exec(b.name, b.input as Record<string, unknown>)
      const outPrev = JSON.stringify(out).slice(0, 130)
      process.stdout.write(`\n     → ${outPrev}${outPrev.length >= 130 ? '…' : ''}\n`)
      toolResults.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) })
    }
    if (!toolResults.length) break
    messages.push({ role: 'user', content: toolResults })
  }

  // ── Auto-save if agent hit iteration cap without calling save_report ──
  if (!reportSaved && log.length > 0) {
    console.log('\n⚠️  save_report çağrılmadı — avtomatik saxlanılır...')
    const issues = log.filter(r => r.score === 'POOR' || r.score === 'BROKEN')
      .map(r => `- **${r.test}** (${r.severity}): ${r.finding}`).join('\n') || 'Kritik problem aşkar edilmədi.'
    const recs = log.filter(r => r.score !== 'EXCELLENT')
      .slice(0, 10).map((r, i) => `${i + 1}. ${r.test}: ${r.expected}`).join('\n') || 'Tövsiyə yoxdur.'
    buildReport(
      `Leyla ${log.length} UX testi apardı. Hesabat avtomatik generasiya edildi.`,
      log.filter(r => r.score === 'EXCELLENT').map(r => `- ${r.test}: ${r.finding}`).join('\n') || 'Yoxdur.',
      issues,
      recs,
      `Leyla ${log.length} test apardı — nəticələri nəzərdən keçirin.`,
    )
  }

  // ── Final score summary ───────────────────────────────────────────
  const total  = log.reduce((s, r) => s + SCORE_PTS[r.score], 0)
  const maxPts = log.length * 3
  const pct    = maxPts > 0 ? Math.round((total / maxPts) * 100) : 0
  const counts: Record<UxScore, number> = { EXCELLENT: 0, GOOD: 0, FAIR: 0, POOR: 0, BROKEN: 0 }
  log.forEach(r => counts[r.score]++)
  const criticals = log.filter(r => r.severity === 'Critical' && (r.score === 'POOR' || r.score === 'BROKEN'))

  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log(`║  UX Audit Tamamlandı  ${String(total).padStart(3)}/${String(maxPts).padEnd(3)} xal  (${String(pct).padStart(3)}%)               ║`)
  console.log(`║  🌟${String(counts.EXCELLENT).padStart(2)} ✅${String(counts.GOOD).padStart(2)} ⚠️${String(counts.FAIR).padStart(2)} ❌${String(counts.POOR).padStart(2)} 💀${String(counts.BROKEN).padStart(2)}                              ║`)
  console.log(`║  🔴 ${criticals.length} kritik problem${' '.repeat(Math.max(0, 43 - String(criticals.length).length))}║`)
  console.log('╚══════════════════════════════════════════════════════════════╝')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  try {
    await runAgent()
  } catch (e) {
    console.error('\n❌ Agent xətası:', e)
  } finally {
    console.log('\n' + '─'.repeat(64) + '\n')
  }
}

main()
