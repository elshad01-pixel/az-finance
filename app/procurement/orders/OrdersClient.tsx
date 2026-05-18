'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import { useCompany } from '@/lib/CompanyContext'
import UpgradePrompt from '@/app/ui/UpgradePrompt'
import { generatePOPDF } from '@/lib/generatePOPDF'
import type { TranslationKey } from '@/lib/i18n'

interface LineItem { description: string; quantity: number; unit_price: number; unit: string }

interface PurchaseOrder {
  id:            string
  po_number:     string
  request_id:    string | null
  vendor_id:     number
  items:         LineItem[]
  subtotal:      number
  vat_amount:    number
  total_amount:  number
  status:        'draft' | 'sent' | 'confirmed' | 'partially_received' | 'received' | 'cancelled'
  payment_terms: string | null
  delivery_date: string | null
  notes:         string | null
  created_by:    string
  created_at:    string
  vendors?: { name: string; voen: string | null } | null
  purchase_requests?: { request_number: string; title: string } | null
}

interface Vendor { id: number; name: string; voen: string | null }
interface ApprovedPR { id: string; request_number: string; title: string; vendor_id: number | null; items: LineItem[]; total_amount: number }

type POStatus = PurchaseOrder['status']

const STATUS_STYLES: Record<POStatus, string> = {
  draft:              'bg-gray-100 text-gray-600',
  sent:               'bg-blue-100 text-blue-700',
  confirmed:          'bg-green-100 text-green-700',
  partially_received: 'bg-orange-100 text-orange-700',
  received:           'bg-purple-100 text-purple-700',
  cancelled:          'bg-red-100 text-red-700',
}
const STATUS_KEY: Record<POStatus, TranslationKey> = {
  draft:              'proc.poDraft',
  sent:               'proc.poSent',
  confirmed:          'proc.poConfirmed',
  partially_received: 'proc.poPartial',
  received:           'proc.poReceived',
  cancelled:          'proc.poCancelled',
}

const EMPTY_ITEM = (): LineItem => ({ description: '', quantity: 1, unit_price: 0, unit: 'ədəd' })
const VAT_RATE = 0.18

