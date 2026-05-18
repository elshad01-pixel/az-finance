'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import { useCompany } from '@/lib/CompanyContext'
import UpgradePrompt from '@/app/ui/UpgradePrompt'

interface POItem { description: string; quantity: number; unit_price: number; unit: string }
interface GRItem { description: string; ordered_qty: number; received_qty: number; unit_price: number; unit: string }

interface ConfirmedPO {
  id:           string
  po_number:    string
  vendor_id:    string
  items:        POItem[]
  total_amount: number
  vendors?: { name: string } | null
}

interface GoodsReceipt {
  id:             string
  receipt_number: string
  po_id:          string
  received_by:    string
  received_date:  string
  items:          GRItem[]
  notes:          string | null
  status:         'draft' | 'confirmed'
  expense_id:     string | null
  created_at:     string
  purchase_orders?: {
    po_number:     string
    vendors?: { name: string } | null
  } | null
}

const CHECK = '✅'
const PENDING = '⏳'

export default function ReceiptsClient() {
  const { t }     = useLanguage()
  const { company, user, isFinance, canAccess } = useCompany()
  const params    = useSearchParams()

  const [receipts,    setReceipts]    = useState<GoodsReceipt[]>([])
  const [confirmedPOs,setConfirmedPOs] = useState<ConfirmedPO[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [toast,       setToast]       = useState<string | null>(null)

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
        .select('*, purchase_orders(po_number, vendors(name))')
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

  // Pre-populate from ?po= param
  useEffect(() => {
    const poId = params.get('po')
    if (poId && confirmedPOs.length > 0) {
      const po = confirmedPOs.find(p => p.id === poId)
      if (po) { handlePOSelect(poId); setShowForm(true) }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, confirmedPOs])

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  function handlePOSelect(poId: string) {
    setSelectedPO(poId)
    const po = confirmedPOs.find(p => p.id === poId)
    if (po) {
      setGRItems(po.items.map(it => ({
        description:  it.description,
        ordered_qty:  it.quantity,
        received_qty: it.quantity,
        unit_price:   it.unit_price,
        unit:         it.unit,
      })))
    } else {
      setGRItems([])
    }
  }

  async function handleCreate() {
    if (!selectedPO || !company || !user) return
    setSaving(true)
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
    if (error) notify('Error: ' + error.message)
    else { notify(t('proc.newReceipt') + ' yaradıldı'); setShowForm(false); resetForm(); load() }
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
    setGRItems([]); setNotes('')
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
                {[t('proc.receiptNumber'), t('proc.po'), t('proc.vendor'), t('proc.receivedDate'), t('proc.threeWayMatch'), t('common.status'), ''].map(h => (
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
                      <div className="flex gap-1 text-xs">
                        <span title={t('proc.po')}>{CHECK} {t('proc.po')}</span>
                        <span className="text-gray-300 mx-1">·</span>
                        <span title={t('proc.receipt')}>{isConfirmed ? CHECK : PENDING} {t('proc.receipt')}</span>
                        <span className="text-gray-300 mx-1">·</span>
                        <span title={t('proc.invoice')}>{r.expense_id ? CHECK : PENDING} {t('proc.invoice')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isConfirmed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {isConfirmed ? t('proc.grConfirmed') : t('proc.grDraft')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!isConfirmed && isFinance && (
                        <button onClick={() => handleConfirm(r.id)}
                          className="px-2.5 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
                          {t('proc.confirmReceipt')}
                        </button>
                      )}
                      {r.expense_id && (
                        <span className="text-xs text-purple-600 font-medium">
                          {t('proc.expenseCreated')}
                        </span>
                      )}
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
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">{t('proc.newReceipt')}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* PO select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('proc.po')} *</label>
                <div className="relative">
                  <select value={selectedPO} onChange={e => handlePOSelect(e.target.value)}
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
                      <div key={idx} className="grid grid-cols-[2fr_80px_80px] px-3 py-2 gap-2 border-t border-gray-100 items-center text-sm">
                        <span className="text-gray-700">{it.description}</span>
                        <span className="text-center text-gray-500">{it.ordered_qty} {it.unit}</span>
                        <input type="number" min="0" max={it.ordered_qty} value={it.received_qty}
                          onChange={e => setGRItems(p => p.map((g, i) => i === idx ? { ...g, received_qty: Number(e.target.value) } : g))}
                          className="text-center border border-gray-200 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full" />
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
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                {t('common.cancel')}
              </button>
              <button onClick={handleCreate} disabled={saving || !selectedPO}
                className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {saving ? t('common.saving') : t('proc.newReceipt')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpgrade && <UpgradePrompt feature="goods_receipt" onClose={() => setShowUpgrade(false)} />}
    </div>
  )
}
