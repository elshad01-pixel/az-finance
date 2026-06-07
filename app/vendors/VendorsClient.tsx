'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

export interface Vendor {
  id:         number
  name:       string
  voen:       string | null
  category:   string | null
  phone:      string | null
  email:      string | null
  address:    string | null
  notes:      string | null
  created_at: string
}

interface ExpenseSummary {
  vendor_id: number
  amount:    number
  date:      string
}

interface PortalAccess {
  vendor_id: number
  email:     string
  status:    'pending' | 'active' | 'suspended'
}

type VendorCategory = 'office' | 'utility' | 'it' | 'transport' | 'marketing' | 'professional' | 'other'

const CAT_KEYS: Record<VendorCategory, TranslationKey> = {
  office:       'ven.catOffice',
  utility:      'ven.catUtility',
  it:           'ven.catIT',
  transport:    'ven.catTransport',
  marketing:    'ven.catMarketing',
  professional: 'ven.catProfessional',
  other:        'ven.catOther',
}

const CAT_COLORS: Record<VendorCategory, string> = {
  office:       'bg-blue-100 text-blue-700',
  utility:      'bg-yellow-100 text-yellow-700',
  it:           'bg-purple-100 text-purple-700',
  transport:    'bg-orange-100 text-orange-700',
  marketing:    'bg-pink-100 text-pink-700',
  professional: 'bg-teal-100 text-teal-700',
  other:        'bg-gray-100 text-gray-600',
}

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const EMPTY_FORM = {
  name: '', voen: '', category: '' as VendorCategory | '',
  phone: '', email: '', address: '', notes: '',
}
type FormData = typeof EMPTY_FORM

