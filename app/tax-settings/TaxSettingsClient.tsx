'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import VatThresholdMonitor from '@/app/ui/VatThresholdMonitor'
import { useLanguage } from '@/lib/LanguageContext'

type TaxRegime    = 'simplified' | 'profit_tax' | 'income_tax'
type BusinessType = 'general' | 'trade_food'
type PayrollSector = 'private_non_oil' | 'oil_gas_public'

interface TaxSettings {
  tax_regime:          TaxRegime
  business_type:       BusinessType
  vat_registered:      boolean
  simplified_eligible: boolean
  payroll_sector:      PayrollSector
}

const DEFAULTS: TaxSettings = {
  tax_regime:          'simplified',
  business_type:       'general',
  vat_registered:      false,
  simplified_eligible: false,
  payroll_sector:      'private_non_oil',
}

const REGIME_OPTIONS: { value: TaxRegime; label: string; desc: string }[] = [
  {
    value: 'simplified',
    label: 'Simplified Tax',
    desc:  '2% of gross revenue (general) or 8% (trade/food service). Designed for small businesses.',
  },
  {
    value: 'profit_tax',
    label: 'Profit Tax — 20%',
    desc:  'For legal entities (LLCs, JSCs). 20% on taxable profit after deductible expenses.',
  },
  {
    value: 'income_tax',
    label: 'Business Income Tax — 20%',
    desc:  'For individual entrepreneurs not on simplified. 20% on net taxable income.',
  },
]

