'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface TaxSettings {
  tax_regime:          'simplified' | 'profit_tax' | 'income_tax'
  business_type:       'general' | 'trade_food'
  vat_registered:      boolean
  simplified_eligible: boolean
  employee_count:      number
}

interface TaxLine {
  label:  string
  rate:   string
  base:   number
  amount: number
  note?:  string
  color:  string
  warn?:  boolean
}

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function calcTax(s: TaxSettings, gross: number, expenses: number): TaxLine[] {
  const profit = Math.max(0, gross - expenses)
  const lines: TaxLine[] = []

  if (s.tax_regime === 'simplified') {
    const rate     = s.business_type === 'trade_food' ? 0.08 : 0.02
    const rateLabel = s.business_type === 'trade_food' ? '8%' : '2%'
    const eligible  = s.simplified_eligible && s.employee_count >= 3
    const amount    = gross * rate * (eligible ? 0.25 : 1)
    lines.push({
      label:  'Simplified Tax',
      rate:   rateLabel,
      base:   gross,
      amount,
      note:   eligible ? '75% micro-business relief applied' : undefined,
      color:  'text-purple-700',
    })
  } else {
    lines.push({
      label:  s.tax_regime === 'profit_tax' ? 'Profit Tax' : 'Business Income Tax',
      rate:   '20%',
      base:   profit,
      amount: profit * 0.2,
      note:   profit === 0 ? 'No taxable profit — no tax due' : undefined,
      color:  'text-blue-700',
    })
  }

  if (s.vat_registered) {
    lines.push({
      label:  'VAT Collected (Output)',
      rate:   '18%',
      base:   gross,
      amount: gross * 0.18,
      note:   'Before input VAT deductions',
      color:  'text-amber-700',
    })
  } else if (gross >= 200000) {
    lines.push({
      label:  'VAT Registration Required',
      rate:   '18%',
      base:   gross,
      amount: 0,
      note:   'Revenue ≥ ₼200,000 — VAT registration is mandatory',
      color:  'text-red-600',
      warn:   true,
    })
  }

  return lines
}

const REGIME_LABEL: Record<string, string> = {
  simplified:  'Simplified Tax',
  profit_tax:  'Profit Tax (Legal Entity)',
  income_tax:  'Business Income Tax (Entrepreneur)',
}

export default function TaxCalculator() {
  const [settings, setSettings] = useState<TaxSettings | null>(null)
  const [gross, setGross]       = useState(0)
  const [expenses, setExpenses] = useState(0)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      supabase
        .from('tax_settings')
        .select('tax_regime, business_type, vat_registered, simplified_eligible, employee_count')
        .maybeSingle(),
      supabase.from('invoices').select('amount'),
      supabase.from('expenses').select('amount'),
    ]).then(([sRes, iRes, eRes]) => {
      setSettings(sRes.data as TaxSettings | null)
      setGross((iRes.data ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0))
      setExpenses((eRes.data ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0))
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-56 mb-6" />
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-50 rounded-lg" />)}
        </div>
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => <div key={i} className="h-12 bg-gray-50 rounded" />)}
        </div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-amber-900">Tax Calculator unavailable</p>
          <p className="text-xs text-amber-700 mt-1">
            Complete your tax setup to see your estimated tax liability.
          </p>
        </div>
        <Link
          href="/tax-settings"
          className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Set Up Taxes
        </Link>
      </div>
    )
  }

  const profit = Math.max(0, gross - expenses)
  const lines  = calcTax(settings, gross, expenses)
  const total  = lines.filter(l => !l.warn).reduce((s, l) => s + l.amount, 0)

  return (
    <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Azerbaijan Tax Calculator</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {REGIME_LABEL[settings.tax_regime]}
            {settings.vat_registered ? ' · VAT registered' : ''}
            {settings.simplified_eligible && settings.employee_count >= 3 ? ' · Micro-business relief' : ''}
          </p>
        </div>
        <Link href="/tax-settings" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
          Change Settings →
        </Link>
      </div>

      <div className="p-6">
        {/* Financial summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Gross Revenue',  value: gross,    color: 'text-blue-700'  },
            { label: 'Total Expenses', value: expenses,  color: 'text-red-600'   },
            { label: 'Net Profit',     value: profit,    color: profit >= 0 ? 'text-green-600' : 'text-red-600' },
          ].map(item => (
            <div key={item.label} className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-medium text-gray-500">{item.label}</p>
              <p className={`text-xl font-bold mt-1 tabular-nums ${item.color}`}>{fmt(item.value)}</p>
            </div>
          ))}
        </div>

        {/* Tax lines */}
        <div className="divide-y divide-gray-50">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center justify-between py-3.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{line.label}</p>
                  <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {line.rate}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Base: {fmt(line.base)}
                  {line.note && (
                    <span className={`ml-2 ${line.warn ? 'text-red-600 font-medium' : 'text-amber-600'}`}>
                      {line.note}
                    </span>
                  )}
                </p>
              </div>
              <p className={`text-base font-bold tabular-nums ml-4 ${line.color}`}>
                {line.warn ? '—' : fmt(line.amount)}
              </p>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="mt-4 pt-4 border-t-2 border-gray-200 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900">Estimated Total Tax Liability</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmt(total)}</p>
        </div>

        <p className="text-xs text-gray-400 mt-3 leading-relaxed">
          Estimates only — based on all invoices and expenses in the system. Input VAT deductions
          not applied. Consult a certified tax professional for official filings.
        </p>
      </div>
    </div>
  )
}
