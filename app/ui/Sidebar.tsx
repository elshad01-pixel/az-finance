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
  labelKey: TranslationKey
  href:     string
  icon:     string
  minRole?: Role
}

const navItems: NavItem[] = [
  { labelKey: 'nav.dashboard',       href: '/',                 icon: 'ti-layout-dashboard' },
  { labelKey: 'nav.invoices',        href: '/invoices',         icon: 'ti-file-invoice',   minRole: 'finance' },
  { labelKey: 'nav.expenses',        href: '/expenses',         icon: 'ti-receipt',        minRole: 'finance' },
  { labelKey: 'nav.clients',         href: '/clients',          icon: 'ti-users',          minRole: 'finance' },
  { labelKey: 'nav.vendors',         href: '/vendors',          icon: 'ti-building-store', minRole: 'finance' },
  { labelKey: 'nav.reports',         href: '/reports',          icon: 'ti-chart-bar',      minRole: 'finance' },
  { labelKey: 'nav.taxSettings',     href: '/tax-settings',     icon: 'ti-calculator',     minRole: 'manager' },
  { labelKey: 'nav.payroll',         href: '/payroll',          icon: 'ti-cash',           minRole: 'manager' },
  { labelKey: 'nav.companySettings', href: '/company-settings', icon: 'ti-settings',       minRole: 'manager' },
  { labelKey: 'nav.billing',         href: '/billing',          icon: 'ti-credit-card',    minRole: 'admin'   },
]

const WH_ITEMS = [
  { labelKey: 'nav.whProducts'   as TranslationKey, href: '/warehouse/products',  icon: 'ti-box' },
  { labelKey: 'nav.whBatches'    as TranslationKey, href: '/warehouse/batches',   icon: 'ti-packages' },
  { labelKey: 'nav.whMovements'  as TranslationKey, href: '/warehouse/movements', icon: 'ti-arrows-exchange' },
  { labelKey: 'nav.whSettings'   as TranslationKey, href: '/warehouse/settings',  icon: 'ti-settings' },
]

const SALES_ITEMS = [
  { labelKey: 'nav.salesOrders'     as TranslationKey, href: '/sales/orders',    icon: 'ti-shopping-cart' },
  { labelKey: 'nav.salesDeliveries' as TranslationKey, href: '/sales/deliveries',icon: 'ti-truck-delivery' },
]

const PROC_ITEMS = [
  { labelKey: 'nav.procRequests' as TranslationKey, href: '/procurement/requests', icon: 'ti-clipboard-list' },
  { labelKey: 'nav.procOrders'   as TranslationKey, href: '/procurement/orders',   icon: 'ti-file-text' },
  { labelKey: 'nav.procReceipts' as TranslationKey, href: '/procurement/receipts', icon: 'ti-package-import' },
]

const ROLE_RANK: Record<Role, number> = { employee: 0, finance: 1, manager: 2, admin: 3 }

