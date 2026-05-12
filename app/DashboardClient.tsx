'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import TaxDeadlines from '@/app/ui/TaxDeadlines'
import RecurringAlert from '@/app/ui/RecurringAlert'
import { useLanguage } from '@/lib/LanguageContext'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterPreset = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'all_time' | 'custom'

interface FilterState {
  preset:     FilterPreset
  customFrom: string
  customTo:   string
}

interface TaxSettings {
  tax_regime:          'simplified' | 'profit_tax' | 'income_tax'
  business_type:       'general' | 'trade_food'
  simplified_eligible: boolean
  employee_count:      number
}

interface ChartPoint   { label: string; revenue: number; expenses: number }
interface ActivityItem { label: string; amount: string; positive: boolean; date: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'az_dash_filter'

const PRESETS: Array<{ key: FilterPreset; az: string; en: string }> = [
  { key: 'this_month',   az: 'Bu Ay',      en: 'This Month'   },
  { key: 'last_month',   az: 'Keçən Ay',   en: 'Last Month'   },
  { key: 'this_quarter', az: 'Bu Rüb',     en: 'This Quarter' },
  { key: 'this_year',    az: 'Bu İl',      en: 'This Year'    },
  { key: 'all_time',     az: 'Bütün Dövr', en: 'All Time'     },
  { key: 'custom',       az: 'Xüsusi',     en: 'Custom'       },
]

const ML_EN = ['January','February','March','April','May','June','July','August','September','October','November','December']
const ML_AZ = ['Yanvar','Fevral','Mart','Aprel','May','İyun','İyul','Avqust','Sentyabr','Oktyabr','Noyabr','Dekabr']
const MS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MS_AZ = ['Yan','Fev','Mar','Apr','May','İyn','İyl','Avq','Sen','Okt','Noy','Dek']

// ── Pure helpers ──────────────────────────────────────────────────────────────

function monthRange(year: number, month: number) {
  const m    = String(month).padStart(2, '0')
  const last = new Date(year, month, 0).getDate()
  return { start: `${year}-${m}-01`, end: `${year}-${m}-${String(last).padStart(2, '0')}` }
}

function prevMonthOf(year: number, month: number): [number, number] {
  return month === 1 ? [year - 1, 12] : [year, month - 1]
}

type DateRange = { start: string | null; end: string | null }

function getRange(f: FilterState, now: Date): DateRange {
  const y = now.getFullYear(), m = now.getMonth() + 1
  if (f.preset === 'this_month')   return monthRange(y, m)
  if (f.preset === 'last_month')   { const [py, pm] = prevMonthOf(y, m); return monthRange(py, pm) }
  if (f.preset === 'this_quarter') {
    const q = Math.ceil(m / 3)
    return { start: monthRange(y, (q - 1) * 3 + 1).start, end: monthRange(y, q * 3).end }
  }
  if (f.preset === 'this_year') return { start: `${y}-01-01`, end: `${y}-12-31` }
  if (f.preset === 'all_time')  return { start: null, end: null }
  return { start: f.customFrom || null, end: f.customTo || null }
}

function getPrevRange(f: FilterState, now: Date): DateRange {
  const y = now.getFullYear(), m = now.getMonth() + 1
  if (f.preset === 'this_month') {
    const [py, pm] = prevMonthOf(y, m); return monthRange(py, pm)
  }
  if (f.preset === 'last_month') {
    const [py, pm] = prevMonthOf(y, m); const [ppy, ppm] = prevMonthOf(py, pm); return monthRange(ppy, ppm)
  }
  if (f.preset === 'this_quarter') {
    const q = Math.ceil(m / 3); let pq = q - 1, py = y
    if (pq < 1) { pq = 4; py-- }
    return { start: monthRange(py, (pq - 1) * 3 + 1).start, end: monthRange(py, pq * 3).end }
  }
  if (f.preset === 'this_year')   return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` }
  if (f.preset === 'custom' && f.customFrom && f.customTo) {
    const fromMs = new Date(f.customFrom).getTime()
    const dur    = new Date(f.customTo).getTime() - fromMs + 86_400_000
    return {
      start: new Date(fromMs - dur).toISOString().slice(0, 10),
      end:   new Date(fromMs - 1).toISOString().slice(0, 10),
    }
  }
  return { start: null, end: null }
}

function getChartMonths(f: FilterState, now: Date): Array<{ year: number; month: number }> {
  const y = now.getFullYear(), m = now.getMonth() + 1

  const trailing = (endY: number, endM: number, count: number) => {
    const r: Array<{ year: number; month: number }> = []
    for (let i = count - 1; i >= 0; i--) {
      let cm = endM - i, cy = endY
      while (cm <= 0) { cm += 12; cy-- }
      r.push({ year: cy, month: cm })
    }
    return r
  }

  if (f.preset === 'this_month')   return trailing(y, m, 5)
  if (f.preset === 'last_month')   { const [py, pm] = prevMonthOf(y, m); return trailing(py, pm, 5) }
  if (f.preset === 'this_quarter') {
    const q = Math.ceil(m / 3), qs = (q - 1) * 3 + 1
    return [0, 1, 2].map(i => ({ year: y, month: qs + i }))
  }
  if (f.preset === 'this_year')
    return Array.from({ length: Math.min(m, 12) }, (_, i) => ({ year: y, month: i + 1 }))
  if (f.preset === 'all_time') return trailing(y, m, 12)
  if (f.preset === 'custom' && f.customFrom && f.customTo) {
    const result: Array<{ year: number; month: number }> = []
    const to  = new Date(f.customTo)
    let   cur = new Date(new Date(f.customFrom).getFullYear(), new Date(f.customFrom).getMonth(), 1)
    while (cur <= to && result.length < 12) {
      result.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 })
      cur.setMonth(cur.getMonth() + 1)
    }
    return result
  }
  return trailing(y, m, 5)
}

function periodLabel(f: FilterState, now: Date, lang: string): string {
  const y = now.getFullYear(), m = now.getMonth() + 1
  const ml = lang === 'az' ? ML_AZ : ML_EN
  if (f.preset === 'this_month')   return `${ml[m - 1]} ${y}`
  if (f.preset === 'last_month')   { const [py, pm] = prevMonthOf(y, m); return `${ml[pm - 1]} ${py}` }
  if (f.preset === 'this_quarter') return `Q${Math.ceil(m / 3)} ${y}`
  if (f.preset === 'this_year')    return `${y}`
  if (f.preset === 'all_time')     return lang === 'az' ? 'Bütün Dövr' : 'All Time'
  if (f.preset === 'custom') {
    if (f.customFrom && f.customTo) return `${f.customFrom} – ${f.customTo}`
    return lang === 'az' ? 'Xüsusi' : 'Custom'
  }
  return ''
}

function sumRows(rows: { amount: number }[] | null) {
  return (rows ?? []).reduce((acc, r) => acc + (Number(r.amount) || 0), 0)
}

function pctChange(curr: number, prev: number): { text: string; positive: boolean; neutral: boolean } {
  if (prev === 0 && curr === 0) return { text: '—', positive: true, neutral: true }
  if (prev === 0)               return { text: '+100%', positive: true, neutral: false }
  const pct = ((curr - prev) / Math.abs(prev)) * 100
  return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, positive: pct >= 0, neutral: false }
}

function fmtAmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function relDate(dateStr: string, lang: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (diff === 0) return lang === 'az' ? 'Bu gün'  : 'Today'
  if (diff === 1) return lang === 'az' ? 'Dünən'   : 'Yesterday'
  return lang === 'az' ? `${diff} gün əvvəl` : `${diff}d ago`
}

function estimateTax(s: TaxSettings | null, revenue: number, expenses: number): number {
  if (!s) return 0
  if (s.tax_regime === 'simplified') {
    const rate     = s.business_type === 'trade_food' ? 0.08 : 0.02
    const eligible = s.simplified_eligible && s.employee_count >= 3
    return revenue * rate * (eligible ? 0.25 : 1)
  }
  return Math.max(0, revenue - expenses) * 0.2
}

function taxRateLabel(s: TaxSettings | null): string {
  if (!s) return ''
  return s.tax_regime === 'simplified'
    ? (s.business_type === 'trade_food' ? ' (8%)' : ' (2%)')
    : ' (20%)'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyRange(q: any, r: DateRange) {
  if (r.start) q = q.gte('date', r.start)
  if (r.end)   q = q.lte('date', r.end)
  return q
}

// ── Revenue Chart ─────────────────────────────────────────────────────────────

// SVG user-space dimensions (preserveAspectRatio="none" fills container exactly)
const CW = 600, CH = 200, PL = 60, PR = 8, PT = 8, PB = 22
const DW = CW - PL - PR   // drawable width  (532)
const DH = CH - PT - PB   // drawable height (170)
const DB = PT + DH         // bottom Y of drawable area (178)

// Compact tooltip format: ₼1,500 (no decimals, no space)
function fmtT(n: number): string {
  if (n === 0) return '₼0'
  return `₼${Math.round(n).toLocaleString('en-US')}`
}

function roundedTopRect(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return ''
  const cr = Math.min(r, h / 2, w / 2)
  return [
    `M ${x},${y + h}`,
    `L ${x},${y + cr}`,
    `Q ${x},${y} ${x + cr},${y}`,
    `L ${x + w - cr},${y}`,
    `Q ${x + w},${y} ${x + w},${y + cr}`,
    `L ${x + w},${y + h}`,
    'Z',
  ].join(' ')
}

function niceYTicks(max: number): number[] {
  if (max <= 0) return [0, 100, 200, 300, 400]
  const raw = max / 4
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = ([1, 2, 2.5, 5, 10].find(f => f * mag >= raw) ?? 10) * mag
  const ticks = [0]
  while (ticks[ticks.length - 1] < max) ticks.push(ticks.length * step)
  return ticks
}

function fmtY(n: number): string {
  if (n >= 1_000_000) return `₼${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `₼${+(n / 1_000).toFixed(1)}K`
  return `₼${n}`
}

interface TooltipState { pctX: number; pctY: number; index: number }

function RevenueChart({ data }: { data: ChartPoint[] }) {
  const [animated, setAnimated] = useState(false)
  const [tooltip,  setTooltip]  = useState<TooltipState | null>(null)

  useEffect(() => {
    setAnimated(false)
    const t = setTimeout(() => setAnimated(true), 60)
    return () => clearTimeout(t)
  }, [data])

  const n      = data.length || 1
  const groupW = DW / n
  const barW   = Math.min(groupW * 0.33, 40)
  const barGap = Math.min(barW * 0.18, 6)
  const padLR  = (groupW - barW * 2 - barGap) / 2

  const maxVal  = Math.max(...data.map(d => Math.max(d.revenue, d.expenses)), 1)
  const ticks   = niceYTicks(maxVal)
  const maxTick = ticks[ticks.length - 1]

  const bH = (v: number) => v > 0 ? Math.max((v / maxTick) * DH, 4) : 0

  return (
    <div
      className="relative select-none"
      style={{ height: '200px' }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const pctX = (e.clientX - rect.left) / rect.width
        const pctY = (e.clientY - rect.top)  / rect.height
        const idx  = Math.floor((pctX * CW - PL) / groupW)
        if (idx >= 0 && idx < data.length) setTooltip({ pctX, pctY, index: idx })
        else setTooltip(null)
      }}
      onMouseLeave={() => setTooltip(null)}
    >
      {/* SVG fills container exactly — no letterboxing */}
      <svg
        viewBox={`0 0 ${CW} ${CH}`}
        preserveAspectRatio="none"
        overflow="visible"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#2563EB" />
            <stop offset="100%" stopColor="#60A5FA" />
          </linearGradient>
          <linearGradient id="gradExp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#F43F5E" />
            <stop offset="100%" stopColor="#FDA4AF" />
          </linearGradient>
          <filter id="bShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#00000018" />
          </filter>
        </defs>

        {/* Grid lines + Y-axis labels */}
        {ticks.slice(1).map((tick) => {
          const y = DB - (tick / maxTick) * DH
          return (
            <g key={tick}>
              <line x1={PL} y1={y} x2={CW - PR} y2={y} stroke="#F1F5F9" strokeWidth="1" />
              <text x={PL - 7} y={y + 3.5} textAnchor="end"
                    fontSize="11" fontWeight="400" fill="#94A3B8"
                    fontFamily="Inter, system-ui, sans-serif"
                    fontStretch="normal" letterSpacing="0">
                {fmtY(tick)}
              </text>
            </g>
          )
        })}

        {/* Bottom axis */}
        <line x1={PL} y1={DB} x2={CW - PR} y2={DB} stroke="#CBD5E1" strokeWidth="1.5" />

        {/* Column hover highlight (rendered behind bars) */}
        {data.map((_, i) => {
          const gx = PL + i * groupW
          return tooltip?.index === i ? (
            <rect key={i} x={gx + 1} y={PT} width={groupW - 2} height={DH + 1}
                  rx="4" fill="#EFF6FF" fillOpacity="0.65" />
          ) : null
        })}

        {/* Bars */}
        {data.map((pt, i) => {
          const gx   = PL + i * groupW
          const revX = gx + padLR
          const expX = revX + barW + barGap
          const rH   = bH(pt.revenue)
          const eH   = bH(pt.expenses)
          const revY = DB - rH
          const expY = DB - eH
          const hov  = tooltip?.index === i
          const org  = (cx: number) => `${(cx + barW / 2).toFixed(1)}px ${DB}px`
          const del  = (off: number) => `${(i * 0.025 + off).toFixed(3)}s`

          return (
            <g key={i}>
              {/* Revenue bar */}
              {rH > 0 ? (
                <g style={{
                  transform:       `scaleY(${animated ? 1 : 0})`,
                  transformOrigin: org(revX),
                  transition:      `transform 0.42s cubic-bezier(0.34,1.4,0.64,1) ${del(0)}`,
                }}>
                  <path d={roundedTopRect(revX, revY, barW, rH, 5)}
                        fill="url(#gradRev)" filter="url(#bShadow)"
                        opacity={!tooltip || hov ? 1 : 0.55} />
                </g>
              ) : (
                <path d={roundedTopRect(revX, DB - 4, barW, 4, 2)}
                      fill="#CBD5E1" opacity="0.3" />
              )}

              {/* Expenses bar */}
              {eH > 0 ? (
                <g style={{
                  transform:       `scaleY(${animated ? 1 : 0})`,
                  transformOrigin: org(expX),
                  transition:      `transform 0.42s cubic-bezier(0.34,1.4,0.64,1) ${del(0.013)}`,
                }}>
                  <path d={roundedTopRect(expX, expY, barW, eH, 5)}
                        fill="url(#gradExp)" filter="url(#bShadow)"
                        opacity={!tooltip || hov ? 1 : 0.55} />
                </g>
              ) : (
                <path d={roundedTopRect(expX, DB - 4, barW, 4, 2)}
                      fill="#CBD5E1" opacity="0.3" />
              )}

              {/* X-axis label */}
              <text x={gx + groupW / 2} y={DB + 17} textAnchor="middle"
                    fontSize="12" fontWeight={hov ? '600' : '400'}
                    fill={hov ? '#475569' : '#94A3B8'}
                    fontFamily="Inter, system-ui, sans-serif"
                    fontStretch="normal" letterSpacing="0">
                {pt.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (() => {
        const pt  = data[tooltip.index]
        const net = pt.revenue - pt.expenses
        return (
          <div
            className="absolute pointer-events-none z-20 bg-white rounded-xl border border-gray-100 shadow-xl px-3 py-2.5 min-w-[148px]"
            style={{
              left:      `${tooltip.pctX * 100}%`,
              top:       `${Math.max(tooltip.pctY * 100 - 4, 2)}%`,
              transform: 'translate(-50%, -100%)',
              fontSize:  '11px',
            }}
          >
            <p className="font-semibold text-gray-500 mb-1.5 pb-1.5 border-b border-gray-100 leading-none">
              {pt.label}
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#2563EB' }} />
                  Gəlir
                </span>
                <span className="font-semibold text-blue-600 tabular-nums">{fmtT(pt.revenue)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#F43F5E' }} />
                  Xərclər
                </span>
                <span className="font-semibold text-rose-500 tabular-nums">{fmtT(pt.expenses)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 pt-1 border-t border-gray-100">
                <span className="text-gray-400">Xalis</span>
                <span className={`font-bold tabular-nums ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {net >= 0 ? '+' : ''}{fmtT(net)}
                </span>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardClient() {
  const { t, lang } = useLanguage()
  const now = new Date()

  const [filter, setFilter] = useState<FilterState>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) return JSON.parse(saved) as FilterState
      } catch {}
    }
    return { preset: 'this_month', customFrom: '', customTo: '' }
  })
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filter)) } catch {}
  }, [filter])

  const [loading,      setLoading]      = useState(true)
  const [currRevenue,  setCurrRevenue]  = useState(0)
  const [prevRevenue,  setPrevRevenue]  = useState(0)
  const [unpaidTotal,  setUnpaidTotal]  = useState(0)
  const [unpaidCount,  setUnpaidCount]  = useState(0)
  const [currExpenses, setCurrExpenses] = useState(0)
  const [prevExpenses, setPrevExpenses] = useState(0)
  const [currTax,      setCurrTax]      = useState(0)
  const [prevTax,      setPrevTax]      = useState(0)
  const [taxSettings,  setTaxSettings]  = useState<TaxSettings | null>(null)
  const [chartData,    setChartData]    = useState<ChartPoint[]>([])
  const [activity,     setActivity]     = useState<ActivityItem[]>([])

  useEffect(() => {
    async function load() {
      setLoading(true)

      const sel         = getRange(filter, now)
      const prev        = getPrevRange(filter, now)
      const chartMonths = getChartMonths(filter, now)
      const chartStart  = chartMonths.length > 0
        ? monthRange(chartMonths[0].year, chartMonths[0].month).start
        : '2020-01-01'
      const chartEnd = chartMonths.length > 0
        ? monthRange(chartMonths[chartMonths.length - 1].year, chartMonths[chartMonths.length - 1].month).end
        : now.toISOString().slice(0, 10)

      const [
        { data: paidCurr  },
        { data: paidPrev  },
        { data: unpaidQ   },
        { data: expCurr   },
        { data: expPrev   },
        { data: paidChart },
        { data: expChart  },
        { data: recentInv },
        { data: recentExp },
        { data: taxRow    },
      ] = await Promise.all([
        applyRange(supabase.from('invoices').select('amount').eq('status', 'Paid'), sel),
        applyRange(supabase.from('invoices').select('amount').eq('status', 'Paid'), prev),
        applyRange(supabase.from('invoices').select('amount').eq('status', 'Unpaid'), sel),
        applyRange(supabase.from('expenses').select('amount'), sel),
        applyRange(supabase.from('expenses').select('amount'), prev),
        supabase.from('invoices').select('amount, date').eq('status', 'Paid').gte('date', chartStart).lte('date', chartEnd),
        supabase.from('expenses').select('amount, date').gte('date', chartStart).lte('date', chartEnd),
        supabase.from('invoices').select('amount, date, client, number').eq('status', 'Paid').order('date', { ascending: false }).limit(5),
        supabase.from('expenses').select('amount, date, description, category').order('date', { ascending: false }).limit(5),
        supabase.from('tax_settings').select('tax_regime, business_type, simplified_eligible, employee_count').maybeSingle(),
      ])

      const ts        = taxRow as TaxSettings | null
      const cRevenue  = sumRows(paidCurr)
      const pRevenue  = sumRows(paidPrev)
      const cExpenses = sumRows(expCurr)
      const pExpenses = sumRows(expPrev)

      setCurrRevenue(cRevenue)
      setPrevRevenue(pRevenue)
      setUnpaidTotal(sumRows(unpaidQ))
      setUnpaidCount(unpaidQ?.length ?? 0)
      setCurrExpenses(cExpenses)
      setPrevExpenses(pExpenses)
      setCurrTax(estimateTax(ts, cRevenue, cExpenses))
      setPrevTax(estimateTax(ts, pRevenue, pExpenses))
      setTaxSettings(ts)

      const shortLabels = lang === 'az' ? MS_AZ : MS_EN
      setChartData(chartMonths.map(({ year, month }) => {
        const r = monthRange(year, month)
        return {
          label:    shortLabels[month - 1],
          revenue:  sumRows((paidChart ?? []).filter(x => x.date >= r.start && x.date <= r.end)),
          expenses: sumRows((expChart  ?? []).filter(x => x.date >= r.start && x.date <= r.end)),
        }
      }))

      const invItems: ActivityItem[] = (recentInv ?? []).map(r => ({
        label:    r.number ? `${r.number} — ${r.client ?? ''}` : (r.client ?? 'Invoice'),
        amount:   `+${fmtAmt(Number(r.amount))}`,
        positive: true,
        date:     r.date as string,
      }))
      const expItems: ActivityItem[] = (recentExp ?? []).map(r => ({
        label:    (r.description || r.category) as string,
        amount:   `-${fmtAmt(Number(r.amount))}`,
        positive: false,
        date:     r.date as string,
      }))
      setActivity(
        [...invItems, ...expItems].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
      )

      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, refreshKey, lang])

  const currNet = currRevenue - currExpenses - currTax
  const prevNet = prevRevenue - prevExpenses - prevTax

  const canCompare     = filter.preset !== 'all_time'
  const noChg          = { text: '—', positive: true, neutral: true }
  const revChg         = canCompare ? pctChange(currRevenue, prevRevenue) : noChg
  const expChg         = canCompare ? pctChange(currExpenses, prevExpenses) : noChg
  const netChg         = canCompare ? pctChange(currNet, prevNet) : noChg
  const expBadgePos    = expChg.neutral ? true : !expChg.positive

  const label = periodLabel(filter, now, lang)

  const summaryCards = [
    {
      titleKey:      'dash.totalRevenue' as const,
      value:         fmtAmt(currRevenue),
      badge:         loading ? '…' : revChg.text,
      badgePositive: revChg.neutral ? true : revChg.positive,
      note:          label,
      borderAccent:  'border-l-blue-500',
      gradient:      'from-blue-50 to-white',
      iconBg:        'bg-blue-100 text-blue-600',
      breakdown:     undefined as undefined | Array<{ label: string; amount: string; negative?: boolean; total?: boolean }>,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      titleKey:      'dash.unpaidInvoices' as const,
      value:         fmtAmt(unpaidTotal),
      badge:         loading ? '…' : `${unpaidCount} ${lang === 'az' ? 'faktura' : unpaidCount === 1 ? 'invoice' : 'invoices'}`,
      badgePositive: false,
      note:          t('dash.awaitingPayment'),
      borderAccent:  'border-l-orange-500',
      gradient:      'from-orange-50 to-white',
      iconBg:        'bg-amber-100 text-amber-600',
      breakdown:     undefined as undefined | Array<{ label: string; amount: string; negative?: boolean; total?: boolean }>,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      titleKey:      'dash.totalExpenses' as const,
      value:         fmtAmt(currExpenses),
      badge:         loading ? '…' : expChg.text,
      badgePositive: expBadgePos,
      note:          label,
      borderAccent:  'border-l-red-500',
      gradient:      'from-red-50 to-white',
      iconBg:        'bg-red-100 text-red-600',
      breakdown:     undefined as undefined | Array<{ label: string; amount: string; negative?: boolean; total?: boolean }>,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
    {
      titleKey:      'dash.netProfitAfterTax' as const,
      value:         fmtAmt(currNet),
      badge:         loading ? '…' : netChg.text,
      badgePositive: netChg.neutral ? true : netChg.positive,
      note:          label,
      breakdown: loading ? undefined : [
        { label: t('dash.revenue'),                                    amount: fmtAmt(currRevenue) },
        { label: `− ${t('dash.expenses')}`,                           amount: fmtAmt(currExpenses), negative: true },
        { label: `− ${t('dash.estTax')}${taxRateLabel(taxSettings)}`, amount: fmtAmt(currTax),      negative: true },
        { label: `= ${t('dash.netProfitAfterTax')}`,                  amount: fmtAmt(currNet),      total: true },
      ],
      borderAccent: 'border-l-green-500',
      gradient:     'from-green-50 to-white',
      iconBg:       'bg-green-100 text-green-600',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
  ]

  const quickActions = [
    {
      labelKey: 'inv.newInvoice' as const,
      href:     '/invoices',
      color:    'bg-blue-600 hover:bg-blue-700',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      labelKey: 'exp.addExpense' as const,
      href:     '/expenses',
      color:    'bg-red-500 hover:bg-red-600',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
    {
      labelKey: 'cli.addClient' as const,
      href:     '/clients',
      color:    'bg-green-600 hover:bg-green-700',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
    },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900">{t('dash.welcome')}</h2>
        <p className="text-gray-500 text-sm mt-1">{t('dash.subtitle')}</p>
      </div>

      {/* Filter bar */}
      <div className="mb-6 flex flex-wrap items-center gap-2 bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => setFilter(prev => ({ ...prev, preset: p.key }))}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap ${
              filter.preset === p.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {lang === 'az' ? p.az : p.en}
          </button>
        ))}

        {filter.preset === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="date"
              value={filter.customFrom}
              onChange={e => setFilter(prev => ({ ...prev, customFrom: e.target.value }))}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <span className="text-gray-400 text-xs">→</span>
            <input
              type="date"
              value={filter.customTo}
              onChange={e => setFilter(prev => ({ ...prev, customTo: e.target.value }))}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        )}

        <button
          onClick={() => setRefreshKey(k => k + 1)}
          title={lang === 'az' ? 'Yenilə' : 'Refresh'}
          className="ml-auto p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {summaryCards.map((card) => (
          <div
            key={card.titleKey}
            className={`bg-gradient-to-br ${card.gradient} rounded-xl shadow-md border border-gray-100 border-l-4 ${card.borderAccent} p-5 flex flex-col gap-4 hover:shadow-lg transition-shadow`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">{t(card.titleKey)}</p>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.iconBg}`}>
                {card.icon}
              </div>
            </div>
            <div>
              {loading ? (
                <div className="h-10 w-32 bg-gray-200 animate-pulse rounded-lg" />
              ) : (
                <p className="text-4xl font-bold text-gray-900 tracking-tight">{card.value}</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  card.badgePositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {card.badge}
                </span>
                <span className="text-xs text-gray-400">{card.note}</span>
              </div>
              {card.breakdown && (
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
                  {card.breakdown.map((line, i) => (
                    <div
                      key={i}
                      className={`flex justify-between text-xs tabular-nums ${
                        line.total
                          ? 'font-semibold text-gray-800 pt-1 border-t border-gray-300'
                          : 'text-gray-500'
                      }`}
                    >
                      <span>{line.label}</span>
                      <span className={
                        line.total    ? (currNet >= 0 ? 'text-green-600' : 'text-red-500')
                        : line.negative ? 'text-red-500'
                        : 'text-gray-700'
                      }>
                        {line.amount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Chart + Recent Activity */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Premium bar chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 px-5 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">{t('dash.revenueVsExp')}</h3>
            <span className="text-xs text-gray-400 font-medium">{label}</span>
          </div>
          <RevenueChart data={chartData.length > 0 ? chartData : Array(5).fill({ label: '—', revenue: 0, expenses: 0 })} />
          <div className="flex items-center gap-5 mt-2 pl-1">
            <span className="flex items-center gap-1.5" style={{ fontSize: '12px', color: '#64748B' }}>
              <span className="w-2 h-2 rounded-sm inline-block flex-shrink-0"
                    style={{ background: 'linear-gradient(to bottom, #2563EB, #60A5FA)' }} />
              {t('dash.revenue')}
            </span>
            <span className="flex items-center gap-1.5" style={{ fontSize: '12px', color: '#64748B' }}>
              <span className="w-2 h-2 rounded-sm inline-block flex-shrink-0"
                    style={{ background: 'linear-gradient(to bottom, #F43F5E, #FDA4AF)' }} />
              {t('dash.expenses')}
            </span>
          </div>
        </div>

        {/* Recent Activity — always last 5 transactions, unfiltered */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('dash.recentActivity')}</h3>
          {loading ? (
            <div className="space-y-3">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="flex justify-between py-1.5 border-b border-gray-50">
                  <div className="space-y-1">
                    <div className="h-3 w-32 bg-gray-200 animate-pulse rounded" />
                    <div className="h-2 w-16 bg-gray-100 animate-pulse rounded" />
                  </div>
                  <div className="h-3 w-16 bg-gray-200 animate-pulse rounded" />
                </div>
              ))}
            </div>
          ) : activity.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">{t('common.noExpenses')}</p>
          ) : (
            <ul className="space-y-3">
              {activity.map((item, i) => (
                <li key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div className="min-w-0 pr-2">
                    <p className="text-sm text-gray-700 truncate">{item.label}</p>
                    <p className="text-xs text-gray-400">{relDate(item.date, lang)}</p>
                  </div>
                  <span className={`text-sm font-semibold whitespace-nowrap ${item.positive ? 'text-green-600' : 'text-red-500'}`}>
                    {item.amount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('dash.quickActions')}</h3>
        <div className="flex flex-wrap gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.labelKey}
              href={action.href}
              className={`flex items-center gap-3 ${action.color} text-white px-6 py-3 rounded-lg text-sm font-semibold transition-colors shadow-sm`}
            >
              {action.icon}
              {t(action.labelKey)}
            </Link>
          ))}
        </div>
      </div>

      <RecurringAlert />
      <TaxDeadlines />
    </div>
  )
}
