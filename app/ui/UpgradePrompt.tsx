'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/LanguageContext'
import { useCompany } from '@/lib/CompanyContext'
import { PACKAGE_LABELS, PACKAGE_PRICES_AZN, requiredPackage } from '@/lib/features'

interface Props {
  feature: string
  onClose: () => void
}

const CHECK = (
  <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
)

const CROSS = (
  <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const PLANS = [
  {
    pkg: 'light' as const,
    price: PACKAGE_PRICES_AZN.light,
    color: 'border-gray-600',
    header: 'bg-gray-700',
    features: [
      { label: 'Dashboard & Reports', included: true },
      { label: 'Invoices & Clients', included: true },
      { label: 'Expenses & Vendors', included: true },
      { label: 'Tax Calculator', included: true },
      { label: 'Payroll', included: true },
      { label: 'Purchase Orders', included: false },
      { label: 'Inventory', included: false },
      { label: 'Vendor Portal', included: false },
      { label: 'Multi-company', included: false },
    ],
  },
  {
    pkg: 'mid' as const,
    price: PACKAGE_PRICES_AZN.mid,
    color: 'border-blue-500',
    header: 'bg-blue-600',
    popular: true,
    features: [
      { label: 'Dashboard & Reports', included: true },
      { label: 'Invoices & Clients', included: true },
      { label: 'Expenses & Vendors', included: true },
      { label: 'Tax Calculator', included: true },
      { label: 'Payroll', included: true },
      { label: 'Purchase Orders', included: true },
      { label: 'Inventory', included: true },
      { label: 'Vendor Portal', included: false },
      { label: 'Multi-company', included: false },
    ],
  },
  {
    pkg: 'enterprise' as const,
    price: PACKAGE_PRICES_AZN.enterprise,
    color: 'border-purple-500',
    header: 'bg-purple-700',
    features: [
      { label: 'Dashboard & Reports', included: true },
      { label: 'Invoices & Clients', included: true },
      { label: 'Expenses & Vendors', included: true },
      { label: 'Tax Calculator', included: true },
      { label: 'Payroll', included: true },
      { label: 'Purchase Orders', included: true },
      { label: 'Inventory', included: true },
      { label: 'Vendor Portal', included: true },
      { label: 'Multi-company', included: true },
    ],
  },
]

export default function UpgradePrompt({ feature, onClose }: Props) {
  const { t } = useLanguage()
  const { currentPackage } = useCompany()
  const needed = requiredPackage(feature)
  const msg = needed === 'enterprise' ? t('upgrade.msgEnterprise') : t('upgrade.msgMid')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-700">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-semibold px-2.5 py-1 rounded-full">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('upgrade.trialBadge')}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white">{t('upgrade.title')}</h2>
            <p className="text-sm text-gray-400 mt-1">{msg}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors ml-4 shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Plan cards */}
        <div className="p-6 grid grid-cols-3 gap-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.pkg === currentPackage
            const isTarget  = plan.pkg === needed
            return (
              <div
                key={plan.pkg}
                className={`rounded-xl border-2 overflow-hidden ${
                  isCurrent ? 'border-gray-500 opacity-70' :
                  isTarget  ? plan.color + ' ring-2 ring-offset-2 ring-offset-gray-900 ' + plan.color.replace('border-', 'ring-') :
                  plan.color
                }`}
              >
                <div className={`${plan.header} px-3 py-3`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      {PACKAGE_LABELS[plan.pkg]}
                    </span>
                    {plan.popular && !isCurrent && (
                      <span className="text-xs bg-white/20 text-white px-1.5 py-0.5 rounded-full">
                        {t('billing.popularBadge')}
                      </span>
                    )}
                    {isCurrent && (
                      <span className="text-xs bg-white/20 text-white px-1.5 py-0.5 rounded-full">
                        {t('billing.currentBadge')}
                      </span>
                    )}
                  </div>
                  <div className="text-white">
                    <span className="text-xl font-bold">{plan.price}</span>
                    <span className="text-xs opacity-80"> AZN{t('billing.perMonth')}</span>
                  </div>
                </div>
                <div className="px-3 py-3 bg-gray-800/60 space-y-2">
                  {plan.features.map((f) => (
                    <div key={f.label} className="flex items-center gap-2">
                      {f.included ? CHECK : CROSS}
                      <span className={`text-xs ${f.included ? 'text-gray-200' : 'text-gray-500'}`}>
                        {f.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer CTA */}
        <div className="px-6 pb-6">
          <div className="bg-gray-800 rounded-xl p-4 text-center">
            <p className="text-sm text-gray-300 mb-3">{t('billing.upgradeContact')}</p>
            <div className="flex items-center justify-center gap-6 mb-4">
              <a href="tel:+994103221210" className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {t('billing.contactPhone')}
              </a>
              <a href="mailto:eganiyev@digitx.az" className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {t('billing.contactEmail')}
              </a>
            </div>
            <div className="flex gap-3">
              <Link
                href="/billing"
                onClick={onClose}
                className="flex-1 text-center text-sm text-gray-300 border border-gray-600 hover:border-gray-400 px-4 py-2.5 rounded-lg transition-colors"
              >
                {t('upgrade.viewBilling')}
              </Link>
              <button
                onClick={onClose}
                className="flex-1 text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg font-semibold transition-colors"
              >
                {t('upgrade.close')}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
