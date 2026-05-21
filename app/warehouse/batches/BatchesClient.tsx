'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'

type BatchStatus = 'active' | 'consumed' | 'expired'

interface Batch {
  id:                 string
  batch_number:       string
  product_id:         string
  gr_id:              string | null
  po_number:          string | null
  received_date:      string
  expiry_date:        string | null
  quantity_received:  number
  quantity_remaining: number
  unit_cost:          number
  status:             BatchStatus
  created_at:         string
  products:           { sku: string; name: string; unit: string } | null
  warehouses:         { name: string } | null
}

const STATUS_STYLE: Record<BatchStatus, string> = {
  active:   'bg-green-100 text-green-700',
  consumed: 'bg-gray-100 text-gray-500',
  expired:  'bg-red-100 text-red-700',
}

function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.floor((new Date(dateStr).getTime() - now.getTime()) / 86_400_000)
}

function rowBg(b: Batch): string {
  if (b.status !== 'active' || !b.expiry_date) return ''
  const d = daysUntil(b.expiry_date)
  if (d < 0 || d <= 7)  return 'bg-red-50 hover:bg-red-100'
  if (d <= 30)           return 'bg-yellow-50 hover:bg-yellow-100'
  return ''
}

export default function BatchesClient() {
  const { t } = useLanguage()

  const [batches,      setBatches]      = useState<Batch[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filterStatus, setFilterStatus] = useState<BatchStatus | 'all'>('all')
  const [search,       setSearch]       = useState('')

  useEffect(() => {
    async function load() {
      let q = supabase
        .from('product_batches')
        .select('*, products(sku, name, unit), warehouses(name)')
        .order('received_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500)

      if (filterStatus !== 'all') q = q.eq('status', filterStatus)

      const { data } = await q
      setBatches((data as Batch[]) ?? [])
      setLoading(false)
    }
    load()
  }, [filterStatus])

  const filtered = batches.filter(b => {
    if (!search) return true
    const q = search.toLowerCase()
    return b.batch_number.toLowerCase().includes(q) ||
           (b.products?.name ?? '').toLowerCase().includes(q) ||
           (b.products?.sku  ?? '').toLowerCase().includes(q) ||
           (b.po_number      ?? '').toLowerCase().includes(q)
  })

  function fmtDate(s: string) {
    return new Date(s + 'T12:00:00').toLocaleDateString('az-AZ', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  }

  function expiryCell(b: Batch) {
    if (!b.expiry_date) return <span className="text-gray-300">—</span>
    const days    = daysUntil(b.expiry_date)
    const dateStr = fmtDate(b.expiry_date)
    if (days < 0)   return <span className="text-red-600 font-semibold">{dateStr} <span className="text-xs font-normal">(Vaxtı Keçib)</span></span>
    if (days <= 7)  return <span className="text-red-600 font-semibold">{dateStr} <span className="text-xs font-normal">({days}g)</span></span>
    if (days <= 30) return <span className="text-yellow-700 font-medium">{dateStr} <span className="text-xs font-normal">({days}g)</span></span>
    return <span className="text-gray-700">{dateStr}</span>
  }

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 bg-gray-100 rounded-lg" />
      <div className="h-96 bg-gray-100 rounded-xl" />
    </div>
  )

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('page.whBatches')}</h2>
          <p className="text-gray-500 text-sm mt-1">{filtered.length} partiya</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Partiya nömrəsi, məhsul adı və ya SO nömrəsi…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        </div>
        <div className="flex gap-1.5 bg-gray-100 rounded-lg p-1">
          {([
            { v: 'all',      l: 'Hamısı'              },
            { v: 'active',   l: t('wh.statusActive')  },
            { v: 'consumed', l: t('wh.statusConsumed') },
            { v: 'expired',  l: t('wh.statusExpired')  },
          ] as const).map(opt => (
            <button key={opt.v} onClick={() => setFilterStatus(opt.v)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                filterStatus === opt.v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{opt.l}</button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-100 inline-block" />
          ≤7 gün / Vaxtı keçmiş
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-yellow-100 inline-block" />
          8–30 gün
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {[
                  t('wh.batchNumber'),
                  t('wh.productName'),
                  'SO Nömrəsi',
                  t('proc.receivedDate'),
                  t('wh.expiryDate'),
                  t('wh.qtyReceived'),
                  t('wh.qtyRemaining'),
                  t('wh.costPrice'),
                  t('common.status'),
                ].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(b => (
                <tr key={b.id} className={`transition-colors ${rowBg(b) || 'hover:bg-slate-50'}`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{b.batch_number}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{b.products?.name ?? '—'}</p>
                    {b.products?.sku && <p className="text-xs font-mono text-gray-400 mt-0.5">{b.products.sku}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">{b.po_number ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{fmtDate(b.received_date)}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{expiryCell(b)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 tabular-nums text-right whitespace-nowrap">
                    {b.quantity_received} <span className="text-gray-400 text-xs">{b.products?.unit ?? ''}</span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold tabular-nums text-right whitespace-nowrap">
                    <span className={b.quantity_remaining <= 0 ? 'text-gray-300' : 'text-gray-900'}>
                      {b.quantity_remaining} <span className="text-gray-400 text-xs font-normal">{b.products?.unit ?? ''}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 tabular-nums text-right whitespace-nowrap">
                    ₼ {Number(b.unit_cost).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[b.status]}`}>
                      {b.status === 'active'   ? t('wh.statusActive')
                       : b.status === 'consumed' ? t('wh.statusConsumed')
                       : t('wh.statusExpired')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">{t('wh.noBatches')}</div>
        )}
      </div>
    </div>
  )
}
