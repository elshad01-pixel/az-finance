'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import { useCompany } from '@/lib/CompanyContext'
import { logActivity } from '@/lib/activity'
import ProductSearchInput, { type ProductOption } from '@/app/ui/ProductSearchInput'
import type { TranslationKey } from '@/lib/i18n'

type SOStatus = 'draft' | 'confirmed' | 'delivered' | 'invoiced' | 'cancelled'

interface SOLineItem {
  description:   string
  quantity:      number
  unit_price:    number
  unit:          string
  product_id:    string | null
  is_stock_item: boolean
}

interface SalesOrder {
  id:            string
  so_number:     string
  client_id:     number
  items:         SOLineItem[]
  subtotal:      number
  vat_amount:    number
  total_amount:  number
  status:        SOStatus
  delivery_date: string | null
  notes:         string | null
  invoice_id:    number | null
  created_at:    string
  clients:       { company: string } | null
  deliveries?:   { id: string; delivery_number: string; status: string }[] | null
}

interface Client  { id: number; company: string; email: string; address: string }
interface Product { id: string; sku: string; name: string; unit: string; sale_price: number; stock_qty: number }

const STATUS_STYLE: Record<SOStatus, string> = {
  draft:     'bg-gray-100 text-gray-600',
  confirmed: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  invoiced:  'bg-purple-100 text-purple-700',
  cancelled: 'bg-red-100 text-red-500',
}

const STATUS_KEY: Record<SOStatus, TranslationKey> = {
  draft:     'so.statusDraft',
  confirmed: 'so.statusConfirmed',
  delivered: 'so.statusDelivered',
  invoiced:  'so.statusInvoiced',
  cancelled: 'so.statusCancelled',
}

function EMPTY_ITEM(): SOLineItem {
  return { description: '', quantity: 1, unit_price: 0, unit: 'ədəd', product_id: null, is_stock_item: false }
}

