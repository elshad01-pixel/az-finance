'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useVendor } from '@/lib/VendorContext'

interface InvRow {
  id:               string
  invoice_number:   string
  po_id:            string | null
  invoice_date:     string
  total_amount:     number
  status:           string
  match_status:     string
  submitted_at:     string
  rejection_reason: string | null
  po_number?:       string
}

const fmt = (n: number) =>
  '₼ ' + n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

const STATUS_STYLE: Record<string, string> = {
  submitted:    'bg-blue-100 text-blue-700',
  under_review: 'bg-amber-100 text-amber-700',
  approved:     'bg-green-100 text-green-700',
  rejected:     'bg-red-100 text-red-700',
  paid:         'bg-teal-100 text-teal-700',
}

const MATCH_STYLE: Record<string, string> = {
  matched:     'bg-green-100 text-green-700',
  discrepancy: 'bg-amber-100 text-amber-700',
  pending:     'bg-gray-100 text-gray-500',
}

const MATCH_LABEL: Record<string, string> = {
  matched:     '✅ Matched',
  discrepancy: '⚠️ Discrepancy',
  pending:     '⏳ Pending',
}

export default function VendorInvoices() {
  const { access } = useVendor()
  const [invoices, setInvoices] = useState<InvRow[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!access) return
    async function load() {
      const { data } = await supabase
        .from('vendor_invoices')
        .select('id, invoice_number, po_id, invoice_date, total_amount, status, match_status, submitted_at, rejection_reason')
        .eq('vendor_id', access!.vendor_id)
        .eq('company_id', access!.company_id)
        .order('submitted_at', { ascending: false })

      // Enrich with PO numbers
      const poIds = [...new Set((data ?? []).map(i => i.po_id).filter(Boolean))] as string[]
      let poMap: Record<string, string> = {}
      if (poIds.length) {
        const { data: pos } = await supabase
          .from('purchase_orders')
          .select('id, po_number')
          .in('id', poIds)
        ;(pos ?? []).forEach(p => { poMap[p.id] = p.po_number })
      }

      setInvoices((data ?? []).map(i => ({ ...i, po_number: i.po_id ? poMap[i.po_id] : undefined })))
      setLoading(false)
    }
    load()
  }, [access])

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-400 text-sm">No invoices submitted yet.</p>
            <Link href="/vendor/purchase-orders" className="mt-3 inline-block text-sm text-teal-600 hover:text-teal-700 font-medium">
              View Purchase Orders →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO #</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase">Match</th>
                  <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoices.map(inv => (
                  <>
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-gray-800">{inv.invoice_number}</td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {inv.po_id ? (
                          <Link href={`/vendor/purchase-orders/${inv.po_id}`} className="text-teal-600 hover:underline">
                            {inv.po_number ?? inv.po_id.slice(0, 8)}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">{fmtDate(inv.invoice_date)}</td>
                      <td className="px-5 py-3.5 text-right font-medium text-gray-800">{fmt(inv.total_amount)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`text-xs px-2.5 py-1 rounded-full ${MATCH_STYLE[inv.match_status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {MATCH_LABEL[inv.match_status] ?? inv.match_status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`text-xs px-2.5 py-1 rounded-full capitalize ${STATUS_STYLE[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {inv.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                    {inv.status === 'rejected' && inv.rejection_reason && (
                      <tr key={`${inv.id}-reason`} className="bg-red-50">
                        <td colSpan={6} className="px-5 py-2 text-xs text-red-700">
                          <strong>Rejection reason:</strong> {inv.rejection_reason}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
