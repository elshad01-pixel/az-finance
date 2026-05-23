'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { MAIN_CATEGORIES, CATEGORY_I18N } from '@/lib/categories'

type Period       = 'month' | 'quarter' | 'year' | 'all' | 'custom'
type ReportTab    = 'pl' | 'margin'
type TaxRegime    = 'simplified' | 'profit_tax' | 'income_tax'
type BusinessType = 'general' | 'trade_food'
type TFn          = (key: TranslationKey) => string

interface Invoice { date: string; status: string; amount: number }
interface Expense { date: string; category: string; amount: number }

interface DelItem {
  product_id: string | null
  description: string
  unit: string
  so_qty: number
  delivered_qty: number
  is_stock_item: boolean
}
interface DelSOItem {
  product_id: string | null
  unit_price: number
  is_stock_item: boolean
}
interface Delivery {
  id: string
  delivery_date: string
  status: string
  cogs_amount: number
  items: DelItem[]
  sales_orders: { items: DelSOItem[] } | null
}
interface ProductInfo { id: string; name: string; sku: string }
interface MarginRow {
  product_id: string
  name: string
  sku: string
  qty_sold: number
  revenue: number
  cogs: number
  gross_profit: number
  margin_pct: number
}
interface MonthlyBar {
  label: string
  revenue: number
  cogs: number
  gross_profit: number
}

interface TaxSettings {
  tax_regime:          TaxRegime
  business_type:       BusinessType
  simplified_eligible: boolean
  vat_registered:      boolean
}

const CATEGORIES = MAIN_CATEGORIES

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
  if (period === 'all')     return { from: '2000-01-01', to: '2099-12-31' }
  return { from: cf, to: ct }
}

