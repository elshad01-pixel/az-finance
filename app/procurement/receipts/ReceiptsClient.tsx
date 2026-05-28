'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import { useCompany } from '@/lib/CompanyContext'
import UpgradePrompt from '@/app/ui/UpgradePrompt'

interface POItem { description: string; quantity: number; unit_price: number; unit: string; product_id?: string | null; is_stock_item?: boolean }
interface GRItem { description: string; ordered_qty: number; received_qty: number; unit_price: number; unit: string; product_id?: string | null; is_stock_item?: boolean; expiry_date?: string | null }

interface ConfirmedPO {
  id:           string
  po_number:    string
  vendor_id:    number
  items:        POItem[]
  total_amount: number
  vendors?: { name: string } | null
}

interface GoodsReceipt {
  id:                    string
  receipt_number:        string
  po_id:                 string
  received_by:           string
  received_date:         string
  items:                 GRItem[]
  notes:                 string | null
  status:                'draft' | 'confirmed'
  expense_id:            number | null
  vendor_invoice_number: string | null
  vendor_invoice_date:   string | null
  vendor_invoice_amount: number | null
  created_at:            string
  purchase_orders?: {
    po_number:    string
    total_amount: number
    vendors?: { name: string } | null
  } | null
  expenses?: { id: number; payment_status: string; amount: number; category: string | null } | null
}

const CHECK = '✅'
const PENDING = '⏳'

