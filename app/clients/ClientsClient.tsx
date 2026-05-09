'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'

interface Client {
  id: number
  company: string
  contact: string
  email: string
  phone: string
  address: string
}

interface InvoiceSummary {
  client: string
  amount: number
  status: string
}

const EMPTY_FORM = { company: '', contact: '', email: '', phone: '', address: '' }
type FormData = typeof EMPTY_FORM

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getTotals(company: string, invoices: InvoiceSummary[]) {
  const mine = invoices.filter(i => i.client === company)
  return {
    totalInvoiced: mine.reduce((s, i) => s + i.amount, 0),
    outstanding:   mine.filter(i => i.status === 'Unpaid').reduce((s, i) => s + i.amount, 0),
  }
}

export default function ClientsClient() {
  const { t, lang } = useLanguage()

  const [clients, setClients]     = useState<Client[]>([])
  const [invoices, setInvoices]   = useState<InvoiceSummary[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm]           = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)

  const isEditing = editingId !== null

  useEffect(() => {
    Promise.all([
      supabase.from('clients').select('*').order('created_at'),
      supabase.from('invoices').select('client, amount, status'),
    ]).then(([clientsRes, invoicesRes]) => {
      setClients((clientsRes.data as Client[]) ?? [])
      setInvoices((invoicesRes.data as InvoiceSummary[]) ?? [])
      setLoading(false)
    })
  }, [])

  function setField(key: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  function openEdit(client: Client) {
    setEditingId(client.id)
    setForm({ company: client.company, contact: client.contact, email: client.email, phone: client.phone, address: client.address })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    if (isEditing) {
      const { data, error } = await supabase
        .from('clients')
        .update(form)
        .eq('id', editingId)
        .select()
        .single()
      if (!error && data) {
        setClients(prev => prev.map(c => c.id === editingId ? (data as Client) : c))
      }
    } else {
      const { data, error } = await supabase
        .from('clients')
        .insert(form)
        .select()
        .single()
      if (!error && data) {
        setClients(prev => [...prev, data as Client])
      }
    }
    setSaving(false)
    closeModal()
  }

  const allTotals = clients.map(c => ({ ...c, ...getTotals(c.company, invoices) }))
  const totalInvoiced    = allTotals.reduce((s, c) => s + c.totalInvoiced, 0)
  const totalOutstanding = allTotals.reduce((s, c) => s + c.outstanding, 0)

  const clientWord = lang === 'az' ? 'müştəri' : clients.length !== 1 ? 'clients' : 'client'

  return (
    <div>

      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.clients')}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {clients.length} {clientWord} &mdash;{' '}
            <span className="font-semibold text-gray-700">{fmt(totalInvoiced)}</span> {t('cli.invoiced')},{' '}
            <span className={`font-semibold ${totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {fmt(totalOutstanding)}
            </span>{' '}
            {t('cli.outstanding').toLowerCase()}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('cli.addClient')}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">
            {t('cli.loading')}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {[t('cli.companyName'), t('cli.email'), t('cli.phone'), t('cli.totalInvoiced'), t('cli.outstanding'), ''].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3 last:w-20">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {allTotals.map(client => (
                    <tr key={client.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-gray-900">{client.company}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{client.contact}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <a href={`mailto:${client.email}`} className="hover:text-blue-600 transition-colors">
                          {client.email}
                        </a>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">{client.phone}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {fmt(client.totalInvoiced)}
                      </td>
                      <td className="px-6 py-4 tabular-nums whitespace-nowrap">
                        {client.outstanding === 0 ? (
                          <span className="text-sm font-semibold text-green-600">{fmt(0)}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                            {fmt(client.outstanding)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openEdit(client)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-blue-200 opacity-0 group-hover:opacity-100"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          {t('common.edit')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {clients.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-gray-600">{t('common.total')}</td>
                      <td className="px-6 py-3 text-sm font-bold text-gray-900 tabular-nums">{fmt(totalInvoiced)}</td>
                      <td className={`px-6 py-3 text-sm font-bold tabular-nums ${totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {fmt(totalOutstanding)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {clients.length === 0 && (
              <div className="text-center py-16 text-gray-400 text-sm">
                {t('cli.noClients')}
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {isEditing ? t('cli.editClient') : t('cli.addClient')}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isEditing ? t('cli.updateDetails') : t('cli.fillDetails')}
                </p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-4">

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('cli.companyName')}</label>
                  <input
                    type="text"
                    required
                    value={form.company}
                    onChange={setField('company')}
                    placeholder="e.g. Baku Tech LLC"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('cli.contactPerson')}</label>
                  <input
                    type="text"
                    required
                    value={form.contact}
                    onChange={setField('contact')}
                    placeholder="e.g. Ali Mammadov"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('cli.email')}</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={setField('email')}
                      placeholder="email@company.az"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('cli.phone')}</label>
                    <input
                      type="tel"
                      required
                      value={form.phone}
                      onChange={setField('phone')}
                      placeholder="+994 50 000 0000"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('cli.address')}</label>
                  <textarea
                    value={form.address}
                    onChange={setField('address')}
                    placeholder="Street, City"
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                  />
                </div>

              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 active:bg-green-800 rounded-lg transition-colors shadow-sm disabled:opacity-60"
                >
                  {saving ? t('common.saving') : isEditing ? t('common.saveChanges') : t('cli.addClient')}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  )
}
