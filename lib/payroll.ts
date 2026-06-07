export type PayrollSector = 'private_non_oil' | 'oil_gas_public'

export interface GrossBreakdown {
  workingDaysPay:     number
  vacationMethodA:    number
  vacationMethodB:    number
  vacationPay:        number
  vacationMethodUsed: 'A' | 'B' | 'floor'
  overtimePay:        number
  gross:              number
  hasLimitedHistory:  boolean
}

// Azerbaijan Labour Code vacation pay rules:
//   Method A: (base × 12 / 365) × vacation_days  — annual-average daily rate
//   Method B: (base / 30) × vacation_days          — calendar-day rate
//   Floor:    (base / wd)  × vacation_days          — working-day rate
//
// Use the highest of the three. The floor is required because Methods A and B
// use calendar-day denominators (365/30) which are always larger than the number
// of working days in a month (~22), so they can produce a rate below the
// employee's normal working-day rate — vacation must never cost the employee money.
//
// Sick days are paid by DSMF — excluded from employer gross.
export function calcGross(
  base:           number,
  vacationDays:   number,
  overtimeHours:  number,
  bonus:          number,
  otherAdd:       number,
  otherDed:       number,
  wd:             number,   // working days in the payroll month
  hasFullHistory: boolean,  // true = employee has 12+ months on record
): GrossBreakdown {
  const safeVac        = Math.min(Math.max(0, vacationDays), wd)
  const daysWorked     = Math.max(0, wd - safeVac)
  const workingDaysPay = wd > 0 ? (base / wd) * daysWorked : 0

  const vacationMethodA = (base * 12 / 365) * safeVac
  const vacationMethodB = (base / 30) * safeVac
  // Floor: vacation must pay at least the same as working those days would have
  const vacationFloor   = wd > 0 ? (base / wd) * safeVac : 0

  let vacationPay: number
  let vacationMethodUsed: 'A' | 'B' | 'floor'
  if (safeVac === 0) {
    vacationPay = 0
    vacationMethodUsed = 'B'
  } else if (vacationMethodA >= vacationMethodB && vacationMethodA >= vacationFloor) {
    vacationPay = vacationMethodA
    vacationMethodUsed = 'A'
  } else if (vacationMethodB >= vacationFloor) {
    vacationPay = vacationMethodB
    vacationMethodUsed = 'B'
  } else {
    vacationPay = vacationFloor
    vacationMethodUsed = 'floor'
  }

  const hourlyRate  = wd > 0 ? base / (wd * 8) : 0
  const overtimePay = hourlyRate * 1.5 * Math.max(0, overtimeHours)

  const gross = Math.max(0, workingDaysPay + vacationPay + overtimePay + bonus + otherAdd - otherDed)

  return {
    workingDaysPay, vacationMethodA, vacationMethodB,
    vacationPay, vacationMethodUsed, overtimePay,
    gross, hasLimitedHistory: !hasFullHistory,
  }
}

export interface PayrollResult {
  gross:              number
  pitDeduction:       number
  pit:                number
  empSocial:          number
  empHealth:          number
  empUnemployment:    number
  totalEmpDeductions: number
  netSalary:          number
  emplrSocial:        number
  emplrHealth:        number
  emplrUnemployment:  number
  totalEmployerCost:  number
}

export function calcPayroll(
  gross: number,
  sector: PayrollSector,
  isMainWorkplace: boolean,  // unused in 2026 private_non_oil (Art.102 replaced by new brackets)
): PayrollResult {
  const r2 = (n: number) => Math.round(n * 100) / 100

  if (sector === 'private_non_oil') {
    // ── PIT 2026 (VM Art.101) — new progressive brackets, Art.102 deduction abolished ──
    // 0–2,500: 3%   |   2,501–8,000: ₼75 + 10%   |   8,001+: ₼625 + 14%
    const pitDeduction = 0  // Art.102 200 AZN exemption replaced by the new bracket structure
    let pit: number
    if (gross <= 2500) {
      pit = r2(gross * 0.03)
    } else if (gross <= 8000) {
      pit = r2(75 + (gross - 2500) * 0.10)
    } else {
      pit = r2(625 + (gross - 8000) * 0.14)
    }

    // Health 2026: 2% on gross ≤ 2,500 + 0.5% on gross > 2,500 (threshold unverified for 2026 — keeping 2,500)
    const health = (g: number) => r2(Math.min(g, 2500) * 0.02 + Math.max(0, g - 2500) * 0.005)

    // ── Social Insurance 2026 — new tiered rates + 80% state subsidy (2026–2028) ──
    // Employee: first 200 AZN @ 3%, remainder @ 10% — FULL amount, NO subsidy
    // Employer: first 200 AZN @ 22%, remainder @ 15% — state covers 80%, employer pays 20%
    const empSocial   = r2(Math.min(gross, 200) * 0.03 + Math.max(0, gross - 200) * 0.10)
    const emplrSocial = r2((Math.min(gross, 200) * 0.22 + Math.max(0, gross - 200) * 0.15) * 0.20)

    const empHealth       = health(gross)
    const empUnemployment = r2(gross * 0.005)

    const totalEmpDeductions = r2(pit + empSocial + empHealth + empUnemployment)
    const netSalary          = r2(gross - totalEmpDeductions)

    const emplrHealth       = empHealth
    const emplrUnemployment = r2(gross * 0.005)
    const totalEmployerCost = r2(gross + emplrSocial + emplrHealth + emplrUnemployment)

    return {
      gross, pitDeduction, pit, empSocial, empHealth, empUnemployment,
      totalEmpDeductions, netSalary,
      emplrSocial, emplrHealth, emplrUnemployment, totalEmployerCost,
    }
  }

  // ── Oil/gas & public sector — rates unchanged for 2026 ────────────────
  const pitDeduction = 0
  const taxable = gross

  const pit = taxable <= 8000
    ? r2(taxable * 0.14)
    : r2(1120 + (taxable - 8000) * 0.25)

  const empSocial       = r2(gross * 0.03)
  const empHealth       = 0
  const empUnemployment = 0

  const totalEmpDeductions = r2(pit + empSocial)
  const netSalary          = r2(gross - totalEmpDeductions)

  const emplrSocial      = r2(gross * 0.22)
  const emplrHealth      = 0
  const emplrUnemployment = 0
  const totalEmployerCost = r2(gross + emplrSocial)

  return {
    gross, pitDeduction, pit, empSocial, empHealth, empUnemployment,
    totalEmpDeductions, netSalary,
    emplrSocial, emplrHealth, emplrUnemployment, totalEmployerCost,
  }
}
