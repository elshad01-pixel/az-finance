'use client'

import { useCompany } from '@/lib/CompanyContext'
import { useLanguage } from '@/lib/LanguageContext'
import {
  PACKAGE_FEATURES, PACKAGE_LABELS, PACKAGE_PRICES_AZN, PACKAGE_COLORS,
  type Package,
} from '@/lib/features'
import type { TranslationKey } from '@/lib/i18n'

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

const FEATURE_ROWS: { key: string; labelKey: TranslationKey; label: string; plans: Package[] }[] = [
  { key: 'dashboard',         labelKey: 'billing.featDashboard',    label: 'Dashboard & Reports',      plans: ['light','mid','enterprise'] },
  { key: 'invoices',          labelKey: 'billing.featInvoices',     label: 'Invoices & Clients',        plans: ['light','mid','enterprise'] },
  { key: 'expenses',          labelKey: 'billing.featExpenses',     label: 'Expenses & Vendors',        plans: ['light','mid','enterprise'] },
  { key: 'tax',               labelKey: 'billing.featTax',          label: 'Tax Calculator',            plans: ['light','mid','enterprise'] },
  { key: 'payroll',           labelKey: 'billing.featPayroll',      label: 'Payroll',                   plans: ['light','mid','enterprise'] },
  { key: 'purchase_orders',   labelKey: 'billing.featPO',           label: 'Purchase Orders',           plans: ['mid','enterprise'] },
  { key: 'inventory_basic',   labelKey: 'billing.featInventory',    label: 'Inventory',                 plans: ['mid','enterprise'] },
  { key: 'vendor_portal',     labelKey: 'billing.featVendorPortal', label: 'Vendor Portal',             plans: ['enterprise'] },
  { key: 'inventory_advanced',labelKey: 'billing.featAdvInv',       label: 'Advanced Inventory',        plans: ['enterprise'] },
  { key: 'multi_company',     labelKey: 'billing.featMultiCo',      label: 'Multi-company',             plans: ['enterprise'] },
  { key: 'api_access',        labelKey: 'billing.featApi',          label: 'API Access',                plans: ['enterprise'] },
]

const PACKAGES: Package[] = ['light', 'mid', 'enterprise']

const HEADER_STYLES: Record<Package, string> = {
  light:      'bg-gray-700 border-gray-600',
  mid:        'bg-blue-700 border-blue-500',
  enterprise: 'bg-purple-800 border-purple-500',
}

const POPULAR_PKG: Package = 'mid'

export default function BillingPage() {
  const { t } = useLanguage()
  const { subscription, currentPackage, isTrialActive, trialDaysLeft, loading } = useCompany()

  const trialEnd = subscription?.trial_ends_at
    ? new Date(subscription.trial_ends_at).toLocaleDateString()
    : null

  const paidUntil = subscription?.paid_until
    ? new Date(subscription.paid_until).toLocaleDateString()
    : null

  return (
    <div className="max-w-4xl mx-auto space-y-8">

      {/* ── Current plan card ─────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
          {t('billing.currentPlan')}
        </h2>
        {loading ? (
          <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
        ) : (
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold border-2 ${PACKAGE_COLORS[currentPackage].bg} ${PACKAGE_COLORS[currentPackage].text} ${PACKAGE_COLORS[currentPackage].border}`}>
                {PACKAGE_LABELS[currentPackage][0]}
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {PACKAGE_LABELS[currentPackage]}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {PACKAGE_PRICES_AZN[currentPackage]} AZN{t('billing.perMonth')}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              {isTrialActive && trialEnd && (
                <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full ${
                  trialDaysLeft <= 3
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    : trialDaysLeft <= 7
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                }`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('billing.trialActive')} — {t('billing.trialDaysLeft').replace('{n}', String(trialDaysLeft))}
                </span>
              )}
              {!isTrialActive && subscription?.status === 'active' && paidUntil && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t('billing.paidUntil')}: {paidUntil}
                </span>
              )}
              {(subscription?.status === 'expired' || subscription?.status === 'cancelled') && (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {t('billing.trialExpired')}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Plan comparison ───────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {t('billing.comparisonTitle')}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="w-48 px-6 py-4 text-left" />
                {PACKAGES.map((pkg) => (
                  <th key={pkg} className="px-4 py-0 text-center align-bottom">
                    <div className={`m-2 rounded-xl border-2 overflow-hidden ${HEADER_STYLES[pkg]}`}>
                      <div className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <span className="text-sm font-bold text-white">{PACKAGE_LABELS[pkg]}</span>
                          {pkg === POPULAR_PKG && pkg !== currentPackage && (
                            <span className="text-xs bg-white/20 text-white px-1.5 py-0.5 rounded-full">
                              {t('billing.popularBadge')}
                            </span>
                          )}
                          {pkg === currentPackage && (
                            <span className="text-xs bg-white/20 text-white px-1.5 py-0.5 rounded-full">
                              {t('billing.currentBadge')}
                            </span>
                          )}
                        </div>
                        <p className="text-white text-center">
                          <span className="text-2xl font-bold">{PACKAGE_PRICES_AZN[pkg]}</span>
                          <span className="text-xs opacity-80"> AZN{t('billing.perMonth')}</span>
                        </p>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((row, i) => (
                <tr
                  key={row.key}
                  className={i % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/30' : 'bg-white dark:bg-gray-800'}
                >
                  <td className="px-6 py-3 text-sm text-gray-700 dark:text-gray-300 font-medium">
                    {t(row.labelKey)}
                  </td>
                  {PACKAGES.map((pkg) => (
                    <td key={pkg} className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        {row.plans.includes(pkg) ? CHECK : CROSS}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Upgrade contact ───────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-bold mb-1">{t('billing.upgrade')}</h3>
            <p className="text-blue-100 text-sm">{t('billing.upgradeContact')}</p>
          </div>
          <div className="flex flex-col gap-2 min-w-48">
            <a
              href="tel:+994103221210"
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 transition-colors px-4 py-2.5 rounded-xl text-sm font-medium"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              {t('billing.contactPhone')}
            </a>
            <a
              href="mailto:eganiyev@digitx.az"
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 transition-colors px-4 py-2.5 rounded-xl text-sm font-medium"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {t('billing.contactEmail')}
            </a>
          </div>
        </div>
      </div>

    </div>
  )
}
