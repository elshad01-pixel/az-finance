export type PayrollSector = 'private_non_oil' | 'oil_gas_public'

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
