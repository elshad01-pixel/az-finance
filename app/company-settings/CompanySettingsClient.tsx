'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface CompanySettings {
  company_name:    string
  company_address: string
  tax_id:          string
  phone:           string
  email:           string
  bank_name:       string
  bank_account:    string
  swift_code:      string
}

const DEFAULTS: CompanySettings = {
  company_name:    '',
  company_address: '',
  tax_id:          '',
  phone:           '',
  email:           '',
  bank_name:       '',
  bank_account:    '',
  swift_code:      '',
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition'

export default function CompanySettingsClient() {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULTS)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    supabase
      .from('company_settings')
      .select('company_name, company_address, tax_id, phone, email, bank_name, bank_account, swift_code')
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSettings(data as CompanySettings)
        setLoading(false)
      })
  }, [])

  function set(key: keyof CompanySettings) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setSettings(prev => ({ ...prev, [key]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('company_settings').upsert(settings, { onConflict: 'user_id' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-5">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-40 mb-4" />
            <div className="space-y-3">
              <div className="h-10 bg-gray-50 rounded" />
              <div className="h-10 bg-gray-50 rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Company Information ──────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Company Information</h3>
          <p className="text-xs text-gray-400 mb-4">
            Appears in the &ldquo;From&rdquo; section of invoice PDFs.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Company Name</label>
              <input
                type="text"
                required
                value={settings.company_name}
                onChange={set('company_name')}
                placeholder="e.g. Acme MMC"
                className={INPUT}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Address</label>
              <textarea
                value={settings.company_address}
                onChange={set('company_address')}
                placeholder={'12 Nizami St\nBaku, Azerbaijan'}
                rows={2}
                className={`${INPUT} resize-none`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  VÖEN (Tax ID)
                </label>
                <input
                  type="text"
                  value={settings.tax_id}
                  onChange={set('tax_id')}
                  placeholder="1234567890"
                  className={INPUT}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={settings.phone}
                  onChange={set('phone')}
                  placeholder="+994 50 000 0000"
                  className={INPUT}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={settings.email}
                onChange={set('email')}
                placeholder="billing@company.az"
                className={INPUT}
              />
            </div>
          </div>
        </div>

        {/* ── Bank Details ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Bank Details</h3>
          <p className="text-xs text-gray-400 mb-4">
            Printed at the bottom of invoice PDFs so clients know where to pay.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Bank Name</label>
              <input
                type="text"
                value={settings.bank_name}
                onChange={set('bank_name')}
                placeholder="International Bank of Azerbaijan"
                className={INPUT}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Account Number / IBAN
              </label>
              <input
                type="text"
                value={settings.bank_account}
                onChange={set('bank_account')}
                placeholder="AZ12 IBAZ 3456 7890 1234 5678 90"
                className={`${INPUT} font-mono tracking-wide`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">SWIFT / BIC</label>
              <input
                type="text"
                value={settings.swift_code}
                onChange={set('swift_code')}
                placeholder="IBAZAZ2X"
                className={`${INPUT} font-mono uppercase`}
              />
            </div>
          </div>
        </div>

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