export default function TaxSettingsClient() {
  const { lang } = useLanguage()
  const [settings,           setSettings]           = useState<TaxSettings>(DEFAULTS)
  const [loading,            setLoading]            = useState(true)
  const [saving,             setSaving]             = useState(false)
  const [saved,              setSaved]              = useState(false)
  const [annualRevenue,      setAnnualRevenue]      = useState(0)
  const [activeEmployeeCount, setActiveEmployeeCount] = useState(0)

  useEffect(() => {
    const since = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10) })()
    Promise.all([
      supabase.from('tax_settings').select('tax_regime, business_type, vat_registered, simplified_eligible, payroll_sector').maybeSingle(),
      supabase.from('invoices').select('amount').neq('status', 'Draft').gte('date', since),
      supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ]).then(([{ data: ts }, { data: inv }, { count }]) => {
      if (ts) setSettings(ts as TaxSettings)
      setAnnualRevenue((inv ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0))
      setActiveEmployeeCount(count ?? 0)
      setLoading(false)
    })
  }, [])

  function setField<K extends keyof TaxSettings>(key: K, value: TaxSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('tax_settings').upsert(
      { ...settings, employee_count: activeEmployeeCount },
      { onConflict: 'user_id' },
    )
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-5">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-40 mb-4" />
            <div className="h-12 bg-gray-50 rounded" />
          </div>
        ))}
      </div>
    )
  }

  const canClaimRelief = settings.tax_regime === 'simplified' && activeEmployeeCount >= 3

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Tax Regime ───────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Tax Regime</h3>
          <p className="text-xs text-gray-400 mb-4">Select the tax system that applies to your business.</p>
          <div className="space-y-3">
            {REGIME_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  settings.tax_regime === opt.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <input
                  type="radio"
                  name="tax_regime"
                  value={opt.value}
                  checked={settings.tax_regime === opt.value}
                  onChange={() => setField('tax_regime', opt.value)}
                  className="mt-0.5 accent-blue-600"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* ── Business Type (simplified only) ──────────────────── */}
        {settings.tax_regime === 'simplified' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Business Type</h3>
            <p className="text-xs text-gray-400 mb-4">Determines your simplified tax rate.</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: 'general',    label: 'General',             rate: '2%', desc: 'All other businesses' },
                { value: 'trade_food', label: 'Trade / Food Service', rate: '8%', desc: 'Retail, catering, restaurants' },
              ] as { value: BusinessType; label: string; rate: string; desc: string }[]).map(opt => (
                <label
                  key={opt.value}
                  className={`flex flex-col gap-1 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    settings.business_type === opt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="business_type"
                    value={opt.value}
                    checked={settings.business_type === opt.value}
                    onChange={() => setField('business_type', opt.value)}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                    <span className="text-lg font-bold text-blue-600">{opt.rate}</span>
                  </div>
                  <p className="text-xs text-gray-400">{opt.desc}</p>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── VAT Threshold Monitor ────────────────────────────── */}
        {!settings.vat_registered && (
          <VatThresholdMonitor annualRevenue={annualRevenue} />
        )}

        {/* ── VAT Registration ─────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{lang === 'az' ? 'ƏDV Qeydiyyatı' : 'VAT Registration'}</h3>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                {lang === 'az'
                  ? '18% ƏDV. İllik gəlir ₼200,000 həddi keçdikdə və ya hər hansı bir əməliyyat ₼200,000 aşdıqda məcburidir. Dividend tutma vergisi 5%.'
                  : '18% VAT. Mandatory when annual revenue exceeds ₼200,000 or any single transaction exceeds ₼200,000. Dividend withholding tax is 5%.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setField('vat_registered', !settings.vat_registered)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 ${
                settings.vat_registered ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                settings.vat_registered ? 'translate-x-5' : ''
              }`} />
            </button>
          </div>
          {settings.vat_registered && (
            <div className="mt-3 bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg">
              {lang === 'az' ? 'ƏDV hesabatı növbəti ayın 20-nə qədər verilməlidir.' : 'VAT returns due on the 20th of each following month.'}
            </div>
          )}
        </div>

        {/* ── Payroll & Employees ──────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Payroll &amp; Employees</h3>
          <p className="text-xs text-gray-400 mb-4">
            Used for payroll tax deadlines and micro-business relief eligibility.
          </p>

          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Active Employees
            </label>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-12 h-9 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-sm font-bold tabular-nums">
                {activeEmployeeCount}
              </span>
              <span className="text-xs text-gray-400">
                Live count from the{' '}
                <a href="/payroll" className="text-blue-500 hover:underline">Employees</a>
                {' '}table — manage employees there.
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Payroll Sector</label>
            <div className="flex flex-wrap gap-3">
              {([
                { value: 'private_non_oil', label: 'Private (non-oil)' },
                { value: 'oil_gas_public',  label: 'Oil, Gas & Public Sector' },
              ] as { value: PayrollSector; label: string }[]).map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 cursor-pointer transition-all text-sm font-medium ${
                    settings.payroll_sector === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-100 text-gray-600 hover:border-gray-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="payroll_sector"
                    value={opt.value}
                    checked={settings.payroll_sector === opt.value}
                    onChange={() => setField('payroll_sector', opt.value)}
                    className="accent-blue-600"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── Micro-Business Relief (simplified only) ──────────── */}
        {settings.tax_regime === 'simplified' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Micro-Business Relief</h3>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                  75% tax reduction for eligible micro-businesses with a minimum of 3 employees.
                  {!canClaimRelief && (
                    <span className="text-amber-600"> Requires at least 3 active employees (currently {activeEmployeeCount}).</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                disabled={!canClaimRelief}
                onClick={() => canClaimRelief && setField('simplified_eligible', !settings.simplified_eligible)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                  settings.simplified_eligible && canClaimRelief ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.simplified_eligible && canClaimRelief ? 'translate-x-5' : ''
                }`} />
              </button>
            </div>
            {settings.simplified_eligible && canClaimRelief && (
              <div className="mt-3 bg-green-50 text-green-700 text-xs px-3 py-2 rounded-lg">
                Relief active — effective rate: <strong>{settings.business_type === 'trade_food' ? '2%' : '0.5%'}</strong> of gross revenue.
              </div>
            )}
          </div>
        )}

        {/* ── Save ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pb-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors shadow-sm disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved successfully
            </span>
          )}
        </div>

      </form>
    </div>
  )
}
