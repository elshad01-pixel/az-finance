'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useVendor } from '@/lib/VendorContext'

interface PORow {
  id:         string
  po_number:  string
  created_at: string
  total_amount: number
  status:     string
  gr_status?: string
}

interface InvRow {
  id:             string
  invoice_number: string
  po_id:          string | null
  total_amount:   number
  status:         string
  submitted_at:   string
}

const fmt = (n: number) =>
  '₼ ' + n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const INV_STATUS_STYLE: Record<string, string> = {
  submitted:    'bg-blue-100 text-blue-700',
  under_review: 'bg-amber-100 text-amber-700',
  approved:     'bg-green-100 text-green-700',
  rejected:     'bg-red-100 text-red-700',
  paid:         'bg-teal-100 text-teal-700',
}

export default function VendorDashboard() {
  const { access, vendor } = useVendor()
  const [stats, setStats]       = useState({ openPOs: 0, submitted: 0, approved: 0, paid: 0 })
  const [recentPOs, setRecentPOs]     = useState<PORow[]>([])
  const [recentInvs, setRecentInvs]   = useState<InvRow[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!access) return
    async function load() {
      // PO stats
      const { data: pos } = await supabase
        .from('purchase_orders')
        .select('id, po_number, created_at, total_amount, status')
        .eq('vendor_id', access!.vendor_id)
        .eq('company_id', access!.company_id)
        .order('created_at', { ascending: false })
        .limit(5)

      // GR status for recent POs
      const poIds = (pos ?? []).map(p => p.id)
      let grMap: Record<string, string> = {}
      if (poIds.length) {
        const { data: grs } = await supabase
          .from('goods_receipts')
          .select('po_id, status')
          .in('po_id', poIds)
        ;(grs ?? []).forEach(g => { grMap[g.po_id] = g.status })
      }
      setRecentPOs((pos ?? []).map(p => ({ ...p, gr_status: grMap[p.id] })))

      // Invoice stats + recent
      const { data: invs } = await supabase
        .from('vendor_invoices')
        .select('id, invoice_number, po_id, total_amount, status, submitted_at')
        .eq('vendor_id', access!.vendor_id)
        .eq('company_id', access!.company_id)
        .order('submitted_at', { ascending: false })

      const all = invs ?? []
      setStats({
        openPOs:   (pos ?? []).length,
        submitted: all.filter(i => i.status === 'submitted' || i.status === 'under_review').length,
        approved:  all.filter(i => i.status === 'approved').length,
        paid:      all.filter(i => i.status === 'paid').length,
      })
      setRecentInvs(all.slice(0, 5))
      setLoading(false)
    }
    load()
  }, [access])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-24" />
          ))}
        </div>
      </div>
    )
  }

  const cards = [
    { label: 'Open POs',        value: stats.openPOs,   color: 'border-l-teal-500',  bg: 'bg-teal-50',  text: 'text-teal-700' },
    { label: 'Submitted',       value: stats.submitted, color: 'border-l-blue-500',  bg: 'bg-blue-50',  text: 'text-blue-700' },
    { label: 'Approved',        value: stats.approved,  color: 'border-l-green-500', bg: 'bg-green-50', text: 'text-green-700' },
    { label: 'Paid',            value: stats.paid,      color: 'border-l-gray-400',  bg: 'bg-gray-50',  text: 'text-gray-700' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Welcome back, {vendor?.name}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${c.color} p-5 shadow-sm`}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-3xl font-bold mt-1 ${c.text}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent POs */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Recent Purchase Orders</h3>
            <Link href="/vendor/purchase-orders" className="text-xs text-teal-600 hover:text-teal-700 font-medium">
              View all →
            </Link>
          </div>
          {recentPOs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No purchase orders yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-500">PO #</th>
                  <th className="px-5 py-2.5 text-right text-xs font-medium text-gray-500">Amount</th>
                  <th className="px-5 py-2.5 text-right text-xs font-medium text-gray-500">GR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentPOs.map(po => (
                  <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/vendor/purchase-orders/${po.id}`} className="font-medium text-teal-600 hover:underline">
                        {po.po_number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">{fmt(po.total_amount)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        po.gr_status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        po.gr_status === 'draft'     ? 'bg-amber-100 text-amber-700' :
                                                       'bg-gray-100 text-gray-500'
                      }`}>
                        {po.gr_status === 'confirmed' ? 'Confirmed' : po.gr_status === 'draft' ? 'Draft' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Invoices */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Recent Invoices</h3>
            <Link href="/vendor/invoices" className="text-xs text-teal-600 hover:text-teal-700 font-medium">
              View all →
            </Link>
          </div>
          {recentInvs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No invoices submitted yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-500">Invoice #</th>
                  <th className="px-5 py-2.5 text-right text-xs font-medium text-gray-500">Amount</th>
                  <th className="px-5 py-2.5 text-right text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentInvs.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-800">{inv.invoice_number}</td>
                    <td className="px-5 py-3 text-right text-gray-700">{fmt(inv.total_amount)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${INV_STATUS_STYLE[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {inv.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
