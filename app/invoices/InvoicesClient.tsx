'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import InvoiceDetailModal from './InvoiceDetailModal'
import { useLanguage } from '@/lib/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

// ── Types ──────────────────────────────────────────────────────────────────

type Status    = 'Paid' | 'Unpaid' | 'Draft'
type FilterTab = 'All' | Status

interface StoredLineItem {
  description: string
  quantity:    number
  unit_price:  number
}

interface Client {
  id:      number
  company: string
  email:   string
  address: string
}

interface Invoice {
  id:             number
  number:         string
  client:         string
  client_id:      number | null
  client_email:   string | null
  client_address: string | null
  date:           string
  due_date:       string
  amount:         number
  status:         Status
  line_items:     StoredLineItem[] | null
  vat_applied:    boolean | null
}

interface LineItem {
  id:          number
  description: string
  quantity:    string
  unitPrice:   string
}

interface MenuState    { id: number; top: number; right: number }
interface ConfirmState { type: 'finalize' | 'delete'; invoice: Invoice }

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<Status, string> = {
  Paid:   'bg-green-100 text-green-700 ring-1 ring-green-200',
  Unpaid: 'bg-red-100   text-red-700   ring-1 ring-red-200',
  Draft:  'bg-gray-100  text-gray-600  ring-1 ring-gray-300',
}

const FILTER_TABS: FilterTab[] = ['All', 'Paid', 'Unpaid', 'Draft']

const EMPTY_LINE = (): LineItem => ({ id: Date.now() + Math.random(), description: '', quantity: '1', unitPrice: '' })

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Dropdown item ──────────────────────────────────────────────────────────

