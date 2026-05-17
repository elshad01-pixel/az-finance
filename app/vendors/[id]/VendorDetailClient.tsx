'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { CATEGORY_I18N } from '@/lib/categories'
import type { Vendor } from '../VendorsClient'

interface LinkedExpense {
  id:             number
  date:           string
  description:    string
  category:       string
  amount:         number
  payment_method: string | null
  payment_status: string | null
  notes:          string | null
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

const PAYMENT_STATUS_BADGE: Record<string, string> = {
  paid:      'bg-green-100 text-green-700',
  pending:   'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

const PAYMENT_STATUS_LABEL: Record<string, Record<string, string>> = {
  paid:      { en: 'Paid',      az: 'Ödənilib'     },
  pending:   { en: 'Pending',   az: 'Gözləyir'     },
  cancelled: { en: 'Cancelled', az: 'Ləğv edilib'  },
}

type FormData = {
  name: string; voen: string; category: VendorCategory | ''
  phone: string; email: string; address: string; notes: string
}

const EMPTY_FORM: FormData = { name: '', voen: '', category: '', phone: '', email: '', address: '', notes: '' }

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function VendorDetailClient({ vendorId }: { vendorId: number }) {
  const { t, lang } = useLanguage()

  const [vendor,    setVendor]    = useState<Vendor | null>(null)
  const [expenses,  setExpenses]  = useState<LinkedExpense[]>([])
  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)

  // Edit modal state
  const [showEdit, setShowEdit] = useState(false)
  const [form,     setForm]     = useState<FormData>(EMPTY_FORM)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('vendors').select('*').eq('id', vendorId).maybeSingle(),
      supabase.from('expenses')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('date', { ascending: false }),
    ]).then(([vRes, eRes]) => {
      if (!vRes.data) { setNotFound(true); setLoading(false); return }
      setVendor(vRes.data as Vendor)
      setExpenses((eRes.data as LinkedExpense[]) ?? [])
      setLoading(false)
    })
  }, [vendorId])

  function formatDate(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString(
      lang === 'az' ? 'az-AZ' : 'en-GB',
      { day: '2-digit', month: 'short', year: 'numeric' },
    )
  }

  function tCat(cat: string | null) {
    if (!cat) return null
    const key = CAT_KEYS[cat as VendorCategory]
    return key ? t(key) : cat
  }

  function tExpCat(cat: string) {
    const key = CATEGORY_I18N[cat]
    return key ? t(key as TranslationKey) : cat
  }

  const PAYMENT_METHOD_KEYS: Record<string, TranslationKey> = {
    bank:   'exp.paymentBank',
    cash:   'exp.paymentCash',
    card:   'exp.paymentCard',
    cheque: 'exp.paymentCheque',
  }

  function tPayment(method: string | null) {
    if (!method) return null
    return t(PAYMENT_METHOD_KEYS[method] ?? ('exp.paymentMethod' as TranslationKey)) || method
  }

  function setField(key: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  function openEdit() {
    if (!vendor) return
    setForm({
      name:     vendor.name,
      voen:     vendor.voen ?? '',
      category: (vendor.category ?? '') as VendorCategory | '',
      phone:    vendor.phone ?? '',
      email:    vendor.email ?? '',
      address:  vendor.address ?? '',
      notes:    vendor.notes ?? '',
    })
    setShowEdit(true)
  }

  async function handleSave(e: React.FormEvent) {
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
    const { data, error } = await supabase.from('vendors').update(payload).eq('id', vendorId).select().single()
    if (!error && data) setVendor(data as Vendor)
    setSaving(false)
    setShowEdit(false)
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse max-w-4xl">
        <div className="h-8 bg-gray-100 rounded w-48" />
        <div className="h-40 bg-gray-100 rounded-xl" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
        </div>
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  if (notFound || !vendor) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-lg font-medium">{lang === 'az' ? 'Təchizatçı tapılmadı' : 'Vendor not found'}</p>
        <Link href="/vendors" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          {lang === 'az' ? '← Siyahıya qayıt' : '← Back to vendors'}
        </Link>
      </div>
    )
  }

  const now        = new Date()
  const mStart     = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const mEnd       = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  const yearStart  = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
  const totalMonth = expenses.filter(e => e.date >= mStart && e.date <= mEnd).reduce((s, e) => s + e.amount, 0)
  const totalYear  = expenses.filter(e => e.date >= yearStart).reduce((s, e) => s + e.amount, 0)
  const totalAll   = expenses.reduce((s, e) => s + e.amount, 0)
  const catColor   = CAT_COLORS[(vendor.category ?? 'other') as VendorCategory] ?? CAT_COLORS.other

  return (
    <div className="max-w-4xl space-y-6">

      {/* ── Back link ── */}
      <Link href="/vendors" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {lang === 'az' ? 'Təchizatçılara qayıt' : 'Back to Vendors'}
      </Link>

      {/* ── Vendor info card ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{vendor.name}</h2>
            {vendor.category && (
              <span className={`inline-block mt-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${catColor}`}>
                {tCat(vendor.category)}
              </span>
            )}
          </div>
          <button
            onClick={openEdit}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {t('common.edit')}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
          {vendor.voen && (
            <div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-0.5">{t('ven.taxId')}</span>
              <span className="text-gray-900 font-mono">{vendor.voen}</span>
            </div>
          )}
          {vendor.phone && (
            <div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-0.5">{t('ven.phone')}</span>
              <a href={`tel:${vendor.phone}`} className="text-blue-600 hover:underline">{vendor.phone}</a>
            </div>
          )}
          {vendor.email && (
            <div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-0.5">{t('ven.email')}</span>
              <a href={`mailto:${vendor.email}`} className="text-blue-600 hover:underline">{vendor.email}</a>
            </div>
          )}
          {vendor.address && (
            <div className="col-span-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-0.5">{t('ven.address')}</span>
              <span className="text-gray-900">{vendor.address}</span>
            </div>
          )}
          {vendor.notes && (
            <div className="col-span-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-0.5">{t('ven.notes')}</span>
              <span className="text-gray-600">{vendor.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-500 mb-1">
            {lang === 'az' ? `Bu Ay (${now.toLocaleString('az-AZ', { month: 'long' })})` : `This Month (${now.toLocaleString('en-US', { month: 'long' })})`}
          </p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmt(totalMonth)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-500 mb-1">{t('ven.totalSpentYear')} ({now.getFullYear()})</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmt(totalYear)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-500 mb-1">{t('ven.totalSpentAll')}</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmt(totalAll)}</p>
        </div>
      </div>

      {/* ── Expense history ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{t('ven.linkedExpenses')}</h3>
          {expenses.length > 0 && (
            <span className="text-xs text-gray-400">{expenses.length} {lang === 'az' ? 'qeyd' : expenses.length === 1 ? 'record' : 'records'}</span>
          )}
        </div>

        {expenses.length === 0 ? (
          <p className="text-center py-12 text-sm text-gray-400">{t('ven.noLinked')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {[t('common.date'), t('common.description'), t('exp.category'), t('exp.paymentMethod'), t('exp.paymentStatus'), t('exp.amountAZN')].map((h, i) => (
                    <th key={i} className={`text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 ${i === 5 ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expenses.map(e => {
                  const status    = e.payment_status ?? 'paid'
                  const badgeCls  = PAYMENT_STATUS_BADGE[status] ?? PAYMENT_STATUS_BADGE.paid
                  const badgeLbl  = PAYMENT_STATUS_LABEL[status]?.[lang] ?? status
                  return (
                    <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 text-sm text-gray-500 whitespace-nowrap">{formatDate(e.date)}</td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-gray-900">{e.description}</p>
                        {e.notes && <p className="text-xs text-gray-400 mt-0.5">{e.notes}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{tExpCat(e.category)}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">
                        {tPayment(e.payment_method) ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${badgeCls}`}>
                          {badgeLbl}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 tabular-nums text-right">
                        {fmt(e.amount)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={5} className="px-5 py-3 text-sm font-semibold text-gray-600">{t('common.total')}</td>
                  <td className="px-5 py-3 text-sm font-bold text-gray-900 tabular-nums text-right">{fmt(totalAll)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Edit modal ── */}
      {showEdit && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) setShowEdit(false) }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">{t('ven.editVendor')}</h3>
              <button onClick={() => setShowEdit(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="px-6 py-5 space-y-4">

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('ven.companyName')} <span className="text-red-500">*</span>
                  </label>
                  <input required type="text" value={form.name} onChange={setField('name')}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('ven.taxId')}</label>
                    <input type="text" value={form.voen} onChange={setField('voen')} placeholder="1234567890"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('ven.category')}</label>
                    <div className="relative">
                      <select value={form.category} onChange={setField('category')}
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
                    <input type="tel" value={form.phone} onChange={setField('phone')} placeholder="+994 50 000 00 00"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('ven.email')}</label>
                    <input type="email" value={form.email} onChange={setField('email')} placeholder="info@vendor.az"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('ven.address')}</label>
                  <input type="text" value={form.address} onChange={setField('address')}
                    placeholder={lang === 'az' ? 'məs. Bakı, Nərimanov rayonu' : 'e.g. Baku, Narimanov district'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('ven.notes')}</label>
                  <textarea value={form.notes} onChange={setField('notes')} rows={2}
                    placeholder={lang === 'az' ? 'Əlavə qeydlər…' : 'Additional notes…'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                  />
                </div>

              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button type="button" onClick={() => setShowEdit(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-60">
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  )
}