export default function VendorsClient() {
  const { t, lang } = useLanguage()

  const [vendors,         setVendors]         = useState<Vendor[]>([])
  const [expenses,        setExpenses]        = useState<ExpenseSummary[]>([])
  const [portalAccess,    setPortalAccess]    = useState<PortalAccess[]>([])
  const [pendingInvoices, setPendingInvoices] = useState(0)
  const [loading,         setLoading]         = useState(true)
  const [showModal,       setShowModal]       = useState(false)
  const [editingId,       setEditingId]       = useState<number | null>(null)
  const [form,            setForm]            = useState<FormData>(EMPTY_FORM)
  const [saving,          setSaving]          = useState(false)
  const [search,          setSearch]          = useState('')

  const [inviteVendor,  setInviteVendor]  = useState<Vendor | null>(null)
  const [inviteEmail,   setInviteEmail]   = useState('')
  const [inviteSaving,  setInviteSaving]  = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [inviteError,   setInviteError]   = useState<string | null>(null)

  const isEditing = editingId !== null

  useEffect(() => {
    Promise.all([
      supabase.from('vendors').select('*').order('name'),
      supabase.from('expenses').select('vendor_id, amount, date').not('vendor_id', 'is', null),
      supabase.from('vendor_portal_access').select('vendor_id, email, status'),
      supabase.from('vendor_invoices').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'under_review']),
    ]).then(([vRes, eRes, paRes, viRes]) => {
      setVendors((vRes.data as Vendor[]) ?? [])
      setExpenses((eRes.data as ExpenseSummary[]) ?? [])
      setPortalAccess((paRes.data as PortalAccess[]) ?? [])
      setPendingInvoices(viRes.count ?? 0)
      setLoading(false)
    })
  }, [])

  function tCat(cat: string | null) {
    if (!cat) return null
    const key = CAT_KEYS[cat as VendorCategory]
    return key ? t(key) : cat
  }

  function getStats(vendorId: number) {
    const linked = expenses.filter(e => e.vendor_id === vendorId)
    const total  = linked.reduce((s, e) => s + e.amount, 0)
    const last   = linked.reduce((d, e) => (e.date > d ? e.date : d), '')
    return { total, last }
  }

  function getPortalStatus(vendorId: number): 'active' | 'pending' | 'suspended' | null {
    const entries = portalAccess.filter(a => a.vendor_id === vendorId)
    if (entries.some(e => e.status === 'active'))    return 'active'
    if (entries.some(e => e.status === 'pending'))   return 'pending'
    if (entries.some(e => e.status === 'suspended')) return 'suspended'
    return null
  }

  function formatDate(d: string) {
    if (!d) return '—'
    return new Date(d + 'T12:00:00').toLocaleDateString(
      lang === 'az' ? 'az-AZ' : 'en-GB',
      { day: '2-digit', month: 'short', year: 'numeric' },
    )
  }

  function setField(key: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  function openEdit(v: Vendor) {
    setEditingId(v.id)
    setForm({
      name: v.name, voen: v.voen ?? '', category: (v.category ?? '') as VendorCategory | '',
      phone: v.phone ?? '', email: v.email ?? '', address: v.address ?? '', notes: v.notes ?? '',
    })
    setShowModal(true)
  }

  function closeModal() { setShowModal(false); setEditingId(null); setForm(EMPTY_FORM) }

  function openInvite(v: Vendor) {
    setInviteVendor(v)
    setInviteEmail(v.email ?? '')
    setInviteSuccess(false)
    setInviteError(null)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteVendor || !inviteEmail.trim()) return
    setInviteSaving(true)
    setInviteError(null)
    try {
      const res  = await fetch('/api/vendor/invite', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: inviteVendor.id, email: inviteEmail.trim() }),
      })
      const json = await res.json()
      if (!json.ok) {
        setInviteError(json.error ?? 'Failed to create invite record.')
      } else {
        // Invite record saved. Show success but warn if email delivery failed.
        setInviteSuccess(true)
        if (!json.emailSent && json.emailError) {
          setInviteError(`Invite saved but email failed: ${json.emailError}`)
        }
        setPortalAccess(prev => {
          const without = prev.filter(a => !(a.vendor_id === inviteVendor.id && a.email === inviteEmail.trim()))
          return [...without, { vendor_id: inviteVendor.id, email: inviteEmail.trim(), status: 'pending' }]
        })
      }
    } catch {
      setInviteError('Network error. Please try again.')
    }
    setInviteSaving(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      name:     form.name.trim(),
      voen:     form.voen.trim() || null,
      category: form.category || null,
      phone:    form.phone.trim() || null,
      email:    form.email.trim() || null,
      address:  form.address.trim() || null,
      notes:    form.notes.trim() || null,
    }
    if (isEditing) {
      const { data, error } = await supabase.from('vendors').update(payload).eq('id', editingId!).select().single()
      if (!error && data) setVendors(prev => prev.map(v => v.id === editingId ? (data as Vendor) : v).sort((a, b) => a.name.localeCompare(b.name)))
    } else {
      const { data, error } = await supabase.from('vendors').insert(payload).select().single()
      if (!error && data) setVendors(prev => [...prev, data as Vendor].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setSaving(false)
    closeModal()
  }

  async function handleDelete(id: number) {
    await supabase.from('vendors').delete().eq('id', id)
    setVendors(prev => prev.filter(v => v.id !== id))
  }

  const filtered = vendors.filter(v => {
    const q = search.toLowerCase()
    return !q || v.name.toLowerCase().includes(q) || (v.voen ?? '').includes(q) || (v.email ?? '').toLowerCase().includes(q)
  })

  const totalSpent      = expenses.reduce((s, e) => s + e.amount, 0)
  const activePortalIds = new Set(portalAccess.filter(a => a.status === 'active').map(a => a.vendor_id))

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex justify-between">
          <div className="h-8 bg-gray-100 rounded w-40" />
          <div className="h-10 bg-gray-100 rounded-lg w-36" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
        </div>
        <div className="h-96 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="w-full">

      {/* ── Header ── */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.vendors')}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {vendors.length} {lang === 'az' ? 'təchizatçı' : vendors.length !== 1 ? 'vendors' : 'vendor'}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('ven.addVendor')}
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            {lang === 'az' ? 'Cəmi Təchizatçı' : 'Total Vendors'}
          </p>
          <p className="text-2xl font-bold text-gray-900">{vendors.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            {lang === 'az' ? 'Aktiv Portal İstifadəçiləri' : 'Active Portal Users'}
          </p>
          <p className="text-2xl font-bold text-teal-600">{activePortalIds.size}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            {lang === 'az' ? 'Gözləyən Fakturalar' : 'Pending Invoices'}
          </p>
          <p className="text-2xl font-bold text-amber-600">{pendingInvoices}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            {lang === 'az' ? 'Cəmi Xərclər' : 'Total Spent'}
          </p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totalSpent)}</p>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="relative mb-5 max-w-sm">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input
          type="text" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={lang === 'az' ? 'Ad, VÖEN və ya e-poçt ilə axtar…' : 'Search by name, VÖEN or email…'}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
        />
      </div>

      {/* ── Table / Empty State ── */}
      <div className="w-full bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">

        {vendors.length === 0 ? (
          /* ── Empty state (no vendors at all) ── */
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <i className="ti ti-building-store text-6xl text-gray-200 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-1">
              {lang === 'az' ? 'Hələ təchizatçı yoxdur' : 'No vendors yet'}
            </h3>
            <p className="text-sm text-gray-400 max-w-xs mb-6">
              {lang === 'az'
                ? 'Alışları və satınalmaları izləməyə başlamaq üçün ilk təchizatçını əlavə edin'
                : 'Add your first vendor to start tracking purchases and procurement'}
            </p>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('ven.addVendor')}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {[
                    t('ven.companyName'),
                    t('ven.category'),
                    t('ven.taxId'),
                    lang === 'az' ? 'Əlaqə' : 'Contact',
                    t('ven.totalSpent'),
                    t('ven.lastPayment'),
                    lang === 'az' ? 'Portal Statusu' : 'Portal Status',
                    '',
                  ].map((h, i) => (
                    <th key={i} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 last:w-20">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-sm text-gray-400">
                      {lang === 'az' ? 'Axtarışa uyğun nəticə tapılmadı.' : 'No results found.'}
                    </td>
                  </tr>
                ) : filtered.map(v => {
                  const { total, last }  = getStats(v.id)
                  const catColor         = CAT_COLORS[(v.category ?? 'other') as VendorCategory] ?? CAT_COLORS.other
                  const portalStatus     = getPortalStatus(v.id)
                  return (
                    <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/vendors/${v.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline">
                          {v.name}
                        </Link>
                        {v.address && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{v.address}</p>}
                      </td>
                      <td className="px-5 py-3.5">
                        {v.category ? (
                          <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${catColor}`}>
                            {tCat(v.category)}
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 tabular-nums">
                        {v.voen || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {v.phone && <p className="text-xs text-gray-600">{v.phone}</p>}
                        {v.email && <p className="text-xs text-gray-400 mt-0.5">{v.email}</p>}
                        {!v.phone && !v.email && <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 tabular-nums">
                        {total > 0 ? fmt(total) : <span className="text-gray-300 font-normal">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(last)}
                      </td>
                      <td className="px-5 py-3.5">
                        <PortalStatusBadge status={portalStatus} lang={lang} />
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openInvite(v)}
                            title="Invite to Vendor Portal"
                            className={`text-xs border px-2 py-1 rounded transition-colors font-medium ${
                              portalStatus === 'active'
                                ? 'text-teal-700 border-teal-200 bg-teal-50 hover:bg-teal-100'
                                : portalStatus === 'pending'
                                ? 'text-amber-600 border-amber-200 hover:bg-amber-50'
                                : 'text-teal-600 border-teal-200 hover:bg-teal-50'
                            }`}
                          >
                            {portalStatus === 'active' ? 'Re-invite' : portalStatus === 'pending' ? 'Resend' : 'Invite'}
                          </button>
                          <button
                            onClick={() => openEdit(v)}
                            title={t('common.edit')}
                            className="text-gray-400 hover:text-blue-500 p-1.5 rounded hover:bg-blue-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(v.id)}
                            title={t('common.delete')}
                            className="text-gray-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {isEditing ? t('ven.editVendor') : t('ven.addVendor')}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-4">

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('ven.companyName')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    required type="text" value={form.name} onChange={setField('name')}
                    placeholder="məs. ABC MMC"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('ven.taxId')}</label>
                    <input
                      type="text" value={form.voen} onChange={setField('voen')}
                      placeholder="1234567890"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('ven.category')}</label>
                    <div className="relative">
                      <select
                        value={form.category}
                        onChange={setField('category')}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-8"
                      >
                        <option value="">{lang === 'az' ? 'Seçin…' : 'Select…'}</option>
                        {(Object.keys(CAT_KEYS) as VendorCategory[]).map(cat => (
                          <option key={cat} value={cat}>{t(CAT_KEYS[cat])}</option>
                        ))}
                      </select>
                      <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('ven.phone')}</label>
                    <input
                      type="tel" value={form.phone} onChange={setField('phone')}
                      placeholder="+994 50 000 00 00"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('ven.email')}</label>
                    <input
                      type="email" value={form.email} onChange={setField('email')}
                      placeholder="info@vendor.az"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('ven.address')}</label>
                  <input
                    type="text" value={form.address} onChange={setField('address')}
                    placeholder={lang === 'az' ? 'məs. Bakı, Nərimanov rayonu' : 'e.g. Baku, Narimanov district'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('ven.notes')}</label>
                  <textarea
                    value={form.notes} onChange={setField('notes')} rows={2}
                    placeholder={lang === 'az' ? 'Əlavə qeydlər…' : 'Additional notes…'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                  />
                </div>

              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button
                  type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit" disabled={saving}
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-60"
                >
                  {saving ? t('common.saving') : isEditing ? t('common.save') : t('ven.addVendor')}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ── Invite to Portal Modal ── */}
      {inviteVendor && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setInviteVendor(null) }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">Invite to Vendor Portal</h3>
                <p className="text-sm text-gray-500 mt-0.5">{inviteVendor.name}</p>
              </div>
              <button onClick={() => setInviteVendor(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {inviteSuccess ? (
              <div className="py-4">
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-800">Invite record saved!</p>
                  <p className="text-xs text-gray-500 mt-1">Vendor: <strong>{inviteEmail}</strong></p>
                </div>
                {inviteError ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800">
                    <p className="font-semibold mb-1">Email delivery failed:</p>
                    <p className="font-mono break-all">{inviteError}</p>
                    <p className="mt-2 text-amber-600">
                      Fix: set <code className="bg-amber-100 px-1 rounded">EMAIL_FROM=noreply@digitx.az</code> in .env.local after verifying digitx.az in Resend. Until then, invite by sharing the portal link manually.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 text-center">Invitation email sent to <strong>{inviteEmail}</strong>.</p>
                )}
                <button onClick={() => setInviteVendor(null)} className="mt-4 w-full text-sm text-teal-600 hover:text-teal-700 font-medium text-center block">
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <p className="text-sm text-gray-500">
                  Enter the vendor&apos;s email to send them a portal access invite. They&apos;ll receive a link to sign in and view their POs.
                </p>
                {inviteError && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-lg">{inviteError}</div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                  <input
                    type="email" required value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="vendor@company.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
                  />
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="submit" disabled={inviteSaving}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
                    {inviteSaving ? 'Sending…' : 'Send Invite'}
                  </button>
                  <button type="button" onClick={() => setInviteVendor(null)}
                    className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-2.5 rounded-lg text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

function PortalStatusBadge({ status, lang }: { status: 'active' | 'pending' | 'suspended' | null; lang: string }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />
        {lang === 'az' ? 'Aktiv' : 'Active'}
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
        {lang === 'az' ? 'Gözləyir' : 'Pending'}
      </span>
    )
  }
  if (status === 'suspended') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
        {lang === 'az' ? 'Dayandırılıb' : 'Suspended'}
      </span>
    )
  }
  return (
    <span className="text-xs text-gray-400">
      {lang === 'az' ? 'Dəvət edilməyib' : 'Not Invited'}
    </span>
  )
}