function MenuItem({
  onClick, children, variant = 'default',
}: {
  onClick: () => void
  children: React.ReactNode
  variant?: 'default' | 'danger' | 'success' | 'primary'
}) {
  const cls = {
    default: 'text-gray-700 hover:bg-gray-50',
    danger:  'text-red-600  hover:bg-red-50',
    success: 'text-green-700 hover:bg-green-50',
    primary: 'text-blue-700 hover:bg-blue-50',
  }[variant]
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium transition-colors ${cls}`}
    >
      {children}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function InvoicesClient() {
  const { t } = useLanguage()

  // ── Data ──────────────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading]   = useState(true)

  // ── UI ────────────────────────────────────────────────────────────────
  const [search, setSearch]             = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  // ── Clients list (for dropdown) ───────────────────────────────────────
  const [clients, setClients]               = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)

  // ── Form modal ────────────────────────────────────────────────────────
  const [showModal, setShowModal]               = useState(false)
  const [editingInvoice, setEditingInvoice]     = useState<Invoice | null>(null)
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)
  const [clientEmail, setClientEmail]           = useState('')
  const [clientAddress, setClientAddress]       = useState('')
  const [invoiceDate, setInvoiceDate]           = useState('')
  const [dueDate, setDueDate]                   = useState('')
  const [lineItems, setLineItems]               = useState<LineItem[]>([EMPTY_LINE()])
  const [saving, setSaving]                     = useState(false)

  // ── Quick-add client inline form ──────────────────────────────────────
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [qaForm, setQaForm] = useState({ company: '', contact: '', email: '', phone: '', address: '' })
  const [qaSaving, setQaSaving] = useState(false)

  // ── Actions menu ──────────────────────────────────────────────────────
  const [menu, setMenu] = useState<MenuState | null>(null)

  // ── Confirmation dialog ───────────────────────────────────────────────
  const [confirm, setConfirm]       = useState<ConfirmState | null>(null)
  const [confirming, setConfirming] = useState(false)

  // ── VAT ───────────────────────────────────────────────────────────────
  const [vatRegistered, setVatRegistered] = useState(false)
  const [vatEnabled, setVatEnabled]       = useState(false)

  // ── PDF download ──────────────────────────────────────────────────────
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  // ── Toast ─────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, company, email, address').order('company'),
      supabase.from('tax_settings').select('vat_registered').maybeSingle(),
    ]).then(([invRes, cliRes, taxRes]) => {
      setInvoices((invRes.data as Invoice[]) ?? [])
      setClients((cliRes.data as Client[]) ?? [])
      const isVat = taxRes.data?.vat_registered ?? false
      setVatRegistered(isVat)
      setVatEnabled(isVat)
      setLoading(false)
      setClientsLoading(false)
    })
  }, [])

  // ── Derived ───────────────────────────────────────────────────────────
  const subtotal   = lineItems.reduce(
    (s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0),
    0,
  )
  const vatAmount  = vatEnabled ? subtotal * 0.18 : 0
  const grandTotal = subtotal + vatAmount

  const filtered = invoices.filter(inv =>
    inv.client.toLowerCase().includes(search.toLowerCase()) &&
    (activeFilter === 'All' || inv.status === activeFilter),
  )

  const counts: Record<FilterTab, number> = {
    All:    invoices.length,
    Paid:   invoices.filter(i => i.status === 'Paid').length,
    Unpaid: invoices.filter(i => i.status === 'Unpaid').length,
    Draft:  invoices.filter(i => i.status === 'Draft').length,
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function tabLabel(tab: FilterTab): string {
    if (tab === 'All') return t('common.all')
    return t(`status.${tab}` as TranslationKey)
  }

  function statusLabel(s: Status): string {
    return t(`status.${s}` as TranslationKey)
  }

  function updateLine(id: number, field: keyof Omit<LineItem, 'id'>, val: string) {
    setLineItems(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l))
  }

  function selectClient(id: number) {
    const c = clients.find(c => c.id === id)
    if (!c) return
    setSelectedClientId(id)
    setClientEmail(c.email ?? '')
    setClientAddress(c.address ?? '')
  }

  function resetForm() {
    setSelectedClientId(null); setClientEmail(''); setClientAddress('')
    setInvoiceDate(''); setDueDate('')
    setLineItems([EMPTY_LINE()]); setEditingInvoice(null)
    setShowQuickAdd(false)
    setQaForm({ company: '', contact: '', email: '', phone: '', address: '' })
    setVatEnabled(vatRegistered)
  }

  function closeModal() { setShowModal(false); resetForm() }

  // ── Actions menu ──────────────────────────────────────────────────────
  function openMenu(e: React.MouseEvent<HTMLButtonElement>, invId: number) {
    e.stopPropagation()
    if (menu?.id === invId) { setMenu(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setMenu({ id: invId, top: rect.bottom + 4, right: window.innerWidth - rect.right })
  }

  // ── Action handlers ───────────────────────────────────────────────────
  function handleEdit(inv: Invoice) {
    setMenu(null)
    setEditingInvoice(inv)
    // Pre-select client: by stored client_id, or fall back to matching by company name
    if (inv.client_id) {
      selectClient(inv.client_id)
    } else {
      const matched = clients.find(c => c.company === inv.client)
      if (matched) {
        selectClient(matched.id)
      } else {
        setSelectedClientId(null)
        setClientEmail(inv.client_email ?? '')
        setClientAddress(inv.client_address ?? '')
      }
    }
    setVatEnabled(inv.vat_applied ?? vatRegistered)
    setInvoiceDate(inv.date)
    setDueDate(inv.due_date)
    setLineItems(
      inv.line_items?.length
        ? inv.line_items.map((li, i) => ({
            id: Date.now() + i, description: li.description,
            quantity: String(li.quantity), unitPrice: String(li.unit_price),
          }))
        : [{ id: Date.now(), description: 'Professional Services', quantity: '1', unitPrice: String(inv.amount) }],
    )
    setShowModal(true)
  }

  function handleFinalize(inv: Invoice) { setMenu(null); setConfirm({ type: 'finalize', invoice: inv }) }

  async function handleMarkAsPaid(inv: Invoice) { setMenu(null); await updateStatus(inv.id, 'Paid') }

  function handleDelete(inv: Invoice) { setMenu(null); setConfirm({ type: 'delete', invoice: inv }) }

  async function handleDownloadPDF(inv: Invoice) {
    setMenu(null)
    setDownloadingId(inv.id)
    try {
      const [companyRes, taxRes] = await Promise.all([
        supabase.from('company_settings')
          .select('company_name, company_address, city, tax_id, phone, email, bank_name, bank_account, swift_code')
          .maybeSingle(),
        supabase.from('tax_settings').select('vat_registered').maybeSingle(),
      ])
      const cs = companyRes.data
      const { generateInvoicePDF } = await import('@/lib/generateInvoicePDF')
      await generateInvoicePDF(
        {
          number:        inv.number,
          date:          inv.date,
          due_date:      inv.due_date,
          status:        inv.status,
          client:        inv.client,
          clientAddress: inv.client_address ?? '',
          clientEmail:   inv.client_email   ?? '',
          line_items:    inv.line_items ?? [],
          amount:        inv.amount,
          vat_applied:   inv.vat_applied ?? false,
        },
        {
          company_name:    cs?.company_name    ?? '',
          company_address: cs?.company_address ?? '',
          city:            cs?.city            ?? '',
          tax_id:          cs?.tax_id          ?? '',
          phone:           cs?.phone           ?? '',
          email:           cs?.email           ?? '',
          bank_name:       cs?.bank_name       ?? '',
          bank_account:    cs?.bank_account    ?? '',
          swift_code:      cs?.swift_code      ?? '',
          vat_registered:  taxRes.data?.vat_registered ?? false,
        },
      )
    } finally {
      setDownloadingId(null)
    }
  }

  async function updateStatus(id: number, status: Status) {
    const { error } = await supabase.from('invoices').update({ status }).eq('id', id)
    if (!error) setInvoices(prev => prev.map(i => i.id === id ? { ...i, status } : i))
  }

  async function handleConfirm() {
    if (!confirm) return
    setConfirming(true)
    if (confirm.type === 'finalize') {
      await updateStatus(confirm.invoice.id, 'Unpaid')
    } else {
      const { error } = await supabase.from('invoices').delete().eq('id', confirm.invoice.id)
      if (!error) setInvoices(prev => prev.filter(i => i.id !== confirm.invoice.id))
    }
    setConfirming(false)
    setConfirm(null)
  }

  function logSupabaseError(label: string, error: unknown) {
    // PostgrestError properties are non-enumerable so plain console.error shows {}
    if (error && typeof error === 'object') {
      const e = error as Record<string, unknown>
      console.error(
        `${label} | message: ${e['message']} | code: ${e['code']} | details: ${e['details']} | hint: ${e['hint']}`,
      )
    } else {
      console.error(label, error)
    }
  }

  function errMsg(error: unknown, fallback: string): string {
    if (error && typeof error === 'object') {
      const msg = (error as Record<string, unknown>)['message']
      if (typeof msg === 'string' && msg) return msg
    }
    return fallback
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault()
    setQaSaving(true)
    const { data, error } = await supabase
      .from('clients')
      .insert(qaForm)
      .select('id, company, email, address')
      .single()
    if (!error && data) {
      const newClient = data as Client
      setClients(prev => [...prev, newClient].sort((a, b) => a.company.localeCompare(b.company)))
      setSelectedClientId(newClient.id)
      setClientEmail(newClient.email ?? '')
      setClientAddress(newClient.address ?? '')
      setShowQuickAdd(false)
      setQaForm({ company: '', contact: '', email: '', phone: '', address: '' })
    } else {
      logSupabaseError('[quick-add client]', error)
    }
    setQaSaving(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedClientId) return
    const selectedClient = clients.find(c => c.id === selectedClientId)
    if (!selectedClient) return

    setSaving(true)

    const storedItems = lineItems.map(({ description, quantity, unitPrice }) => ({
      description,
      quantity:   parseFloat(quantity)  || 0,
      unit_price: parseFloat(unitPrice) || 0,
    }))

    if (editingInvoice) {
      const { data, error } = await supabase
        .from('invoices')
        .update({
          client:         selectedClient.company,
          client_id:      selectedClientId,
          client_email:   clientEmail,
          client_address: clientAddress,
          date:           invoiceDate,
          due_date:       dueDate,
          amount:         subtotal,
          vat_applied:    vatEnabled,
          line_items:     storedItems,
        })
        .eq('id', editingInvoice.id)
        .select()
        .single()
      if (error || !data) {
        logSupabaseError('[invoice update]', error)
        showToast(errMsg(error, t('inv.saveError')), false)
      } else {
        setInvoices(prev => prev.map(i => i.id === editingInvoice.id ? data as Invoice : i))
        showToast(t('inv.updatedOk'), true)
        closeModal()
      }
    } else {
      // Find the highest existing invoice number to avoid unique-key collisions
      const { data: allNums } = await supabase.from('invoices').select('number')
      const maxNum = (allNums ?? []).reduce((max, row) => {
        const n = parseInt((row.number ?? '').replace(/\D+/g, '')) || 0
        return Math.max(max, n)
      }, 1000)
      const number = `INV-${maxNum + 1}`

      // Insert without select — avoids PGRST116 if RLS has no SELECT policy
      const { error: insertError } = await supabase
        .from('invoices')
        .insert({
          number,
          client:         selectedClient.company,
          client_id:      selectedClientId,
          client_email:   clientEmail,
          client_address: clientAddress,
          date:           invoiceDate,
          due_date:       dueDate,
          amount:         subtotal,
          vat_applied:    vatEnabled,
          status:         'Draft',
          line_items:     storedItems,
        })

      if (insertError) {
        logSupabaseError('[invoice insert]', insertError)
        showToast(errMsg(insertError, t('inv.saveError')), false)
        setSaving(false)
        return
      }

      // Fetch the newly inserted row separately so RLS SELECT policy doesn't affect the insert result
      const { data: newRow, error: fetchError } = await supabase
        .from('invoices')
        .select('*')
        .eq('number', number)
        .single()

      if (fetchError || !newRow) {
        logSupabaseError('[invoice fetch-after-insert]', fetchError)
        // Insert succeeded — reload full list so UI stays consistent
        const { data: allRows } = await supabase
          .from('invoices')
          .select('*')
          .order('created_at', { ascending: false })
        if (allRows) setInvoices(allRows as Invoice[])
      } else {
        setInvoices(prev => [newRow as Invoice, ...prev])
      }

      showToast(t('inv.savedOk'), true)
      closeModal()
    }

    setSaving(false)
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div>

      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('page.invoices')}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {counts.All} {t('common.total')} &mdash;{' '}
            <span className="text-green-600 font-medium">{counts.Paid} {t('inv.paid')}</span>,{' '}
            <span className="text-red-500 font-medium">{counts.Unpaid} {t('inv.unpaid')}</span>,{' '}
            <span className="text-gray-400 font-medium">{counts.Draft} {t('inv.draft')}</span>
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('inv.newInvoice')}
        </button>
      </div>

      {/* Search + filter */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t('inv.searchPlaceholder')}
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
                activeFilter === tab ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tabLabel(tab)}
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
            {t('inv.loadingInvoices')}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {[t('inv.number'), t('inv.clientName'), t('common.date'), t('inv.dueDate'), t('inv.amountAZN'), t('common.status'), ''].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3.5 last:w-12 last:px-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(inv => (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedInvoice(inv)}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 text-sm font-semibold text-blue-600 group-hover:text-blue-700">{inv.number}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{inv.client}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{formatDate(inv.date)}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{formatDate(inv.due_date)}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900 tabular-nums">
                        {fmt(inv.amount)}
                        {inv.vat_applied && (
                          <span className="ml-1.5 text-xs font-medium text-blue-500 normal-nums">+ƏDV</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full ${STATUS_STYLES[inv.status]}`}>
                          {statusLabel(inv.status)}
                        </span>
                      </td>
                      <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={e => openMenu(e, inv.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                          aria-label="Invoice actions"
                        >
                          {downloadingId === inv.id ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm4 2a2 2 0 100-4 2 2 0 000 4z"/>
                            </svg>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-16 text-gray-400 text-sm">
                {search || activeFilter !== 'All'
                  ? t('inv.noMatch')
                  : t('inv.noInvoices')}
              </div>
            )}
          </>
        )}
      </div>

      {/* Invoice detail modal */}
      {selectedInvoice && (
        <InvoiceDetailModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
      )}

      {/* New / Edit modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingInvoice ? `${t('inv.editInvoice')} — ${editingInvoice.number}` : t('inv.newInvoice')}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {editingInvoice ? t('inv.updateDraftMsg') : t('inv.fillDetails')}
                </p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-5">

                {/* ── Client selector ── */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-gray-700">{t('inv.clientName')}</label>
                    {!showQuickAdd && (
                      <button
                        type="button"
                        onClick={() => setShowQuickAdd(true)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        {t('inv.addNewClient')}
                      </button>
                    )}
                  </div>

                  {clientsLoading ? (
                    <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                  ) : clients.length === 0 ? (
                    <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                      <p className="text-sm text-amber-800">{t('inv.noClients')}</p>
                      <Link
                        href="/clients"
                        className="shrink-0 text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors"
                      >
                        {t('inv.goToClients')}
                      </Link>
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        required
                        value={selectedClientId ?? ''}
                        onChange={e => {
                          const id = parseInt(e.target.value)
                          if (!isNaN(id)) selectClient(id)
                        }}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-8"
                      >
                        <option value="" disabled>{t('inv.selectClient')}</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.id}>{c.company}</option>
                        ))}
                      </select>
                      <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  )}

                  {/* Auto-filled client details */}
                  {selectedClientId && (clientEmail || clientAddress) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {clientEmail && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1">
                          <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          {clientEmail}
                        </span>
                      )}
                      {clientAddress && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1">
                          <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {clientAddress}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Quick-add client mini form */}
                  {showQuickAdd && (
                    <div className="mt-3 border border-blue-200 bg-blue-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-blue-900">{t('inv.quickAddTitle')}</p>
                        <button
                          type="button"
                          onClick={() => { setShowQuickAdd(false); setQaForm({ company: '', contact: '', email: '', phone: '', address: '' }) }}
                          className="text-blue-400 hover:text-blue-600 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <input
                          type="text" required={showQuickAdd}
                          value={qaForm.company}
                          onChange={e => setQaForm(p => ({ ...p, company: e.target.value }))}
                          placeholder={`${t('cli.companyName')} *`}
                          className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={qaForm.contact}
                          onChange={e => setQaForm(p => ({ ...p, contact: e.target.value }))}
                          placeholder={t('cli.contactPerson')}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={qaForm.phone}
                          onChange={e => setQaForm(p => ({ ...p, phone: e.target.value }))}
                          placeholder={t('cli.phone')}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <input
                          type="email"
                          value={qaForm.email}
                          onChange={e => setQaForm(p => ({ ...p, email: e.target.value }))}
                          placeholder={t('cli.email')}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={qaForm.address}
                          onChange={e => setQaForm(p => ({ ...p, address: e.target.value }))}
                          placeholder={t('cli.address')}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={!qaForm.company || qaSaving}
                          onClick={handleQuickAdd}
                          className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors"
                        >
                          {qaSaving ? (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          )}
                          {t('cli.addClient')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('inv.invoiceDate')}</label>
                    <input type="date" required value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('inv.dueDate')}</label>
                    <input type="date" required value={dueDate} onChange={e => setDueDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('inv.lineItems')}</label>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[1fr_72px_104px_88px_32px] bg-gray-50 border-b border-gray-200">
                      {[t('common.description'), t('common.quantity'), t('common.unitPrice'), t('common.total'), ''].map(h => (
                        <div key={h} className="text-xs font-semibold text-gray-500 px-3 py-2">{h}</div>
                      ))}
                    </div>
                    <div className="divide-y divide-gray-100">
                      {lineItems.map(item => {
                        const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
                        return (
                          <div key={item.id} className="grid grid-cols-[1fr_72px_104px_88px_32px] items-center hover:bg-gray-50">
                            <input type="text" required value={item.description}
                              onChange={e => updateLine(item.id, 'description', e.target.value)}
                              placeholder={t('common.description')}
                              className="px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent w-full" />
                            <input type="number" required min="0.01" step="any" value={item.quantity}
                              onChange={e => updateLine(item.id, 'quantity', e.target.value)}
                              className="px-3 py-2.5 text-sm text-gray-900 focus:outline-none bg-transparent w-full" />
                            <input type="number" required min="0" step="0.01" value={item.unitPrice}
                              onChange={e => updateLine(item.id, 'unitPrice', e.target.value)}
                              placeholder="0.00"
                              className="px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent w-full" />
                            <div className="px-3 py-2.5 text-sm font-medium text-gray-700 tabular-nums">
                              ₼&nbsp;{lineTotal.toFixed(2)}
                            </div>
                            <div className="flex items-center justify-center pr-2">
                              {lineItems.length > 1 && (
                                <button type="button"
                                  onClick={() => setLineItems(prev => prev.filter(l => l.id !== item.id))}
                                  className="text-gray-300 hover:text-red-400 transition-colors p-0.5 rounded">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="border-t border-gray-100 bg-gray-50 px-3 py-2.5">
                      <button type="button"
                        onClick={() => setLineItems(prev => [...prev, EMPTY_LINE()])}
                        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        {t('inv.addLineItem')}
                      </button>
                    </div>
                  </div>

                  {/* Totals breakdown */}
                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between text-gray-600">
                      <span>Cəmi</span>
                      <span className="tabular-nums font-medium text-gray-800">₼&nbsp;{subtotal.toFixed(2)}</span>
                    </div>
                    {vatRegistered && (
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={vatEnabled}
                            onClick={() => setVatEnabled(v => !v)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${vatEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${vatEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                          </button>
                          <span className="text-gray-600">ƏDV 18%</span>
                        </label>
                        <span className={`tabular-nums font-medium transition-colors ${vatEnabled ? 'text-gray-800' : 'text-gray-400'}`}>
                          ₼&nbsp;{vatAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t border-gray-200 pt-2">
                      <span className="font-semibold text-gray-900">Ümumi Cəmi</span>
                      <span className="font-bold text-blue-700 tabular-nums text-base">₼&nbsp;{grandTotal.toFixed(2)}</span>
                    </div>
                  </div>

                </div>

              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={saving || !selectedClientId || clients.length === 0}
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed">
                  {saving ? t('common.saving') : editingInvoice ? t('common.saveChanges') : t('inv.createInvoice')}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Actions dropdown (portal) */}
      {menu && typeof window !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 w-52 overflow-hidden"
            style={{ top: menu.top, right: menu.right }}
          >
            {(() => {
              const inv = invoices.find(i => i.id === menu.id)
              if (!inv) return null
              return (
                <>
                  {inv.status === 'Draft' && (
                    <>
                      <MenuItem onClick={() => handleEdit(inv)}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        {t('common.edit')}
                      </MenuItem>
                      <MenuItem onClick={() => handleFinalize(inv)} variant="primary">
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {t('inv.finalize')}
                      </MenuItem>
                      <div className="my-1 border-t border-gray-100" />
                      <MenuItem onClick={() => handleDelete(inv)} variant="danger">
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        {t('common.delete')}
                      </MenuItem>
                    </>
                  )}
                  {inv.status === 'Unpaid' && (
                    <>
                      <MenuItem onClick={() => handleMarkAsPaid(inv)} variant="success">
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {t('inv.markAsPaid')}
                      </MenuItem>
                      <MenuItem onClick={() => handleDownloadPDF(inv)}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {t('inv.downloadPDF')}
                      </MenuItem>
                      <div className="my-1 border-t border-gray-100" />
                      <MenuItem onClick={() => handleDelete(inv)} variant="danger">
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        {t('common.delete')}
                      </MenuItem>
                    </>
                  )}
                  {inv.status === 'Paid' && (
                    <>
                      <MenuItem onClick={() => handleDownloadPDF(inv)}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {t('inv.downloadPDF')}
                      </MenuItem>
                      <MenuItem onClick={() => { setMenu(null); setSelectedInvoice(inv) }}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        {t('common.view')}
                      </MenuItem>
                    </>
                  )}
                </>
              )
            })()}
          </div>
        </>,
        document.body,
      )}

      {/* Confirmation dialog */}
      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">

            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
              confirm.type === 'delete' ? 'bg-red-100' : 'bg-blue-100'
            }`}>
              {confirm.type === 'delete' ? (
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>

            <h3 className="text-lg font-bold text-gray-900">
              {confirm.type === 'delete' ? t('inv.deleteTitle') : t('inv.finalizeTitle')}
            </h3>
            <p className="text-sm text-gray-500 mt-1.5">
              {confirm.type === 'delete'
                ? t('inv.deleteMsg').replace('{number}', confirm.invoice.number)
                : t('inv.finalizeMsg').replace('{number}', confirm.invoice.number)}
            </p>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setConfirm(null)} disabled={confirming}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-60">
                {t('common.cancel')}
              </button>
              <button onClick={handleConfirm} disabled={confirming}
                className={`flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60 ${
                  confirm.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}>
                {confirming ? t('common.processing') : confirm.type === 'delete' ? t('common.delete') : t('inv.finalize')}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all animate-in ${
          toast.ok
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50   border-red-200   text-red-800'
        }`}>
          {toast.ok ? (
            <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}

    </div>
  )
}
