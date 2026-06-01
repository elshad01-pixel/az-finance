'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import { useCompany } from '@/lib/CompanyContext'
import { logActivity } from '@/lib/activity'

type DelStatus = 'draft' | 'confirmed' | 'cancelled'

interface SOLineItem {
  description:   string
  quantity:      number
  unit_price:    number
  unit:          string
  product_id:    string | null
  is_stock_item: boolean
}

interface DelItem {
  product_id:    string | null
  description:   string
  unit:          string
  so_qty:        number
  delivered_qty: number
  is_stock_item: boolean
}

interface Delivery {
  id:              string
  delivery_number: string
  so_id:           string
  delivery_date:   string
  items:           DelItem[]
  status:          DelStatus
  notes:           string | null
  cogs_amount:     number
  created_at:      string
  sales_orders:    { so_number: string; clients: { company: string } | null } | null
}

interface ConfirmedSO {
  id:        string
  so_number: string
  items:     SOLineItem[]
  clients:   { company: string } | null
}

const STATUS_STYLE: Record<DelStatus, string> = {
  draft:     'bg-gray-100 text-gray-600',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

function fmtDate(s: string) {
  return new Intl.DateTimeFormat('az-AZ').format(new Date(s + 'T12:00:00'))
}

export default function DeliveriesClient() {
  const { t } = useLanguage()
  const { company } = useCompany()
  const searchParams = useSearchParams()

  const [deliveries,   setDeliveries]   = useState<Delivery[]>([])
  const [confirmedSOs, setConfirmedSOs] = useState<ConfirmedSO[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [showForm,     setShowForm]     = useState(false)
  const [selectedSOId, setSelectedSOId] = useState('')
  const [formItems,    setFormItems]    = useState<DelItem[]>([])
  const [formDate,     setFormDate]     = useState(new Date().toISOString().slice(0, 10))
  const [formNotes,    setFormNotes]    = useState('')
  const [confirmDel,   setConfirmDel]   = useState<{ id: string; number: string } | null>(null)
  const [cancelDel,    setCancelDel]    = useState<{ id: string; number: string } | null>(null)
  const [toast,        setToast]        = useState('')
  const paramHandled = useRef(false)

  const load = useCallback(async () => {
    const [delRes, soRes] = await Promise.all([
      supabase.from('deliveries')
        .select('*, sales_orders(so_number, clients(company))')
        .order('created_at', { ascending: false })
        .limit(300),
      supabase.from('sales_orders')
        .select('id, so_number, items, clients(company)')
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false }),
    ])
    setDeliveries((delRes.data as Delivery[]) ?? [])
    setConfirmedSOs((soRes.data as unknown as ConfirmedSO[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-open form when ?so=uuid param present (from "Create Delivery" button on SO page)
  useEffect(() => {
    const soId = searchParams.get('so')
    if (soId && confirmedSOs.length > 0 && !paramHandled.current) {
      paramHandled.current = true
      openFormWithSO(soId)
    }
  }, [searchParams, confirmedSOs]) // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4500)
  }

  function openFormWithSO(soId: string) {
    const so = confirmedSOs.find(s => s.id === soId)
    if (!so) return
    setSelectedSOId(soId)
    setFormItems(itemsFromSO(so.items))
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormNotes('')
    setShowForm(true)
  }

  function itemsFromSO(soItems: SOLineItem[]): DelItem[] {
    return soItems.map(it => ({
      product_id:    it.product_id ?? null,
      description:   it.description,
      unit:          it.unit,
      so_qty:        it.quantity,
      delivered_qty: it.quantity,
      is_stock_item: it.is_stock_item ?? false,
    }))
  }

  function handleSOSelect(soId: string) {
    setSelectedSOId(soId)
    const so = confirmedSOs.find(s => s.id === soId)
    setFormItems(so ? itemsFromSO(so.items) : [])
  }

  function openForm() {
    setSelectedSOId('')
    setFormItems([])
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormNotes('')
    setShowForm(true)
  }

  async function submit() {
    if (!selectedSOId) return
    setSaving(true)

    const year   = new Date().getFullYear()
    const prefix = `DEL-${year}-`
    const { data: existing } = await supabase.from('deliveries').select('delivery_number').like('delivery_number', `${prefix}%`)
    const maxNum = (existing ?? []).reduce((mx, r) => {
      const n = parseInt(r.delivery_number.split('-')[2] ?? '0') || 0
      return Math.max(mx, n)
    }, 0)
    const delNumber = `${prefix}${String(maxNum + 1).padStart(3, '0')}`

    const { error } = await supabase.from('deliveries').insert({
      delivery_number: delNumber,
      so_id:           selectedSOId,
      delivery_date:   formDate,
      items:           formItems,
      notes:           formNotes || null,
      status:          'draft',
    })
    setSaving(false)
    if (!error) {
      setShowForm(false)
      showToast(`${t('del.newDelivery')} (${delNumber}) yaradıldı`)
      load()
    }
  }

  async function handleConfirmDelivery(id: string) {
    const delivLabel = deliveries.find(d => d.id === id)?.delivery_number
    const { data, error } = await supabase.rpc('confirm_delivery', { p_delivery_id: id })
    setConfirmDel(null)
    if (!error && data?.ok) {
      showToast(`${t('del.deliveryConfirmed')}. ${t('del.invoiceCreated')}: ${data.invoice_number}`)
      logActivity({ supabase, action: 'confirmed', module: 'deliveries', record_label: delivLabel, company_id: company?.id })
      load()
    } else {
      showToast(data?.error ?? 'Xəta baş verdi')
    }
  }

  async function handleCancelDelivery(id: string) {
    const { data, error } = await supabase.rpc('cancel_delivery', { p_delivery_id: id })
    setCancelDel(null)
    if (!error && data?.ok) {
      showToast(t('del.deliveryCancelled'))
      load()
    } else {
      showToast((data as { error?: string })?.error ?? error?.message ?? 'Xəta baş verdi')
    }
  }

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 bg-gray-100 rounded-lg" />
      <div className="h-96 bg-gray-100 rounded-xl" />
    </div>
  )

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-green-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 max-w-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('page.salesDeliveries')}</h2>
          <p className="text-gray-500 text-sm mt-1">{deliveries.length} çatdırılma</p>
        </div>
        <button onClick={openForm} disabled={confirmedSOs.length === 0}
          title={confirmedSOs.length === 0 ? 'Əvvəlcə satış sifarişini təsdiqləyin' : undefined}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('del.newDelivery')}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[750px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {[
                  t('del.deliveryNumber'),
                  t('del.soNumber'),
                  t('common.client'),
                  t('del.deliveryDate'),
                  t('del.cogs'),
                  t('common.status'),
                  '',
                ].map((h, i) => (
                  <th key={i} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {deliveries.map(d => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{d.delivery_number}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{d.sales_orders?.so_number ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{d.sales_orders?.clients?.company ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{fmtDate(d.delivery_date)}</td>
                  <td className="px-4 py-3 text-sm tabular-nums text-gray-600 whitespace-nowrap">
                    {d.cogs_amount > 0 ? `₼ ${Number(d.cogs_amount).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[d.status]}`}>
                      {d.status === 'confirmed'
                        ? t('del.statusConfirmed')
                        : d.status === 'cancelled'
                        ? t('del.statusCancelled')
                        : t('del.statusDraft')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {d.status === 'draft' && (
                        <button onClick={() => setConfirmDel({ id: d.id, number: d.delivery_number })}
                          className="text-xs font-semibold text-green-600 hover:text-green-700 px-2.5 py-1 border border-green-200 rounded-lg hover:bg-green-50 transition-colors whitespace-nowrap">
                          {t('del.confirmDelivery')}
                        </button>
                      )}
                      {d.status !== 'cancelled' && (
                        <button onClick={() => setCancelDel({ id: d.id, number: d.delivery_number })}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-1 border border-red-200 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap">
                          {t('del.cancelDelivery')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {deliveries.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">{t('del.noDeliveries')}</div>
        )}
      </div>

      {/* ── New Delivery slide-over ──────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">

            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">{t('del.newDelivery')}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 px-6 py-5 space-y-5">

              {/* SO select */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('del.selectSO')}</label>
                <select value={selectedSOId} onChange={e => handleSOSelect(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{t('del.selectSO')}</option>
                  {confirmedSOs.map(so => (
                    <option key={so.id} value={so.id}>{so.so_number} — {so.clients?.company ?? '—'}</option>
                  ))}
                </select>
              </div>

              {/* Delivery date */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('del.deliveryDate')}</label>
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Items table */}
              {formItems.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mallar</label>
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Mal / Xidmət</th>
                          <th className="text-center px-3 py-2 font-semibold text-gray-500">{t('del.soQty')}</th>
                          <th className="text-center px-3 py-2 font-semibold text-gray-500">{t('del.deliveredQty')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {formItems.map((it, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2.5 text-gray-700">
                              {it.description || '—'}
                              {it.is_stock_item && <span className="ml-1 text-blue-400">📦</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center text-gray-500 tabular-nums">{it.so_qty} {it.unit}</td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number" min="0" max={it.so_qty} step="any"
                                value={it.delivered_qty}
                                onChange={e => setFormItems(prev => prev.map((fi, i) =>
                                  i === idx ? { ...fi, delivered_qty: Number(e.target.value) } : fi
                                ))}
                                className="w-20 text-center border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 mx-auto block" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('so.notes')} <span className="text-gray-400 font-normal">(ixtiyari)</span>
                </label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                {t('common.cancel')}
              </button>
              <button onClick={submit} disabled={saving || !selectedSOId}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delivery dialog ──────────────────────────────────────── */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-base font-bold text-gray-900 mb-2">{t('del.confirmDelivery')}</h3>
            <p className="text-sm text-gray-500 mb-6">
              {t('del.confirmDeliveryMsg')} <span className="font-mono text-gray-700">({confirmDel.number})</span>
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                {t('common.cancel')}
              </button>
              <button onClick={() => handleConfirmDelivery(confirmDel.id)}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors">
                {t('del.confirmDelivery')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Delivery dialog ───────────────────────────────────────── */}
      {cancelDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-base font-bold text-gray-900 mb-2">{t('del.cancelDelivery')}</h3>
            <p className="text-sm text-gray-500 mb-6">
              {t('del.cancelDeliveryMsg')} <span className="font-mono text-gray-700">({cancelDel.number})</span>
            </p>
            <div className="flex gap-3">
              <button onClick={() => setCancelDel(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                {t('common.cancel')}
              </button>
              <button onClick={() => handleCancelDelivery(cancelDel.id)}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition-colors">
                {t('del.cancelDelivery')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