export default function OrdersClient() {
  const { t }     = useLanguage()
  const { company, user, isManager, canAccess } = useCompany()
  const params    = useSearchParams()

  const [orders,       setOrders]       = useState<PurchaseOrder[]>([])
  const [vendors,      setVendors]      = useState<Vendor[]>([])
  const [approvedPRs,  setApprovedPRs]  = useState<ApprovedPR[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [showUpgrade,  setShowUpgrade]  = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [toast,        setToast]        = useState<string | null>(null)

  // form state
  const [selectedPR,    setSelectedPR]    = useState('')
  const [vendorId,      setVendorId]      = useState('')
  const [items,         setItems]         = useState<LineItem[]>([EMPTY_ITEM()])
  const [vatEnabled,    setVatEnabled]    = useState(false)
  const [paymentTerms,  setPaymentTerms]  = useState('')
  const [deliveryDate,  setDeliveryDate]  = useState('')
  const [notes,         setNotes]         = useState('')

  const subtotal   = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const vatAmount  = vatEnabled ? subtotal * VAT_RATE : 0
  const totalAmount = subtotal + vatAmount

  const load = useCallback(async () => {
    if (!company) return
    setLoading(true)
    const [{ data: oData }, { data: vData }, { data: prData }] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, vendors(name, voen), purchase_requests(request_number, title)')
        .order('created_at', { ascending: false }),
      supabase.from('vendors').select('id, name, voen').order('name'),
      supabase.from('purchase_requests')
        .select('id, request_number, title, vendor_id, items, total_amount')
        .eq('status', 'approved')
        .order('created_at', { ascending: false }),
    ])
    setOrders((oData ?? []) as PurchaseOrder[])
    setVendors((vData ?? []) as Vendor[])
    setApprovedPRs((prData ?? []) as ApprovedPR[])
    setLoading(false)
  }, [company])

  useEffect(() => { load() }, [load])

  // Pre-populate from PR if navigated with ?pr=
  useEffect(() => {
    const prId = params.get('pr')
    if (prId && approvedPRs.length > 0) {
      const pr = approvedPRs.find(p => p.id === prId)
      if (pr) {
        setSelectedPR(prId)
        setVendorId(pr.vendor_id?.toString() ?? '')
        setItems(pr.items.length > 0 ? pr.items : [EMPTY_ITEM()])
        setShowForm(true)
      }
    }
  }, [params, approvedPRs])

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  function resetForm() {
    setSelectedPR(''); setVendorId(''); setItems([EMPTY_ITEM()])
    setVatEnabled(false); setPaymentTerms(''); setDeliveryDate(''); setNotes('')
  }

  function handlePRSelect(prId: string) {
    setSelectedPR(prId)
    const pr = approvedPRs.find(p => p.id === prId)
    if (pr) {
      setVendorId(pr.vendor_id?.toString() ?? '')
      setItems(pr.items.length > 0 ? pr.items : [EMPTY_ITEM()])
    }
  }

  function updateItem(idx: number, field: keyof LineItem, val: string | number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }

  async function handleCreate() {
    if (!vendorId || !company || !user) return
    setSaving(true)
    const { data: numData } = await supabase.rpc('get_next_po_number', { p_company_id: company.id })
    const { error } = await supabase.from('purchase_orders').insert({
      company_id:    company.id,
      po_number:     numData as string,
      request_id:    selectedPR || null,
      vendor_id:     Number(vendorId),
      items, subtotal, vat_amount: vatAmount, total_amount: totalAmount,
      status: 'draft',
      payment_terms: paymentTerms || null,
      delivery_date: deliveryDate || null,
      notes: notes || null,
      created_by: user.id,
    })
    if (error) notify('Error: ' + error.message)
    else { notify(t('proc.newOrder') + ' yaradıldı'); setShowForm(false); resetForm(); load() }
    setSaving(false)
  }

  async function handleStatusChange(id: string, status: POStatus) {
    await supabase.from('purchase_orders').update({ status }).eq('id', id)
    load()
  }

  async function handleCancel(id: string) {
    if (!confirm(t('proc.cancelConfirm'))) return
    await handleStatusChange(id, 'cancelled')
  }

  async function handleDownloadPDF(po: PurchaseOrder) {
    const vendor = vendors.find(v => v.id === po.vendor_id)
    await generatePOPDF(po, vendor ?? null)
  }

  const filtered = orders.filter(o => filterStatus === 'all' || o.status === filterStatus)
  const openCount = orders.filter(o => !['received','cancelled'].includes(o.status)).length

  if (!canAccess('purchase_orders')) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-gray-500">{t('proc.upgradeHint')}</p>
          <button onClick={() => setShowUpgrade(true)}
            className="mt-3 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl">
            {t('billing.upgrade')}
          </button>
        </div>
        {showUpgrade && <UpgradePrompt feature="purchase_orders" onClose={() => setShowUpgrade(false)} />}
      </>
    )
  }

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">{toast}</div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 rounded-xl p-4 border border-white">
          <p className="text-xs text-gray-500 mb-1">{t('proc.openOrders')}</p>
          <p className="text-2xl font-bold text-blue-600">{openCount}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 border border-white">
          <p className="text-xs text-gray-500 mb-1">{t('proc.pendingApprovals')}</p>
          <p className="text-2xl font-bold text-gray-700">{approvedPRs.length}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 border border-white">
          <p className="text-xs text-gray-500 mb-1">{t('proc.statusReceived')}</p>
          <p className="text-2xl font-bold text-purple-600">{orders.filter(o => o.status === 'received').length}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {(['all','draft','sent','confirmed','partially_received','received','cancelled'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {s === 'all' ? t('common.all') : t(STATUS_KEY[s as POStatus])}
            </button>
          ))}
        </div>
        {isManager && (
          <button onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('proc.newOrder')}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t('proc.noOrders')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {[t('proc.orderNumber'), t('proc.vendor'), t('proc.fromPR'), t('proc.deliveryDate'), t('common.status'), t('common.amount'), ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(o => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{o.po_number}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{o.vendors?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {o.purchase_requests ? o.purchase_requests.request_number : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{o.delivery_date ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[o.status]}`}>
                      {t(STATUS_KEY[o.status])}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">
                    ₼ {o.total_amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {/* Status progression */}
                      {o.status === 'draft' && isManager && (
                        <button onClick={() => handleStatusChange(o.id, 'sent')}
                          className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                          {t('proc.poSent')}
                        </button>
                      )}
                      {o.status === 'sent' && isManager && (
                        <button onClick={() => handleStatusChange(o.id, 'confirmed')}
                          className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg">
                          {t('proc.poConfirmed')}
                        </button>
                      )}
                      {o.status === 'confirmed' && (
                        <a href={`/procurement/receipts?po=${o.id}`}
                          className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-lg">
                          {t('proc.newReceipt')}
                        </a>
                      )}
                      {/* PDF */}
                      <button onClick={() => handleDownloadPDF(o)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </button>
                      {/* Cancel */}
                      {!['received','cancelled'].includes(o.status) && isManager && (
                        <button onClick={() => handleCancel(o.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">{t('proc.newOrder')}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* From PR */}
              {approvedPRs.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('proc.fromPR')}</label>
                  <div className="relative">
                    <select value={selectedPR} onChange={e => handlePRSelect(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm appearance-none pr-8 focus:ring-2 focus:ring-blue-500 outline-none">
                      <option value="">— {t('proc.newOrder')} —</option>
                      {approvedPRs.map(pr => (
                        <option key={pr.id} value={pr.id}>{pr.request_number} — {pr.title}</option>
                      ))}
                    </select>
                    <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              )}
              {/* Vendor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('proc.vendor')} *</label>
                <div className="relative">
                  <select value={vendorId} onChange={e => setVendorId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm appearance-none pr-8 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">—</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              {/* Payment Terms + Delivery Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('proc.paymentTerms')}</label>
                  <input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="30 days net"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('proc.deliveryDate')}</label>
                  <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">{t('inv.lineItems')}</label>
                  <button onClick={() => setItems(p => [...p, EMPTY_ITEM()])}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    + {t('proc.addItem')}
                  </button>
                </div>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[2fr_1fr_1fr_100px_32px] bg-gray-50 text-xs font-semibold text-gray-500 px-3 py-2 gap-2">
                    <span>{t('common.description')}</span><span>{t('common.quantity')}</span>
                    <span>{t('proc.unit')}</span><span className="text-right">{t('common.unitPrice')}</span><span />
                  </div>
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-[2fr_1fr_1fr_100px_32px] px-3 py-2 gap-2 border-t border-gray-100 items-center">
                      <input value={it.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                        className="text-sm border-b border-gray-200 focus:border-blue-500 outline-none py-1 w-full" />
                      <input type="number" min="0" value={it.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                        className="text-sm border-b border-gray-200 focus:border-blue-500 outline-none py-1 w-full text-center" />
                      <input value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} placeholder="ədəd"
                        className="text-sm border-b border-gray-200 focus:border-blue-500 outline-none py-1 w-full" />
                      <input type="number" min="0" step="0.01" value={it.unit_price} onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))}
                        className="text-sm border-b border-gray-200 focus:border-blue-500 outline-none py-1 w-full text-right" />
                      <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))} disabled={items.length === 1}
                        className="text-gray-300 hover:text-red-500 disabled:opacity-30">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {/* Totals */}
                  <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 space-y-1">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>{t('billing.featDashboard').includes('') ? t('proc.paymentTerms').includes('') ? 'Subtotal' : 'Subtotal' : 'Subtotal'}</span>
                      <span>₼ {subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={vatEnabled} onChange={e => setVatEnabled(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600" />
                        {t('proc.vatEnabled')}
                      </label>
                      {vatEnabled && <span className="text-sm text-gray-600">₼ {vatAmount.toFixed(2)}</span>}
                    </div>
                    <div className="flex justify-between text-sm font-bold text-gray-800 border-t border-gray-200 pt-1">
                      <span>{t('common.total')}</span>
                      <span>₼ {totalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('proc.notes')}</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                {t('common.cancel')}
              </button>
              <button onClick={handleCreate} disabled={saving || !vendorId}
                className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {saving ? t('common.saving') : t('proc.newOrder')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpgrade && <UpgradePrompt feature="purchase_orders" onClose={() => setShowUpgrade(false)} />}
    </div>
  )
}
