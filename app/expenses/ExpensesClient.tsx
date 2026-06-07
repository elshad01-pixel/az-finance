'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import { useCompany } from '@/lib/CompanyContext'
import { logActivity } from '@/lib/activity'
import type { TranslationKey } from '@/lib/i18n'
import {
  MAIN_CATEGORIES, CATEGORY_MAP, CATEGORY_STYLES, CATEGORY_DOT,
  CATEGORY_I18N, SUBCATEGORY_I18N, FREQUENCY_I18N,
  calcNextDue, todayIso,
  type MainCategory, type Frequency,
} from '@/lib/categories'

type PaymentStatus = 'paid' | 'pending' | 'cancelled'

interface Expense {
  id:             number
  date:           string
  description:    string
  category:       string
  subcategory:    string | null
  amount:         number
  is_recurring:   boolean
  frequency:      string | null
  next_due_date:  string | null
  supplier:       string | null
  payment_method: string | null
  vat_enabled:    boolean
  vat_amount:     number | null
  notes:          string | null
  receipt_url:    string | null
  vendor_id:            number | null
  payment_status?:      PaymentStatus
  payment_date?:        string | null
  is_payroll_generated: boolean
  source?:              'manual' | 'procurement' | 'payroll' | 'recurring' | 'petty_cash' | 'bank_charge'
}

interface Vendor {
  id:       number
  name:     string
  category: string | null
  phone:    string | null
  email:    string | null
}

interface Template {
  id:           number
  name:         string
  description:  string
  category:     string
  subcategory:  string | null
  amount:       number
  is_recurring: boolean
  frequency:    string | null
}

type DateFilter = 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear' | 'all'

type VendorCategory = 'office' | 'utility' | 'it' | 'transport' | 'marketing' | 'professional' | 'other'

const VENDOR_CAT_KEYS: Record<VendorCategory, TranslationKey> = {
  office:       'ven.catOffice',
  utility:      'ven.catUtility',
  it:           'ven.catIT',
  transport:    'ven.catTransport',
  marketing:    'ven.catMarketing',
  professional: 'ven.catProfessional',
  other:        'ven.catOther',
}

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getDateRange(filter: DateFilter): { start: string; end: string } | null {
  if (filter === 'all') return null
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth()
  if (filter === 'thisMonth') {
    return { start: new Date(y, m, 1).toISOString().slice(0, 10), end: new Date(y, m + 1, 0).toISOString().slice(0, 10) }
  }
  if (filter === 'lastMonth') {
    return { start: new Date(y, m - 1, 1).toISOString().slice(0, 10), end: new Date(y, m, 0).toISOString().slice(0, 10) }
  }
  if (filter === 'thisQuarter') {
    const q = Math.floor(m / 3)
    return { start: new Date(y, q * 3, 1).toISOString().slice(0, 10), end: new Date(y, q * 3 + 3, 0).toISOString().slice(0, 10) }
  }
  return { start: new Date(y, 0, 1).toISOString().slice(0, 10), end: new Date(y, 11, 31).toISOString().slice(0, 10) }
}

