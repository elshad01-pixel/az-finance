'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { LineItem, CompanyForPDF } from '@/lib/generateInvoicePDF'

interface Invoice {
  id:         number
  number:     string
  client:     string
  date:       string
  due_date:   string
  amount:     number
  status:     string
  line_items: LineItem[] | null
}

interface Props {
  invoice: Invoice
  onClose: () => void
}

const STATUS_STYLES: Record<string, string> = {
  Paid:   'bg-green-100 text-green-700 ring-1 ring-green-200',
  Unpaid: 'bg-red-100   text-red-700   ring-1 ring-red-200',
  Draft:  'bg-gray-100  text-gray-600  ring-1 ring-gray-300',
}

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function InvoiceDetailModal({ invoice, onClose }: Props) {
  const [company, setCompany]               = useState<CompanyForPDF | null>(null)
  const [hasCompanySettings, setHasCompanySettings] = useState(true)
  const [clientAddress, setClientAddress]   = useState('')
  const [clientEmail, setClientEmail]       = useState('')
  const [downloading, setDownloading]       = useState(false)

  useEffect(() => {
    Promise.all([
      supabase
        .from('company_settings')
        .select('company_name, company_address, tax_id, phone, email, bank_name, bank_account, swift_code')
        .maybeSingle(),
      supabase
        .from('tax_settings')
        .select('vat_registered')
        .maybeSingle(),
      supabase
        .from('clients')
        .select('address, email')
        .eq('company', invoice.client)
        .maybeSingle(),
    ]).then(([companyRes, taxRes, clientRes]) => {
      const cs = companyRes.data
      setHasCompanySettings(cs !== null && !!cs.company_name)
      setCompany({
        company_name:    cs?.company_name    ?? '',
        company_address: cs?.company_address ?? '',
        tax_id:          cs?.tax_id          ?? '',
        phone:           cs?.phone           ?? '',
        email:           cs?.email           ?? '',
        bank_name:       cs?.bank_name       ?? '',
        bank_account:    cs?.bank_account    ?? '',
        swift_code:      cs?.swift_code      ?? '',
        vat_registered:  taxRes.data?.vat_registered ?? false,
      })
      setClientAddress(clientRes.data?.address ?? '')
      setClientEmail(clientRes.data?.email ?? '')
    })
  }, [invoice.client])

  const items: LineItem[] =
    invoice.line_items?.length ? invoice.line_items
    : [{ description: 'Professional Services', quantity: 1, unit_price: invoice.amount }]

  const subtotal   = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const vatAmount  = company?.vat_registered ? subtotal * 0.18 : 0
  const grandTotal = subtotal + vatAmount

  async function handleDownload() {
    if (!company) return
    setDownloading(true)
    try {
      const { generateInvoicePDF } = await import('@/lib/generateInvoicePDF')
      await generateInvoicePDF(
        {
          number:        invoice.number,
          date:          invoice.date,
          due_date:      invoice.due_date,
          status:        invoice.status,
          client:        invoice.client,
          clientAddress,
          clientEmail,
          line_items:    items,
          amount:        invoice.amount,
        },
        company,
      )
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto py-8 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">

        {/* ── Modal header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Invoice Preview</h3>
            <p className="text-xs text-gray-400 mt-0.5">{invoice.number} · Click rows to edit</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── No-settings warning ── */}
        {company !== null && !hasCompanySettings && (
          <div className="mx-6 mb-0 mt-0 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-xs text-amber-700">
              Company name is missing.{' '}
              <a href="/company-settings" className="font-semibold underline">Complete Company Settings</a>{' '}
              before downloading to include your company details in the PDF.
            </p>
          </div>
        )}

        {/* ── Invoice document ── */}
        <div className="p-6">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">

            {/* Header bar */}
            <div className="bg-blue-900 px-8 py-6 flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold tracking-tight text-white">
                  Az<span className="text-blue-300">Finance</span>
                </p>
                <p className="text-blue-300 text-xs mt-0.5">Financial Management Platform</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-white tracking-widest">INVOICE</p>
                <p className="text-blue-200 text-sm mt-1">{invoice.number}</p>
              </div>
            </div>

            <div className="px-8 py-6 space-y-6">

              {/* Dates + Status */}
              <div className="flex items-start justify-between">
                <div className="flex gap-8">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Invoice Date</p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{fmtDate(invoice.date)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Due Date</p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{fmtDate(invoice.due_date)}</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_STYLES[invoice.status]}`}>
                  {invoice.status}
                </span>
              </div>

              {/* FROM / BILL TO */}
              <div className="grid grid-cols-2 gap-8 pt-2 border-t border-gray-100">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">From</p>
                  {company ? (
                    <>
                      {company.company_name ? (
                        <p className="text-sm font-bold text-gray-900">{company.company_name}</p>
                      ) : (
                        <p className="text-sm font-semibold text-red-600">Please complete Company Settings</p>
                      )}
                      {company.company_address && (
                        <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{company.company_address}</p>
                      )}
                      {company.tax_id && (
                        <p className="text-xs text-gray-500 mt-0.5"><span className="font-semibold">VÖEN:</span> {company.tax_id}</p>
                      )}
                      {company.phone && (
                        <p className="text-xs text-gray-500 mt-0.5"><span className="font-semibold">Tel:</span> {company.phone}</p>
                      )}
                      {company.email && (
                        <p className="text-xs text-gray-500 mt-0.5">{company.email}</p>
                      )}
                    </>
                  ) : (
                    <div className="h-16 bg-gray-50 rounded animate-pulse" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Bill To</p>
                  <p className="text-sm font-bold text-gray-900">{invoice.client}</p>
                  {clientAddress && <p className="text-sm text-gray-500 mt-1">{clientAddress}</p>}
                  {clientEmail   && <p className="text-sm text-gray-500 mt-0.5">{clientEmail}</p>}
                </div>
              </div>

              {/* Line items table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-blue-900 text-white">
                      <th className="text-left font-semibold px-4 py-3">Description</th>
                      <th className="text-center font-semibold px-4 py-3 w-16">Qty</th>
                      <th className="text-right font-semibold px-4 py-3 w-36">Unit Price</th>
                      <th className="text-right font-semibold px-4 py-3 w-36">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item, i) => (
                      <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="px-4 py-3 text-gray-800">{item.description}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{item.quantity}</td>
                        <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{fmt(item.unit_price)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                          {fmt(item.quantity * item.unit_price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-72 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-semibold text-gray-900 tabular-nums">{fmt(subtotal)}</span>
                  </div>
                  {company?.vat_registered && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">ƏDV (18%)</span>
                      <span className="font-semibold text-gray-900 tabular-nums">{fmt(vatAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center bg-blue-900 text-white px-4 py-3 rounded-lg mt-3">
                    <span className="text-sm font-bold">Grand Total</span>
                    <span className="text-lg font-bold tabular-nums">{fmt(grandTotal)}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Bank details */}
            {company && (company.bank_name || company.bank_account || company.swift_code) && (
              <div className="mx-8 mb-6 bg-blue-50 border border-blue-200 rounded-lg px-5 py-4">
                <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">
                  Bank Rekvizitləri / Bank Details
                </p>
                <div className="space-y-1">
                  {company.bank_name    && <p className="text-xs text-gray-700"><span className="font-semibold">Bank:</span> {company.bank_name}</p>}
                  {company.bank_account && <p className="text-xs text-gray-700"><span className="font-semibold">Hesab / IBAN:</span> {company.bank_account}</p>}
                  {company.swift_code   && <p className="text-xs text-gray-700"><span className="font-semibold">SWIFT:</span> {company.swift_code}</p>}
                </div>
              </div>
            )}

            {/* Document footer */}
            <div className="border-t border-gray-100 px-8 py-3 text-center">
              <p className="text-xs text-gray-400">Generated by AzFinance · Financial Management Platform</p>
            </div>
          </div>
        </div>

        {/* ── Modal footer ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading || !company}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            {downloading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Generating PDF…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
