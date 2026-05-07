'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Status = 'Paid' | 'Unpaid' | 'Draft'
type FilterTab = 'All' | Status

interface Invoice {
  id: number
  number: string
  client: string
  date: string
  due_date: string
  amount: number
  status: Status
}

interface LineItem {
  id: number
  description: string
  quantity: string
  unitPrice: string
}

const STATUS_STYLES: Record<Status, string> = {
  Paid:   'bg-green-100 text-green-700 ring-1 ring-green-200',
  Unpaid: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  Draft:  'bg-gray-100 text-gray-600 ring-1 ring-gray-300',
}

const FILTER_TABS: FilterTab[] = ['All', 'Paid', 'Unpaid', 'Draft']

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const EMPTY_LINE = (): LineItem => ({ id: Date.now(), description: '', quantity: '1', unitPrice: '' })

export default function InvoicesClient() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch]       = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All')

  const [clientName, setClientName] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [dueDate, setDueDate]         = useState('')
  const [lineItems, setLineItems]     = useState<LineItem[]>([EMPTY_LINE()])
  const [saving, setSaving]           = useState(false)

  useEffect(() => {
    supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setInvoices((data as Invoice[]) ?? [])
        setLoading(false)
      })
  }, [])

  const total = lineItems.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
  }, 0)

  const filtered = invoices.filter(inv => {
    const matchesSearch = inv.client.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = activeFilter === 'All' || inv.status === activeFilter
    return matchesSearch && matchesFilter
  })

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const number = `INV-${1000 + invoices.length + 1}`
    const { data, error } = await supabase
      .from('invoices')
      .insert({ number, client: clientName, date: invoiceDate, due_date: dueDate, amount: total, status: 'Draft' })
      .select()
      .single()
    if (!error && data) {
      setInvoices(prev => [data as Invoice, ...prev])
    }
    setSaving(false)
    closeModal()
  }

  const counts: Record<FilterTab, number> = {
    All:    invoices.length,
    Paid:   invoices.filter(i => i.status === 'Paid').length,
    Unpaid: invoices.filter(i => i.status === 'Unpaid').length,
    Draft:  invoices.filter(i => i.status === 'Draft').length,
  }

  return (
    <div>

      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invoices</h2>
          <p className="text-gray-500 text-sm mt-1">
            {counts.All} total &mdash;{' '}
            <span className="text-green-600 font-medium">{counts.Paid} paid</span>,{' '}
            <span className="text-red-500 font-medium">{counts.Unpaid} unpaid</span>,{' '}
            <span className="text-gray-400 font-medium">{counts.Draft} draft</span>
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

      {/* Search + filter bar */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by client name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 bg-white rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeFilter === tab
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab}
              <span className={`ml-1.5 text-xs ${activeFilter === tab ? 'opacity-75' : 'opacity-50'}`}>
                {counts[tab]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">
            Loading invoices…
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Invoice #', 'Client Name', 'Date', 'Due Date', 'Amount (AZN)', 'Status'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3.5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(inv => (
                    <tr key={inv.id} className="hover:bg-blue-50/40 transition-colors cursor-default group">
                      <td className="px-6 py-4 text-sm font-semibold text-blue-600 group-hover:text-blue-700">{inv.number}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{inv.client}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{formatDate(inv.date)}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{formatDate(inv.due_date)}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900 tabular-nums">{fmt(inv.amount)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full ${STATUS_STYLES[inv.status]}`}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-16 text-gray-400 text-sm">
                {search || activeFilter !== 'All'
                  ? 'No invoices match your search or filter.'
                  : <>No invoices yet. Click <strong>New Invoice</strong> to create one.</>}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">

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

            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-5">

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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Line Items</label>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[1fr_72px_104px_88px_32px] bg-gray-50 border-b border-gray-200">
                      {['Description', 'Qty', 'Unit Price', 'Total', ''].map(h => (
                        <div key={h} className="text-xs font-semibold text-gray-500 px-3 py-2">{h}</div>
                      ))}
                    </div>

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
                        <span className="font-bold text-blue-700 tabular-nums">₼&nbsp;{total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

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
                  disabled={saving}
                  className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 active:bg-green-800 rounded-lg transition-colors shadow-sm disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Create Invoice'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  )
}
