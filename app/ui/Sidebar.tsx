'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/LanguageContext'
import { useCompany, type Role } from '@/lib/CompanyContext'
import { PACKAGE_COLORS, PACKAGE_LABELS } from '@/lib/features'
import UpgradePrompt from '@/app/ui/UpgradePrompt'
import type { TranslationKey } from '@/lib/i18n'

interface NavItem {
  labelKey:  TranslationKey
  href:      string
  icon:      React.ReactNode
  minRole?:  Role  // minimum role required; undefined = everyone
}

const navItems: NavItem[] = [
  {
    labelKey: 'nav.dashboard',
    href: '/',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.invoices',
    href: '/invoices',
    minRole: 'finance',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.expenses',
    href: '/expenses',
    minRole: 'finance',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.clients',
    href: '/clients',
    minRole: 'finance',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.vendors',
    href: '/vendors',
    minRole: 'finance',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.reports',
    href: '/reports',
    minRole: 'finance',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.taxSettings',
    href: '/tax-settings',
    minRole: 'manager',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.payroll',
    href: '/payroll',
    minRole: 'manager',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.companySettings',
    href: '/company-settings',
    minRole: 'manager',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.billing',
    href: '/billing',
    minRole: 'admin',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
]

// Role hierarchy for visibility checks
const ROLE_RANK: Record<Role, number> = {
  employee: 0,
  finance:  1,
  manager:  2,
  admin:    3,
}

const ROLE_BADGE: Record<Role, { label: string; cls: string }> = {
  admin:    { label: 'Admin',    cls: 'bg-red-500/20 text-red-300 border border-red-500/30' },
  manager:  { label: 'Manager',  cls: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' },
  finance:  { label: 'Finance',  cls: 'bg-blue-400/20 text-blue-300 border border-blue-400/30' },
  employee: { label: 'Employee', cls: 'bg-gray-500/20 text-gray-300 border border-gray-500/30' },
}

const WH_ITEMS = [
  {
    labelKey: 'nav.whProducts' as TranslationKey,
    href:     '/warehouse/products',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.whMovements' as TranslationKey,
    href:     '/warehouse/movements',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.whSettings' as TranslationKey,
    href:     '/warehouse/settings',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
]

const PROC_ITEMS = [
  {
    labelKey: 'nav.procRequests' as TranslationKey,
    href:     '/procurement/requests',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.procOrders' as TranslationKey,
    href:     '/procurement/orders',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.procReceipts' as TranslationKey,
    href:     '/procurement/receipts',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { t }   = useLanguage()
  const { role, user, company, loading, currentPackage, isTrialActive, trialDaysLeft, subscription, canAccess } = useCompany()
  const [showUpgrade,    setShowUpgrade]    = React.useState(false)
  const [upgradeFeature, setUpgradeFeature] = React.useState<string>('purchase_requests')
  const hasProcurement = canAccess('purchase_requests')
  const hasInventory   = canAccess('inventory_basic')

  const userRank = role ? ROLE_RANK[role] : 3 // default to admin rank while loading

  const visibleNavItems = navItems.filter(item => {
    if (!item.minRole) return true
    if (loading || !role) return true // show all while loading
    return userRank >= ROLE_RANK[item.minRole]
  })

  const initials    = user?.email?.[0].toUpperCase() ?? 'U'
  const displayName = user?.email?.split('@')[0] ?? 'User'
  const badge       = role ? ROLE_BADGE[role] : null

  return (
    <>
    <aside className="w-72 bg-blue-900 text-white flex flex-col shrink-0 h-full border-r border-blue-800">

      {/* ── Logo ─────────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-blue-800">
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">
            Az<span className="text-blue-300">Finance</span>
          </span>
          {!loading && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PACKAGE_COLORS[currentPackage].bg.replace('bg-', 'bg-').replace('100', '200/20')} ${PACKAGE_COLORS[currentPackage].text.replace('600', '300').replace('700', '300')} border-white/10`}>
              {PACKAGE_LABELS[currentPackage]}
            </span>
          )}
        </div>
        {company?.name ? (
          <p className="text-blue-400 text-xs mt-1 truncate">{company.name}</p>
        ) : (
          <p className="text-blue-400 text-xs mt-1">Financial Management</p>
        )}
      </div>

      {/* ── Navigation ───────────────────────────────────────────── */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-700 text-white shadow-md shadow-blue-900/40'
                  : 'text-blue-200 hover:bg-blue-800/70 hover:text-white'
              }`}
            >
              {item.icon}
              {t(item.labelKey)}
            </Link>
          )
        })}
      </nav>

      {/* ── Warehouse section ────────────────────────────────────── */}
      <div className="px-4 pb-4">
        <button
          onClick={() => { if (!hasInventory) { setUpgradeFeature('inventory_basic'); setShowUpgrade(true) } }}
          className="w-full text-left"
        >
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
              {t('wh.section')}
            </span>
            {!hasInventory && (
              <span className="text-xs bg-blue-800 text-blue-300 px-1.5 py-0.5 rounded-full">Mid+</span>
            )}
          </div>
        </button>
        <div className="space-y-0.5">
          {WH_ITEMS.map(item => {
            const isActive = pathname.startsWith(item.href)
            if (!hasInventory) {
              return (
                <button key={item.href}
                  onClick={() => { setUpgradeFeature('inventory_basic'); setShowUpgrade(true) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-blue-300/50 hover:text-blue-300/70 hover:bg-blue-800/30 transition-all">
                  {item.icon}
                  {t(item.labelKey)}
                </button>
              )
            }
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive ? 'bg-blue-700 text-white shadow-md shadow-blue-900/40' : 'text-blue-200 hover:bg-blue-800/70 hover:text-white'
                }`}>
                {item.icon}
                {t(item.labelKey)}
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── Procurement section ──────────────────────────────────── */}
      <div className="px-4 pb-4">
        <button
          onClick={() => !hasProcurement && setShowUpgrade(true)}
          className="w-full text-left"
        >
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
              {t('proc.section')}
            </span>
            {!hasProcurement && (
              <span className="text-xs bg-blue-800 text-blue-300 px-1.5 py-0.5 rounded-full">Mid+</span>
            )}
          </div>
        </button>
        <div className="space-y-0.5">
          {PROC_ITEMS.map(item => {
            const isActive = pathname.startsWith(item.href)
            if (!hasProcurement) {
              return (
                <button
                  key={item.href}
                  onClick={() => setShowUpgrade(true)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-blue-300/50 hover:text-blue-300/70 hover:bg-blue-800/30 transition-all"
                >
                  {item.icon}
                  {t(item.labelKey)}
                </button>
              )
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-700 text-white shadow-md shadow-blue-900/40'
                    : 'text-blue-200 hover:bg-blue-800/70 hover:text-white'
                }`}
              >
                {item.icon}
                {t(item.labelKey)}
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── Trial / subscription banner ───────────────────────────── */}
      {!loading && subscription && (
        <div className="px-4 pb-2">
          {isTrialActive ? (
            <Link
              href="/billing"
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                trialDaysLeft <= 3
                  ? 'bg-red-500/15 text-red-300 border border-red-500/25 hover:bg-red-500/25'
                  : trialDaysLeft <= 7
                  ? 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/25 hover:bg-yellow-500/25'
                  : 'bg-blue-500/15 text-blue-300 border border-blue-500/25 hover:bg-blue-500/25'
              }`}
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="truncate">
                {t('billing.trialDaysLeft').replace('{n}', String(trialDaysLeft))}
              </span>
            </Link>
          ) : subscription.status === 'expired' || subscription.status === 'cancelled' ? (
            <Link
              href="/billing"
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium bg-red-500/15 text-red-300 border border-red-500/25 hover:bg-red-500/25 transition-colors"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{t('billing.trialExpired')}</span>
            </Link>
          ) : null}
        </div>
      )}

      {/* ── User / Role section ───────────────────────────────────── */}
      <div className="px-4 py-5 border-t border-blue-800">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-blue-800/50 transition-colors">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-sm font-semibold shrink-0 ring-2 ring-blue-500">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{displayName}</p>
            {badge ? (
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5 ${badge.cls}`}>
                {badge.label}
              </span>
            ) : (
              <p className="text-xs text-blue-400 truncate">{user?.email ?? ''}</p>
            )}
          </div>
        </div>
      </div>
    </aside>
    {showUpgrade && <UpgradePrompt feature={upgradeFeature} onClose={() => setShowUpgrade(false)} />}
    </>
  )
}
