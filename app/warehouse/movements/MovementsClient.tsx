'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'

type MovementType = 'in' | 'out' | 'adjustment' | 'transfer'

interface Movement {
  id:            string
  movement_type: MovementType
  quantity:      number
  unit_cost:     number | null
  total_cost:    number | null
  reference_type: string | null
  notes:         string | null
  created_at:    string
  products:      { sku: string; name: string; unit: string } | null
  warehouses:    { name: string } | null
}

type DateFilter = 'thisMonth' | 'lastMonth' | 'thisYear' | 'all'

function getDateRange(f: DateFilter) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth()
  if (f === 'thisMonth')  return { start: new Date(y, m, 1).toISOString(), end: new Date(y, m + 1, 0, 23, 59, 59).toISOString() }
  if (f === 'lastMonth')  return { start: new Date(y, m - 1, 1).toISOString(), end: new Date(y, m, 0, 23, 59, 59).toISOString() }
  if (f === 'thisYear')   return { start: new Date(y, 0, 1).toISOString(), end: new Date(y, 11, 31, 23, 59, 59).toISOString() }
  return null
}

const TYPE_STYLE: Record<MovementType, { label_key: string; cls: string }> = {
  in:         { label_key: 'wh.movIn',       cls: 'bg-green-100 text-green-700' },
  out:        { label_key: 'wh.movOut',      cls: 'bg-red-100 text-red-700' },
  adjustment: { label_key: 'wh.movAdj',      cls: 'bg-blue-100 text-blue-700' },
  transfer:   { label_key: 'wh.movTransfer', cls: 'bg-purple-100 text-purple-700' },
}

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtQty(n: number) {
  return n % 1 === 0 ? (n > 0 ? '+' : '') + String(n) : (n > 0 ? '+' : '') + n.toFixed(3).replace(/\.?0+$/, '')
}

export default function MovementsClient() {
  const { t, lang } = useLanguage()

  const [movements,    setMovements]    = useState<Movement[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filterType,   setFilterType]   = useState<MovementType | 'all'>('all')
  const [filterDate,   setFilterDate]   = useState<DateFilter>('thisMonth')
  const [search,       setSearch]       = useState('')

  useEffect(() => {
    async function load() {
      let q = supabase
        .from('stock_movements')
        .select('*, products(sku, name, unit), warehouses(name)')
        .order('created_at', { ascending: false })
        .limit(500)

      const range = getDateRange(filterDate)
      if (range) q = q.gte('created_at', range.start).lte('created_at', range.end)
      if (filterType !== 'all') q = q.eq('movement_type', filterType)

      const { data } = await q
      setMovements((data as Movement[]) ?? [])
      setLoading(false)
    }
    load()
  }, [filterType, filterDate])

  const filtered = movements.filter(m => {
    if (!search) return true
    const q = search.toLowerCase()
    return (m.products?.name ?? '').toLowerCase().includes(q) ||
           (m.products?.sku  ?? '').toLowerCase().includes(q) ||
           (m.notes ?? '').toLowerCase().includes(q)
  })

  function formatDate(s: string) {
    return new Date(s).toLocaleDateString(lang === 'az' ? 'az-AZ' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 bg-gray-100 rounded-lg" />
      <div className="h-96 bg-gray-100 rounded-xl" />
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('page.whMovements')}</h2>
          <p className="text-gray-500 text-sm mt-1">{filtered.length} {lang === 'az' ? 'hərəkət' : 'movements'}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={lang === 'az' ? 'Məhsul adı ilə axtar…' : 'Search by product…'}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>
        {/* Type filter */}
        <div className="flex gap-1.5 bg-gray-100 rounded-lg p-1">
          {([
            { v: 'all',        l: lang === 'az' ? 'Hamısı' : 'All' },
            { v: 'in',         l: t('wh.movIn') },
            { v: 'out',        l: t('wh.movOut') },
            { v: 'adjustment', l: t('wh.movAdj') },
          ] as const).map(opt => (
            <button key={opt.v} onClick={() => setFilterType(opt.v)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                filterType === opt.v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{opt.l}</button>
          ))}
        </div>
        {/* Date filter */}
        <div className="flex gap-1.5 bg-gray-100 rounded-lg p-1">
          {([
            { v: 'thisMonth', l: lang === 'az' ? 'Bu Ay'    : 'This Month' },
            { v: 'lastMonth', l: lang === 'az' ? 'Keçən Ay' : 'Last Month' },
            { v: 'thisYear',  l: lang === 'az' ? 'Bu İl'    : 'This Year'  },
            { v: 'all',       l: lang === 'az' ? 'Hamısı'   : 'All'        },
          ] as const).map(opt => (
            <button key={opt.v} onClick={() => setFilterDate(opt.v)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                filterDate === opt.v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{opt.l}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{t('common.date')}</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{t('wh.productName')}</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{t('common.status')}</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{t('common.quantity')}</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{t('wh.costPrice')}</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{t('common.amount')}</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{t('wh.reference')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(m => {
                const ts = TYPE_STYLE[m.movement_type]
                const qty = m.movement_type === 'out' || (m.movement_type === 'adjustment' && m.quantity < 0)
                  ? m.quantity : Math.abs(m.quantity)
                return (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(m.created_at)}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{m.products?.name ?? '—'}</p>
                      {m.products?.sku && <p className="text-xs font-mono text-gray-400 mt-0.5">{m.products.sku}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${ts.cls}`}>
                        {t(ts.label_key as 'wh.movIn')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold tabular-nums text-right">
                      <span className={m.movement_type === 'in' ? 'text-green-600' : m.movement_type === 'out' ? 'text-red-600' : 'text-blue-600'}>
                        {fmtQty(qty)} {m.products?.unit ?? ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 tabular-nums text-right">
                      {m.unit_cost != null ? fmt(m.unit_cost) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 tabular-nums text-right">
                      {m.total_cost != null ? fmt(m.total_cost) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {m.notes ? (
                        <span className="inline-block max-w-[160px] truncate" title={m.notes}>{m.notes}</span>
                      ) : m.reference_type ? (
                        <span className="text-gray-400">{m.reference_type}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">{t('wh.noMovements')}</div>
        )}
      </div>
    </div>
  )
}
