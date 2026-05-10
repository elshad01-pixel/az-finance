'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import {
  MAIN_CATEGORIES, CATEGORY_MAP, CATEGORY_STYLES, CATEGORY_DOT,
  CATEGORY_I18N, SUBCATEGORY_I18N, FREQUENCY_I18N,
  calcNextDue, todayIso,
  type MainCategory, type Frequency,
} from '@/lib/categories'

interface Expense {
  id:            number
  date:          string
  description:   string
  category:      string
  subcategory:   string | null
  amount:        number
  is_recurring:  boolean
  frequency:     string | null
  next_due_date: string | null
}

interface Template {
  id:          number
  name:        string
  description: string
  category:    string
  subcategory: string | null
  amount:      number
  is_recurring: boolean
  frequency:   string | null
}

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ExpensesClient() {
  const { t, lang } = useLanguage()

  // ── Data ─────────────────────────────────────────────────────────────────
  const [expenses,  setExpenses]  = useState<Expense[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading,   setLoading]   = useState(true)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showModal,    setShowModal]    = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [filterCat,    setFilterCat]    = useState<MainCategory | 'All'>('All')
  const [templateSaved, setTemplateSaved] = useState(false)

  // ── Form fields ───────────────────────────────────────────────────────────
  const [date,        setDate]        = useState('')
  const [description, setDescription] = useState('')
  const [category,    setCategory]    = useState<MainCategory>('Office')
  const [subcategory, setSubcategory] = useState('')
  const [amount,      setAmount]      = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency,   setFrequency]   = useState<Frequency>('monthly')

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('expenses')
        .select('id, date, description, category, subcategory, amount, is_recurring, frequency, next_due_date')
        .order('date', { ascending: false }),
      supabase.from('expense_templates')
        .select('*')
        .order('created_at', { ascending: false }),
    ]).then(([expRes, tplRes]) => {
      setExpenses((expRes.data as Expense[]) ?? [])
      if (!tplRes.error) setTemplates((tplRes.data as Template[]) ?? [])
      setLoading(false)
    })
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatDate(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString(
      lang === 'az' ? 'az-AZ' : 'en-GB',
      { day: '2-digit', month: 'short', year: 'numeric' },
    )
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
    if (days < 0)  return { label: t('exp.overdue'),    cls: 'bg-red-100 text-red-700'    }
    if (days === 0) return { label: t('exp.dueToday'),  cls: 'bg-red-100 text-red-700'    }
    if (days === 1) return { label: t('exp.dueTomorrow'), cls: 'bg-amber-100 text-amber-700' }
    return { label: `${t('exp.nextDue')}: ${date}`,       cls: 'bg-green-100 text-green-700' }
  }

  function tCat(name: string): string {
    const key = CATEGORY_I18N[name]
    return key ? t(key as TranslationKey) : name
  }

  function tSub(name: string): string {
    const key = SUBCATEGORY_I18N[name]
    return key ? t(key as TranslationKey) : name
  }

  function tFreq(freq: string): string {
    const key = FREQUENCY_I18N[freq as Frequency]
    return key ? t(key as TranslationKey) : freq
  }

  // ── Form helpers ──────────────────────────────────────────────────────────
  function resetForm() {
    setDate(''); setDescription(''); setCategory('Office')
    setSubcategory(''); setAmount(''); setIsRecurring(false); setFrequency('monthly')
  }

  function closeModal() { setShowModal(false); resetForm() }

  function applyTemplate(tmpl: Template) {
    setDescription(tmpl.description)
    setCategory(tmpl.category as MainCategory)
    setSubcategory(tmpl.subcategory ?? '')
    setAmount(String(tmpl.amount))
    setIsRecurring(tmpl.is_recurring)
    if (tmpl.frequency) setFrequency(tmpl.frequency as Frequency)
    setDate(todayIso())
    setShowModal(true)
  }

  // ── When category changes, reset subcategory ──────────────────────────────
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
      user_id:      user.id,
      name:         description,
      description,
      category,
      subcategory:  subcategory || null,
      amount:       parseFloat(amount),
      is_recurring: isRecurring,
      frequency:    isRecurring ? frequency : null,
    }).select().single()
    if (!error && data) {
      setTemplates(prev => [data as Template, ...prev])
      setTemplateSaved(true)
      setTimeout(() => setTemplateSaved(false), 2500)
    }
  }

  // ── Delete template ───────────────────────────────────────────────────────
  async function deleteTemplate(id: number) {
    await supabase.from('expense_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  // ── Add expense ───────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const nextDue = isRecurring && date ? calcNextDue(date, frequency) : null
    const { data, error } = await supabase.from('expenses').insert({
      date,
      description,
      category,
      subcategory:   subcategory || null,
      amount:        parseFloat(amount),
      is_recurring:  isRecurring,
      frequency:     isRecurring ? frequency : null,
      next_due_date: nextDue,
    }).select().single()
    if (!error && data) setExpenses(prev => [data as Expense, ...prev])
    setSaving(false)
    closeModal()
  }

  // ── Mark recurring as paid ────────────────────────────────────────────────
  async function markPaid(exp: Expense) {
    const newNextDue = calcNextDue(
      exp.next_due_date ?? todayIso(),
      (exp.frequency ?? 'monthly') as Frequency,
    )
    const [insertRes, _] = await Promise.all([
      supabase.from('expenses').insert({
        date:         todayIso(),
        description:  exp.description,
        category:     exp.category,
        subcategory:  exp.subcategory,
        amount:       exp.amount,
        is_recurring: false,
      }).select().single(),
      supabase.from('expenses').update({ next_due_date: newNextDue }).eq('id', exp.id),
    ])
    setExpenses(prev => {
      const updated = prev.map(e => e.id === exp.id ? { ...e, next_due_date: newNextDue } : e)
      if (!insertRes.error && insertRes.data) return [insertRes.data as Expense, ...updated]
      return updated
    })
  }

  // ── Delete expense ────────────────────────────────────────────────────────
  async function deleteExpense(id: number) {
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const filtered = filterCat === 'All'
    ? expenses
    : expenses.filter(e => e.category === filterCat)

  const total = filtered.reduce((s, e) => s + e.amount, 0)

  const byCategory = MAIN_CATEGORIES.map(cat => ({
    cat,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(x => x.total > 0)

  const subcats = CATEGORY_MAP[category] as string[]

  const recordWord = lang === 'az'
    ? 'qeyd'
    : filtered.length !== 1 ? 'records' : 'record'

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex justify-between">
          <div className="h-8 bg-gray-100 rounded w-40" />
          <div className="h-10 bg-gray-100 rounded-lg w-36" />
        </div>
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded-lg w-24" />)}
        </div>
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
            {filtered.length} {recordWord} &mdash; {t('common.total')}{' '}
            <span className="font-semibold text-gray-700">{fmt(total)}</span>
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setDate(todayIso()); setSubcategory(CATEGORY_MAP['Office'][0]); setShowModal(true) }}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('exp.addExpense')}
        </button>
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
                  <button
                    onClick={() => applyTemplate(tmpl)}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                    <span className="font-medium text-gray-700 group-hover:text-blue-700">{tmpl.name}</span>
                    <span className="text-xs text-gray-400">{fmt(tmpl.amount)}</span>
                    {tmpl.is_recurring && tmpl.frequency && (
                      <span className="text-xs text-blue-500">↻</span>
                    )}
                  </button>
                  <button
                    onClick={() => deleteTemplate(tmpl.id)}
                    title={t('exp.deleteTemplate')}
                    className="ml-1 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
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

      {/* ── Category filter ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(['All', ...MAIN_CATEGORIES] as (MainCategory | 'All')[]).map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
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
      </div>

      {/* ── Category totals chips ── */}
      {byCategory.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {byCategory.map(({ cat, total: catTotal }) => (
            <span
              key={cat}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${CATEGORY_STYLES[cat]}`}
            >
              {tCat(cat)}
              <span className="opacity-75">{fmt(catTotal)}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {[t('common.date'), t('common.description'), t('exp.category'), t('exp.amountAZN'), ''].map((h, i) => (
                  <th key={i} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 last:w-28">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(exp => {
                const cat  = exp.category as MainCategory
                const due  = dueBadge(exp)
                const freq = exp.frequency ? tFreq(exp.frequency) : null
                return (
                  <tr key={exp.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3.5 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(exp.date)}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-gray-900">{exp.description}</p>
                      {exp.subcategory && (
                        <p className="text-xs text-gray-400 mt-0.5">{tSub(exp.subcategory)}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_STYLES[cat] ?? 'bg-gray-100 text-gray-600'}`}>
                        {tCat(exp.category)}
                      </span>
                      {exp.is_recurring && freq && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="text-xs text-blue-600 font-medium">↻ {freq}</span>
                          {due && (
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${due.cls}`}>
                              {due.label}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                      {fmt(exp.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {exp.is_recurring && (
                          <button
                            onClick={() => markPaid(exp)}
                            title={t('exp.markPaid')}
                            className="flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700 hover:bg-green-50 px-2.5 py-1.5 rounded-lg border border-green-200 transition-colors whitespace-nowrap"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {t('exp.markPaid')}
                          </button>
                        )}
                        <button
                          onClick={() => deleteExpense(exp.id)}
                          title={t('common.delete')}
                          className="text-gray-300 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"
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

            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={3} className="px-5 py-3 text-sm font-semibold text-gray-600">{t('common.total')}</td>
                  <td className="px-5 py-3 text-sm font-bold text-gray-900 tabular-nums">{fmt(total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">
            {t('exp.noExpenses')}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{t('exp.addExpense')}</h3>
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
                  <input
                    type="date" required value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.description')}</label>
                  <input
                    type="text" required value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="e.g. Office rent payment"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                {/* Category + Subcategory */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.category')}</label>
                    <div className="relative">
                      <select
                        value={category}
                        onChange={e => handleCategoryChange(e.target.value as MainCategory)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-8"
                      >
                        {MAIN_CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{tCat(cat)}</option>
                        ))}
                      </select>
                      <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.subcategory')}</label>
                    <div className="relative">
                      <select
                        value={subcategory}
                        onChange={e => setSubcategory(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-8"
                      >
                        {subcats.map(s => (
                          <option key={s} value={s}>{tSub(s)}</option>
                        ))}
                      </select>
                      <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.amountAZN')}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium select-none">₼</span>
                    <input
                      type="number" required min="0.01" step="0.01" value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                {/* Recurring toggle */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{t('exp.recurring')}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{t('exp.frequency')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsRecurring(r => !r)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${isRecurring ? 'bg-blue-600' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isRecurring ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                  {isRecurring && (
                    <div className="flex gap-2 pt-1">
                      {(['monthly', 'quarterly', 'annual'] as Frequency[]).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFrequency(f)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                            frequency === f
                              ? 'bg-blue-600 text-white'
                              : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
                          }`}
                        >
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

              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={!description || !amount}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
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
                <div className="flex items-center gap-3">
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
                    className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm disabled:opacity-60"
                  >
                    {saving ? t('common.saving') : t('exp.addExpense')}
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
