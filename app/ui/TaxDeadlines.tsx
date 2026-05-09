'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

type TFn = (key: TranslationKey) => string

interface TaxSettings {
  tax_regime:          'simplified' | 'profit_tax' | 'income_tax'
  business_type:       'general' | 'trade_food'
  vat_registered:      boolean
  simplified_eligible: boolean
  employee_count:      number
}

interface Deadline {
  title:       string
  description: string
  date:        Date
  days:        number
}

function daysUntil(date: Date, today: Date): number {
  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function nextMonthly(day: number, today: Date): Date {
  const candidate = new Date(today.getFullYear(), today.getMonth(), day)
  if (candidate >= today) return candidate
  return new Date(today.getFullYear(), today.getMonth() + 1, day)
}

function nextQuarterly(day: number, today: Date): Date {
  const candidates = [
    new Date(today.getFullYear(),     3, day),
    new Date(today.getFullYear(),     6, day),
    new Date(today.getFullYear(),     9, day),
    new Date(today.getFullYear() + 1, 0, day),
  ]
  return candidates.find(d => d >= today) ?? candidates[3]
}

function nextMarch31(today: Date): Date {
  const candidate = new Date(today.getFullYear(), 2, 31)
  return candidate >= today ? candidate : new Date(today.getFullYear() + 1, 2, 31)
}

function buildDeadlines(s: TaxSettings, today: Date, t: TFn): Deadline[] {
  const make = (title: string, description: string, date: Date): Deadline => ({
    title, description, date, days: daysUntil(date, today),
  })

  const deadlines: Deadline[] = []

  deadlines.push(make(
    t('tax.socialInsurance'),
    t('tax.socialInsuranceDesc'),
    nextMonthly(15, today),
  ))

  deadlines.push(make(
    t('tax.pit'),
    t('tax.pitDesc'),
    nextMonthly(20, today),
  ))

  if (s.vat_registered) {
    deadlines.push(make(
      t('tax.vatReturn'),
      t('tax.vatDesc'),
      nextMonthly(20, today),
    ))
  }

  if (s.tax_regime === 'simplified') {
    const rate   = s.business_type === 'trade_food' ? '8%' : '2%'
    const relief = s.simplified_eligible && s.employee_count >= 3 ? t('tax.simplifiedRelief') : ''
    deadlines.push(make(
      t('tax.simplifiedTaxTitle'),
      t('tax.simplifiedTaxDesc').replace('{rate}', rate).replace('{relief}', relief),
      nextQuarterly(20, today),
    ))
  }

  if (s.tax_regime === 'profit_tax' || s.tax_regime === 'income_tax') {
    deadlines.push(make(
      t('tax.currentPayment'),
      t('tax.currentPaymentDesc'),
      nextQuarterly(15, today),
    ))
    const titleKey: TranslationKey = s.tax_regime === 'profit_tax'
      ? 'tax.annualProfitDecl'
      : 'tax.annualIncomeDecl'
    deadlines.push(make(
      t(titleKey),
      t('tax.annualDeclDesc'),
      nextMarch31(today),
    ))
  }

  return deadlines.sort((a, b) => a.days - b.days)
}

function urgency(days: number) {
  if (days <= 7)  return { bg: 'bg-red-50',   border: 'border-red-200',   badge: 'bg-red-100 text-red-700',   dot: 'bg-red-500'   }
  if (days <= 30) return { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' }
  return              { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
}

export default function TaxDeadlines() {
  const { t, lang } = useLanguage()
  const [settings, setSettings] = useState<TaxSettings | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    supabase
      .from('tax_settings')
      .select('tax_regime, business_type, vat_registered, simplified_eligible, employee_count')
      .maybeSingle()
      .then(({ data }) => {
        setSettings(data as TaxSettings | null)
        setLoading(false)
      })
  }, [])

  const locale = lang === 'az' ? 'az-AZ' : 'en-GB'

  function fmtDate(d: Date) {
    return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function daysLabel(n: number) {
    if (n === 0) return t('tax.today')
    if (n === 1) return t('tax.oneDay')
    return t('tax.days').replace('{n}', String(n))
  }

  if (loading) return null

  if (!settings) {
    return (
      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">{t('tax.setupIncomplete')}</p>
            <p className="text-xs text-amber-700 mt-0.5">{t('tax.setupMsg')}</p>
          </div>
        </div>
        <Link
          href="/tax-settings"
          className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {t('tax.setUpNow')}
        </Link>
      </div>
    )
  }

  const today     = new Date()
  const deadlines = buildDeadlines(settings, today, t)

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">{t('tax.upcomingDeadlines')}</h3>
        <Link href="/tax-settings" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
          {t('tax.settingsLink')}
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {deadlines.map((d, i) => {
          const u = urgency(d.days)
          return (
            <div key={i} className={`${u.bg} border ${u.border} rounded-xl p-4`}>
              <div className="flex items-center justify-between mb-2.5">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.badge}`}>
                  {daysLabel(d.days)}
                </span>
                <span className={`w-2 h-2 rounded-full ${u.dot}`} />
              </div>
              <p className="text-sm font-semibold text-gray-900 leading-snug">{d.title}</p>
              <p className="text-xs font-medium text-gray-500 mt-1">{fmtDate(d.date)}</p>
              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{d.description}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
