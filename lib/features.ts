export type Package = 'light' | 'mid' | 'enterprise'
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled'

const LIGHT: readonly string[] = [
  'dashboard', 'invoices', 'expenses', 'clients', 'vendors',
  'reports', 'tax', 'payroll', 'company_settings', 'billing',
]

const MID: readonly string[] = [
  ...LIGHT,
  'purchase_requests', 'purchase_orders', 'goods_receipt', 'inventory_basic',
]

const ENTERPRISE: readonly string[] = [
  ...MID,
  'vendor_portal', 'inventory_advanced', 'multi_company', 'api_access',
]

export const PACKAGE_FEATURES: Record<Package, readonly string[]> = {
  light:      LIGHT,
  mid:        MID,
  enterprise: ENTERPRISE,
}

export const PACKAGE_LABELS: Record<Package, string> = {
  light:      'Light',
  mid:        'Mid',
  enterprise: 'Enterprise',
}

export const PACKAGE_PRICES_AZN: Record<Package, number> = {
  light:      29,
  mid:        79,
  enterprise: 199,
}

export const PACKAGE_COLORS: Record<Package, { bg: string; text: string; border: string }> = {
  light:      { bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-200' },
  mid:        { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200' },
  enterprise: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
}

// Which package is the minimum required to access a feature
export function requiredPackage(feature: string): Package {
  if (ENTERPRISE.includes(feature) && !MID.includes(feature)) return 'enterprise'
  if (MID.includes(feature) && !LIGHT.includes(feature)) return 'mid'
  return 'light'
}

// During trial: access to mid features (as per product spec)
export function resolveFeatureSet(
  pkg: Package,
  status: SubscriptionStatus,
  isTrialActive: boolean,
): readonly string[] {
  if (status === 'expired' || status === 'cancelled') return PACKAGE_FEATURES.light
  if (isTrialActive) return PACKAGE_FEATURES.mid
  return PACKAGE_FEATURES[pkg]
}