function fmt(n: number) {
  return `₼ ${Number(n).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const VAT_RATE = 0.18

export default function SalesOrdersClient() {
  const { t, lang } = useLanguage()
  const { company } = useCompany()
  const router = useRouter()

  const [orders,       setOrders]       = useState<SalesOrder[]>([])
  const [clients,      setClients]      = useState<Client[]>([])
  const [products,     setProducts]     = useState<Product[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [filterStatus, setFilterStatus] = useState<SOStatus | 'all'>('all')
  const [search,       setSearch]       = useState('')
  const [toast,        setToast]        = useState('')

  // Form
  const [showForm,     setShowForm]     = useState(false)
  const [formClientId, setFormClientId] = useState('')
  const [formDelivDate,setFormDelivDate]= useState('')
  const [formNotes,    setFormNotes]    = useState('')
  const [formVAT,      setFormVAT]      = useState(false)
  const [formItems,    setFormItems]    = useState<SOLineItem[]>([EMPTY_ITEM()])

  // Confirm dialog
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: 'confirm' | 'cancel'; number: string } | null>(null)

  const subtotal = formItems.reduce((s, it) => s + it.quantity * it.unit_price, 0)
  const vatAmt   = formVAT ? subtotal * VAT_RATE : 0
  const total    = subtotal + vatAmt

  const load = useCallback(async () => {
    const [ordRes, cliRes, prodRes] = await Promise.all([
      supabase.from('sales_orders').select('*, clients(company), deliveries(id, delivery_number, status)').order('created_at', { ascending: false }).limit(300),
      supabase.from('clients').select('id, company, email, address').order('company'),
      supabase.from('products').select('id, sku, name, unit, sale_price, stock_qty').eq('status', 'active').order('name'),
    ])
    setOrders((ordRes.data as SalesOrder[]) ?? [])
    setClients((cliRes.data as Client[]) ?? [])
    setProducts((prodRes.data as Product[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  function openForm() {
    setFormClientId('')
    setFormDelivDate('')
    setFormNotes('')
    setFormVAT(false)
    setFormItems([EMPTY_ITEM()])
    setShowForm(true)
  }

  const productOptions = useMemo<ProductOption[]>(() =>
    products.map(p => ({ id: p.id, sku: p.sku, name: p.name, unit: p.unit, price: Number(p.sale_price) || 0, stock_qty: p.stock_qty })),
  [products])

  function addItem() { setFormItems(p => [...p, EMPTY_ITEM()]) }
  function removeItem(idx: number) { setFormItems(p => p.filter((_, i) => i !== idx)) }

  function updateItem(idx: number, field: keyof SOLineItem, value: string | number | boolean | null) {
    setFormItems(p => p.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function selectProduct(idx: number, p: ProductOption) {
    setFormItems(prev => prev.map((it, i) => i === idx ? {
      ...it,
      product_id:    p.id,
      description:   p.name,
      unit:          p.unit,
      unit_price:    p.price,
      is_stock_item: true,
    } : it))
  }

  function clearProduct(idx: number) {
    setFormItems(prev => prev.map((it, i) => i === idx ? {
      ...it,
      product_id:    null,
      description:   '',
      unit:          'ədəd',
      unit_price:    0,
      is_stock_item: false,
    } : it))
  }

  async function submit() {
    if (!formClientId) return
    setSaving(true)

    const year   = new Date().getFullYear()
    const prefix = `SO-${year}-`
    const { data: existing } = await supabase.from('sales_orders').select('so_number').like('so_number', `${prefix}%`)
    const maxNum = (existing ?? []).reduce((mx, r) => {
      const n = parseInt(r.so_number.split('-')[2] ?? '0') || 0
      return Math.max(mx, n)
    }, 0)
    const soNumber = `${prefix}${String(maxNum + 1).padStart(3, '0')}`

    const { error } = await supabase.from('sales_orders').insert({
      so_number:     soNumber,
      client_id:     Number(formClientId),
      items:         formItems,
      subtotal,
      vat_amount:    vatAmt,
      total_amount:  total,
      delivery_date: formDelivDate || null,
      notes:         formNotes || null,
      status:        'draft',
    })

    setSaving(false)
    if (!error) {
      setShowForm(false)
      showToast(t('so.orderCreated'))
      logActivity({ supabase, action: 'created', module: 'sales_orders', record_label: soNumber, company_id: company?.id })
      load()
    }
  }

  async function doConfirm(id: string) {
    await supabase.from('sales_orders').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', id)
    setConfirmAction(null)
    showToast(t('so.orderConfirmed'))
    load()
  }

  async function doCancel(id: string) {
    await supabase.from('sales_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id)
    setConfirmAction(null)
    showToast(t('so.orderCancelled'))
    load()
  }

  const filtered = orders.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false
    if (!search) return true
    const q = search.toLowerCase()
    return o.so_number.toLowerCase().includes(q) || (o.clients?.company ?? '').toLowerCase().includes(q)
  })

  const openCount      = orders.filter(o => o.status === 'confirmed').length
  const deliveredCount = orders.filter(o => o.status === 'delivered').length
  const totalValue     = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total_amount, 0)

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-24 bg-gray-100 rounded-xl" />
      <div className="h-96 bg-gray-100 rounded-xl" />
    </div>
  )

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-green-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('page.salesOrders')}</h2>
          <p className="text-gray-500 text-sm mt-1">{filtered.length} sifariş</p>
        </div>
        <button onClick={openForm}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('so.newOrder')}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{t('so.openOrders')}</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{openCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{t('so.deliveredOrders')}</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{deliveredCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{t('so.totalValue')}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(totalValue)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Sifariş # və ya müştəri adı…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        </div>
        <div className="flex gap-1.5 bg-gray-100 rounded-lg p-1">
          {([
            { v: 'all',       l: 'Hamısı'                },
            { v: 'draft',     l: t('so.statusDraft')     },
            { v: 'confirmed', l: t('so.statusConfirmed') },
            { v: 'delivered', l: t('so.statusDelivered') },
            { v: 'invoiced',  l: t('so.statusInvoiced')  },
          ] as const).map(opt => (
            <button key={opt.v} onClick={() => setFilterStatus(opt.v)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                filterStatus === opt.v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{opt.l}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {[t('so.soNumber'), t('common.client'), t('common.date'), t('common.amount'), t('common.status'), ''].map((h, i) => (
                  <th key={i} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(o => (
                <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{o.so_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{o.clients?.company ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {new Intl.DateTimeFormat('az-AZ').format(new Date(o.created_at))}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{fmt(o.total_amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[o.status]}`}>
                      {t(STATUS_KEY[o.status])}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {o.status === 'draft' && (
                        <button onClick={() => setConfirmAction({ id: o.id, action: 'confirm', number: o.so_number })}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700 px-2.5 py-1 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap">
                          {t('so.confirmOrder')}
                        </button>
                      )}
                      {o.status === 'confirmed' && (
                        <button onClick={() => router.push(`/sales/deliveries?so=${o.id}`)}
                          className="text-xs font-semibold text-green-600 hover:text-green-700 px-2.5 py-1 border border-green-200 rounded-lg hover:bg-green-50 transition-colors whitespace-nowrap">
                          {t('so.createDelivery')}
                        </button>
                      )}
                      {o.invoice_id && (
                        <a href="/invoices"
                          className="text-xs text-purple-600 hover:underline whitespace-nowrap">
                          {t('so.viewInvoice')}
                        </a>
                      )}
                      {(o.status === 'draft' || o.status === 'confirmed') && (
                        <button onClick={() => {
                          const confirmedDel = o.deliveries?.find(d => d.status === 'confirmed')
                          if (confirmedDel) {
                            showToast(t('so.cancelBlockedByDelivery').replace('{del}', confirmedDel.delivery_number))
                            return
                          }
                          setConfirmAction({ id: o.id, action: 'cancel', number: o.so_number })
                        }}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-1 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap">
                          {t('so.cancelOrder')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">{t('so.noOrders')}</div>
        )}
      </div>

      {/* ── New Order slide-over ─────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">

            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">{t('so.newOrder')}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 px-6 py-5 space-y-5">

              {/* Client */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('so.selectClient')}</label>
                <select value={formClientId} onChange={e => setFormClientId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{t('so.selectClient')}</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
                </select>
              </div>

              {/* Delivery date + VAT */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    {t('so.deliveryDate')} <span className="text-gray-400 font-normal">(ixtiyari)</span>
                  </label>
                  <input type="date" value={formDelivDate} onChange={e => setFormDelivDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-end pb-2.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={formVAT} onChange={e => setFormVAT(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700">{t('so.vatEnabled')}</span>
                  </label>
                </div>
              </div>

              {/* Line items */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Mallar / Xidmətlər</label>
                <div className="space-y-2">
                  {formItems.map((it, idx) => {
                    const prod     = products.find(p => p.id === it.product_id)
                    const avail    = prod?.stock_qty ?? 0
                    const insuffic = it.product_id && prod && it.quantity > avail
                    return (
                      <div key={idx} className={`border rounded-xl p-3 ${insuffic ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200'}`}>
                        {/* Product search + delete button */}
                        <div className="flex items-start gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <ProductSearchInput
                              products={productOptions}
                              selectedId={it.product_id}
                              value={it.description}
                              onChange={text => updateItem(idx, 'description', text)}
                              onSelect={p => selectProduct(idx, p)}
                              onClear={() => clearProduct(idx)}
                              lang={lang}
                            />
                          </div>
                          {formItems.length > 1 && (
                            <button onClick={() => removeItem(idx)} className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors mt-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {/* Stock warning */}
                        {prod && (
                          <p className={`text-xs mb-2 ${insuffic ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                            {insuffic
                              ? `⚠ ${t('so.insufficientStock')}`
                              : `${t('so.availableStock')}: ${avail} ${prod.unit}`}
                          </p>
                        )}
                        {/* Qty + Price + Unit */}
                        <div className="grid grid-cols-3 gap-1.5">
                          <input type="number" min="0.001" step="any" value={it.quantity}
                            onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <input type="number" min="0" step="0.01" value={it.unit_price}
                            onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))}
                            placeholder="0.00"
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <input value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                            placeholder="ədəd"
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button onClick={addItem}
                  className="mt-2 w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
                  + {t('proc.addItem')}
                </button>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('so.notes')} <span className="text-gray-400 font-normal">(ixtiyari)</span>
                </label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              {/* Totals */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-1.5">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{t('so.subtotal')}</span>
                  <span className="tabular-nums">{fmt(subtotal)}</span>
                </div>
                {formVAT && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>{t('so.vatAmount')} (18%)</span>
                    <span className="tabular-nums">{fmt(vatAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-200 pt-1.5 mt-1.5">
                  <span>{t('common.total')}</span>
                  <span className="tabular-nums">{fmt(total)}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                {t('common.cancel')}
              </button>
              <button onClick={submit}
                disabled={saving || !formClientId || formItems.every(it => !it.description && !it.product_id)}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm / Cancel dialog ──────────────────────────────────────── */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-base font-bold text-gray-900 mb-2">
              {confirmAction.action === 'confirm' ? t('so.confirmOrder') : t('so.cancelOrder')}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {confirmAction.action === 'confirm' ? t('so.confirmOrderMsg') : t('so.cancelOrderMsg')}
              {' '}({confirmAction.number})
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => confirmAction.action === 'confirm' ? doConfirm(confirmAction.id) : doCancel(confirmAction.id)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${
                  confirmAction.action === 'confirm' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-500 hover:bg-red-600'
                }`}>
                {confirmAction.action === 'confirm' ? t('so.confirmOrder') : t('so.cancelOrder')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
