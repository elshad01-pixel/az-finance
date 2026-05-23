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
  isMainWorkplace: boolean,
): PayrollResult {
  const r2 = (n: number) => Math.round(n * 100) / 100

  if (sector === 'private_non_oil') {
    // Art. 102 Vergi Məcəlləsi: 200 AZN aylıq güzəşt — əsas iş yeri, gross ≤ 2,500
    const pitDeduction = isMainWorkplace && gross <= 2500 ? 200 : 0
    const taxable = Math.max(0, gross - pitDeduction)

    // PIT — Azerbaijan law: 14% up to 8,000 AZN; 25% on excess
    const pit = taxable <= 8000
      ? r2(taxable * 0.14)
      : r2(1120 + (taxable - 8000) * 0.25)

    // Employee: SI 3%, HI 0.5%, UI 0.5%
    const empSocial       = r2(gross * 0.03)
    const empHealth       = r2(gross * 0.005)
    const empUnemployment = r2(gross * 0.005)

    const totalEmpDeductions = r2(pit + empSocial + empHealth + empUnemployment)
    const netSalary          = r2(gross - totalEmpDeductions)

    // Employer: SI 22%, HI 0.5% — no employer UI in Azerbaijan
    const emplrSocial      = r2(gross * 0.22)
    const emplrHealth      = r2(gross * 0.005)
    const emplrUnemployment = 0
    const totalEmployerCost = r2(gross + emplrSocial + emplrHealth)

    return {
      gross, pitDeduction, pit, empSocial, empHealth, empUnemployment,
      totalEmpDeductions, netSalary,
      emplrSocial, emplrHealth, emplrUnemployment, totalEmployerCost,
    }
  }

  // ── Oil/gas & public sector ────────────────────────────────────────────
  // No monthly deduction, no health/unemployment insurance for employee
  const pitDeduction = 0
  const taxable = gross

  // PIT — same progressive brackets as private sector
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
