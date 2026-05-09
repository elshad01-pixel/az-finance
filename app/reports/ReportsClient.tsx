'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Period       = 'month' | 'quarter' | 'year' | 'custom'
type TaxRegime    = 'simplified' | 'profit_tax' | 'income_tax'
type BusinessType = 'general' | 'trade_food'

interface Invoice { date: string; status: string; amount: number }
interface Expense { date: string; category: string; amount: number }

interface TaxSettings {
  tax_regime:          TaxRegime
  business_type:       BusinessType
  simplified_eligible: boolean
  vat_registered:      boolean
}

const CATEGORIES = ['Office', 'Utilities', 'Salaries', 'Transport', 'Other'] as const

// ── Date helpers ──────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0') }

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function lastDayOf(year: number, monthIndex: number): string {
  const last = new Date(year, monthIndex + 1, 0).getDate()
  return `${year}-${pad(monthIndex + 1)}-${pad(last)}`
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function getRange(period: Period, cf: string, ct: string): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  if (period === 'month')   return { from: `${y}-${pad(m + 1)}-01`,         to: lastDayOf(y, m) }
  if (period === 'quarter') {
    const q = Math.floor(m / 3)
    return { from: `${y}-${pad(q * 3 + 1)}-01`, to: lastDayOf(y, q * 3 + 2) }
  }
  if (period === 'year')    return { from: `${y}-01-01`,                     to: `${y}-12-31` }
  return { from: cf, to: ct }
}