function getPrev(period: Period, r: { from: string; to: string }): { from: string; to: string } {
  if (period === 'all') return { from: '2000-01-01', to: '2099-12-31' }
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

function taxLabel(ts: TaxSettings | null, t: TFn): string {
  if (!ts) return t('rep.incomeTax')
  if (ts.tax_regime === 'simplified') {
    const b = ts.business_type === 'trade_food' ? 8 : 2
    const e = ts.simplified_eligible ? (b * 0.25) : b
    return t('rep.simplifiedTax').replace('{rate}', String(e))
  }
  return t('rep.profitTax')
}

function periodLabel(period: Period, from: string, to: string, lang: string, allLabel?: string): string {
  const locale = lang === 'az' ? 'az-AZ' : 'en-GB'
  if (period === 'all') return allLabel ?? (lang === 'az' ? 'Bütün Dövr' : 'All Time')
  if (period === 'month') {
    return new Date(from + 'T12:00:00').toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  }
  if (period === 'quarter') {
    const d = new Date(from + 'T12:00:00')
    return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
  }
  if (period === 'year') return `${from.slice(0, 4)}`
  const fmtDate = (s: string) =>
    new Date(s + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
  return `${fmtDate(from)} – ${fmtDate(to)}`
}

function prevPeriodLabel(period: Period, t: TFn): string {
  if (period === 'month')   return t('rep.prevMonth')
  if (period === 'quarter') return t('rep.prevQuarter')
  if (period === 'year')    return t('rep.prevYear')
  if (period === 'all')     return ''
  return t('rep.prevPeriodNote')
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
  const { t, lang } = useLanguage()

  const [activeTab,  setActiveTab]  = useState<ReportTab>('pl')
  const [period,     setPeriod]     = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
  })
  const [customTo,   setCustomTo]   = useState(localToday)

  const [invoices,    setInvoices]    = useState<Invoice[]>([])
  const [expenses,    setExpenses]    = useState<Expense[]>([])
  const [taxSettings, setTaxSettings] = useState<TaxSettings | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [deliveries,  setDeliveries]  = useState<Delivery[]>([])
  const [products,    setProducts]    = useState<ProductInfo[]>([])
  const [loading,     setLoading]     = useState(true)
  const [exporting,   setExporting]   = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('invoices').select('date, status, amount').neq('status', 'Draft'),
      supabase.from('expenses').select('date, category, amount'),
      supabase.from('tax_settings').select('tax_regime, business_type, simplified_eligible, vat_registered').maybeSingle(),
      supabase.from('company_settings').select('company_name').maybeSingle(),
      supabase.from('deliveries').select('id, delivery_date, status, cogs_amount, items, sales_orders(items)').eq('status', 'confirmed'),
      supabase.from('products').select('id, name, sku'),
    ]).then(([inv, exp, tax, co, del_, prod]) => {
      setInvoices((inv.data as Invoice[]) ?? [])
      setExpenses((exp.data as Expense[]) ?? [])
      setTaxSettings(tax.data as TaxSettings | null)
      setCompanyName(co.data?.company_name ?? '')
      setDeliveries((del_.data as unknown as Delivery[]) ?? [])
      setProducts((prod.data as ProductInfo[]) ?? [])
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

  const pLabel = periodLabel(period, range.from, range.to, lang, t('mar.allPeriods'))
  const tLabel = taxLabel(taxSettings, t)

  // ── Margin computations ───────────────────────────────────────────────────
  const filteredDeliveries = deliveries.filter(d =>
    period === 'all' || (d.delivery_date >= range.from && d.delivery_date <= range.to)
  )

  const productMap = new Map(products.map(p => [p.id, p]))

  const marginMap = new Map<string, MarginRow>()
  let totalMarginRevenue = 0
  let totalMarginCogs    = 0

  for (const del of filteredDeliveries) {
    const soItems = del.sales_orders?.items ?? []
    const stockItems = del.items.filter(it => it.is_stock_item && it.product_id)
    const totalStockQty = stockItems.reduce((s, it) => s + (it.delivered_qty ?? 0), 0)

    for (let i = 0; i < del.items.length; i++) {
      const item     = del.items[i]
      const soItem   = soItems[i]
      const qty      = item.delivered_qty ?? 0
      const unitPrice = soItem?.unit_price ?? 0
      const revenue  = qty * unitPrice

      if (!item.is_stock_item || !item.product_id) {
        totalMarginRevenue += revenue
        continue
      }

      const pid       = item.product_id
      const info      = productMap.get(pid)
      const cogsShare = totalStockQty > 0 ? (qty / totalStockQty) * del.cogs_amount : 0

      totalMarginRevenue += revenue
      totalMarginCogs    += cogsShare

      const existing = marginMap.get(pid)
      if (existing) {
        existing.qty_sold     += qty
        existing.revenue      += revenue
        existing.cogs         += cogsShare
        existing.gross_profit  = existing.revenue - existing.cogs
        existing.margin_pct    = existing.revenue > 0 ? (existing.gross_profit / existing.revenue) * 100 : 0
      } else {
        marginMap.set(pid, {
          product_id: pid,
          name: info?.name ?? item.description,
          sku: info?.sku ?? '—',
          qty_sold: qty,
          revenue,
          cogs: cogsShare,
          gross_profit: revenue - cogsShare,
          margin_pct: revenue > 0 ? ((revenue - cogsShare) / revenue) * 100 : 0,
        })
      }
    }
  }

  const marginRows = Array.from(marginMap.values()).sort((a, b) => b.margin_pct - a.margin_pct)
  const totalGrossMargin     = totalMarginRevenue - totalMarginCogs
  const totalGrossMarginPct  = totalMarginRevenue > 0 ? (totalGrossMargin / totalMarginRevenue) * 100 : 0
  const top3    = marginRows.slice(0, 3)
  const bottom3 = marginRows.length > 3 ? [...marginRows].reverse().slice(0, 3) : []

  // Monthly chart data (last 6 months or all months in range)
  const monthlyMap = new Map<string, { revenue: number; cogs: number; gross_profit: number }>()
  for (const del of filteredDeliveries) {
    const key      = del.delivery_date.slice(0, 7) // YYYY-MM
    const existing = monthlyMap.get(key) ?? { revenue: 0, cogs: 0, gross_profit: 0 }
    const soItems  = del.sales_orders?.items ?? []
    const delRevenue = del.items.reduce((s, it, i) => {
      const soItem = soItems[i]
      return s + (it.delivered_qty ?? 0) * (soItem?.unit_price ?? 0)
    }, 0)
    existing.revenue      += delRevenue
    existing.cogs         += del.cogs_amount
    existing.gross_profit  = existing.revenue - existing.cogs
    monthlyMap.set(key, existing)
  }
  const monthlyBars: MonthlyBar[] = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, v]) => {
      const d = new Date(key + '-01T12:00:00')
      const label = d.toLocaleDateString(lang === 'az' ? 'az-AZ' : 'en-GB', { month: 'short', year: '2-digit' })
      return { label, ...v }
    })

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

  const PERIOD_TABS: { value: Period; label: string }[] = [
    { value: 'month',   label: t('rep.thisMonth')   },
    { value: 'quarter', label: t('rep.thisQuarter') },
    { value: 'year',    label: t('rep.thisYear')    },
    { value: 'all',     label: t('mar.allPeriods')  },
    { value: 'custom',  label: t('rep.custom')      },
  ]

  // ── SVG margin chart ─────────────────────────────────────────────────────
  const CW = 600; const CH = 200; const PL = 60; const PR = 8; const PT = 8; const PB = 22
  const chartW = CW - PL - PR
  const chartH = CH - PT - PB
  const maxBarVal = Math.max(...monthlyBars.flatMap(b => [b.revenue, b.cogs, b.gross_profit]), 1)
  const barGroupW = monthlyBars.length > 0 ? chartW / monthlyBars.length : chartW
  const bw = Math.min(barGroupW * 0.25, 14)
  const barY = (v: number) => PT + chartH - (v / maxBarVal) * chartH
  const barH = (v: number) => (v / maxBarVal) * chartH

  return (
    <div>

      {/* ── Page header ── */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {activeTab === 'pl' ? t('rep.title') : t('mar.title')}
          </h2>
          <p className="text-gray-500 text-sm mt-1">{pLabel}</p>
        </div>
        {activeTab === 'pl' && (
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
                {t('rep.exporting')}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {t('rep.exportPDF')}
              </>
            )}
          </button>
        )}
      </div>

      {/* ── Report type tabs ── */}
      <div className="flex gap-2 mb-5 border-b border-gray-200">
        {(['pl', 'margin'] as ReportTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'pl' ? t('rep.title') : t('mar.tabLabel')}
          </button>
        ))}
      </div>

      {/* ── Period tabs ── */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {PERIOD_TABS.map(tab => (
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

      {activeTab === 'pl' && (
        <>
          <p className="text-xs text-gray-400 mb-4 hidden md:block">
            {t('rep.grayNote')} {prevPeriodLabel(period, t)} · {t('rep.arrowNote')}
          </p>

          {/* ── P&L Statement card ── */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

            {/* Card header */}
            <div className="bg-blue-900 px-5 py-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white font-bold text-sm tracking-wide">{t('rep.statementTitle')}</p>
                  {companyName && <p className="text-blue-300 text-xs mt-0.5">{companyName}</p>}
                </div>
                <div className="text-right hidden md:block">
                  <p className="text-blue-200 text-xs font-medium">{pLabel}</p>
                  <div className="flex items-center justify-end mt-1.5 text-xs">
                    <span className="text-blue-400 w-28 text-right">{t('rep.prevPeriod')}</span>
                    <span className="text-blue-400 w-16 text-right">{t('rep.change')}</span>
                    <span className="text-blue-200 font-semibold w-32 text-right">{t('rep.current')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* REVENUE */}
            <SectionHead label={t('rep.revenue')} cls="bg-blue-50 border-blue-100 text-blue-700" />
            <PLRow label={t('rep.totalInvoiced')}   curr={totalInvoiced}     prev={prevTotalInvoiced} indent />
            <PLRow label={t('rep.collected')}        curr={collected}         prev={prevCollected}     indent />
            <PLRow label={t('rep.outstanding')}      curr={outstanding}       prev={prevOutstanding}   indent />

            {/* EXPENSES */}
            <SectionHead label={t('rep.expenses')} cls="bg-red-50 border-red-100 text-red-700" />
            {catRows.length === 0 && (
              <p className="text-sm text-gray-400 italic px-5 py-3">{t('rep.noExpenses')}</p>
            )}
            {catRows.map(r => {
              const i18nKey = CATEGORY_I18N[r.cat]
              const label   = i18nKey ? t(i18nKey as TranslationKey) : r.cat
              return <PLRow key={r.cat} label={label} curr={r.curr} prev={r.prev} indent invert />
            })}
            <PLRow label={t('rep.totalExpenses')} curr={totalExp} prev={prevTotalExp} bold invert />

            {/* PROFIT */}
            <SectionHead label={t('rep.profit')} cls="bg-green-50 border-green-100 text-green-700" />
            <PLRow
              label={t('rep.grossProfit')}
              curr={gross} prev={prevGross}
              indent
              highlight={gross >= 0 ? 'green' : 'red'}
            />
            <PLRow label={tLabel} curr={tax} prev={prevTax} indent invert />
            <PLRow
              label={t('rep.netProfit')}
              curr={net} prev={prevNet}
              bold
              highlight={net >= 0 ? 'green' : 'red'}
            />

            {/* Card footer */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
              <span>{t('rep.generatedBy')}</span>
              <span>{new Date().toLocaleDateString(lang === 'az' ? 'az-AZ' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>
          </div>
        </>
      )}

      {activeTab === 'margin' && (
        <div className="space-y-5">

          {/* ── Summary cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: t('mar.totalRevenue'), value: money(totalMarginRevenue), color: 'text-blue-700', bg: 'bg-blue-50' },
              { label: t('mar.totalCogs'),    value: money(totalMarginCogs),    color: 'text-red-700',  bg: 'bg-red-50'  },
              { label: t('mar.grossMargin'),  value: money(totalGrossMargin),   color: totalGrossMargin >= 0 ? 'text-green-700' : 'text-red-700', bg: totalGrossMargin >= 0 ? 'bg-green-50' : 'bg-red-50' },
              { label: t('mar.marginPct'),    value: `${totalGrossMarginPct.toFixed(1)}%`, color: totalGrossMarginPct >= 30 ? 'text-green-700' : totalGrossMarginPct >= 10 ? 'text-yellow-700' : 'text-red-700', bg: 'bg-white' },
            ].map(c => (
              <div key={c.label} className={`${c.bg} rounded-xl border border-gray-100 shadow-sm px-5 py-4`}>
                <p className="text-xs text-gray-500 font-medium mb-1">{c.label}</p>
                <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* ── Monthly chart ── */}
          {monthlyBars.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-700 mb-3">{t('mar.chartTitle')}</p>
              <div className="flex gap-4 text-xs text-gray-500 mb-3">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />{t('mar.revenue')}</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" />{t('mar.cogs')}</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />{t('mar.grossProfit')}</span>
              </div>
              <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="w-full h-48">
                {/* Y gridlines */}
                {[0, 0.25, 0.5, 0.75, 1].map(f => {
                  const y = PT + chartH * (1 - f)
                  return (
                    <g key={f}>
                      <line x1={PL} y1={y} x2={CW - PR} y2={y} stroke="#f0f0f0" strokeWidth="1" />
                      <text x={PL - 4} y={y + 4} fontSize="9" fill="#9ca3af" textAnchor="end">
                        {(maxBarVal * f / 1000).toFixed(0)}k
                      </text>
                    </g>
                  )
                })}
                {/* Bars */}
                {monthlyBars.map((b, i) => {
                  const gx = PL + i * barGroupW + barGroupW / 2
                  return (
                    <g key={b.label}>
                      <rect x={gx - bw * 1.5} y={barY(b.revenue)}      width={bw} height={Math.max(barH(b.revenue), 1)}      fill="#3b82f6" rx="2" />
                      <rect x={gx - bw * 0.5} y={barY(b.cogs)}         width={bw} height={Math.max(barH(b.cogs), 1)}         fill="#f87171" rx="2" />
                      <rect x={gx + bw * 0.5} y={barY(b.gross_profit)} width={bw} height={Math.max(barH(b.gross_profit > 0 ? b.gross_profit : 0), 1)} fill="#22c55e" rx="2" />
                      <text x={gx} y={CH - 4} fontSize="9" fill="#6b7280" textAnchor="middle">{b.label}</text>
                    </g>
                  )
                })}
              </svg>
            </div>
          )}

          {/* ── Product margin table ── */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">{t('mar.tabLabel')}</p>
            </div>
            {marginRows.length === 0 ? (
              <p className="text-sm text-gray-400 italic px-5 py-6 text-center">{t('mar.noData')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                      <th className="px-5 py-3 text-left">{t('mar.productName')}</th>
                      <th className="px-4 py-3 text-left">{t('mar.sku')}</th>
                      <th className="px-4 py-3 text-right">{t('mar.qtySold')}</th>
                      <th className="px-4 py-3 text-right">{t('mar.revenue')}</th>
                      <th className="px-4 py-3 text-right">{t('mar.cogs')}</th>
                      <th className="px-4 py-3 text-right">{t('mar.grossProfit')}</th>
                      <th className="px-4 py-3 text-right">{t('mar.marginPct')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marginRows.map(r => {
                      const pctColor = r.margin_pct >= 30
                        ? 'text-green-700 bg-green-50'
                        : r.margin_pct >= 10
                          ? 'text-yellow-700 bg-yellow-50'
                          : 'text-red-700 bg-red-50'
                      return (
                        <tr key={r.product_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-5 py-2.5 font-medium text-gray-900">{r.name}</td>
                          <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{r.sku}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{r.qty_sold.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{money(r.revenue)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-red-700">{money(r.cogs)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">{money(r.gross_profit)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full tabular-nums ${pctColor}`}>
                              {r.margin_pct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Top / Bottom performers ── */}
          {marginRows.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Top 3 */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-green-50">
                  <p className="text-sm font-semibold text-green-700">{t('mar.top3')}</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {top3.map((r, i) => (
                    <div key={r.product_id} className="flex items-center px-5 py-3 gap-3">
                      <span className="text-lg font-bold text-gray-300 w-6 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                        <p className="text-xs text-gray-400">{money(r.revenue)} {t('mar.revenue').toLowerCase()}</p>
                      </div>
                      <span className="text-sm font-bold text-green-700 tabular-nums shrink-0">{r.margin_pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Bottom 3 */}
              {bottom3.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 bg-red-50">
                    <p className="text-sm font-semibold text-red-700">{t('mar.bottom3')}</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {bottom3.map((r, i) => (
                      <div key={r.product_id} className="flex items-center px-5 py-3 gap-3">
                        <span className="text-lg font-bold text-gray-300 w-6 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                          <p className="text-xs text-gray-400">{money(r.revenue)} {t('mar.revenue').toLowerCase()}</p>
                        </div>
                        <span className="text-sm font-bold text-red-700 tabular-nums shrink-0">{r.margin_pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}

    </div>
  )
}