export default function ReceiptsClient() {
  const { t, lang } = useLanguage()
  const { company, user, isFinance, canAccess } = useCompany()
  const params        = useSearchParams()
  const autoOpenedRef = useRef<string | null>(null)

  const [receipts,    setReceipts]    = useState<GoodsReceipt[]>([])
  const [confirmedPOs,setConfirmedPOs] = useState<ConfirmedPO[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [toast,       setToast]       = useState<string | null>(null)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  // detail / vendor invoice
  const [detailGR,   setDetailGR]   = useState<GoodsReceipt | null>(null)
  const [invNumber,  setInvNumber]  = useState('')
  const [invDate,    setInvDate]    = useState('')
  const [invAmount,  setInvAmount]  = useState('')
  const [invError,   setInvError]   = useState<string | null>(null)
  const [savingInv,  setSavingInv]  = useState(false)

  // form state
  const [selectedPO,    setSelectedPO]    = useState('')
  const [receivedDate,  setReceivedDate]  = useState(new Date().toISOString().slice(0, 10))
  const [grItems,       setGRItems]       = useState<GRItem[]>([])
  const [notes,         setNotes]         = useState('')

  const load = useCallback(async () => {
    if (!company) return
    setLoading(true)
    const [{ data: rData }, { data: poData }] = await Promise.all([
      supabase.from('goods_receipts')
        .select('*, purchase_orders(po_number, total_amount, vendors(name)), expenses(id, payment_status, amount, category)')
        .order('created_at', { ascending: false }),
      supabase.from('purchase_orders')
        .select('id, po_number, vendor_id, items, total_amount, vendors(name)')
        .eq('status', 'confirmed'),
    ])
    setReceipts((rData ?? []) as GoodsReceipt[])
    setConfirmedPOs((poData ?? []) as unknown as ConfirmedPO[])
    setLoading(false)
  }, [company])

  useEffect(() => { load() }, [load])

  // Pre-populate from ?po= param — only once per poId to avoid re-opening after load()
  useEffect(() => {
    const poId = params.get('po')
    if (poId && confirmedPOs.length > 0 && autoOpenedRef.current !== poId) {
      const po = confirmedPOs.find(p => p.id === poId)
      if (po) { autoOpenedRef.current = poId; handlePOSelect(poId); setShowForm(true) }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, confirmedPOs])

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  function handlePOSelect(poId: string) {
    setSelectedPO(poId)
    const po = confirmedPOs.find(p => p.id === poId)
    if (po) {
      setGRItems(po.items.map(it => ({
        description:   it.description,
        ordered_qty:   it.quantity,
        received_qty:  it.quantity,
        unit_price:    it.unit_price,
        unit:          it.unit,
        product_id:    it.product_id ?? null,
        is_stock_item: it.is_stock_item ?? false,
        expiry_date:   null,
      })))
    } else {
      setGRItems([])
    }
  }

  async function handleCreate() {
    if (!selectedPO || !company || !user) return
    // Duplicate check: only one confirmed GR per PO allowed
    const hasConfirmed = receipts.some(r => r.po_id === selectedPO && r.status === 'confirmed')
    if (hasConfirmed) { setCreateError(t('proc.duplicateGR')); return }
    setSaving(true)
    if (editingId) {
      const { error } = await supabase.from('goods_receipts').update({
        received_date: receivedDate,
        items:         grItems,
        notes:         notes || null,
      }).eq('id', editingId)
      if (error) setCreateError('Error: ' + error.message)
      else { notify(t('proc.receiptUpdated')); setShowForm(false); resetForm(); load() }
    } else {
      const { data: numData } = await supabase.rpc('get_next_gr_number', { p_company_id: company.id })
      const { error } = await supabase.from('goods_receipts').insert({
        company_id:     company.id,
        receipt_number: numData as string,
        po_id:          selectedPO,
        received_by:    user.id,
        received_date:  receivedDate,
        items:          grItems,
        notes:          notes || null,
        status:         'draft',
      })
      if (error) setCreateError('Error: ' + error.message)
      else { notify(t('proc.receiptCreated')); setShowForm(false); resetForm(); load() }
    }
    setSaving(false)
  }

  async function handleConfirm(id: string) {
    if (!confirm(t('proc.confirmReceiptMsg'))) return
    const { data, error } = await supabase.rpc('confirm_goods_receipt', { p_gr_id: id })
    if (error || (data as { error?: string })?.error) {
      notify('Error: ' + (error?.message ?? (data as { error?: string })?.error))
    } else {
      notify(t('proc.expenseCreated')); load()
    }
  }

  function resetForm() {
    setSelectedPO(''); setReceivedDate(new Date().toISOString().slice(0, 10))
    setGRItems([]); setNotes(''); setEditingId(null); setCreateError(null)
  }

  function openEdit(gr: GoodsReceipt) {
    setEditingId(gr.id)
    setSelectedPO(gr.po_id)
    setReceivedDate(gr.received_date)
    setGRItems(gr.items)
    setNotes(gr.notes ?? '')
    setCreateError(null)
    setShowForm(true)
  }

  async function handleDelete(id: string) {
    if (!confirm(t('proc.deleteReceiptConfirm'))) return
    const { error } = await supabase.from('goods_receipts').delete().eq('id', id)
    if (error) notify('Error: ' + error.message)
    else { notify(t('proc.receiptDeleted')); load() }
  }

  function openDetail(gr: GoodsReceipt) {
    setDetailGR(gr)
    setInvNumber(gr.vendor_invoice_number ?? '')
    setInvDate(gr.vendor_invoice_date ?? '')
    setInvAmount(gr.vendor_invoice_amount != null ? gr.vendor_invoice_amount.toString() : '')
    setInvError(null)
  }

  async function saveVendorInvoice() {
    if (!detailGR) return
    if (!invNumber.trim() || !invDate || !invAmount) return
    const poTotal  = detailGR.purchase_orders?.total_amount ?? 0
    const entered  = Math.round(Number(invAmount) * 100)
    const expected = Math.round(poTotal * 100)
    if (entered !== expected) { setInvError(t('proc.invoiceMismatch')); return }
    setSavingInv(true)
    const { error } = await supabase.from('goods_receipts').update({
      vendor_invoice_number: invNumber.trim(),
      vendor_invoice_date:   invDate,
      vendor_invoice_amount: Number(invAmount),
    }).eq('id', detailGR.id)
    if (error) setInvError('Error: ' + error.message)
    else { notify(t('proc.invoiceSaved')); setDetailGR(null); load() }
    setSavingInv(false)
  }

  async function handleMarkPaid(expenseId: number) {
    if (!confirm(t('proc.paidConfirm'))) return
    const { error } = await supabase.from('expenses').update({ payment_status: 'paid' }).eq('id', expenseId)
    if (error) notify('Error: ' + error.message)
    else { notify(t('proc.paid')); setDetailGR(null); load() }
  }

  if (!canAccess('goods_receipt')) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-gray-500">{t('proc.upgradeHint')}</p>
          <button onClick={() => setShowUpgrade(true)}
            className="mt-3 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl">
            {t('billing.upgrade')}
          </button>
        </div>
        {showUpgrade && <UpgradePrompt feature="goods_receipt" onClose={() => setShowUpgrade(false)} />}
      </>
    )
  }

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">{toast}</div>
      )}

      {/* Summary cards */}
      {!loading && (() => {
        const mStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
        const confirmed = receipts.filter(r => r.status === 'confirmed')
        const monthlySpend = confirmed
          .filter(r => r.received_date >= mStart)
          .reduce((s, r) => s + (r.expenses?.amount ?? r.purchase_orders?.total_amount ?? 0), 0)
        const unpaidCount = confirmed.filter(r => r.expenses?.payment_status !== 'paid').length
        return (
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-medium text-gray-500 mb-1">
                {lang === 'az' ? 'Bu Ay Satınalma Xərcləri' : 'Total Procurement Spend This Month'}
              </p>
              <p className="text-xl font-bold text-gray-900 tabular-nums">₼ {monthlySpend.toFixed(2)}</p>
            </div>
            <div className={`rounded-xl border shadow-sm p-4 ${unpaidCount > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'}`}>
              <p className={`text-xs font-medium mb-1 ${unpaidCount > 0 ? 'text-orange-600' : 'text-gray-500'}`}>
                {lang === 'az' ? 'Ödənilməmiş Satınalma' : 'Unpaid Procurement'}
              </p>
              <p className={`text-xl font-bold tabular-nums ${unpaidCount > 0 ? 'text-orange-600' : 'text-gray-900'}`}>{unpaidCount}</p>
            </div>
          </div>
        )
      })()}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {receipts.length} {t('proc.receipt')}
        </p>
        {isFinance && (
          <button onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('proc.newReceipt')}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t('common.loading')}</div>
        ) : receipts.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t('proc.noReceipts')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {[t('proc.receiptNumber'), t('proc.po'), t('proc.vendor'), t('proc.receivedDate'), t('proc.threeWayMatch'), t('common.status'), t('common.amount'), ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {receipts.map(r => {
                const isConfirmed = r.status === 'confirmed'
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.receipt_number}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{r.purchase_orders?.po_number ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.purchase_orders?.vendors?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{r.received_date}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 text-xs flex-wrap">
                        <span>{CHECK} {t('proc.po')}</span>
                        <span className="text-gray-300 mx-1">·</span>
                        <span>{isConfirmed ? CHECK : PENDING} {t('proc.receipt')}</span>
                        <span className="text-gray-300 mx-1">·</span>
                        <span>{r.vendor_invoice_number ? CHECK : PENDING} {t('proc.vendorInvoice')}</span>
                        <span className="text-gray-300 mx-1">·</span>
                        <span>{r.expenses?.payment_status === 'paid' ? CHECK : PENDING} {t('proc.payment')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isConfirmed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {isConfirmed ? t('proc.grConfirmed') : t('proc.grDraft')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-700 text-sm whitespace-nowrap">
                      {r.expenses?.amount != null
                        ? `₼ ${r.expenses.amount.toFixed(2)}`
                        : r.purchase_orders?.total_amount != null
                          ? `₼ ${r.purchase_orders.total_amount.toFixed(2)}`
                          : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {!isConfirmed && isFinance && (
                          <>
                            <button onClick={() => handleConfirm(r.id)}
                              className="px-2.5 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
                              {t('proc.confirmReceipt')}
                            </button>
                            <button onClick={() => openEdit(r)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title={t('common.edit')}>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={() => handleDelete(r.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title={t('common.delete')}>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        )}
                        <button onClick={() => openDetail(r)}
                          className="px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
                          {t('proc.grDetail')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) { setShowForm(false); resetForm() } }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">
                {editingId ? t('proc.editReceipt') : t('proc.newReceipt')}
              </h2>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* PO select — read-only in edit mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('proc.po')} *</label>
                {editingId ? (
                  <p className="px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-600">
                    {confirmedPOs.find(p => p.id === selectedPO)?.po_number ?? selectedPO}
                  </p>
                ) : (
                  <div className="relative">
                    <select value={selectedPO} onChange={e => { handlePOSelect(e.target.value); setCreateError(null) }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm appearance-none pr-8 focus:ring-2 focus:ring-blue-500 outline-none">
                      <option value="">{t('proc.selectPO')}</option>
                      {confirmedPOs.map(po => (
                        <option key={po.id} value={po.id}>{po.po_number} — {po.vendors?.name}</option>
                      ))}
                    </select>
                    <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                )}
                {createError && (
                  <p className="mt-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{createError}</p>
                )}
              </div>
              {/* Received date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('proc.receivedDate')}</label>
                <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              {/* Items received */}
              {grItems.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('inv.lineItems')}</label>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[2fr_80px_80px] bg-gray-50 text-xs font-semibold text-gray-500 px-3 py-2 gap-2">
                      <span>{t('common.description')}</span>
                      <span className="text-center">{t('proc.orderedQty')}</span>
                      <span className="text-center">{t('proc.receivedQty')}</span>
                    </div>
                    {grItems.map((it, idx) => (
                      <div key={idx} className="border-t border-gray-100">
                        <div className="grid grid-cols-[2fr_80px_80px] px-3 py-2 gap-2 items-center text-sm">
                          <span className="text-gray-700 flex items-center gap-1.5">
                            {it.description}
                            {it.is_stock_item && (
                              <span className="shrink-0 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                {t('proc.stockProduct')}
                              </span>
                            )}
                          </span>
                          <span className="text-center text-gray-500">{it.ordered_qty} {it.unit}</span>
                          <input type="number" min="0" max={it.ordered_qty} value={it.received_qty}
                            onChange={e => setGRItems(p => p.map((g, i) => i === idx ? { ...g, received_qty: Number(e.target.value) } : g))}
                            className="text-center border border-gray-200 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full" />
                        </div>
                        {it.is_stock_item && (
                          <div className="px-3 pb-2 flex items-center gap-2">
                            <label className="text-xs text-gray-500 whitespace-nowrap">{t('wh.expiryDateOptional')}:</label>
                            <input type="date" value={it.expiry_date ?? ''}
                              onChange={e => setGRItems(p => p.map((g, i) => i === idx ? { ...g, expiry_date: e.target.value || null } : g))}
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('proc.notes')}</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => { setShowForm(false); resetForm() }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                {t('common.cancel')}
              </button>
              <button onClick={handleCreate} disabled={saving || !selectedPO}
                className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {saving ? t('common.saving') : editingId ? t('common.save') : t('proc.newReceipt')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail / Vendor Invoice modal */}
      {detailGR && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) setDetailGR(null) }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-800">{t('proc.grDetail')}</h2>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">{detailGR.receipt_number}</p>
              </div>
              <button onClick={() => setDetailGR(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* 3-way match */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('proc.threeWayMatch')}</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {([
                    { label: t('proc.po'),           ok: true },
                    { label: t('proc.receipt'),      ok: detailGR.status === 'confirmed' },
                    { label: t('proc.vendorInvoice'),ok: !!detailGR.vendor_invoice_number },
                    { label: t('proc.payment'),      ok: detailGR.expenses?.payment_status === 'paid' },
                  ] as { label: string; ok: boolean }[]).map(item => (
                    <div key={item.label} className={`rounded-lg py-2.5 px-1 ${item.ok ? 'bg-green-50' : 'bg-yellow-50'}`}>
                      <div className="text-lg">{item.ok ? CHECK : PENDING}</div>
                      <div className={`text-xs font-medium mt-1 leading-tight ${item.ok ? 'text-green-700' : 'text-yellow-700'}`}>{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* GR info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">{t('proc.po')}</p>
                  <p className="font-medium text-gray-800">{detailGR.purchase_orders?.po_number ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('proc.vendor')}</p>
                  <p className="font-medium text-gray-800">{detailGR.purchase_orders?.vendors?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('proc.receivedDate')}</p>
                  <p className="font-medium text-gray-800">{detailGR.received_date}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('common.amount')}</p>
                  <p className="font-medium text-gray-800">
                    {detailGR.purchase_orders?.total_amount != null
                      ? `₼ ${detailGR.purchase_orders.total_amount.toFixed(2)}`
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Linked Expense */}
              {detailGR.expense_id && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    {lang === 'az' ? 'Əlaqəli Xərc' : 'Linked Expense'}
                  </p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">ID</p>
                      <p className="font-medium text-gray-800">#{detailGR.expense_id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{lang === 'az' ? 'Kateqoriya' : 'Category'}</p>
                      <p className="font-medium text-gray-800">{detailGR.expenses?.category ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{lang === 'az' ? 'Ödəniş statusu' : 'Payment Status'}</p>
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                        detailGR.expenses?.payment_status === 'paid'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {detailGR.expenses?.payment_status === 'paid'
                          ? (lang === 'az' ? 'Ödənilib' : 'Paid')
                          : (lang === 'az' ? 'Gözləyir' : 'Pending')}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Vendor Invoice section */}
              {detailGR.status === 'confirmed' && (
                <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700">{t('proc.vendorInvoice')}</h3>
                  {detailGR.vendor_invoice_number ? (
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-500">{t('proc.invoiceNumber')}</p>
                        <p className="font-medium text-gray-800">{detailGR.vendor_invoice_number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">{t('proc.invoiceDate')}</p>
                        <p className="font-medium text-gray-800">{detailGR.vendor_invoice_date ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">{t('proc.invoiceAmount')}</p>
                        <p className="font-medium text-gray-800">₼ {detailGR.vendor_invoice_amount?.toFixed(2) ?? '—'}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('proc.invoiceNumber')} *</label>
                          <input value={invNumber} onChange={e => { setInvNumber(e.target.value); setInvError(null) }}
                            placeholder="INV-001"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('proc.invoiceDate')} *</label>
                          <input type="date" value={invDate} onChange={e => { setInvDate(e.target.value); setInvError(null) }}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('proc.invoiceAmount')} *</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₼</span>
                          <input type="number" min="0" step="0.01" value={invAmount}
                            onChange={e => { setInvAmount(e.target.value); setInvError(null) }}
                            placeholder={detailGR.purchase_orders?.total_amount?.toFixed(2) ?? '0.00'}
                            className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {t('proc.po')}: ₼ {detailGR.purchase_orders?.total_amount?.toFixed(2) ?? '—'}
                        </p>
                      </div>
                      {invError && (
                        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{invError}</p>
                      )}
                      {isFinance && (
                        <button onClick={saveVendorInvoice}
                          disabled={savingInv || !invNumber.trim() || !invDate || !invAmount}
                          className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
                          {savingInv ? t('common.saving') : t('proc.saveInvoice')}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Mark as Paid */}
              {detailGR.expense_id && isFinance && (
                detailGR.expenses?.payment_status === 'paid' ? (
                  <div className="text-center text-sm text-green-600 font-medium bg-green-50 rounded-xl py-2.5">
                    {CHECK} {t('proc.paid')}
                  </div>
                ) : (
                  <button onClick={() => handleMarkPaid(detailGR.expense_id!)}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors">
                    {t('proc.markAsPaid')}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {showUpgrade && <UpgradePrompt feature="goods_receipt" onClose={() => setShowUpgrade(false)} />}
    </div>
  )
}