function getPrev(period: Period, r: { from: string; to: string }): { from: string; to: string } {
  if (period === 'month') {
    const d = new Date(r.from + 'T12:00:00')
    d.setMonth(d.getMonth() - 1)
    return { from: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, to: lastDayOf(d.getFullYear(), d.getMonth()) }
  }
  if (period === 'quarter') {
    const d = new Date(r.from + 'T12:00:00')
    d.setMonth(d.getMonth() - 3)
    const q = Math.floor(d.getMonth() / 3)
    return { from: `${d.getFullYear()}-${pad(q * 3 + 1)}-01`, to: lastDayOf(d.getFullYear(), q * 3 + 2) }
  }
  if (period === 'year') {
    const y = parseInt(r.from.slice(0, 4)) - 1
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  // custom: same duration before current period
  const f   = new Date(r.from + 'T12:00:00').getTime()
  const t   = new Date(r.to   + 'T12:00:00').getTime()
  const dur = t - f
  const pt  = new Date(f - 86_400_000)
  const pf  = new Date(pt.getTime() - dur)
  return { from: isoDate(pf), to: isoDate(pt) }
}

function inRange<T extends { date: string }>(items: T[], from: string, to: string): T[] {
  return items.filter(i => i.date >= from && i.date <= to)
}

// ── Money / tax helpers ───────────────────────────────────────────────────────

function money(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function calcTax(gross: number, collected: number, ts: TaxSettings | null): number {
  if (!ts) return 0
  if (ts.tax_regime === 'simplified') {
    const base = ts.business_type === 'trade_food' ? 0.08 : 0.02
    const rate = ts.simplified_eligible ? base * 0.25 : base
    return Math.max(0, collected * rate)
  }
  return Math.max(0, gross * 0.20)
}

function taxLabel(ts: TaxSettings | null): string {
  if (!ts) return 'Income Tax'
  if (ts.tax_regime === 'simplified') {
    const b = ts.business_type === 'trade_food' ? 8 : 2
    const e = ts.simplified_eligible ? (b * 0.25) : b
    return `Simplified Tax (${e}% of collected revenue)`
  }
  return 'Profit / Income Tax (20% of gross profit)'
}

function periodLabel(period: Period, from: string, to: string): string {
  if (period === 'month') {
    return new Date(from + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  }
  if (period === 'quarter') {
    const d = new Date(from + 'T12:00:00')
    return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
  }
  if (period === 'year') return `Year ${from.slice(0, 4)}`
  const fmt = (s: string) =>
    new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${fmt(from)} – ${fmt(to)}`
}

function prevPeriodLabel(period: Period): string {
  if (period === 'month')   return 'previous month'
  if (period === 'quarter') return 'previous quarter'
  if (period === 'year')    return 'previous year'
  return 'previous period'
}

// ── Change arrow ──────────────────────────────────────────────────────────────

function Arrow({ curr, prev, invert = false }: { curr: number; prev: number; invert?: boolean }) {
  if (prev === 0 && curr === 0) return <span className="text-xs text-gray-300 w-14 text-right inline-block">—</span>
  if (prev === 0)               return <span className="text-xs text-green-600 font-semibold w-14 text-right inline-block">New</span>
  const pct     = ((curr - prev) / Math.abs(prev)) * 100
  const went_up = pct > 0
  const isGood  = invert ? !went_up : went_up
  return (
    <span className={`inline-flex items-center justify-end gap-0.5 text-xs font-semibold w-14 ${isGood ? 'text-green-600' : 'text-red-500'}`}>
      {went_up
        ? <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
        : <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
      }
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

// ── P&L row ───────────────────────────────────────────────────────────────────

function PLRow({
  label, curr, prev,
  bold = false, indent = false, invert = false,
  highlight,
}: {
  label: string; curr: number; prev: number
  bold?: boolean; indent?: boolean; invert?: boolean
  highlight?: 'green' | 'red'
}) {
  const hl = highlight === 'green' ? 'bg-green-50' : highlight === 'red' ? 'bg-red-50' : ''
  return (
    <div className={`flex items-center px-5 py-2.5 border-b border-gray-50 last:border-0 ${hl}`}>
      <span className={`flex-1 text-sm min-w-0 ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'} ${indent ? 'pl-3' : ''}`}>
        {label}
      </span>
      <span className="text-xs text-gray-400 tabular-nums w-28 text-right hidden md:inline-block shrink-0">
        {money(prev)}
      </span>
      <span className="w-16 text-right shrink-0">
        <Arrow curr={curr} prev={prev} invert={invert} />
      </span>
      <span className={`text-sm tabular-nums w-32 text-right shrink-0 ${bold ? 'font-bold' : 'font-semibold'} ${
        highlight === 'green' ? 'text-green-700' :
        highlight === 'red'   ? 'text-red-700'   :
        'text-gray-900'
      }`}>
        {money(curr)}
      </span>
    </div>
  )
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionHead({ label, cls }: { label: string; cls: string }) {
  return (
    <div className={`px-5 py-2 border-b ${cls}`}>
      <span className="text-xs font-bold tracking-widest uppercase">{label}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReportsClient() {
  const [period,     setPeriod]     = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
  })
  const [customTo,   setCustomTo]   = useState(localToday)

  const [invoices,    setInvoices]    = useState<Invoice[]>([])
  const [expenses,    setExpenses]    = useState<Expense[]>([])
  const [taxSettings, setTaxSettings] = useState<TaxSettings | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [loading,     setLoading]     = useState(true)
  const [exporting,   setExporting]   = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('invoices').select('date, status, amount').neq('status', 'Draft'),
      supabase.from('expenses').select('date, category, amount'),
      supabase.from('tax_settings').select('tax_regime, business_type, simplified_eligible, vat_registered').maybeSingle(),
      supabase.from('company_settings').select('company_name').maybeSingle(),
    ]).then(([inv, exp, tax, co]) => {
      setInvoices((inv.data as Invoice[]) ?? [])
      setExpenses((exp.data as Expense[]) ?? [])
      setTaxSettings(tax.data as TaxSettings | null)
      setCompanyName(co.data?.company_name ?? '')
      setLoading(false)
    })
  }, [])

  // ── Compute ───────────────────────────────────────────────────────────────
  const range = getRange(period, customFrom, customTo)
  const prev  = getPrev(period, range)

  const cInv = inRange(invoices, range.from, range.to)
  const pInv = inRange(invoices, prev.from,  prev.to)
  const cExp = inRange(expenses, range.from, range.to)
  const pExp = inRange(expenses, prev.from,  prev.to)

  const totalInvoiced     = cInv.reduce((s, i) => s + i.amount, 0)
  const collected         = cInv.filter(i => i.status === 'Paid').reduce((s, i) => s + i.amount, 0)
  const outstanding       = cInv.filter(i => i.status === 'Unpaid').reduce((s, i) => s + i.amount, 0)
  const prevTotalInvoiced = pInv.reduce((s, i) => s + i.amount, 0)
  const prevCollected     = pInv.filter(i => i.status === 'Paid').reduce((s, i) => s + i.amount, 0)
  const prevOutstanding   = pInv.filter(i => i.status === 'Unpaid').reduce((s, i) => s + i.amount, 0)

  const catRows = CATEGORIES.map(cat => ({
    cat,
    curr: cExp.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
    prev: pExp.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(r => r.curr > 0 || r.prev > 0)

  const totalExp     = cExp.reduce((s, e) => s + e.amount, 0)
  const prevTotalExp = pExp.reduce((s, e) => s + e.amount, 0)

  const gross     = collected - totalExp
  const prevGross = prevCollected - prevTotalExp
  const tax       = calcTax(gross, collected, taxSettings)
  const prevTax   = calcTax(prevGross, prevCollected, taxSettings)
  const net       = gross - tax
  const prevNet   = prevGross - prevTax

  const pLabel = periodLabel(period, range.from, range.to)
  const tLabel = taxLabel(taxSettings)

  async function handleExport() {
    setExporting(true)
    try {
      const { generatePLPDF } = await import('@/lib/generatePLPDF')
      await generatePLPDF({
        period: pLabel,
        companyName,
        revenue: {
          totalInvoiced, collected, outstanding,
          prevTotalInvoiced, prevCollected, prevOutstanding,
        },
        expenses: {
          byCategory: catRows.map(r => ({ category: r.cat, amount: r.curr, prevAmount: r.prev })),
          total:     totalExp,
          prevTotal: prevTotalExp,
        },
        profit: {
          gross, taxLabel: tLabel, taxAmount: tax, net,
          prevGross, prevTaxAmount: prevTax, prevNet,
        },
      })
    } finally {
      setExporting(false)
    }
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="flex items-start justify-between">
          <div>
            <div className="h-7 bg-gray-100 rounded w-48 mb-2" />
            <div className="h-4 bg-gray-50 rounded w-28" />
          </div>
          <div className="h-10 bg-gray-100 rounded-lg w-32" />
        </div>
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-9 bg-gray-100 rounded-lg w-28" />)}
        </div>
        <div className="h-[560px] bg-gray-100 rounded-xl" />
      </div>
    )
  }

  const TABS: { value: Period; label: string }[] = [
    { value: 'month',   label: 'This Month'   },
    { value: 'quarter', label: 'This Quarter' },
    { value: 'year',    label: 'This Year'    },
    { value: 'custom',  label: 'Custom'       },
  ]

  return (
    <div>

      {/* ── Page header ── */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Profit &amp; Loss</h2>
          <p className="text-gray-500 text-sm mt-1">{pLabel}</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          {exporting ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Exporting…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export PDF
            </>
          )}
        </button>
      </div>

      {/* ── Period tabs ── */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setPeriod(tab.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === tab.value
                ? 'bg-blue-700 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="date" value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            <span className="text-gray-400">–</span>
            <input
              type="date" value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mb-4 hidden md:block">
        Gray values show {prevPeriodLabel(period)} · Arrows indicate change vs previous period
      </p>

      {/* ── P&L Statement card ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Card header */}
        <div className="bg-blue-900 px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white font-bold text-sm tracking-wide">PROFIT &amp; LOSS STATEMENT</p>
              {companyName && <p className="text-blue-300 text-xs mt-0.5">{companyName}</p>}
            </div>
            <div className="text-right hidden md:block">
              <p className="text-blue-200 text-xs font-medium">{pLabel}</p>
              <div className="flex items-center justify-end mt-1.5 text-xs">
                <span className="text-blue-400 w-28 text-right">Prev. period</span>
                <span className="text-blue-400 w-16 text-right">Change</span>
                <span className="text-blue-200 font-semibold w-32 text-right">Current</span>
              </div>
            </div>
          </div>
        </div>

        {/* REVENUE */}
        <SectionHead label="Revenue" cls="bg-blue-50 border-blue-100 text-blue-700" />
        <PLRow label="Total Invoiced"    curr={totalInvoiced}     prev={prevTotalInvoiced} indent />
        <PLRow label="Collected (Paid)"  curr={collected}         prev={prevCollected}     indent />
        <PLRow label="Outstanding"       curr={outstanding}       prev={prevOutstanding}   indent />

        {/* EXPENSES */}
        <SectionHead label="Expenses" cls="bg-red-50 border-red-100 text-red-700" />
        {catRows.length === 0 && (
          <p className="text-sm text-gray-400 italic px-5 py-3">No expenses recorded in this period.</p>
        )}
        {catRows.map(r => (
          <PLRow key={r.cat} label={r.cat} curr={r.curr} prev={r.prev} indent invert />
        ))}
        <PLRow label="Total Expenses" curr={totalExp} prev={prevTotalExp} bold invert />

        {/* PROFIT */}
        <SectionHead label="Profit" cls="bg-green-50 border-green-100 text-green-700" />
        <PLRow
          label="Gross Profit (Collected − Expenses)"
          curr={gross} prev={prevGross}
          indent
          highlight={gross >= 0 ? 'green' : 'red'}
        />
        <PLRow label={tLabel} curr={tax} prev={prevTax} indent invert />
        <PLRow
          label="Net Profit After Tax"
          curr={net} prev={prevNet}
          bold
          highlight={net >= 0 ? 'green' : 'red'}
        />

        {/* Card footer */}
        <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
          <span>Generated by AzFinance</span>
          <span>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>

    </div>
  )
}
