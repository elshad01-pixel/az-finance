'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'

type Category = 'Office' | 'Utilities' | 'Salaries' | 'Transport' | 'Other'

interface Expense {
  id: number
  date: string
  description: string
  category: Category
  amount: number
}

const CATEGORIES: Category[] = ['Office', 'Utilities', 'Salaries', 'Transport', 'Other']

const CATEGORY_STYLES: Record<Category, string> = {
  Office:    'bg-blue-100   text-blue-700',
  Utilities: 'bg-amber-100  text-amber-700',
  Salaries:  'bg-purple-100 text-purple-700',
  Transport: 'bg-orange-100 text-orange-700',
  Other:     'bg-gray-100   text-gray-600',
}

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ExpensesClient() {
  const { t, lang } = useLanguage()

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving]       = useState(false)

  const [date, setDate]               = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory]       = useState<Category>('Office')
  const [amount, setAmount]           = useState('')

  useEffect(() => {
    supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false })
      .then(({ data }) => {
        setExpenses((data as Expense[]) ?? [])
        setLoading(false)
      })
  }, [])

  const total = expenses.reduce((s, e) => s + e.amount, 0)

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString(lang === 'az' ? 'az-AZ' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function resetForm() {
    setDate(''); setDescription(''); setCategory('Office'); setAmount('')
  }

  function closeModal() { setShowModal(false); resetForm() }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data, error } = await supabase
      .from('expenses')
      .insert({ date, description, category, amount: parseFloat(amount) })
      .select()
      .single()
    if (!error && data) {
      setExpenses(prev => [data as Expense, ...prev])
    }
    setSaving(false)
    closeModal()
  }

  async function deleteExpense(id: number) {
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  const byCategory = CATEGORIES.map(cat => ({
    cat,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(x => x.total > 0)

  const recordWord = lang === 'az' ? 'qeyd' : expenses.length !== 1 ? 'records' : 'record'

  return (
    <div>

      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.expenses')}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {expenses.length} {recordWord} &mdash; {t('common.total')}{' '}
            <span className="font-semibold text-gray-700">{fmt(total)}</span>
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('exp.addExpense')}
        </button>
      </div>

      {/* Category breakdown chips */}
      {byCategory.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {byCategory.map(({ cat, total: catTotal }) => (
            <span key={cat} className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${CATEGORY_STYLES[cat]}`}>
              {cat}
              <span className="opacity-75">{fmt(catTotal)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">
            {t('exp.loading')}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {[t('common.date'), t('common.description'), t('exp.category'), t('exp.amountAZN'), ''].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3 last:w-14">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expenses.map(exp => (
                    <tr key={exp.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(exp.date)}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {exp.description}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_STYLES[exp.category]}`}>
                          {exp.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900 tabular-nums">
                        {fmt(exp.amount)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => deleteExpense(exp.id)}
                          title={t('common.delete')}
                          className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {expenses.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-gray-600">{t('common.total')}</td>
                      <td className="px-6 py-3 text-sm font-bold text-gray-900 tabular-nums">{fmt(total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {expenses.length === 0 && (
              <div className="text-center py-16 text-gray-400 text-sm">
                {t('exp.noExpenses')}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{t('exp.addExpense')}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{t('exp.fillDetails')}</p>
              </div>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-4">

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.date')}</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.description')}</label>
                  <input
                    type="text"
                    required
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="e.g. Office rent payment"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.category')}</label>
                  <div className="relative">
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value as Category)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-9"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {category && (
                    <div className="mt-2">
                      <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_STYLES[category]}`}>
                        {category}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('exp.amountAZN')}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium select-none">₼</span>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
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
                  className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 active:bg-green-800 rounded-lg transition-colors shadow-sm disabled:opacity-60"
                >
                  {saving ? t('common.saving') : t('exp.addExpense')}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  )
}