const ROLE_BADGE: Record<Role, { label: string; cls: string }> = {
  admin:    { label: 'Admin',    cls: 'bg-red-500/20 text-red-300 border border-red-500/30' },
  manager:  { label: 'Manager',  cls: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' },
  finance:  { label: 'Finance',  cls: 'bg-blue-400/20 text-blue-300 border border-blue-400/30' },
  employee: { label: 'Employee', cls: 'bg-gray-500/20 text-gray-300 border border-gray-500/30' },
}


// ── NavLink ───────────────────────────────────────────────────────────────────

function NavLink({
  href, icon, label, active, locked, onLockedClick, sub = false,
}: {
  href: string; icon: string; label: string
  active: boolean; locked?: boolean; onLockedClick?: () => void; sub?: boolean
}) {
  // All items have a 3px left border slot so layout never shifts
  const base = `w-full flex items-center gap-3 py-2 text-sm font-medium transition-all duration-150 border-l-[3px] rounded-r-xl`
  const pad  = sub ? 'pl-[21px] pr-3' : 'pl-[13px] pr-3'

  const state = active
    ? 'bg-blue-700/80 text-white border-[#93c5fd]'
    : locked
    ? 'text-blue-300/50 hover:text-blue-300/70 hover:bg-blue-800/30 border-transparent cursor-pointer'
    : 'text-blue-200 hover:bg-blue-800/60 hover:text-white border-transparent'

  const cls = `${base} ${pad} ${state}`

  if (locked) {
    return (
      <button className={cls} onClick={onLockedClick}>
        <i className={`ti ${icon} text-[18px] shrink-0`} />
        {label}
      </button>
    )
  }
  return (
    <Link href={href} className={cls}>
      <i className={`ti ${icon} text-[18px] shrink-0`} />
      {label}
    </Link>
  )
}

// ── CollapsibleSection ────────────────────────────────────────────────────────

interface SectionProps {
  title:        string
  icon:         string
  storageKey:   string
  hasActiveItem: boolean
  locked?:      boolean
  badge?:       string
  onLockedClick?: () => void
  children:     React.ReactNode
}

function CollapsibleSection({
  title, icon, storageKey, hasActiveItem, locked, badge, onLockedClick, children,
}: SectionProps) {
  // Always start open — matches SSR; sync from localStorage after mount to avoid hydration mismatch
  const [open, setOpen] = React.useState(true)
  React.useEffect(() => {
    const v = localStorage.getItem(storageKey)
    if (v !== null) setOpen(v === 'true')
  }, [storageKey])

  function toggle() {
    if (locked && onLockedClick) { onLockedClick(); return }
    const next = !open
    setOpen(next)
    localStorage.setItem(storageKey, String(next))
  }

  return (
    <div>
      {/* Full-width darker strip header */}
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2.5 px-4 py-2 transition-colors duration-150 hover:brightness-110"
        style={{
          background:    'rgba(0,0,0,0.2)',
          borderTop:     '1px solid rgba(255,255,255,0.1)',
          borderLeft:    `3px solid ${hasActiveItem ? '#93c5fd' : 'transparent'}`,
          letterSpacing: '0.08em',
        }}
      >
        <i className={`ti ${icon} text-[16px] text-blue-300 shrink-0`} />
        <span className="text-[12px] font-semibold uppercase text-blue-300 flex-1 text-left">{title}</span>
        {badge && (
          <span className="text-[10px] bg-blue-800/80 text-blue-300 px-1.5 py-0.5 rounded-full mr-1">{badge}</span>
        )}
        <i className={`ti ti-chevron-down text-[14px] text-blue-400 shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
      </button>

      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? '400px' : '0px', opacity: open ? 1 : 0 }}
      >
        <div className="py-1 space-y-0.5">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname()
  const { t }    = useLanguage()
  const { role, user, company, loading, currentPackage, isTrialActive, trialDaysLeft, subscription, canAccess } = useCompany()
  const [showUpgrade,    setShowUpgrade]    = React.useState(false)
  const [upgradeFeature, setUpgradeFeature] = React.useState<string>('purchase_requests')

  const hasProcurement = canAccess('purchase_requests')
  const hasInventory   = canAccess('inventory_basic')
  const hasSales       = canAccess('sales_orders')

  const userRank = role ? ROLE_RANK[role] : 3

  const visibleNavItems = navItems.filter(item => {
    if (!item.minRole) return true
    if (loading || !role) return true
    return userRank >= ROLE_RANK[item.minRole]
  })

  const initials    = user?.email?.[0].toUpperCase() ?? 'U'
  const displayName = user?.email?.split('@')[0] ?? 'User'
  const badge       = role ? ROLE_BADGE[role] : null

  const whActive   = WH_ITEMS.some(i => pathname.startsWith(i.href))
  const salesActive= SALES_ITEMS.some(i => pathname.startsWith(i.href))
  const procActive = PROC_ITEMS.some(i => pathname.startsWith(i.href))

  return (
    <>
    <aside className="w-72 bg-blue-900 text-white flex flex-col shrink-0 h-full border-r border-blue-800">

      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-blue-800">
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">
            Az<span className="text-blue-300">Finance</span>
          </span>
          {!loading && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PACKAGE_COLORS[currentPackage].bg.replace('100','200/20')} ${PACKAGE_COLORS[currentPackage].text.replace('600','300').replace('700','300')} border-white/10`}>
              {PACKAGE_LABELS[currentPackage]}
            </span>
          )}
        </div>
        {company?.name
          ? <p className="text-blue-400 text-xs mt-1 truncate">{company.name}</p>
          : <p className="text-blue-400 text-xs mt-1">Financial Management</p>
        }
      </div>

      {/* ── Scrollable nav ────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto pt-3 pb-1">

        {/* Main items */}
        <div className="px-3 space-y-0.5">
          {visibleNavItems.map(item => (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={t(item.labelKey)}
              active={item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)}
            />
          ))}
        </div>

        {/* Thin divider — reduced gap */}
        <div className="mx-3 my-2 border-t border-blue-800/60" />

        {/* ── Warehouse ─────────────────────────────────────────────────── */}
        <CollapsibleSection
          title={t('wh.section')}
          icon="ti-building-warehouse"
          storageKey="sidebar_warehouse_open"
          hasActiveItem={whActive}
          locked={!hasInventory}
          badge={!hasInventory ? 'Mid+' : undefined}
          onLockedClick={() => { setUpgradeFeature('inventory_basic'); setShowUpgrade(true) }}
        >
          <div className="px-3 space-y-0.5">
            {WH_ITEMS.map(item => (
              <NavLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={t(item.labelKey)}
                active={pathname.startsWith(item.href)}
                locked={!hasInventory}
                onLockedClick={() => { setUpgradeFeature('inventory_basic'); setShowUpgrade(true) }}
                sub
              />
            ))}
          </div>
        </CollapsibleSection>

        {/* ── Sales ─────────────────────────────────────────────────────── */}
        <CollapsibleSection
          title={t('so.section')}
          icon="ti-shopping-cart"
          storageKey="sidebar_sales_open"
          hasActiveItem={salesActive}
          locked={!hasSales}
          badge={!hasSales ? 'Mid+' : undefined}
          onLockedClick={() => { setUpgradeFeature('sales_orders'); setShowUpgrade(true) }}
        >
          <div className="px-3 space-y-0.5">
            {SALES_ITEMS.map(item => (
              <NavLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={t(item.labelKey)}
                active={pathname.startsWith(item.href)}
                locked={!hasSales}
                onLockedClick={() => { setUpgradeFeature('sales_orders'); setShowUpgrade(true) }}
                sub
              />
            ))}
          </div>
        </CollapsibleSection>

        {/* ── Procurement ───────────────────────────────────────────────── */}
        <CollapsibleSection
          title={t('proc.section')}
          icon="ti-truck-delivery"
          storageKey="sidebar_procurement_open"
          hasActiveItem={procActive}
          locked={!hasProcurement}
          badge={!hasProcurement ? 'Mid+' : undefined}
          onLockedClick={() => { setUpgradeFeature('purchase_requests'); setShowUpgrade(true) }}
        >
          <div className="px-3 space-y-0.5">
            {PROC_ITEMS.map(item => (
              <NavLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={t(item.labelKey)}
                active={pathname.startsWith(item.href)}
                locked={!hasProcurement}
                onLockedClick={() => { setUpgradeFeature('purchase_requests'); setShowUpgrade(true) }}
                sub
              />
            ))}
          </div>
        </CollapsibleSection>

      </nav>

      {/* ── Bottom: trial badge + user — pinned via flex column ───────────── */}
      <div className="mt-auto">

        {/* Trial / subscription banner */}
        {!loading && subscription && (
          <div className="px-3 pb-2">
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
                <i className="ti ti-clock text-[15px] shrink-0" />
                <span className="truncate">{t('billing.trialDaysLeft').replace('{n}', String(trialDaysLeft))}</span>
              </Link>
            ) : subscription.status === 'expired' || subscription.status === 'cancelled' ? (
              <Link
                href="/billing"
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium bg-red-500/15 text-red-300 border border-red-500/25 hover:bg-red-500/25 transition-colors"
              >
                <i className="ti ti-alert-triangle text-[15px] shrink-0" />
                <span>{t('billing.trialExpired')}</span>
              </Link>
            ) : null}
          </div>
        )}

        {/* User / Role */}
        <div className="px-4 py-4 border-t border-blue-800">
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

      </div>
    </aside>
    {showUpgrade && <UpgradePrompt feature={upgradeFeature} onClose={() => setShowUpgrade(false)} />}
    </>
  )
}
