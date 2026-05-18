'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import { useCompany } from '@/lib/CompanyContext'
import UpgradePrompt from '@/app/ui/UpgradePrompt'
import type { TranslationKey } from '@/lib/i18n'

interface LineItem { description: string; quantity: number; unit_price: number; unit: string }

interface PurchaseRequest {
  id:               string
  request_number:   string
  requested_by:     string
  title:            string
  description:      string | null
  vendor_id:        string | null
  items:            LineItem[]
  total_amount:     number
  status:           'draft' | 'submitted' | 'approved' | 'rejected' | 'ordered'
  priority:         'low' | 'normal' | 'high' | 'urgent'
  needed_by:        string | null
  approved_by:      string | null
  approved_at:      string | null
  rejection_reason: string | null
  created_at:       string
  vendors?: { name: string } | null
}

interface Vendor { id: string; name: string }

type PRStatus   = PurchaseRequest['status']
type PRPriority = PurchaseRequest['priority']

const STATUS_STYLES: Record<PRStatus, string> = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
  ordered:   'bg-purple-100 text-purple-700',
}
const STATUS_KEY: Record<PRStatus, TranslationKey> = {
  draft:     'proc.statusDraft',
  submitted: 'proc.statusSubmitted',
  approved:  'proc.statusApproved',
  rejected:  'proc.statusRejected',
  ordered:   'proc.statusOrdered',
}
const PRIORITY_STYLES: Record<PRPriority, string> = {
  low:    'bg-gray-100 text-gray-500',
  normal: 'bg-blue-50 text-blue-600',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}
const PRIORITY_KEY: Record<PRPriority, TranslationKey> = {
  low:    'proc.priorityLow',
  normal: 'proc.priorityNormal',
  high:   'proc.priorityHigh',
  urgent: 'proc.priorityUrgent',
}

const EMPTY_ITEM = (): LineItem => ({ description: '', quantity: 1, unit_price: 0, unit: 'ədəd' })

