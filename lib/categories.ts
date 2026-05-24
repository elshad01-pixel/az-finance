export type MainCategory =
  | 'Office'
  | 'Utilities'
  | 'Salaries'
  | 'Transport'
  | 'Marketing'
  | 'Professional Services'
  | 'Bank & Finance'
  | 'Other'
  | 'COGS'
  | 'Depreciation'

export type Frequency = 'monthly' | 'quarterly' | 'annual'

export const CATEGORY_MAP: Record<MainCategory, readonly string[]> = {
  'Office':                ['Rent', 'Supplies', 'Equipment', 'Repairs'],
  'Utilities':             ['Internet', 'Electricity', 'Water', 'Gas', 'Phone'],
  'Salaries':              ['Full-time Staff', 'Part-time Staff', 'Contractors', 'Bonuses'],
  'Transport':             ['Fuel', 'Taxi/Uber', 'Parking', 'Vehicle Maintenance'],
  'Marketing':             ['Online Ads', 'Events', 'Printed Materials', 'Website'],
  'Professional Services': ['Legal', 'Accounting', 'Consulting', 'Training'],
  'Bank & Finance':        ['Bank Fees', 'Loan Interest', 'Currency Exchange'],
  'Other':                 ['Miscellaneous'],
  'COGS':                  ['Cost of Goods Sold', 'Raw Materials', 'Freight In'],
  'Depreciation':          ['Equipment', 'Vehicles', 'Buildings', 'Intangibles'],
}

export const MAIN_CATEGORIES = Object.keys(CATEGORY_MAP) as MainCategory[]

export const CATEGORY_STYLES: Record<MainCategory, string> = {
  'Office':                'bg-blue-100   text-blue-700',
  'Utilities':             'bg-amber-100  text-amber-700',
  'Salaries':              'bg-purple-100 text-purple-700',
  'Transport':             'bg-orange-100 text-orange-700',
  'Marketing':             'bg-pink-100   text-pink-700',
  'Professional Services': 'bg-teal-100   text-teal-700',
  'Bank & Finance':        'bg-indigo-100 text-indigo-700',
  'Other':                 'bg-gray-100   text-gray-600',
  'COGS':                  'bg-red-100    text-red-700',
  'Depreciation':          'bg-slate-100  text-slate-700',
}

export const CATEGORY_DOT: Record<MainCategory, string> = {
  'Office':                'bg-blue-400',
  'Utilities':             'bg-amber-400',
  'Salaries':              'bg-purple-400',
  'Transport':             'bg-orange-400',
  'Marketing':             'bg-pink-400',
  'Professional Services': 'bg-teal-400',
  'Bank & Finance':        'bg-indigo-400',
  'Other':                 'bg-gray-400',
  'COGS':                  'bg-red-400',
  'Depreciation':          'bg-slate-400',
}

// Maps English display name → i18n key (use with 'as TranslationKey' in components)
export const CATEGORY_I18N: Record<string, string> = {
  'Office':                'cat.Office',
  'Utilities':             'cat.Utilities',
  'Salaries':              'cat.Salaries',
  'Transport':             'cat.Transport',
  'Marketing':             'cat.Marketing',
  'Professional Services': 'cat.ProfessionalServices',
  'Bank & Finance':        'cat.BankFinance',
  'Other':                 'cat.Other',
  'COGS':                  'cat.COGS',
  'Depreciation':          'cat.Depreciation',
}

export const SUBCATEGORY_I18N: Record<string, string> = {
  'Rent':                 'sub.Rent',
  'Supplies':             'sub.Supplies',
  'Equipment':            'sub.Equipment',
  'Repairs':              'sub.Repairs',
  'Internet':             'sub.Internet',
  'Electricity':          'sub.Electricity',
  'Water':                'sub.Water',
  'Gas':                  'sub.Gas',
  'Phone':                'sub.Phone',
  'Full-time Staff':      'sub.FullTimeStaff',
  'Part-time Staff':      'sub.PartTimeStaff',
  'Contractors':          'sub.Contractors',
  'Bonuses':              'sub.Bonuses',
  'Fuel':                 'sub.Fuel',
  'Taxi/Uber':            'sub.TaxiUber',
  'Parking':              'sub.Parking',
  'Vehicle Maintenance':  'sub.VehicleMaintenance',
  'Online Ads':           'sub.OnlineAds',
  'Events':               'sub.Events',
  'Printed Materials':    'sub.PrintedMaterials',
  'Website':              'sub.Website',
  'Legal':                'sub.Legal',
  'Accounting':           'sub.Accounting',
  'Consulting':           'sub.Consulting',
  'Training':             'sub.Training',
  'Bank Fees':            'sub.BankFees',
  'Loan Interest':        'sub.LoanInterest',
  'Currency Exchange':    'sub.CurrencyExchange',
  'Miscellaneous':        'sub.Miscellaneous',
}

export const FREQUENCY_I18N: Record<Frequency, string> = {
  monthly:   'exp.monthly',
  quarterly: 'exp.quarterly',
  annual:    'exp.annual',
}

export function calcNextDue(fromDate: string, freq: Frequency): string {
  const d = new Date(fromDate + 'T12:00:00')
  if (freq === 'monthly') {
    d.setDate(1)
    d.setMonth(d.getMonth() + 1)
  } else if (freq === 'quarterly') {
    d.setMonth(d.getMonth() + 3)
    d.setMonth(Math.floor(d.getMonth() / 3) * 3)
    d.setDate(1)
  } else {
    d.setFullYear(d.getFullYear() + 1)
  }
  const y   = d.getFullYear()
  const mon = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mon}-${day}`
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
