'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { CATEGORY_STYLES, type MainCategory } from '@/lib/categories'

interface DueExpense {
  id:            number
  description:   string
  category:      string
  amount:        number
  next_due_date: string
  frequency:     string | null
}

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due   = new Date(dateStr + 'T00:00:00')
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000)
}

export default function RecurringAlert() {
  const { t, lang } = useLanguage()
  const [items, setItems]     = useState<DueExpense[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const cutoff = new Date(today)
    cutoff.setDate(cutoff.getDate() + 7)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    supabase
      .from('expenses')
      .select('id, description, category, amount, next_due_date, frequency')
      .eq('is_recurring', true)
      .not('next_due_date', 'is', null)
      .lte('next_due_date', cutoffStr)
      .order('next_due_date', { ascending: true })
      .then(({ data }) => {
        setItems((data as DueExpense[]) ?? [])
        setLoading(false)
      })
  }, [])

  if (loading || items.length === 0) return null

  const locale = lang === 'az' ? 'az-AZ' : 'en-GB'

  function fmtDate(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString(locale, {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  }

  function dueLabel(dateStr: string): { text: string; cls: string } {
    const days = daysUntil(dateStr)
    if (days < 0)  return { text: t('exp.overdue'),   cls: 'bg-red-100 text-red-700'      }
    if (days === 0) return { text: t('exp.dueToday'),  cls: 'bg-red-100 text-red-700'      }
    if (days === 1) return { text: t('exp.dueTomorrow'), cls: 'bg-amber-100 text-amber-700' }
    return {
      text: t('exp.dueInDays' as TranslationKey).replace('{n}', String(days)),
      cls:  'bg-amber-100 text-amber-700',
    }
  }

  return (
    <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-amber-900">{t('exp.dueAlertTitle')}</h3>
        </div>
        <Link
          href="/expenses"
          className="text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
        >
          {t('exp.viewAll')}
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map(item => {
          const badge = dueLabel(item.next_due_date)
          const catStyle = CATEGORY_STYLES[item.category as MainCategory] ?? 'bg-gray-100 text-gray-600'
          return (
            <div key={item.id} className="bg-white border border-amber-100 rounded-lg p-3.5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${catStyle}`}>
                    {item.category}
                  </span>
                  <span className="text-xs text-gray-400">{fmtDate(item.next_due_date)}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-gray-900">{fmt(item.amount)}</p>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${badge.cls}`}>
                  {badge.text}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