export default function ExpensesClient() {
  const { t, lang } = useLanguage()
  const { company } = useCompany()
  const router = useRouter()

  // ── Data ──────────────────────────────────────────────────────────────────
  const [expenses,  setExpenses]  = useState<Expense[]>([])
  const [vendors,   setVendors]   = useState<Vendor[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading,   setLoading]   = useState(true)

  // ── UI state ─────────────────────────────────────────────────────────────
  const [showModal,      setShowModal]      = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [saveError,      setSaveError]      = useState<string | null>(null)
  const [filterCat,      setFilterCat]      = useState<MainCategory | 'All' | 'Procurement'>('All')
  const [dateFilter,     setDateFilter]     = useState<DateFilter>('thisMonth')
  const [search,         setSearch]         = useState('')
  const [templateSaved,  setTemplateSaved]  = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

  // ── Source selector ───────────────────────────────────────────────────────
  const [showSourceSelector, setShowSourceSelector] = useState(false)
  const [formSource,         setFormSource]         = useState<'manual' | 'recurring' | 'petty_cash' | 'bank_charge'>('manual')
  const [bankName,           setBankName]           = useState('')
  const [bankChargeType,     setBankChargeType]     = useState('')
  const [pettyCashError,     setPettyCashError]     = useState<string | null>(null)

  // ── Vendor combobox state ─────────────────────────────────────────────────
  const [vendorId,           setVendorId]           = useState<number | null>(null)
  const [vendorSearch,       setVendorSearch]       = useState('')
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)
  const [showQuickAdd,       setShowQuickAdd]        = useState(false)
  const [qaName,             setQaName]             = useState('')
  const [qaCategory,         setQaCategory]         = useState<VendorCategory | ''>('')
  const [qaSaving,           setQaSaving]           = useState(false)
  const vendorRef = useRef<HTMLDivElement>(null)

  // ── Form fields ───────────────────────────────────────────────────────────
  const [date,          setDate]          = useState('')
  const [description,   setDescription]   = useState('')
  const [category,      setCategory]      = useState<MainCategory>('Office')
  const [subcategory,   setSubcategory]   = useState('')
  const [amount,        setAmount]        = useState('')
  const [isRecurring,   setIsRecurring]   = useState(false)
  const [frequency,     setFrequency]     = useState<Frequency>('monthly')
  const [supplier,       setSupplier]       = useState('')
  const [paymentMethod,  setPaymentMethod]  = useState('')
  const [vatOnExpense,   setVatOnExpense]   = useState(false)
  const [notes,          setNotes]          = useState('')
  const [paymentStatus,  setPaymentStatus]  = useState<PaymentStatus>('paid')
  const [paymentDate,    setPaymentDate]    = useState('')

  // ── Close vendor dropdown on outside click ────────────────────────────────
  useEffect(() => {
    if (!showVendorDropdown) return
    function onDown(e: MouseEvent) {
      if (vendorRef.current && !vendorRef.current.contains(e.target as Node)) {
        setShowVendorDropdown(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showVendorDropdown])

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('expenses')
        .select('*')
        .order('date', { ascending: false }),
      supabase.from('vendors').select('id, name, category, phone, email').order('name'),
      supabase.from('expense_templates').select('*').order('created_at', { ascending: false }),
    ]).then(([expRes, venRes, tplRes]) => {
      setExpenses((expRes.data as Expense[]) ?? [])
      setVendors((venRes.data as Vendor[]) ?? [])
      if (!tplRes.error) setTemplates((tplRes.data as Template[]) ?? [])
      setLoading(false)
    })
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatDate(d: string) {
    return new Intl.DateTimeFormat('az-AZ').format(new Date(d + 'T12:00:00'))
  }

  function daysUntil(dateStr: string): number {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due   = new Date(dateStr + 'T00:00:00')
    return Math.ceil((due.getTime() - today.getTime()) / 86_400_000)
  }

  function dueBadge(exp: Expense) {
    if (!exp.is_recurring || !exp.next_due_date) return null
    const days = daysUntil(exp.next_due_date)
    const date = formatDate(exp.next_due_date)
    if (days < 0)   return { label: t('exp.overdue'),      cls: 'bg-red-100 text-red-700'     }
    if (days === 0) return { label: t('exp.dueToday'),     cls: 'bg-red-100 text-red-700'     }
    if (days === 1) return { label: t('exp.dueTomorrow'),  cls: 'bg-amber-100 text-amber-700' }
    return { label: `${t('exp.nextDue')}: ${date}`,         cls: 'bg-green-100 text-green-700' }
  }

  function isOverdue(exp: Expense) {
    if (exp.is_recurring && exp.next_due_date && daysUntil(exp.next_due_date) < 0) return true
    if ((exp.payment_status ?? 'paid') === 'pending' && exp.date < todayIso()) return true
    return false
  }

  function tCat(name: string) {
    const key = CATEGORY_I18N[name]; return key ? t(key as TranslationKey) : name
  }
  function tSub(name: string) {
    const key = SUBCATEGORY_I18N[name]; return key ? t(key as TranslationKey) : name
  }
  function tFreq(freq: string) {
    const key = FREQUENCY_I18N[freq as Frequency]; return key ? t(key as TranslationKey) : freq
  }
  function tVenCat(cat: string | null) {
    if (!cat) return null
    const key = VENDOR_CAT_KEYS[cat as VendorCategory]
    return key ? t(key) : cat
  }

  function statusBadge(exp: Expense): { label: string; cls: string } {
    const status = exp.payment_status ?? 'paid'
    if (status === 'cancelled') return { label: t('exp.cancelled'), cls: 'bg-gray-100 text-gray-500' }
    if (status === 'pending') {
      const overdue = exp.date < todayIso()
      if (overdue) return { label: t('exp.overdue'), cls: 'bg-red-100 text-red-700' }
      return { label: t('exp.pending'), cls: 'bg-orange-100 text-orange-700' }
    }
    return { label: t('exp.paid'), cls: 'bg-green-100 text-green-700' }
  }

  function handlePaymentStatusChange(s: PaymentStatus) {
    setPaymentStatus(s)
    if (s === 'paid' && !paymentDate) setPaymentDate(todayIso())
    if (s !== 'paid') setPaymentDate('')
  }

  // ── Vendor combobox helpers ───────────────────────────────────────────────
  const selectedVendor = vendors.find(v => v.id === vendorId) ?? null

  const filteredVendors = vendors.filter(v =>
    !vendorSearch || v.name.toLowerCase().includes(vendorSearch.toLowerCase()),
  )

  function selectVendor(v: Vendor) {
    setVendorId(v.id)
    setSupplier(v.name)
    setVendorSearch('')
    setShowVendorDropdown(false)
    setShowQuickAdd(false)
  }

  function clearVendor() {
    setVendorId(null)
    setSupplier('')
    setVendorSearch('')
  }

  async function handleQuickAddVendor() {
    if (!qaName.trim()) return
    setQaSaving(true)
    const { data, error } = await supabase.from('vendors').insert({
      name:     qaName.trim(),
      category: qaCategory || null,
    }).select('id, name, category, phone, email').single()
    if (!error && data) {
      const newVendor = data as Vendor
      setVendors(prev => [...prev, newVendor].sort((a, b) => a.name.localeCompare(b.name)))
      selectVendor(newVendor)
    }
    setQaSaving(false)
    setShowQuickAdd(false)
    setQaName('')
    setQaCategory('')
  }

  // ── Form helpers ──────────────────────────────────────────────────────────
  function resetForm() {
    setDate(''); setDescription(''); setCategory('Office')
    setSubcategory(''); setAmount(''); setIsRecurring(false); setFrequency('monthly')
    setSupplier(''); setPaymentMethod(''); setVatOnExpense(false); setNotes('')
    setVendorId(null); setVendorSearch(''); setShowVendorDropdown(false); setShowQuickAdd(false)
    setPaymentStatus('paid'); setPaymentDate(todayIso())
    setEditingExpense(null)
    setFormSource('manual'); setBankName(''); setBankChargeType(''); setPettyCashError(null)
  }

  function closeModal() {
    setShowModal(false); setShowSourceSelector(false); resetForm(); setSaveError(null)
  }

  function openAdd() {
    resetForm()
    setShowSourceSelector(true)
  }

  function openFormWithSource(source: 'recurring' | 'petty_cash' | 'bank_charge') {
    setFormSource(source)
    setDate(todayIso())
    if (source === 'recurring') {
      setIsRecurring(true)
      setSubcategory(CATEGORY_MAP['Office'][0])
    } else if (source === 'petty_cash') {
      setCategory('Other')
      setSubcategory('Miscellaneous')
      setPaymentMethod('cash')
    } else if (source === 'bank_charge') {
      setCategory('Bank & Finance')
      setSubcategory('Bank Fees')
      setPaymentMethod('bank')
    }
    setShowSourceSelector(false)
    setShowModal(true)
  }

  function handleEdit(exp: Expense) {
    setEditingExpense(exp)
    setDate(exp.date)
    setDescription(exp.description)
    setCategory(exp.category as MainCategory)
    setSubcategory(exp.subcategory ?? '')
    setAmount(String(exp.amount))
    setIsRecurring(exp.is_recurring)
    setFrequency((exp.frequency as Frequency) ?? 'monthly')
    setSupplier(exp.supplier ?? '')
    setPaymentMethod(exp.payment_method ?? '')
    setVatOnExpense(exp.vat_enabled ?? false)
    setNotes(exp.notes ?? '')
    setVendorId(exp.vendor_id ?? null)
    setVendorSearch('')
    setPaymentStatus(exp.payment_status ?? 'paid')
    setPaymentDate(exp.payment_date ?? '')
    const src = exp.source
    setFormSource(src === 'petty_cash' || src === 'bank_charge' || src === 'recurring' ? src : 'manual')
    setShowModal(true)
  }

  function applyTemplate(tmpl: Template) {
    resetForm()
    setDescription(tmpl.description)
    setCategory(tmpl.category as MainCategory)
    setSubcategory(tmpl.subcategory ?? '')
    setAmount(String(tmpl.amount))
    setIsRecurring(tmpl.is_recurring)
    if (tmpl.frequency) setFrequency(tmpl.frequency as Frequency)
    setDate(todayIso())
    setShowModal(true)
  }

  function handleCategoryChange(cat: MainCategory) {
    setCategory(cat)
    setSubcategory(CATEGORY_MAP[cat][0])
  }

  // ── Save template ─────────────────────────────────────────────────────────
  async function handleSaveTemplate() {
    if (!description || !amount) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from('expense_templates').insert({
      user_id: user.id, name: description, description, category,
      subcategory: subcategory || null, amount: parseFloat(amount),
      is_recurring: isRecurring, frequency: isRecurring ? frequency : null,
    }).select().single()
    if (!error && data) {
      setTemplates(prev => [data as Template, ...prev])
      setTemplateSaved(true)
      setTimeout(() => setTemplateSaved(false), 2500)
    }
  }

  async function deleteTemplate(id: number) {
    await supabase.from('expense_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  // ── Add / Edit expense ────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setPettyCashError(null)

    if (formSource === 'petty_cash' && parseFloat(amount) > 200) {
      setPettyCashError(lang === 'az' ? 'Kiçik kassa maksimum ₼200 ola bilər' : 'Petty cash maximum is ₼200')
      setSaving(false)
      return
    }

    const netAmount   = parseFloat(amount)
    const computedVat = vatOnExpense ? Math.round(netAmount * 0.18 * 100) / 100 : null
    const nextDue     = isRecurring && date ? calcNextDue(date, frequency) : null

    // Core columns that always exist
    const payload: Record<string, unknown> = {
      date,
      description,
      category,
      subcategory:   subcategory || null,
      amount:        netAmount,
      is_recurring:  isRecurring,
      frequency:     isRecurring ? frequency : null,
      next_due_date: nextDue,
    }

    // New columns from migration 009 — only include if they have a value
    if (supplier.trim())  payload.supplier       = supplier.trim()
    if (paymentMethod)    payload.payment_method  = paymentMethod
    if (vatOnExpense)   { payload.vat_enabled     = true; payload.vat_amount = computedVat }
    if (notes.trim())     payload.notes           = notes.trim()

    // New column from migration 011 — only include if a vendor is actually selected
    if (vendorId !== null) payload.vendor_id = vendorId

    // New columns from migration 012
    if (paymentStatus !== 'paid' || editingExpense) payload.payment_status = paymentStatus
    if (paymentStatus === 'paid' && paymentDate) payload.payment_date = paymentDate
    else if (editingExpense) payload.payment_date = null

    // Source and source-specific fields
    if (!editingExpense) {
      if (formSource === 'petty_cash')   payload.source = 'petty_cash'
      else if (formSource === 'bank_charge') payload.source = 'bank_charge'
      else if (formSource === 'recurring')   payload.source = 'recurring'
    }
    if (formSource === 'bank_charge') {
      if (bankName.trim()) payload.supplier = bankName.trim()
      if (bankChargeType)  payload.notes    = bankChargeType + (notes.trim() ? ' — ' + notes.trim() : '')
    }

    if (editingExpense) {
      const { data, error } = await supabase.from('expenses').update(payload).eq('id', editingExpense.id).select().single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      if (data) setExpenses(prev => prev.map(e => e.id === editingExpense.id ? (data as Expense) : e))
    } else {
      const { data, error } = await supabase.from('expenses').insert(payload).select().single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      if (data) {
        setExpenses(prev => [data as Expense, ...prev])
        logActivity({ supabase, action: 'created', module: 'expenses', record_label: (payload as { description?: string }).description, company_id: company?.id })
      }
    }
    setSaving(false)
    closeModal()
  }

  // ── Mark recurring as paid ─────────────────────────────────────────────────
  async function markPaid(exp: Expense) {
    const newNextDue = calcNextDue(exp.next_due_date ?? todayIso(), (exp.frequency ?? 'monthly') as Frequency)
    const [insertRes] = await Promise.all([
      supabase.from('expenses').insert({
        date: todayIso(), description: exp.description, category: exp.category,
        subcategory: exp.subcategory, amount: exp.amount, is_recurring: false,
        supplier: exp.supplier, payment_method: exp.payment_method, vendor_id: exp.vendor_id,
      }).select().single(),
      supabase.from('expenses').update({ next_due_date: newNextDue }).eq('id', exp.id),
    ])
    setExpenses(prev => {
      const updated = prev.map(e => e.id === exp.id ? { ...e, next_due_date: newNextDue } : e)
      if (!insertRes.error && insertRes.data) return [insertRes.data as Expense, ...updated]
      return updated
    })
    if (!insertRes.error) {
      logActivity({ supabase, action: 'marked_paid', module: 'expenses', record_label: exp.description, company_id: company?.id })
    }
  }

  async function markExpensePaid(id: number) {
    const { data, error } = await supabase
      .from('expenses').update({ payment_status: 'paid', payment_date: todayIso() })
      .eq('id', id).select().single()
    if (!error && data) setExpenses(prev => prev.map(e => e.id === id ? (data as Expense) : e))
  }

  async function deleteExpense(id: number) {
    const exp = expenses.find(e => e.id === id)
    if (exp?.source === 'procurement') {
      alert(lang === 'az'
        ? 'Bu xərc satınalma modulundan avtomatik yaradılıb və silinə bilməz.'
        : 'This expense was auto-created by Procurement and cannot be deleted.')
      return
    }
    if (exp?.is_payroll_generated) {
      alert(lang === 'az'
        ? 'Bu xərc əmək haqqı modulundan avtomatik yaradılıb və silinə bilməz.'
        : 'This expense was auto-generated by payroll and cannot be deleted.')
      return
    }
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const range = getDateRange(dateFilter)
  const dateFiltered = range ? expenses.filter(e => e.date >= range.start && e.date <= range.end) : expenses
  const filtered = dateFiltered.filter(e => {
    if (filterCat === 'Procurement') return e.source === 'procurement'
    const catOk  = filterCat === 'All' || e.category === filterCat
    const q      = search.toLowerCase()
    const textOk = !q || e.description.toLowerCase().includes(q) || (e.supplier ?? '').toLowerCase().includes(q)
    return catOk && textOk
  })
  const total = filtered.reduce((s, e) => s + e.amount, 0)

  const now    = new Date()
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const mEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  const totalThisMonth   = expenses.filter(e => e.date >= mStart && e.date <= mEnd).reduce((s, e) => s + e.amount, 0)
  const procThisMonth    = expenses.filter(e => e.source === 'procurement' && e.date >= mStart && e.date <= mEnd).reduce((s, e) => s + e.amount, 0)
  const recurringMonthly = expenses.filter(e => e.is_recurring && e.frequency === 'monthly').reduce((s, e) => s + e.amount, 0)
  const overdueCount     = expenses.filter(e => isOverdue(e)).length

  const byCategory = MAIN_CATEGORIES.map(cat => ({
    cat,
    total: filtered.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(x => x.total > 0)

  const subcats      = CATEGORY_MAP[category] as string[]
  const vatNetAmount = parseFloat(amount) || 0
  const vatComputed  = vatOnExpense ? Math.round(vatNetAmount * 0.18 * 100) / 100 : 0

  const DATE_FILTER_OPTIONS = [
    { value: 'thisMonth'   as DateFilter, label: t('exp.thisMonth')   },
    { value: 'lastMonth'   as DateFilter, label: t('exp.lastMonth')   },
    { value: 'thisQuarter' as DateFilter, label: t('exp.thisQuarter') },
    { value: 'thisYear'    as DateFilter, label: t('exp.thisYear')    },
    { value: 'all'         as DateFilter, label: t('exp.allTime')     },
  ]

  const PAYMENT_METHODS = [
    { value: 'bank',   label: t('exp.paymentBank')   },
    { value: 'cash',   label: t('exp.paymentCash')   },
    { value: 'card',   label: t('exp.paymentCard')   },
    { value: 'cheque', label: t('exp.paymentCheque') },
  ]

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
        </div>
        <div className="h-10 bg-gray-100 rounded-lg" />
        <div className="h-96 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  return (
    <div>

      {/* ── Page header ── */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.expenses')}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {filtered.length} {lang === 'az' ? 'qeyd' : filtered.length !== 1 ? 'records' : 'record'}
            {' '}&mdash; {t('common.total')}{' '}
            <span className="font-semibold text-gray-700">{fmt(total)}</span>
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('exp.addExpense')}
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">{t('exp.totalThisMonth')}</p>
          <p className="text-xl font-bold text-gray-900 tabular-nums">{fmt(totalThisMonth)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{lang === 'az' ? 'satınalma xaric' : 'excl. procurement'}</p>
        </div>
        <div className="bg-white rounded-xl border border-orange-100 shadow-sm p-4">
          <p className="text-xs font-medium text-orange-600 mb-1">{lang === 'az' ? 'Dolayı Satınalma' : 'Indirect Procurement'}</p>
          <p className="text-xl font-bold text-orange-600 tabular-nums">{fmt(procThisMonth)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{lang === 'az' ? 'ehtiyatsız xərclər' : 'non-inventory expenses'}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">{t('exp.recurringMonthly')}</p>
          <p className="text-xl font-bold text-blue-600 tabular-nums">{fmt(recurringMonthly)}</p>
        </div>
        <div className={`rounded-xl border shadow-sm p-4 ${overdueCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
          <p className={`text-xs font-medium mb-1 ${overdueCount > 0 ? 'text-red-600' : 'text-gray-500'}`}>{t('exp.overdueCount')}</p>
          <p className={`text-xl font-bold tabular-nums ${overdueCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{overdueCount}</p>
        </div>
      </div>

      {/* ── Quick Add Templates ── */}
      {templates.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('exp.quickAdd')}</p>
          <div className="flex flex-wrap gap-2">
            {templates.map(tmpl => {
              const cat = tmpl.category as MainCategory
              const dot = CATEGORY_DOT[cat] ?? 'bg-gray-400'
              return (
                <div key={tmpl.id} className="group flex items-center gap-2 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-lg px-3 py-2 transition-colors">
                  <button onClick={() => applyTemplate(tmpl)} className="flex items-center gap-2 text-sm">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                    <span className="font-medium text-gray-700 group-hover:text-blue-700">{tmpl.name}</span>
                    <span className="text-xs text-gray-400">{fmt(tmpl.amount)}</span>
                    {tmpl.is_recurring && <span className="text-xs text-blue-500">↻</span>}
                  </button>
                  <button onClick={() => deleteTemplate(tmpl.id)} title={t('exp.deleteTemplate')}
                    className="ml-1 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Search + Date filter ── */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('exp.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>
        <div className="flex gap-1.5 bg-gray-100 rounded-lg p-1">
          {DATE_FILTER_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setDateFilter(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                dateFilter === opt.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Category filter ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(['All', ...MAIN_CATEGORIES] as (MainCategory | 'All')[]).map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filterCat === cat
                ? 'bg-blue-700 text-white'
                : cat === 'All'
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : `${CATEGORY_STYLES[cat]} opacity-70 hover:opacity-100`
            }`}
          >
            {cat === 'All' ? t('common.all') : tCat(cat)}
          </button>
        ))}
        <button
          onClick={() => setFilterCat('Procurement')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            filterCat === 'Procurement'
              ? 'bg-blue-700 text-white'
              : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
          }`}
        >
          📦 {lang === 'az' ? 'Satınalma' : 'Procurement'}
        </button>
      </div>

      {/* ── Category totals chips ── */}
      {byCategory.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {byCategory.map(({ cat, total: catTotal }) => (
            <span key={cat} className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${CATEGORY_STYLES[cat]}`}>
              {tCat(cat)} <span className="opacity-75">{fmt(catTotal)}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{t('common.date')}</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{t('common.description')}</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{t('exp.category')}</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{t('exp.paymentMethod')}</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{t('exp.amountAZN')}</th>
                <th className="w-10 px-3 py-3" />
                <th className="w-32 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(exp => {
                const cat     = exp.category as MainCategory
                const due     = dueBadge(exp)
                const freq    = exp.frequency ? tFreq(exp.frequency) : null
                const overdue = isOverdue(exp)
                const vendorForExp = exp.vendor_id ? vendors.find(v => v.id === exp.vendor_id) : null
                return (
                  <tr key={exp.id} className={`transition-colors ${overdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'}`}>
                    <td className="px-5 py-3.5 text-sm text-gray-500 whitespace-nowrap">{formatDate(exp.date)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{exp.description}</p>
                        {exp.source === 'procurement' && (
                          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 whitespace-nowrap">
                            📦 {t('proc.sourceBadge')}
                          </span>
                        )}
                        {exp.is_payroll_generated && (
                          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 whitespace-nowrap">
                            👥 {lang === 'az' ? 'Əmək haqqı' : 'Payroll'}
                          </span>
                        )}
                        {exp.source === 'bank_charge' && (
                          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">
                            🏦 {t('exp.badgeBankCharge')}
                          </span>
                        )}
                        {exp.source === 'petty_cash' && (
                          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                            💵 {t('exp.badgePettyCash')}
                          </span>
                        )}
                        {exp.is_recurring && exp.source !== 'procurement' && !exp.is_payroll_generated && (
                          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 whitespace-nowrap">
                            🔄 {t('exp.badgeRecurring')}
                          </span>
                        )}
                      </div>
                      {/* Vendor name — linked if vendor_id is set */}
                      {exp.supplier && (
                        exp.vendor_id ? (
                          <Link href={`/vendors/${exp.vendor_id}`}
                            className="text-xs text-blue-500 hover:text-blue-700 hover:underline mt-0.5 inline-block">
                            {exp.supplier}
                          </Link>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">{exp.supplier}</p>
                        )
                      )}
                      {exp.subcategory && !exp.supplier && (
                        <p className="text-xs text-gray-400 mt-0.5">{tSub(exp.subcategory)}</p>
                      )}
                      {(() => { const sb = statusBadge(exp); return sb.label !== t('exp.paid') ? (
                        <span className={`mt-1 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${sb.cls}`}>{sb.label}</span>
                      ) : null })()}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_STYLES[cat] ?? 'bg-gray-100 text-gray-600'}`}>
                        {tCat(exp.category)}
                      </span>
                      {exp.is_recurring && freq && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="text-xs text-blue-600 font-medium">↻ {freq}</span>
                          {due && <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${due.cls}`}>{due.label}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-500">
                      {exp.payment_method
                        ? PAYMENT_METHODS.find(p => p.value === exp.payment_method)?.label ?? exp.payment_method
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap text-right">
                      {fmt(exp.amount)}
                      {exp.vat_enabled && exp.vat_amount && (
                        <div className="text-xs font-normal text-gray-400 mt-0.5">+ƏDV {fmt(exp.vat_amount)}</div>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      {exp.receipt_url && (
                        <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer" title={t('exp.uploadReceipt')}
                          className="text-blue-400 hover:text-blue-600 transition-colors">
                          <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {exp.is_recurring && (
                          <button onClick={() => markPaid(exp)} title={t('exp.markPaid')}
                            className="flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1.5 rounded-lg border border-green-200 transition-colors whitespace-nowrap">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {t('exp.markPaid')}
                          </button>
                        )}
                        {!exp.is_recurring && (exp.payment_status ?? 'paid') === 'pending' && (
                          <button onClick={() => markExpensePaid(exp.id)} title={t('exp.markPaid')}
                            className="flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1.5 rounded-lg border border-green-200 transition-colors whitespace-nowrap">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {t('exp.markPaid')}
                          </button>
                        )}
                        <button onClick={() => handleEdit(exp)} title={t('common.edit')}
                          className="text-gray-400 hover:text-blue-500 p-1.5 rounded hover:bg-blue-50 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => deleteExpense(exp.id)} title={t('common.delete')}
                          className="text-gray-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors">
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
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={4} className="px-5 py-3 text-sm font-semibold text-gray-600">{t('common.total')}</td>
                  <td className="px-5 py-3 text-sm font-bold text-gray-900 tabular-nums text-right">{fmt(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">
            {search || filterCat !== 'All' || dateFilter !== 'all' ? t('exp.noMatch') : t('exp.noExpenses')}
          </div>
        )}
      </div>

      {/* ── Source Selector Modal ── */}
      {showSourceSelector && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
          onClick={e => { if (e.target === e.currentTarget) { setShowSourceSelector(false); resetForm() } }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">{t('exp.chooseSource')}</h3>
              <button onClick={() => { setShowSourceSelector(false); resetForm() }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => { setShowSourceSelector(false); router.push('/procurement/requests') }}
                className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-gray-100 hover:border-orange-300 hover:bg-orange-50 transition-all text-left"
              >
                <span className="text-2xl">📦</span>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t('exp.sourceProcurement')}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t('exp.sourceProcurementDesc')}</p>
                </div>
              </button>
              <button
                onClick={() => openFormWithSource('recurring')}
                className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-left"
              >
                <span className="text-2xl">🔄</span>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t('exp.sourceRecurring')}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t('exp.sourceRecurringDesc')}</p>
                </div>
              </button>
              <button
                onClick={() => openFormWithSource('petty_cash')}
                className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-gray-100 hover:border-amber-300 hover:bg-amber-50 transition-all text-left"
              >
                <span className="text-2xl">💵</span>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t('exp.sourcePettyCash')}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t('exp.sourcePettyCashDesc')}</p>
                </div>
              </button>
              <button
                onClick={() => openFormWithSource('bank_charge')}
                className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-gray-100 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left"
              >
                <span className="text-2xl">🏦</span>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t('exp.sourceBankCharge')}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t('exp.sourceBankChargeDesc')}</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingExpense ? t('exp.editExpense')
                    : formSource === 'recurring'    ? t('exp.sourceRecurring')
                    : formSource === 'petty_cash'   ? t('exp.sourcePettyCash')
                    : formSource === 'bank_charge'  ? t('exp.sourceBankCharge')
                    : t('exp.addExpense')}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">{t('exp.fillDetails')}</p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-4">

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.date')}</label>
                  <input type="date" required value={date} onChange={e => setDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.description')}</label>
                  <input type="text" required value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="məs. Ofis icarəsi"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                {/* ── Bank charge fields ── */}
                {formSource === 'bank_charge' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.bankName')}</label>
                      <input type="text" value={bankName} onChange={e => setBankName(e.target.value)}
                        placeholder={lang === 'az' ? 'məs. ABB, Kapital Bank' : 'e.g. ABB, Kapital Bank'}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.chargeType')}</label>
                      <div className="relative">
                        <select value={bankChargeType} onChange={e => setBankChargeType(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-8">
                          <option value="">{t('exp.chargeType')}…</option>
                          <option value={t('exp.chargeTypeFee')}>{t('exp.chargeTypeFee')}</option>
                          <option value={t('exp.chargeTypeInterest')}>{t('exp.chargeTypeInterest')}</option>
                          <option value={t('exp.chargeTypeTransfer')}>{t('exp.chargeTypeTransfer')}</option>
                          <option value={t('exp.chargeTypeOther')}>{t('exp.chargeTypeOther')}</option>
                        </select>
                        <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </>
                )}

                {/* ── Vendor combobox ── */}
                {formSource !== 'bank_charge' && formSource !== 'petty_cash' && <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.supplier')}</label>
                  <div ref={vendorRef} className="relative">
                    {/* Trigger button */}
                    <button
                      type="button"
                      onClick={() => { setShowVendorDropdown(v => !v); setShowQuickAdd(false) }}
                      className={`w-full flex items-center justify-between border rounded-lg px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        selectedVendor ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <span className={selectedVendor ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                        {selectedVendor ? selectedVendor.name : t('ven.selectVendor')}
                      </span>
                      <div className="flex items-center gap-2">
                        {selectedVendor && (
                          <span
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => e.key === 'Enter' && clearVendor()}
                            onClick={e => { e.stopPropagation(); clearVendor() }}
                            className="text-gray-400 hover:text-red-500 transition-colors text-xs"
                          >✕</span>
                        )}
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Dropdown panel */}
                    {showVendorDropdown && !showQuickAdd && (
                      <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                        {/* Search within dropdown */}
                        <div className="p-2 border-b border-gray-100">
                          <input
                            autoFocus
                            type="text"
                            value={vendorSearch}
                            onChange={e => setVendorSearch(e.target.value)}
                            placeholder={lang === 'az' ? 'Axtar…' : 'Search…'}
                            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {/* No vendor option */}
                          <button type="button"
                            onClick={() => { clearVendor(); setShowVendorDropdown(false) }}
                            className="w-full text-left px-3 py-2.5 text-sm text-gray-400 hover:bg-gray-50 transition-colors"
                          >
                            — {t('ven.manualEntry')}
                          </button>
                          {filteredVendors.length === 0 && vendorSearch && (
                            <p className="px-3 py-2.5 text-sm text-gray-400 italic">
                              {lang === 'az' ? 'Nəticə tapılmadı' : 'No results'}
                            </p>
                          )}
                          {filteredVendors.map(v => (
                            <button key={v.id} type="button"
                              onClick={() => selectVendor(v)}
                              className={`w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors ${vendorId === v.id ? 'bg-blue-50' : ''}`}
                            >
                              <p className="text-sm font-medium text-gray-900">{v.name}</p>
                              {v.category && (
                                <p className="text-xs text-gray-400 mt-0.5">{tVenCat(v.category)}</p>
                              )}
                            </button>
                          ))}
                        </div>
                        {/* Quick-add trigger */}
                        <div className="border-t border-gray-100">
                          <button type="button"
                            onClick={() => { setQaName(vendorSearch); setShowQuickAdd(true); setShowVendorDropdown(false) }}
                            className="w-full text-left px-3 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-2 font-medium"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            {t('ven.quickAdd')}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Quick-add inline form */}
                    {showQuickAdd && (
                      <div className="mt-2 border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
                        <p className="text-xs font-semibold text-blue-700">{t('ven.quickAdd')}</p>
                        <input
                          autoFocus type="text" value={qaName} onChange={e => setQaName(e.target.value)}
                          placeholder={t('ven.companyName')}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="relative">
                          <select value={qaCategory} onChange={e => setQaCategory(e.target.value as VendorCategory | '')}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                          >
                            <option value="">{t('ven.category')}…</option>
                            {(Object.keys(VENDOR_CAT_KEYS) as VendorCategory[]).map(cat => (
                              <option key={cat} value={cat}>{t(VENDOR_CAT_KEYS[cat])}</option>
                            ))}
                          </select>
                          <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={handleQuickAddVendor} disabled={!qaName.trim() || qaSaving}
                            className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60">
                            {qaSaving ? t('common.saving') : t('common.save')}
                          </button>
                          <button type="button" onClick={() => { setShowQuickAdd(false); setShowVendorDropdown(true) }}
                            className="flex-1 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
                            {t('common.cancel')}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Manual supplier text (shown when no vendor linked) */}
                    {!selectedVendor && !showVendorDropdown && !showQuickAdd && (
                      <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)}
                        placeholder={lang === 'az' ? 'Əl ilə daxil et (istəyə bağlı)' : 'Type manually (optional)'}
                        className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      />
                    )}
                  </div>
                </div>}

                {/* Category + Subcategory — hidden for bank_charge / petty_cash */}
                {formSource !== 'bank_charge' && formSource !== 'petty_cash' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.category')}</label>
                      <div className="relative">
                        <select value={category} onChange={e => handleCategoryChange(e.target.value as MainCategory)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-8">
                          {MAIN_CATEGORIES.map(cat => <option key={cat} value={cat}>{tCat(cat)}</option>)}
                        </select>
                        <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.subcategory')}</label>
                      <div className="relative">
                        <select value={subcategory} onChange={e => setSubcategory(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-8">
                          {subcats.map(s => <option key={s} value={s}>{tSub(s)}</option>)}
                        </select>
                        <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Method */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.paymentMethod')}</label>
                  <div className="grid grid-cols-4 gap-2">
                    {PAYMENT_METHODS.map(pm => (
                      <button key={pm.value} type="button"
                        onClick={() => setPaymentMethod(pm.value === paymentMethod ? '' : pm.value)}
                        className={`py-2 rounded-lg text-xs font-semibold transition-colors border ${
                          paymentMethod === pm.value
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                        }`}>
                        {pm.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.amountAZN')}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium select-none">₼</span>
                    <input type="number" required min="0.01" step="0.01" value={amount}
                      onChange={e => { setAmount(e.target.value); setPettyCashError(null) }} placeholder="0.00"
                      className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  {formSource === 'petty_cash' && (
                    <p className="text-xs text-amber-600 font-medium mt-1">{t('exp.pettyCashLimit')}</p>
                  )}
                  {pettyCashError && (
                    <p className="text-xs text-red-600 font-medium mt-1">{pettyCashError}</p>
                  )}
                </div>

                {/* VAT toggle — hidden for bank_charge / petty_cash */}
                {formSource !== 'bank_charge' && formSource !== 'petty_cash' && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700">{t('exp.vatOnExpense')}</p>
                        <p className="text-xs text-gray-400 mt-0.5">ƏDV 18%</p>
                      </div>
                      <button type="button" onClick={() => setVatOnExpense(v => !v)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${vatOnExpense ? 'bg-blue-600' : 'bg-gray-200'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${vatOnExpense ? 'translate-x-5' : ''}`} />
                      </button>
                    </div>
                    {vatOnExpense && vatNetAmount > 0 && (
                      <div className="mt-3 text-xs text-gray-600 space-y-1 border-t border-gray-200 pt-3">
                        <div className="flex justify-between">
                          <span>{t('exp.netAmount')}</span>
                          <span className="font-semibold tabular-nums">{fmt(vatNetAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('exp.vatAmount')}</span>
                          <span className="font-semibold tabular-nums">{fmt(vatComputed)}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1 mt-1">
                          <span>{t('common.total')}</span>
                          <span className="tabular-nums">{fmt(vatNetAmount + vatComputed)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Recurring toggle — hidden for bank_charge / petty_cash */}
                {formSource !== 'bank_charge' && formSource !== 'petty_cash' && (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700">{t('exp.recurring')}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{t('exp.frequency')}</p>
                      </div>
                      <button type="button" onClick={() => setIsRecurring(r => !r)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${isRecurring ? 'bg-blue-600' : 'bg-gray-200'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isRecurring ? 'translate-x-5' : ''}`} />
                      </button>
                    </div>
                    {isRecurring && (
                      <div className="flex gap-2 pt-1">
                        {(['monthly', 'quarterly', 'annual'] as Frequency[]).map(f => (
                          <button key={f} type="button" onClick={() => setFrequency(f)}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                              frequency === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
                            }`}>
                            {t(FREQUENCY_I18N[f] as TranslationKey)}
                          </button>
                        ))}
                      </div>
                    )}
                    {isRecurring && date && (
                      <p className="text-xs text-blue-600 font-medium">
                        {t('exp.nextDue')}: {formatDate(calcNextDue(date, frequency))}
                      </p>
                    )}
                  </div>
                )}

                {/* Payment Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.paymentStatus')}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: 'paid'      as PaymentStatus, label: t('exp.paid'),      cls: 'border-green-500 bg-green-600 text-white', outline: 'border-gray-200 text-gray-600 hover:border-green-300' },
                      { value: 'pending'   as PaymentStatus, label: t('exp.pending'),   cls: 'border-orange-500 bg-orange-500 text-white', outline: 'border-gray-200 text-gray-600 hover:border-orange-300' },
                      { value: 'cancelled' as PaymentStatus, label: t('exp.cancelled'), cls: 'border-gray-400 bg-gray-400 text-white',   outline: 'border-gray-200 text-gray-600 hover:border-gray-300' },
                    ]).map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => handlePaymentStatusChange(opt.value)}
                        className={`py-2 rounded-lg text-xs font-semibold transition-colors border ${
                          paymentStatus === opt.value ? opt.cls : opt.outline
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment Date (shown when paid) */}
                {paymentStatus === 'paid' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.paymentDate')}</label>
                    <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.notes')}</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                    placeholder="məs. Faktura №123"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                  />
                </div>

              </div>

              {/* Save error */}
              {saveError && (
                <div className="mx-6 mb-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                  {saveError}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                {!editingExpense ? (
                  <button type="button" onClick={handleSaveTemplate} disabled={!description || !amount}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {templateSaved ? (
                      <span className="text-green-600 font-semibold flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {t('exp.templateSaved')}
                      </span>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        {t('exp.saveTemplate')}
                      </>
                    )}
                  </button>
                ) : <div />}
                <div className="flex items-center gap-3">
                  <button type="button" onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
                    {t('common.cancel')}
                  </button>
                  <button type="submit" disabled={saving}
                    className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm disabled:opacity-60">
                    {saving ? t('common.saving') : editingExpense ? t('common.save') : t('exp.addExpense')}
                  </button>
                </div>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  )
}
