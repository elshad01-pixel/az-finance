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
  if (sector === 'private_non_oil') {
    // Main workplace deduction: AZN 200 if gross ≤ 2,500
    const pitDeduction = isMainWorkplace && gross <= 2500 ? 200 : 0
    const taxable = Math.max(0, gross - pitDeduction)

    // PIT — progressive (private sector)
    let pit: number
    if (taxable <= 2500)       pit = taxable * 0.03
    else if (taxable <= 8000)  pit = 75  + (taxable - 2500) * 0.10
    else                       pit = 625 + (taxable - 8000) * 0.14

    // Employee social insurance
    const empSocial = gross <= 200
      ? gross * 0.03
      : 6 + (gross - 200) * 0.10

    // Employee health insurance
    const empHealth = gross <= 2500
      ? gross * 0.02
      : 50 + (gross - 2500) * 0.005

    // Employee unemployment insurance
    const empUnemployment = gross * 0.005

    const totalEmpDeductions = pit + empSocial + empHealth + empUnemployment
    const netSalary          = gross - totalEmpDeductions

    // Employer social insurance
    const emplrSocial = gross <= 200
      ? gross * 0.22
      : 44 + (gross - 200) * 0.15

    // Employer health insurance (same rate as employee)
    const emplrHealth        = empHealth
    const emplrUnemployment  = gross * 0.005
    const totalEmployerCost  = gross + emplrSocial + emplrHealth + emplrUnemployment

    return {
      gross, pitDeduction, pit, empSocial, empHealth, empUnemployment,
      totalEmpDeductions, netSalary,
      emplrSocial, emplrHealth, emplrUnemployment, totalEmployerCost,
    }
  }

  // ── Oil/gas & public sector ────────────────────────────────────────────
  const pitDeduction = 0

  // PIT — progressive (oil/gas)
  const pit = gross <= 2500
    ? gross * 0.14
    : 350 + (gross - 2500) * 0.25

  const empSocial      = gross * 0.03
  const empHealth      = 0
  const empUnemployment = 0

  const totalEmpDeductions = pit + empSocial
  const netSalary          = gross - totalEmpDeductions

  const emplrSocial        = gross * 0.22
  const emplrHealth        = 0
  const emplrUnemployment  = 0
  const totalEmployerCost  = gross + emplrSocial

  return {
    gross, pitDeduction, pit, empSocial, empHealth, empUnemployment,
    totalEmpDeductions, netSalary,
    emplrSocial, emplrHealth, emplrUnemployment, totalEmployerCost,
  }
}
