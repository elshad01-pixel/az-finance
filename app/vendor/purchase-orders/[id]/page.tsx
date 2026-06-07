'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useVendor } from '@/lib/VendorContext'

interface POItem { name: string; quantity: number; unit_price: number; total: number }

interface PO {
  id: string; po_number: string; created_at: string; delivery_date: string | null
  payment_terms: string | null; notes: string | null
  subtotal: number; vat_amount: number; total_amount: number
  items: POItem[]
}

interface GR {
  id: string; receipt_number: string; received_date: string
  status: string; notes: string | null
  items: { name: string; quantity: number; unit_price?: number }[]
}

interface VendorInv {
  id: string; invoice_number: string; status: string; total_amount: number
  submitted_at: string; match_status: string
}

const fmt = (n: number) =>
  '₼ ' + n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

const MATCH_STYLE: Record<string, string> = {
  matched:     'bg-green-100 text-green-700',
  discrepancy: 'bg-amber-100 text-amber-700',
  pending:     'bg-gray-100 text-gray-500',
}

export default function VendorPODetail() {
  const { id }    = useParams<{ id: string }>()
  const router    = useRouter()
  const { access } = useVendor()
  const [po,      setPo]      = useState<PO | null>(null)
  const [gr,      setGr]      = useState<GR | null>(null)
  const [inv,     setInv]     = useState<VendorInv | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied,  setDenied]  = useState(false)

  useEffect(() => {
    if (!access || !id) return
    async function load() {
      const { data: poData } = await supabase
        .from('purchase_orders')
        .select('id, po_number, created_at, delivery_date, payment_terms, notes, subtotal, vat_amount, total_amount, items')
        .eq('id', id)
        .eq('vendor_id', access!.vendor_id)
        .eq('company_id', access!.company_id)
        .maybeSingle()

      if (!poData) { setDenied(true); setLoading(false); return }
      setPo(poData as PO)

      const [{ data: grData }, { data: invData }] = await Promise.all([
        supabase.from('goods_receipts')
          .select('id, receipt_number, received_date, status, notes, items')
          .eq('po_id', id)
          .maybeSingle(),
        supabase.from('vendor_invoices')
          .select('id, invoice_number, status, total_amount, submitted_at, match_status')
          .eq('po_id', id)
          .eq('vendor_id', access!.vendor_id)
          .maybeSingle(),
      ])
      if (grData) setGr(grData as GR)
      if (invData) setInv(invData as VendorInv)
      setLoading(false)
    }
    load()
  }, [access, id])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (denied || !po) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Purchase order not found.</p>
        <Link href="/vendor/purchase-orders" className="text-sm text-teal-600 hover:underline mt-2 block">← Back to POs</Link>
      </div>
    )
  }

  const canInvoice = gr?.status === 'confirmed' && !inv

  return (
    <div className="max-w-3xl space-y-5">
      {/* Back */}
      <Link href="/vendor/purchase-orders" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Purchase Orders
      </Link>

      {/* PO header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{po.po_number}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Issued {fmtDate(po.created_at)}</p>
          </div>
          {canInvoice && (
            <Link
              href={`/vendor/invoices/new?po=${po.id}`}
              className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              Submit Invoice
            </Link>
          )}
        </div>

        {(po.delivery_date || po.payment_terms) && (
          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
            {po.delivery_date && (
              <div><p className="text-gray-400 text-xs mb-0.5">Delivery Date</p><p className="font-medium text-gray-800">{fmtDate(po.delivery_date)}</p></div>
            )}
            {po.payment_terms && (
              <div><p className="text-gray-400 text-xs mb-0.5">Payment Terms</p><p className="font-medium text-gray-800">{po.payment_terms}</p></div>
            )}
          </div>
        )}

        {/* Line items */}
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Line Items</h3>
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Item</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Qty</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Unit Price</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(po.items ?? []).map((item, i) => (
                <tr key={i}>
                  <td className="px-4 py-2.5 text-gray-800">{item.name}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{item.quantity}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{fmt(item.unit_price)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(item.total ?? item.quantity * item.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="mt-4 space-y-1 text-sm text-right">
          <p className="text-gray-500">Subtotal: <span className="text-gray-800 font-medium">{fmt(po.subtotal)}</span></p>
          {po.vat_amount > 0 && <p className="text-gray-500">VAT (18%): <span className="text-gray-800 font-medium">{fmt(po.vat_amount)}</span></p>}
          <p className="text-base font-bold text-gray-900">Total: {fmt(po.total_amount)}</p>
        </div>
      </div>

      {/* GR section */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Goods Receipt</h2>
        {!gr ? (
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-lg p-3">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">Awaiting delivery confirmation. You cannot submit an invoice until goods are received.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-800">{gr.receipt_number}</span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full ${gr.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {gr.status === 'confirmed' ? 'Confirmed' : 'Draft'}
              </span>
              <span className="text-xs text-gray-400">{fmtDate(gr.received_date)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Existing invoice */}
      {inv && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Invoice Submitted</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800">{inv.invoice_number}</p>
              <p className="text-xs text-gray-400 mt-0.5">Submitted {fmtDate(inv.submitted_at)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2.5 py-1 rounded-full ${MATCH_STYLE[inv.match_status] ?? 'bg-gray-100 text-gray-500'}`}>
                {inv.match_status === 'matched' ? '✅ Matched' : inv.match_status === 'discrepancy' ? '⚠️ Discrepancy' : '⏳ Pending'}
              </span>
              <span className="text-sm font-bold text-gray-900">{fmt(inv.total_amount)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
