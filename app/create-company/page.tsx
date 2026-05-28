'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCompany } from '@/lib/CompanyContext'

const INDUSTRIES = ['Retail', 'Services', 'Manufacturing', 'Hospitality', 'Technology', 'Healthcare', 'Other']

const CURRENCIES = [
  { value: 'AZN', label: 'AZN' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'TRY', label: 'TRY' },
]

export default function CreateCompanyPage() {
  const router = useRouter()
  const { user, company, loading: ctxLoading, refresh } = useCompany()

  const [name,     setName]     = useState('')
  const [taxId,    setTaxId]    = useState('')
  const [currency, setCurrency] = useState('AZN')
  const [method,   setMethod]   = useState<'accrual' | 'cash'>('accrual')
  const [industry, setIndustry] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Already set up → go to dashboard
  useEffect(() => {
    if (!ctxLoading && company) router.replace('/')
  }, [ctxLoading, company, router])

  // Not authenticated → middleware should have caught this, but guard anyway
  useEffect(() => {
    if (!ctxLoading && !user) router.replace('/login')
  }, [ctxLoading, user, router])

  async function submit(skipForm: boolean) {
    if (!user) return
    setSaving(true)
    setError(null)

    const companyName = skipForm
      ? `${(user.email ?? 'user').split('@')[0]}'s Company`
      : name.trim()

    // 1. Create company
    const { data: comp, error: compErr } = await supabase
      .from('companies')
      .insert({
        name:     companyName,
        owner_id: user.id,
        ...((!skipForm && taxId.trim()) ? { tax_id: taxId.trim() } : {}),
      })
      .select()
      .single()

    if (compErr || !comp) {
      setError(compErr?.message ?? 'Failed to create company.')
      setSaving(false)
      return
    }

    // 2. Make user an admin member
    const { error: memErr } = await supabase
      .from('company_members')
      .insert({
        company_id:    comp.id,
        user_id:       user.id,
        role:          'admin',
        status:        'active',
        invited_email: user.email ?? null,
      })

    if (memErr) {
      setError(memErr.message)
      setSaving(false)
      return
    }

    // 3. Save company settings
    await supabase.from('company_settings').insert({
      company_id:        comp.id,
      currency:          skipForm ? 'AZN' : currency,
      accounting_method: skipForm ? 'accrual' : method,
      industry:          (!skipForm && industry) ? industry : null,
    })

    // 4. Seed AZ tax defaults (company_id auto-set by DB trigger)
    await supabase.from('tax_settings').upsert({
      tax_regime:         'profit_tax',
      business_type:      'general',
      vat_registered:     false,
      simplified_eligible: false,
      payroll_sector:     'private_non_oil',
      employee_count:     1,
    }, { onConflict: 'user_id' })

    // 5. Reload context (subscription is auto-created by DB trigger)
    await refresh()
    router.push('/')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !industry) return
    await submit(false)
  }

  // Show spinner while context loads or while redirecting away
  if (ctxLoading || (!ctxLoading && (company || !user))) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800">
        <div className="w-6 h-6 rounded-full border-2 border-blue-300 border-t-white animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 min-h-screen">

      {/* Decorative blobs */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-lg">

        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-4xl font-bold tracking-tight text-white">
            Az<span className="text-blue-300">Finance</span>
          </span>
          <p className="text-blue-200 text-sm mt-2">Let&apos;s set up your workspace</p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-1.5 rounded-full bg-green-400" />
          <div className="w-8 h-1.5 rounded-full bg-white" />
          <div className="w-8 h-1.5 rounded-full bg-white/30" />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-10">

          <div className="mb-7">
            <h2 className="text-xl font-bold text-gray-900">Create Your Company</h2>
            <p className="text-sm text-gray-500 mt-1">Takes 30 seconds — you can change these any time.</p>
          </div>

          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Company Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Orion Wholesale LLC"
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {/* VÖEN / Tax ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                VÖEN / Tax ID
                <span className="ml-1.5 text-xs text-gray-400 font-normal">optional, recommended</span>
              </label>
              <input
                type="text"
                value={taxId}
                onChange={e => setTaxId(e.target.value)}
                placeholder="1234567890"
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {/* Currency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
              <div className="grid grid-cols-4 gap-2">
                {CURRENCIES.map(c => (
                  <button key={c.value} type="button"
                    onClick={() => setCurrency(c.value)}
                    className={`py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                      currency === c.value
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}>
                    {c.value}
                  </button>
                ))}
              </div>
            </div>

            {/* Accounting Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Accounting Method</label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'accrual' as const, label: 'Accrual', desc: 'Revenue when earned' },
                  { value: 'cash'    as const, label: 'Cash',    desc: 'Revenue when received' },
                ]).map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setMethod(opt.value)}
                    className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                      method === opt.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}>
                    <p className={`text-sm font-semibold ${method === opt.value ? 'text-blue-700' : 'text-gray-700'}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Industry */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Industry <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  required
                  value={industry}
                  onChange={e => setIndustry(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-10 text-gray-900"
                >
                  <option value="">Select industry…</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || !name.trim() || !industry}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 rounded-lg transition-colors shadow-sm disabled:opacity-60 text-sm mt-2"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Setting up…
                </span>
              ) : 'Get Started →'}
            </button>

          </form>

          <button
            type="button"
            onClick={() => submit(true)}
            disabled={saving}
            className="w-full mt-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
          >
            Skip for now
          </button>

        </div>

        <p className="text-center text-xs text-blue-300/60 mt-6">
          AzFinance &copy; 2026 &middot; All rights reserved
        </p>
      </div>
    </div>
  )
}
