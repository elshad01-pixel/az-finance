'use client'

import { useState } from 'react'

type Status = 'Paid' | 'Unpaid' | 'Draft'

interface Invoice {
  id: number
  number: string
  client: string
  date: string
  dueDate: string
  amount: number
  status: Status
}

interface LineItem {
  id: number
  description: string
  quantity: string
  unitPrice: string
}

const INITIAL_INVOICES: Invoice[] = [
  { id: 1, number: 'INV-1001', client: 'Baku Tech LLC',     date: '2026-04-15', dueDate: '2026-05-15', amount: 4200,  status: 'Paid'   },
  { id: 2, number: 'INV-1002', client: 'Caspian Energy',    date: '2026-04-22', dueDate: '2026-05-22', amount: 7800,  status: 'Paid'   },
  { id: 3, number: 'INV-1003', client: 'Atlas Group',       date: '2026-05-01', dueDate: '2026-05-31', amount: 3500,  status: 'Unpaid' },
  { id: 4, number: 'INV-1004', client: 'Silk Road Hotels',  date: '2026-05-03', dueDate: '2026-06-03', amount: 9200,  status: 'Unpaid' },
  { id: 5, number: 'INV-1005', client: 'Azerenerji',        date: '2026-05-05', dueDate: '2026-06-05', amount: 1850,  status: 'Unpaid' },
  { id: 6, number: 'INV-1006', client: 'Socar Trading',     date: '2026-05-06', dueDate: '2026-06-06', amount: 12400, status: 'Draft'  },
  { id: 7, number: 'INV-1007', client: 'Kapital Bank',      date: '2026-04-10', dueDate: '2026-05-10', amount: 2500,  status: 'Paid'   },
]

const STATUS_STYLES: Record<Status, string> = {
  Paid:   'bg-green-100 text-green-700',
  Unpaid: 'bg-red-100   text-red-700',
  Draft:  'bg-gray-100  text-gray-500',
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const EMPTY_LINE = (): LineItem => ({ id: Date.now(), description: '', quantity: '1', unitPrice: '' })

export default function InvoicesClient() {
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES)
  const [showModal, setShowModal] = useState(false)

  const [clientName, setClientName] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [dueDate, setDueDate]       = useState('')
  const [lineItems, setLineItems]   = useState<LineItem[]>([EMPTY_LINE()])

  const total = lineItems.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
  }, 0)

  function updateLine(id: number, field: keyof Omit<LineItem, 'id'>, val: string) {
    setLineItems(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l))
  }

  function removeLine(id: number) {
    setLineItems(prev => prev.filter(l => l.id !== id))
  }

  function resetForm() {
    setClientName(''); setInvoiceDate(''); setDueDate('')
    setLineItems([EMPTY_LINE()])
  }

  function closeModal() { setShowModal(false); resetForm() }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setInvoices(prev => [{
      id:      Date.now(),
      number:  `INV-${1000 + prev.length + 1}`,
      client:  clientName,
      date:    invoiceDate,
      dueDate,
      amount:  total,
      status:  'Draft',
    }, ...prev])
    closeModal()
  }

  const paid   = invoices.filter(i => i.status === 'Paid').length
  const unpaid = invoices.filter(i => i.status === 'Unpaid').length
  const draft  = invoices.filter(i => i.status === 'Draft').length

  return (
    <div>

      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invoices</h2>
          <p className="text-gray-500 text-sm mt-1">
            {invoices.length} total &mdash;{' '}
            <span className="text-green-600 font-medium">{paid} paid</span>,{' '}
            <span className="text-red-500 font-medium">{unpaid} unpaid</span>,{' '}
            <span className="text-gray-400 font-medium">{draft} draft</span>
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Invoice
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Invoice #', 'Client Name', 'Date', 'Due Date', 'Amount (AZN)', 'Status'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-semibold text-blue-600">{inv.number}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{inv.client}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(inv.date)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(inv.dueDate)}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">{fmt(inv.amount)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[inv.status]}`}>
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {invoices.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">
            No invoices yet. Click <strong>New Invoice</strong> to create one.
          </div>
        )}
      </div>

      {/* ── Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">New Invoice</h3>
                <p className="text-xs text-gray-400 mt-0.5">Fill in the details below</p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-5">

                {/* Client */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Client Name</label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="e.g. Baku Tech LLC"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Invoice Date</label>
                    <input
                      type="date"
                      required
                      value={invoiceDate}
                      onChange={e => setInvoiceDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Due Date</label>
                    <input
                      type="date"
                      required
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                {/* Line items */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Line Items</label>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_72px_104px_88px_32px] bg-gray-50 border-b border-gray-200">
                      {['Description', 'Qty', 'Unit Price', 'Total', ''].map(h => (
                        <div key={h} className="text-xs font-semibold text-gray-500 px-3 py-2">{h}</div>
                      ))}
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-gray-100">
                      {lineItems.map(item => {
                        const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
                        return (
                          <div key={item.id} className="grid grid-cols-[1fr_72px_104px_88px_32px] items-center hover:bg-gray-50">
                            <input
                              type="text"
                              required
                              value={item.description}
                              onChange={e => updateLine(item.id, 'description', e.target.value)}
                              placeholder="Description"
                              className="px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent w-full"
                            />
                            <input
                              type="number"
                              required
                              min="0.01"
                              step="any"
                              value={item.quantity}
                              onChange={e => updateLine(item.id, 'quantity', e.target.value)}
                              className="px-3 py-2.5 text-sm text-gray-900 focus:outline-none bg-transparent w-full"
                            />
                            <input
                              type="number"
                              required
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={e => updateLine(item.id, 'unitPrice', e.target.value)}
                              placeholder="0.00"
                              className="px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent w-full"
                            />
                            <div className="px-3 py-2.5 text-sm font-medium text-gray-700 tabular-nums">
                              ₼&nbsp;{lineTotal.toFixed(2)}
                            </div>
                            <div className="flex items-center justify-center pr-2">
                              {lineItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeLine(item.id)}
                                  className="text-gray-300 hover:text-red-400 transition-colors p-0.5 rounded"
                                  title="Remove"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Footer: add row + total */}
                    <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setLineItems(prev => [...prev, EMPTY_LINE()])}
                        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add line item
                      </button>
                      <div className="text-sm text-gray-700">
                        Total:{' '}
                        <span className="font-bold text-blue-700 tabular-nums">
                          ₼&nbsp;{total.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Form footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 active:bg-green-800 rounded-lg transition-colors shadow-sm"
                >
                  Create Invoice
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  )
}
