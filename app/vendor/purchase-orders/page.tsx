'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useVendor } from '@/lib/VendorContext'

type FilterTab = 'all' | 'awaiting_gr' | 'ready' | 'invoiced'

interface PORow {
  id:            string
  po_number:     string
  created_at:    string
  total_amount:  number
  status:        string
  gr_status:     string | null
  gr_id:         string | null
  has_invoice:   boolean
}

const fmt = (n: number) =>
  '₼ ' + n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

export default function VendorPurchaseOrders() {
  const { access } = useVendor()
  const [pos,     setPos]     = useState<PORow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<FilterTab>('all')

  useEffect(() => {
    if (!access) return
    async function load() {
      const { data: poData } = await supabase
        .from('purchase_orders')
        .select('id, po_number, created_at, total_amount, status')
        .eq('vendor_id', access!.vendor_id)
        .eq('company_id', access!.company_id)
        .order('created_at', { ascending: false })

      const ids = (poData ?? []).map(p => p.id)
      let grMap: Record<string, { status: string; id: string }> = {}
      let invoicedSet = new Set<string>()

      if (ids.length) {
        const [{ data: grs }, { data: invs }] = await Promise.all([
          supabase.from('goods_receipts').select('po_id, id, status').in('po_id', ids),
          supabase.from('vendor_invoices').select('po_id').in('po_id', ids),
        ])
        ;(grs ?? []).forEach(g => { grMap[g.po_id] = { status: g.status, id: g.id } })
        ;(invs ?? []).forEach(i => { if (i.po_id) invoicedSet.add(i.po_id) })
      }

      setPos((poData ?? []).map(p => ({
        ...p,
        gr_status:   grMap[p.id]?.status ?? null,
        gr_id:       grMap[p.id]?.id ?? null,
        has_invoice: invoicedSet.has(p.id),
      })))
      setLoading(false)
    }
    load()
  }, [access])

  const filtered = pos.filter(p => {
    if (tab === 'awaiting_gr') return p.gr_status !== 'confirmed'
    if (tab === 'ready')       return p.gr_status === 'confirmed' && !p.has_invoice
    if (tab === 'invoiced')    return p.has_invoice
    return true
  })

  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'all',        label: `All (${pos.length})` },
    { id: 'awaiting_gr', label: 'Awaiting GR' },
    { id: 'ready',      label: 'Ready to Invoice' },
    { id: 'invoiced',   label: 'Invoiced' },
  ]

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>

      {/* Filter tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">No purchase orders found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO Number</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase">GR Status</th>
                  <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase">Invoice</th>
                  <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(po => {
                  const canInvoice = po.gr_status === 'confirmed' && !po.has_invoice
                  return (
                    <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/vendor/purchase-orders/${po.id}`} className="font-semibold text-teal-600 hover:underline">
                          {po.po_number}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">{fmtDate(po.created_at)}</td>
                      <td className="px-5 py-3.5 text-right font-medium text-gray-800">{fmt(po.total_amount)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`text-xs px-2.5 py-1 rounded-full ${
                          po.gr_status === 'confirmed' ? 'bg-green-100 text-green-700' :
                          po.gr_status === 'draft'     ? 'bg-amber-100 text-amber-700' :
                                                         'bg-gray-100 text-gray-500'
                        }`}>
                          {po.gr_status === 'confirmed' ? 'Confirmed' :
                           po.gr_status === 'draft'     ? 'Draft GR' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {po.has_invoice ? (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">Invoiced</span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {canInvoice ? (
                          <Link
                            href={`/vendor/invoices/new?po=${po.id}`}
                            className="text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Submit Invoice
                          </Link>
                        ) : (
                          <Link
                            href={`/vendor/purchase-orders/${po.id}`}
                            className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                          >
                            View
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
