'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompany } from '@/lib/CompanyContext'

type Status    = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid'
type FilterTab = 'all' | 'pending' | 'approved' | 'rejected' | 'paid'

interface VendorInv {
  id:               string
  invoice_number:   string
  invoice_date:     string
  due_date:         string | null
  total_amount:     number
  status:           Status
  match_status:     string
  match_notes:      string | null
  rejection_reason: string | null
  pdf_url:          string | null
  submitted_at:     string
  approved_at:      string | null
  paid_at:          string | null
  po_amount:        number | null
  gr_amount:        number | null
  vendor_name:      string
  vendor_email:     string | null
  po_number:        string | null
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

const MATCH_LABEL: Record<string, string> = {
  matched:     '✅ Matched',
  discrepancy: '⚠️ Discrepancy',
  pending:     '⏳ Pending',
}

const MATCH_STYLE: Record<string, string> = {
  matched:     'bg-green-100 text-green-700',
  discrepancy: 'bg-amber-100 text-amber-700',
  pending:     'bg-gray-100 text-gray-500',
}

export default function VendorInvoicesClient() {
  const { company, isAdmin, isManager } = useCompany()
  const [invoices,  setInvoices]  = useState<VendorInv[]>([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState<FilterTab>('all')
  const [rejectId,  setRejectId]  = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [saving,    setSaving]    = useState(false)

  const load = useCallback(async () => {
    if (!company) return
    const { data } = await supabase
      .from('vendor_invoices')
      .select(`
        id, invoice_number, invoice_date, due_date, total_amount, status,
        match_status, match_notes, rejection_reason, pdf_url, submitted_at,
        approved_at, paid_at, po_amount, gr_amount,
        vendors(name, email),
        purchase_orders(po_number)
      `)
      .eq('company_id', company.id)
      .order('submitted_at', { ascending: false })

    setInvoices((data ?? []).map((d: any) => ({
      ...d,
      vendor_name:  d.vendors?.name ?? 'Unknown',
      vendor_email: d.vendors?.email ?? null,
      po_number:    d.purchase_orders?.po_number ?? null,
    })))
    setLoading(false)
  }, [company])

  useEffect(() => { load() }, [load])

  const filtered = invoices.filter(inv => {
    if (tab === 'pending')  return inv.status === 'submitted' || inv.status === 'under_review'
    if (tab === 'approved') return inv.status === 'approved'
    if (tab === 'rejected') return inv.status === 'rejected'
    if (tab === 'paid')     return inv.status === 'paid'
    return true
  })

  const pendingCount = invoices.filter(i => i.status === 'submitted' || i.status === 'under_review').length

  async function handleApprove(inv: VendorInv) {
    setSaving(true)
    await supabase.from('vendor_invoices')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', inv.id)

    if (inv.vendor_email) {
      fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'vendor_invoice_approved',
          to:   inv.vendor_email,
          data: { invoiceNumber: inv.invoice_number, companyName: company?.name ?? '' },
        }),
      }).catch(() => {})
    }

    await load()
    setSaving(false)
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) return
    setSaving(true)
    const inv = invoices.find(i => i.id === id)

    await supabase.from('vendor_invoices')
      .update({ status: 'rejected', rejection_reason: rejectReason.trim(), reviewed_at: new Date().toISOString() })
      .eq('id', id)

    if (inv?.vendor_email) {
      fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'vendor_invoice_rejected',
          to:   inv.vendor_email,
          data: { invoiceNumber: inv.invoice_number, companyName: company?.name ?? '', reason: rejectReason.trim() },
        }),
      }).catch(() => {})
    }

    setRejectId(null)
    setRejectReason('')
    await load()
    setSaving(false)
  }

  async function handleMarkPaid(inv: VendorInv) {
    setSaving(true)
    await supabase.from('vendor_invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', inv.id)

    if (inv.vendor_email) {
      fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'vendor_payment_confirmed',
          to:   inv.vendor_email,
          data: { invoiceNumber: inv.invoice_number, amount: fmt(inv.total_amount), companyName: company?.name ?? '' },
        }),
      }).catch(() => {})
    }

    await load()
    setSaving(false)
  }

  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'all',      label: `All (${invoices.length})` },
    { id: 'pending',  label: `Pending Review${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'paid',     label: 'Paid' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Vendor Invoices</h2>
          <p className="text-gray-500 text-sm mt-0.5">Review and approve invoices submitted through the Vendor Portal.</p>
        </div>
        {pendingCount > 0 && (
          <span className="bg-amber-100 text-amber-700 text-sm font-semibold px-3 py-1.5 rounded-full">
            {pendingCount} awaiting review
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
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
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">No vendor invoices found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO #</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase">3-Way Match</th>
                  <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-800">{inv.vendor_name}</p>
                      <p className="text-xs text-gray-400">{fmtDate(inv.submitted_at)}</p>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-gray-800">{inv.invoice_number}</td>
                    <td className="px-5 py-3.5 text-gray-600">{inv.po_number ?? '—'}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-gray-900">{fmt(inv.total_amount)}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full ${MATCH_STYLE[inv.match_status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {MATCH_LABEL[inv.match_status] ?? inv.match_status}
                      </span>
                      {inv.match_notes && (
                        <p className="text-xs text-gray-400 mt-1">{inv.match_notes}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full capitalize ${STATUS_STYLE[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {inv.status.replace('_', ' ')}
                      </span>
                      {inv.status === 'rejected' && inv.rejection_reason && (
                        <p className="text-xs text-red-500 mt-1 max-w-40 truncate" title={inv.rejection_reason}>
                          {inv.rejection_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        {/* View PDF */}
                        {inv.pdf_url && (
                          <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg transition-colors">
                            PDF
                          </a>
                        )}

                        {/* Approve */}
                        {(inv.status === 'submitted' || inv.status === 'under_review') && (isAdmin || isManager) && (
                          <button onClick={() => handleApprove(inv)} disabled={saving}
                            className="text-xs text-white bg-green-600 hover:bg-green-700 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
                            Approve
                          </button>
                        )}

                        {/* Reject */}
                        {(inv.status === 'submitted' || inv.status === 'under_review') && (isAdmin || isManager) && (
                          <button onClick={() => { setRejectId(inv.id); setRejectReason('') }} disabled={saving}
                            className="text-xs text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
                            Reject
                          </button>
                        )}

                        {/* Mark paid */}
                        {inv.status === 'approved' && (isAdmin || isManager) && (
                          <button onClick={() => handleMarkPaid(inv)} disabled={saving}
                            className="text-xs text-white bg-teal-600 hover:bg-teal-700 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
                            Mark Paid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-gray-900 mb-1">Reject Invoice</h3>
            <p className="text-sm text-gray-500 mb-4">Please provide a reason so the vendor can resubmit a corrected invoice.</p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Invoice amount exceeds PO total, incorrect VAT calculation…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 transition mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => handleReject(rejectId)} disabled={saving || !rejectReason.trim()}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                {saving ? 'Rejecting…' : 'Reject Invoice'}
              </button>
              <button onClick={() => { setRejectId(null); setRejectReason('') }}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-2.5 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
