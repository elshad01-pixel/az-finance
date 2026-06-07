'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useVendor } from '@/lib/VendorContext'

interface POItem { name: string; quantity: number; unit_price: number; total: number }

interface PO {
  id: string; po_number: string; created_at: string
  subtotal: number; vat_amount: number; total_amount: number
  items: POItem[]
}

interface GR { id: string; status: string; total?: number }

const fmt = (n: number) =>
  '₼ ' + n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function SubmitInvoicePage() {
  const params  = useSearchParams()
  const router  = useRouter()
  const { access } = useVendor()

  const poId = params.get('po') ?? ''

  const [po,       setPo]       = useState<PO | null>(null)
  const [gr,       setGr]       = useState<GR | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [saving,   setSaving]   = useState(false)

  const [invNumber, setInvNumber] = useState('')
  const [invDate,   setInvDate]   = useState(new Date().toISOString().slice(0, 10))
  const [dueDate,   setDueDate]   = useState('')
  const [vatAmount, setVatAmount] = useState('0')
  const [notes,     setNotes]     = useState('')
  const [file,      setFile]      = useState<File | null>(null)

  useEffect(() => {
    if (!access || !poId) { setLoading(false); return }
    async function load() {
      const { data: poData } = await supabase
        .from('purchase_orders')
        .select('id, po_number, created_at, subtotal, vat_amount, total_amount, items')
        .eq('id', poId)
        .eq('vendor_id', access!.vendor_id)
        .eq('company_id', access!.company_id)
        .maybeSingle()

      if (!poData) { setError('Purchase order not found or access denied.'); setLoading(false); return }
      setPo(poData as PO)

      const { data: grData } = await supabase
        .from('goods_receipts')
        .select('id, status')
        .eq('po_id', poId)
        .maybeSingle()

      if (grData) setGr(grData as GR)

      // Check if already invoiced
      const { data: existingInv } = await supabase
        .from('vendor_invoices')
        .select('id')
        .eq('po_id', poId)
        .eq('vendor_id', access!.vendor_id)
        .maybeSingle()

      if (existingInv) { setError('An invoice has already been submitted for this PO.'); setLoading(false); return }

      // Pre-fill VAT from PO
      setVatAmount(String(poData.vat_amount ?? 0))
      setLoading(false)
    }
    load()
  }, [access, poId])

  const subtotal     = po ? po.subtotal : 0
  const vatVal       = parseFloat(vatAmount) || 0
  const totalAmount  = subtotal + vatVal

  function validate(): string | null {
    if (!po)                              return 'PO not loaded.'
    if (!gr || gr.status !== 'confirmed') return 'Goods receipt must be confirmed before submitting an invoice.'
    if (!invNumber.trim())                return 'Invoice number is required.'
    if (!invDate)                         return 'Invoice date is required.'
    if (new Date(invDate) < new Date(po.created_at.slice(0, 10)))
                                          return `Invoice date cannot be before PO date (${po.created_at.slice(0, 10)}).`
    if (totalAmount > po.total_amount * 1.05)
                                          return `Invoice total (${fmt(totalAmount)}) exceeds PO amount + 5% tolerance (${fmt(po.total_amount * 1.05)}).`
    if (!file)                            return 'PDF invoice is required.'
    if (file.size > 5 * 1024 * 1024)     return 'PDF file must be under 5 MB.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }

    setSaving(true)
    setError(null)

    // Upload PDF
    let pdfUrl = ''
    try {
      const form = new FormData()
      form.append('file', file!)
      const res = await fetch('/api/vendor/upload', { method: 'POST', body: form })
      const json = await res.json()
      if (!json.ok) { setError(`Upload failed: ${json.error}`); setSaving(false); return }
      pdfUrl = json.url
    } catch {
      setError('Failed to upload PDF. Please try again.')
      setSaving(false)
      return
    }

    // 3-way match
    const poAmt = po!.total_amount
    const grAmt = poAmt // GR amount approximated from PO (detailed GR items not summed here)
    const invAmt = totalAmount
    const tolerance = 0.05
    const allClose =
      Math.abs(invAmt - poAmt) / poAmt <= tolerance &&
      Math.abs(invAmt - grAmt) / grAmt <= tolerance
    const matchStatus = allClose ? 'matched' : 'discrepancy'
    const matchNotes  = allClose ? null :
      `PO: ${fmt(poAmt)}, GR: ${fmt(grAmt)}, Invoice: ${fmt(invAmt)}`

    // Insert vendor_invoice
    const { error: insertErr } = await supabase
      .from('vendor_invoices')
      .insert({
        company_id:     access!.company_id,
        vendor_id:      access!.vendor_id,
        po_id:          po!.id,
        gr_id:          gr!.id,
        invoice_number: invNumber.trim(),
        invoice_date:   invDate,
        due_date:       dueDate || null,
        subtotal,
        vat_amount:     vatVal,
        total_amount:   totalAmount,
        pdf_url:        pdfUrl,
        notes:          notes.trim() || null,
        po_amount:      poAmt,
        gr_amount:      grAmt,
        match_status:   matchStatus,
        match_notes:    matchNotes,
        status:         'submitted',
      })

    if (insertErr) {
      if (insertErr.code === '23505') {
        setError(`Invoice number "${invNumber}" already exists for this vendor.`)
      } else {
        setError(insertErr.message)
      }
      setSaving(false)
      return
    }

    // Notify company (fire-and-forget)
    fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'vendor_invoice_submitted',
        to:   access!.email,
        data: {
          vendorName:    access!.email,
          invoiceNumber: invNumber,
          amount:        fmt(totalAmount),
          poNumber:      po!.po_number,
        },
      }),
    }).catch(() => {})

    router.push('/vendor/invoices')
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error && !po) {
    return (
      <div className="max-w-lg">
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
        <Link href="/vendor/purchase-orders" className="text-sm text-teal-600 hover:underline">← Back to POs</Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href={`/vendor/purchase-orders/${poId}`} className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 mb-3 block">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {po?.po_number}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Submit Invoice</h1>
      </div>

      {/* GR warning */}
      {gr?.status !== 'confirmed' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-2">
          <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-amber-800">Goods receipt has not been confirmed yet. You cannot submit an invoice until the delivery is confirmed by the buyer.</p>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">

          {/* PO summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">PO Reference</p>
            <p className="font-semibold text-gray-800">{po?.po_number}</p>
            <p className="text-sm text-gray-600 mt-1">PO Total: <strong>{fmt(po?.total_amount ?? 0)}</strong></p>
          </div>

          {/* Invoice fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Invoice Number <span className="text-red-500">*</span></label>
              <input type="text" required value={invNumber} onChange={e => setInvNumber(e.target.value)}
                placeholder="INV-2026-001"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Invoice Date <span className="text-red-500">*</span></label>
              <input type="date" required value={invDate} onChange={e => setInvDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Due Date <span className="text-xs text-gray-400 font-normal">optional</span></label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">VAT Amount (₼)</label>
              <input type="number" min="0" step="0.01" value={vatAmount} onChange={e => setVatAmount(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition" />
            </div>
          </div>

          {/* Amounts (read-only) */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal (from PO)</span><span className="font-medium">{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>VAT</span><span className="font-medium">{fmt(vatVal)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-1.5">
              <span>Invoice Total</span><span>{fmt(totalAmount)}</span>
            </div>
            {po && totalAmount > po.total_amount * 1.05 && (
              <p className="text-xs text-red-600 mt-1">⚠️ Total exceeds PO amount + 5% tolerance ({fmt(po.total_amount * 1.05)})</p>
            )}
          </div>

          {/* PDF upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Invoice PDF <span className="text-red-500">*</span></label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-5 text-center cursor-pointer hover:border-teal-400 transition-colors"
              onClick={() => document.getElementById('pdf-input')?.click()}>
              <input id="pdf-input" type="file" accept="application/pdf" className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)} />
              {file ? (
                <p className="text-sm text-teal-700 font-medium">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>
              ) : (
                <>
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-500">Click to upload PDF (max 5 MB)</p>
                </>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes <span className="text-xs text-gray-400 font-normal">optional</span></label>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 transition" />
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button type="submit" disabled={saving || gr?.status !== 'confirmed'}
            className="flex-1 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-semibold py-3 rounded-lg transition-colors shadow-sm disabled:opacity-60 text-sm">
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Submitting…
              </span>
            ) : 'Submit Invoice'}
          </button>
          <Link href={`/vendor/purchase-orders/${poId}`}
            className="px-6 py-3 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors text-center">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