export default function RequestsClient() {
  const { t }          = useLanguage()
  const { company, user, membership, isManager, canAccess } = useCompany()
  const router         = useRouter()

  const [requests,      setRequests]      = useState<PurchaseRequest[]>([])
  const [vendors,       setVendors]       = useState<Vendor[]>([])
  const [loading,       setLoading]       = useState(true)
  const [showForm,      setShowForm]      = useState(false)
  const [showReject,    setShowReject]    = useState(false)
  const [showUpgrade,   setShowUpgrade]   = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [rejectingId,   setRejectingId]   = useState<string | null>(null)
  const [rejectionNote, setRejectionNote] = useState('')
  const [filterStatus,  setFilterStatus]  = useState('all')
  const [toast,         setToast]         = useState<string | null>(null)

  // form state
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [vendorId,    setVendorId]    = useState('')
  const [items,       setItems]       = useState<LineItem[]>([EMPTY_ITEM()])
  const [priority,    setPriority]    = useState<PRPriority>('normal')
  const [neededBy,    setNeededBy]    = useState('')

  const isEmployee = membership?.role === 'employee'

  const load = useCallback(async () => {
    if (!company) return
    setLoading(true)
    const [{ data: rData }, { data: vData }] = await Promise.all([
      supabase.from('purchase_requests')
        .select('*, vendors(name)')
        .order('created_at', { ascending: false }),
      supabase.from('vendors').select('id, name').order('name'),
    ])
    let rows = (rData ?? []) as PurchaseRequest[]
    if (isEmployee && user) rows = rows.filter(r => r.requested_by === user.id)
    setRequests(rows)
    setVendors((vData ?? []) as Vendor[])
    setLoading(false)
  }, [company, isEmployee, user])

  useEffect(() => { load() }, [load])

  function notify(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function resetForm() {
    setTitle(''); setDescription(''); setVendorId(''); setPriority('normal')
    setNeededBy(''); setItems([EMPTY_ITEM()])
  }

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)

  function updateItem(idx: number, field: keyof LineItem, val: string | number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }

  async function handleCreate() {
    if (!title.trim() || !company || !user) return
    setSaving(true)
    const { data: numData } = await supabase.rpc('get_next_pr_number', { p_company_id: company.id })
    const { error } = await supabase.from('purchase_requests').insert({
      company_id:     company.id,
      request_number: numData as string,
      requested_by:   user.id,
      title: title.trim(),
      description: description.trim() || null,
      vendor_id: vendorId || null,
      items, total_amount: total,
      status: 'draft', priority,
      needed_by: neededBy || null,
    })
    if (error) { notify('Error: ' + error.message) }
    else { notify(t('proc.newRequest') + ' yaradıldı'); setShowForm(false); resetForm(); load() }
    setSaving(false)
  }

  async function handleSubmit(id: string) {
    if (!confirm(t('proc.submitConfirm'))) return
    await supabase.from('purchase_requests').update({ status: 'submitted' }).eq('id', id)
    notify(t('proc.statusSubmitted')); load()
  }

  async function handleApprove(id: string) {
    if (!confirm(t('proc.approveConfirm'))) return
    await supabase.from('purchase_requests').update({
      status: 'approved', approved_by: user?.id, approved_at: new Date().toISOString(),
    }).eq('id', id)
    notify(t('proc.statusApproved')); load()
  }

  function openReject(id: string) { setRejectingId(id); setRejectionNote(''); setShowReject(true) }

  async function handleReject() {
    if (!rejectingId) return
    await supabase.from('purchase_requests').update({
      status: 'rejected', rejection_reason: rejectionNote,
    }).eq('id', rejectingId)
    setShowReject(false); setRejectingId(null)
    notify(t('proc.statusRejected')); load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this request?')) return
    await supabase.from('purchase_requests').delete().eq('id', id)
    load()
  }

  const filtered = requests.filter(r => filterStatus === 'all' || r.status === filterStatus)

  const pendingCount  = requests.filter(r => r.status === 'submitted').length
  const approvedCount = requests.filter(r => r.status === 'approved').length

  if (!canAccess('purchase_requests')) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">{t('proc.upgradeHint')}</h2>
          <button
            onClick={() => setShowUpgrade(true)}
            className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {t('billing.upgrade')}
          </button>
        </div>
        {showUpgrade && <UpgradePrompt feature="purchase_requests" onClose={() => setShowUpgrade(false)} />}
      </>
    )
  }

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: t('proc.pendingApprovals'), value: pendingCount,        color: 'text-blue-600',  bg: 'bg-blue-50' },
          { label: t('proc.statusApproved'),   value: approvedCount,       color: 'text-green-600', bg: 'bg-green-50' },
          { label: lang('az') ? 'Cəmi Sorğu' : 'Total Requests', value: requests.length, color: 'text-gray-700', bg: 'bg-gray-50' },
        ].map(card => (
          <div key={card.label} className={`${card.bg} rounded-xl p-4 border border-white`}>
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {(['all','draft','submitted','approved','rejected','ordered'] as const).map(s => (
            <button key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? (t('common.all')) : t(STATUS_KEY[s as PRStatus])}
            </button>
          ))}
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('proc.newRequest')}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t('proc.noRequests')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {[t('proc.requestNumber'), t('proc.title'), t('proc.vendor'), t('proc.priority'), t('proc.neededBy'), t('common.status'), t('common.amount'), ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.request_number}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{r.title}</p>
                    {r.rejection_reason && (
                      <p className="text-xs text-red-500 mt-0.5">↳ {r.rejection_reason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.vendors?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_STYLES[r.priority]}`}>
                      {t(PRIORITY_KEY[r.priority])}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.needed_by ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[r.status]}`}>
                      {t(STATUS_KEY[r.status])}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">
                    {r.total_amount > 0 ? `₼ ${r.total_amount.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {r.status === 'draft' && r.requested_by === user?.id && (
                        <button onClick={() => handleSubmit(r.id)}
                          className="px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                          {t('proc.submit')}
                        </button>
                      )}
                      {r.status === 'submitted' && isManager && (
                        <>
                          <button onClick={() => handleApprove(r.id)}
                            className="px-2.5 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
                            {t('proc.approve')}
                          </button>
                          <button onClick={() => openReject(r.id)}
                            className="px-2.5 py-1 text-xs font-medium bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors">
                            {t('proc.reject')}
                          </button>
                        </>
                      )}
                      {r.status === 'approved' && isManager && (
                        <button
                          onClick={() => router.push(`/procurement/orders?pr=${r.id}`)}
                          className="px-2.5 py-1 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors">
                          {t('proc.createOrder')}
                        </button>
                      )}
                      {r.status === 'draft' && r.requested_by === user?.id && (
                        <button onClick={() => handleDelete(r.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">{t('proc.newRequest')}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('proc.title')} *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('proc.title')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.description')}</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none" />
              </div>
              {/* Vendor + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('proc.vendor')}</label>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('proc.priority')}</label>
                  <div className="flex gap-1.5">
                    {(['low','normal','high','urgent'] as PRPriority[]).map(p => (
                      <button key={p} onClick={() => setPriority(p)}
                        className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                          priority === p ? PRIORITY_STYLES[p] + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>
                        {t(PRIORITY_KEY[p])}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Needed By */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('proc.neededBy')}</label>
                <input type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
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
                        placeholder={t('common.description')}
                        className="text-sm border-b border-gray-200 focus:border-blue-500 outline-none py-1 w-full" />
                      <input type="number" min="0" value={it.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                        className="text-sm border-b border-gray-200 focus:border-blue-500 outline-none py-1 w-full text-center" />
                      <input value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} placeholder="ədəd"
                        className="text-sm border-b border-gray-200 focus:border-blue-500 outline-none py-1 w-full" />
                      <input type="number" min="0" step="0.01" value={it.unit_price} onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))}
                        className="text-sm border-b border-gray-200 focus:border-blue-500 outline-none py-1 w-full text-right" />
                      <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))} disabled={items.length === 1}
                        className="text-gray-300 hover:text-red-500 disabled:opacity-30 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <div className="grid grid-cols-[2fr_1fr_1fr_100px_32px] px-3 py-2 bg-gray-50 border-t border-gray-100 text-sm font-semibold">
                    <span className="col-span-3 text-gray-500">{t('common.total')}</span>
                    <span className="text-right text-gray-800">₼ {total.toFixed(2)}</span>
                    <span />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                {t('common.cancel')}
              </button>
              <button onClick={handleCreate} disabled={saving || !title.trim()}
                className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
                {saving ? t('common.saving') : t('proc.newRequest')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showReject && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-4">{t('proc.rejectReason')}</h3>
            <textarea value={rejectionNote} onChange={e => setRejectionNote(e.target.value)} rows={3}
              placeholder={t('proc.rejectReason')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-400 outline-none resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setShowReject(false)}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                {t('common.cancel')}
              </button>
              <button onClick={handleReject}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors">
                {t('proc.reject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpgrade && <UpgradePrompt feature="purchase_requests" onClose={() => setShowUpgrade(false)} />}
    </div>
  )
}

function lang(l: string) { return typeof window !== 'undefined' && localStorage.getItem('azfinance-lang') === l }
