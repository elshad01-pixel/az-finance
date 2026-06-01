'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import { useCompany } from '@/lib/CompanyContext'
import { logActivity } from '@/lib/activity'
import { calcPayroll, calcGross, type PayrollSector, type GrossBreakdown, type PayrollResult } from '@/lib/payroll'
import type { TranslationKey } from '@/lib/i18n'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Types ──────────────────────────────────────────────────────────────────────

type EmploymentType = 'full-time' | 'part-time' | 'contractor'
type EmployeeStatus = 'active' | 'inactive'
type RunStatus      = 'draft' | 'approved'
type TabKey         = 'employees' | 'run' | 'history'

interface Employee {
  id:                number
  full_name:         string
  position:          string
  gross_salary:      number
  employment_type:   EmploymentType
  status:            EmployeeStatus
  start_date:        string
  is_main_workplace: boolean
  payroll_sector:    PayrollSector
}

interface PayrollRun {
  id:          number
  month:       number
  year:        number
  status:      RunStatus
  approved_at: string | null
  expense_id:  number | null
  created_at:  string
}

interface PayrollEntry {
  id:                   number
  run_id:               number
  employee_id:          number
  base_salary:          number
  vacation_days:        number
  sick_days:            number
  overtime_hours:       number
  bonus:                number
  other_additions:      number
  other_deductions:     number
  adjusted_gross:       number
  pit_deduction:        number
  pit:                  number
  emp_social:           number
  emp_health:           number
  emp_unemployment:     number
  total_emp_deductions: number
  net_salary:           number
  emplr_social:         number
  emplr_health:         number
  emplr_unemployment:   number
  total_employer_cost:  number
  payroll_sector:       PayrollSector
  is_main_workplace:    boolean
  avans_amount:         number
  avans_paid:           boolean
  avans_paid_at:        string | null
}

interface EntryForm {
  vacation_days:    string
  sick_days:        string
  overtime_hours:   string
  bonus:            string
  other_additions:  string
  other_deductions: string
  avans:            string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const EMPLOYMENT_TYPE_STYLES: Record<EmploymentType, string> = {
  'full-time':  'bg-blue-100   text-blue-700',
  'part-time':  'bg-purple-100 text-purple-700',
  'contractor': 'bg-amber-100  text-amber-700',
}
const SECTOR_STYLES: Record<PayrollSector, string> = {
  'private_non_oil': 'bg-green-100  text-green-700',
  'oil_gas_public':  'bg-orange-100 text-orange-700',
}

const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_AZ = ['Yanvar','Fevral','Mart','Aprel','May','İyun','İyul','Avqust','Sentyabr','Oktyabr','Noyabr','Dekabr']

const EMPTY_EMP_FORM = {
  full_name: '', position: '', gross_salary: '',
  employment_type: 'full-time' as EmploymentType,
  status: 'active' as EmployeeStatus,
  start_date: '', is_main_workplace: true,
  payroll_sector: 'private_non_oil' as PayrollSector,
}

const EMPTY_FORM = (): EntryForm => ({
  vacation_days: '0', sick_days: '0', overtime_hours: '0',
  bonus: '0', other_additions: '0', other_deductions: '0', avans: '0',
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function n2(n: number) {
  if (n === 0) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function num(s: string) { return Math.max(0, parseFloat(s) || 0) }

// Azerbaijan public holidays (month, day) — fixed-date only
// Transfers for weekend holidays are handled via the manual adjustment feature
const AZ_HOLIDAYS: Array<[number, number]> = [
  [1,  1], [1,  2],                                     // New Year
  [1, 20],                                              // Martyrs' Day
  [3,  8],                                              // Women's Day
  [3, 20], [3, 21], [3, 22], [3, 23], [3, 24],         // Novruz (5 days)
  [5,  9],                                              // Victory Day
  [5, 28],                                              // Republic Day
  [6, 15],                                              // National Salvation Day
  [6, 26],                                              // Armed Forces Day
  [10, 18],                                             // Independence Day
  [11,  8],                                             // Victory Day 2020
  [11, 12],                                             // Constitution Day
  [11, 17],                                             // National Revival Day
  [12, 31],                                             // New Year's Eve
]

function workingDaysInMonth(year: number, month: number): number {
  const holidays = new Set(
    AZ_HOLIDAYS.filter(([m]) => m === month).map(([, d]) => d)
  )
  let count = 0
  const last = new Date(year, month, 0).getDate()
  for (let d = 1; d <= last; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    if (dow !== 0 && dow !== 6 && !holidays.has(d)) count++
  }
  return count
}

function monthsSinceStart(startDate: string, year: number, month: number): number {
  if (!startDate) return 0
  const start = new Date(startDate)
  return Math.max(0, (year - start.getFullYear()) * 12 + (month - 1) - start.getMonth())
}

function buildEntryPayload(emp: Employee, form: EntryForm, runId: number, wd: number, year: number, month: number) {
  const f   = { vac: num(form.vacation_days), sick: num(form.sick_days), ot: num(form.overtime_hours), bonus: num(form.bonus), add: num(form.other_additions), ded: num(form.other_deductions) }
  const ms  = monthsSinceStart(emp.start_date, year, month)
  const { gross: adj } = calcGross(emp.gross_salary, f.vac, f.ot, f.bonus, f.add, f.ded, wd, ms >= 12)
  const tax = calcPayroll(adj, emp.payroll_sector, emp.is_main_workplace)
  return {
    run_id: runId, employee_id: emp.id,
    base_salary: emp.gross_salary,
    vacation_days: f.vac, sick_days: f.sick, overtime_hours: f.ot,
    bonus: f.bonus, other_additions: f.add, other_deductions: f.ded,
    adjusted_gross:       tax.gross,
    pit_deduction:        tax.pitDeduction,
    pit:                  tax.pit,
    emp_social:           tax.empSocial,
    emp_health:           tax.empHealth,
    emp_unemployment:     tax.empUnemployment,
    total_emp_deductions: tax.totalEmpDeductions,
    net_salary:           tax.netSalary,
    emplr_social:         tax.emplrSocial,
    emplr_health:         tax.emplrHealth,
    emplr_unemployment:   tax.emplrUnemployment,
    total_employer_cost:  tax.totalEmployerCost,
    payroll_sector:       emp.payroll_sector,
    is_main_workplace:    emp.is_main_workplace,
    avans_amount:         num(form.avans),
    // avans_paid / avans_paid_at are NOT included — DB defaults on insert,
    // and upsert will not overwrite them since they're absent from the payload.
  }
}

// ── PDF helpers ────────────────────────────────────────────────────────────────

function fmtPdf(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function loadRoboto(): Promise<{ reg: string; bold: string }> {
  function bufToB64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf)
    const chunks: string[] = []
    for (let i = 0; i < bytes.byteLength; i += 0x8000)
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)))
    return btoa(chunks.join(''))
  }
  const [reg, bold] = await Promise.all([
    fetch('/fonts/Roboto-Regular.ttf').then(r => r.arrayBuffer()).then(bufToB64),
    fetch('/fonts/Roboto-Bold.ttf').then(r => r.arrayBuffer()).then(bufToB64),
  ])
  return { reg, bold }
}

function registerRoboto(doc: jsPDF, reg: string, bold: string) {
  doc.addFileToVFS('Roboto-Regular.ttf', reg)
  doc.addFileToVFS('Roboto-Bold.ttf',    bold)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFont('Roboto-Bold.ttf',    'Roboto', 'bold')
  doc.setFont('Roboto', 'normal')
}

async function generatePayslipPDF(
  entry: PayrollEntry, emp: Employee,
  month: number, monthName: string, year: number, lang: string,
  company: { company_name: string; tax_id: string } | null,
  mode: 'download' | 'base64' = 'download',
): Promise<string | void> {
  const fonts = await loadRoboto()
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' })
  registerRoboto(doc, fonts.reg, fonts.bold)

  const blue  = [30, 64, 175]  as [number,number,number]
  const green = [21, 128, 61]  as [number,number,number]
  const red   = [220, 38, 38]  as [number,number,number]
  const gray  = [107, 114, 128] as [number,number,number]
  const W = 210
  const M = 14  // left/right margin

  // ── Header band ───────────────────────────────────────────────────────────
  const HEADER_H = 46
  doc.setFillColor(...blue)
  doc.rect(0, 0, W, HEADER_H, 'F')

  // Logo
  doc.setFontSize(22)
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Az', M, 20)
  const azW = doc.getTextWidth('Az')
  doc.setTextColor(147, 197, 253)
  doc.text('Finance', M + azW, 20)

  // Company name + VÖEN below logo
  doc.setFontSize(8)
  doc.setFont('Roboto', 'normal')
  doc.setTextColor(147, 197, 253)
  if (company?.company_name) {
    doc.text(company.company_name, M, 28)
    if (company.tax_id) doc.text(`VÖEN: ${company.tax_id}`, M, 34)
  }

  // Title right
  doc.setFontSize(12)
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(lang === 'az' ? 'MAAŞ VƏRƏQƏSİ' : 'PAYSLIP', W - M, 18, { align: 'right' })
  doc.setFontSize(9)
  doc.setFont('Roboto', 'normal')
  doc.setTextColor(147, 197, 253)
  doc.text(`${monthName} ${year}`, W - M, 25, { align: 'right' })

  // ── Employee info band ────────────────────────────────────────────────────
  doc.setFillColor(248, 250, 252)
  doc.rect(0, HEADER_H, W, 30, 'F')

  doc.setFontSize(13)
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(17, 24, 39)
  doc.text(emp.full_name, M, HEADER_H + 12)

  doc.setFontSize(9)
  doc.setFont('Roboto', 'normal')
  doc.setTextColor(...gray)
  doc.text(emp.position, M, HEADER_H + 20)
  doc.text(
    emp.payroll_sector === 'private_non_oil'
      ? (lang === 'az' ? 'Özəl Sektor' : 'Private Sector')
      : (lang === 'az' ? 'Neft/Dövlət Sektoru' : 'Oil/Gas & Public'),
    M, HEADER_H + 27,
  )

  // ── Helpers ───────────────────────────────────────────────────────────────
  const row = (label: string, value: string, y: number, bold = false, color?: [number,number,number]) => {
    doc.setFont('Roboto', bold ? 'bold' : 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...(color ?? ([33, 33, 33] as [number,number,number])))
    doc.text(label, M, y)
    doc.text(value, W - M, y, { align: 'right' })
  }
  const section = (title: string, y: number) => {
    doc.setFillColor(243, 244, 246)
    doc.rect(10, y - 5, W - 20, 7, 'F')
    doc.setFont('Roboto', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...blue)
    doc.text(title.toUpperCase(), M, y)
    return y + 6
  }
  const hline = (y: number) => {
    doc.setDrawColor(229, 231, 235)
    doc.line(10, y, W - 10, y)
  }
  const highlight = (y: number, fillRgb: [number,number,number], textRgb: [number,number,number], label: string, value: string) => {
    doc.setFillColor(...fillRgb)
    doc.rect(10, y - 5, W - 20, 10, 'F')
    doc.setFont('Roboto', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...textRgb)
    doc.text(label, M, y + 1)
    doc.text(value, W - M, y + 1, { align: 'right' })
    return y + 14
  }

  // ── Content ───────────────────────────────────────────────────────────────
  let y = HEADER_H + 36

  // Earnings — recompute breakdown from stored entry data for correct display
  const wd = workingDaysInMonth(year, month)
  const ms = monthsSinceStart(emp.start_date, year, month)
  const bd = calcGross(
    entry.base_salary, entry.vacation_days, entry.overtime_hours,
    entry.bonus, entry.other_additions, entry.other_deductions,
    wd, ms >= 12,
  )

  y = section(lang === 'az' ? 'GƏLİRLƏR' : 'EARNINGS', y)
  if (entry.vacation_days > 0) {
    row(lang === 'az' ? 'İş Günü Maaşı' : 'Working Days Pay', `₼ ${fmtPdf(bd.workingDaysPay)}`, y); y += 7
    const mLabel = bd.vacationMethodUsed === 'floor' ? (lang === 'az' ? 'iş nisbəti' : 'wd rate') : `Metod ${bd.vacationMethodUsed}`
    row(
      lang === 'az' ? `Məzuniyyət Ödənişi (${mLabel})` : `Vacation Pay (${mLabel})`,
      `₼ ${fmtPdf(bd.vacationPay)}`, y, false, [22, 163, 74] as [number,number,number]
    ); y += 7
  } else {
    row(lang === 'az' ? 'Əsas Maaş' : 'Base Salary', `₼ ${fmtPdf(entry.base_salary)}`, y); y += 7
  }
  if (entry.sick_days > 0) {
    row(
      lang === 'az' ? `Xəstəlik (${entry.sick_days} gün) — DSMF` : `Sick Leave (${entry.sick_days} days) — SSF`,
      lang === 'az' ? 'SSF ödəyir' : 'Paid by SSF', y, false, gray
    ); y += 7
  }
  if (entry.overtime_hours > 0) {
    row(lang === 'az' ? 'İşdənkənar Vaxt (1.5×)' : 'Overtime Pay (1.5×)', `+ ₼ ${fmtPdf(bd.overtimePay)}`, y, false, [22, 163, 74] as [number,number,number]); y += 7
  }
  if (entry.bonus > 0) {
    row(lang === 'az' ? 'Bonus' : 'Bonus', `+ ₼ ${fmtPdf(entry.bonus)}`, y, false, [22, 163, 74] as [number,number,number]); y += 7
  }
  if (entry.other_additions > 0) {
    row(lang === 'az' ? 'Digər Əlavələr' : 'Other Additions', `+ ₼ ${fmtPdf(entry.other_additions)}`, y, false, [22, 163, 74] as [number,number,number]); y += 7
  }
  if (entry.other_deductions > 0) {
    row(lang === 'az' ? 'Digər Tutulmalar' : 'Other Deductions', `- ₼ ${fmtPdf(entry.other_deductions)}`, y, false, red); y += 7
  }
  hline(y); y += 4
  row(lang === 'az' ? 'DÜZƏLDİLMİŞ BRÜT' : 'ADJUSTED GROSS', `₼ ${fmtPdf(entry.adjusted_gross)}`, y, true, blue); y += 10

  // Deductions
  y = section(lang === 'az' ? 'TUTULMALAR' : 'DEDUCTIONS', y); y += 2
  if (entry.pit_deduction > 0) { row(lang === 'az' ? 'GV Güzəşti (azad)' : 'PIT Exemption', `₼ ${fmtPdf(entry.pit_deduction)}`, y, false, gray); y += 7 }
  row(lang === 'az' ? 'Gəlir Vergisi (GV)' : 'Income Tax (PIT)', `- ₼ ${fmtPdf(entry.pit)}`, y, false, red); y += 7
  row(lang === 'az' ? 'Sosial Sığorta (İşçi)' : 'Social Insurance (Employee)', `- ₼ ${fmtPdf(entry.emp_social)}`, y, false, red); y += 7
  if (entry.emp_health > 0) { row(lang === 'az' ? 'Tibbi İcbari Sığorta (İşçi)' : 'Medical Insurance (Employee)', `- ₼ ${fmtPdf(entry.emp_health)}`, y, false, red); y += 7 }
  if (entry.emp_unemployment > 0) { row(lang === 'az' ? 'İşsizlik Sığortası (İşçi)' : 'Unemployment Ins. (Employee)', `- ₼ ${fmtPdf(entry.emp_unemployment)}`, y, false, red); y += 7 }
  hline(y); y += 4
  row(lang === 'az' ? 'CƏMİ TUTULMALAR' : 'TOTAL DEDUCTIONS', `- ₼ ${fmtPdf(entry.total_emp_deductions)}`, y, true, red); y += 8

  // Net salary
  y = highlight(y, [220, 252, 231], green, lang === 'az' ? 'XALİS MAAŞ' : 'NET SALARY', `₼ ${fmtPdf(entry.net_salary)}`)

  // Avans
  if (entry.avans_amount > 0) {
    y = section(lang === 'az' ? 'AVANS' : 'ADVANCE PAYMENT', y); y += 2
    row(lang === 'az' ? 'Avans' : 'Advance', `- ₼ ${fmtPdf(entry.avans_amount)}`, y, false, red); y += 7
    if (entry.avans_paid_at) {
      doc.setFontSize(8)
      doc.setFont('Roboto', 'normal')
      doc.setTextColor(...gray)
      doc.text(
        `${lang === 'az' ? 'Avans ödəniş tarixi' : 'Advance paid on'}: ` +
        new Intl.DateTimeFormat('az-AZ').format(new Date(entry.avans_paid_at)),
        M, y
      ); y += 7
    }
    hline(y); y += 4
    y = highlight(y, [219, 234, 254], blue, lang === 'az' ? 'ÖDƏNİLƏCƏK MƏBLƏĞ' : 'FINAL PAYMENT', `₼ ${fmtPdf(entry.net_salary - entry.avans_amount)}`)
  }

  // Employer costs
  y = section(lang === 'az' ? 'İŞƏGÖTÜRƏN XƏRCLƏRİ' : 'EMPLOYER COSTS', y); y += 2
  row(lang === 'az' ? 'Sosial Sığorta (İşv.)' : 'Social Insurance (Employer)', `₼ ${fmtPdf(entry.emplr_social)}`, y); y += 7
  if (entry.emplr_health > 0) { row(lang === 'az' ? 'Tibbi İcbari Sığorta (İşv.)' : 'Medical Insurance (Employer)', `₼ ${fmtPdf(entry.emplr_health)}`, y); y += 7 }
  if (entry.emplr_unemployment > 0) { row(lang === 'az' ? 'İşsizlik Sığortası (İşv.)' : 'Unemployment Ins. (Employer)', `₼ ${fmtPdf(entry.emplr_unemployment)}`, y); y += 7 }
  hline(y); y += 4
  row(lang === 'az' ? 'ÜMUMİ İŞƏGÖTÜRƏN XƏRCİ' : 'TOTAL EMPLOYER COST', `₼ ${fmtPdf(entry.total_employer_cost)}`, y, true, [234, 88, 12] as [number,number,number]); y += 12

  // Footer
  hline(275)
  doc.setFontSize(7)
  doc.setFont('Roboto', 'normal')
  doc.setTextColor(...gray)
  doc.text('AzFinance · ' + new Intl.DateTimeFormat('az-AZ').format(new Date()), M, 280)
  doc.text(`${lang === 'az' ? 'Dövr' : 'Period'}: ${monthName} ${year}`, W - M, 280, { align: 'right' })

  if (mode === 'base64') {
    return doc.output('datauristring').split(',')[1]
  }
  doc.save(`payslip_${emp.full_name.replace(/\s+/g, '_')}_${year}_${String(month).padStart(2, '0')}.pdf`)
}

async function generateRunPDF(
  entries: PayrollEntry[], empMap: Map<number, Employee>,
  monthName: string, year: number, lang: string,
) {
  const fonts = await loadRoboto()
  const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  registerRoboto(doc, fonts.reg, fonts.bold)
  const blue = [30, 64, 175] as [number,number,number]

  doc.setFillColor(...blue)
  doc.rect(0, 0, 297, 20, 'F')
  doc.setFontSize(14)
  doc.setFont('Roboto', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Az', 10, 13)
  const azW = doc.getTextWidth('Az')
  doc.setTextColor(147, 197, 253)
  doc.text('Finance', 10 + azW, 13)
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text((lang === 'az' ? 'Əmək Haqqı Hesabatı' : 'Payroll Report') + ` — ${monthName} ${year}`, 80, 13)

  const totals = entries.reduce((a, e) => ({
    gross:    a.gross    + e.adjusted_gross,
    pit:      a.pit      + e.pit,
    ded:      a.ded      + e.total_emp_deductions,
    net:      a.net      + e.net_salary,
    cost:     a.cost     + e.total_employer_cost,
    avans:    a.avans    + e.avans_amount,
    finalPay: a.finalPay + (e.net_salary - e.avans_amount),
  }), { gross: 0, pit: 0, ded: 0, net: 0, cost: 0, avans: 0, finalPay: 0 })

  autoTable(doc, {
    startY: 28,
    head: [[
      lang==='az'?'Ad Soyad':'Employee',
      lang==='az'?'Vəzifə':'Position',
      lang==='az'?'Brüt':'Gross',
      lang==='az'?'GV Güzəşti':'PIT Ded.',
      'PIT',
      lang==='az'?'İşçi Sos.':'Emp. Soc.',
      lang==='az'?'İşçi Səh.':'Emp. Hlth.',
      lang==='az'?'İşçi İşs.':'Emp. Unemp.',
      lang==='az'?'Cəmi Tutulma':'Total Ded.',
      lang==='az'?'Ələ Keçən':'Net Salary',
      lang==='az'?'Avans':'Advance',
      lang==='az'?'Avans Tarixi':'Adv. Date',
      lang==='az'?'Ödəniləcək':'Final Pay',
      lang==='az'?'İşv. Sos.':'Empl. Soc.',
      lang==='az'?'İşv. Səh.':'Empl. Hlth.',
      lang==='az'?'İşv. İşs.':'Empl. Unemp.',
      lang==='az'?'Ümumi Xərc':'Total Cost',
    ]],
    body: [
      ...entries.map(e => {
        const emp = empMap.get(e.employee_id)
        const avansDate = e.avans_paid_at
          ? new Intl.DateTimeFormat('az-AZ').format(new Date(e.avans_paid_at))
          : '—'
        return [
          emp?.full_name ?? '',
          emp?.position  ?? '',
          fmtPdf(e.adjusted_gross),
          fmtPdf(e.pit_deduction),
          fmtPdf(e.pit),
          fmtPdf(e.emp_social),
          fmtPdf(e.emp_health),
          fmtPdf(e.emp_unemployment),
          fmtPdf(e.total_emp_deductions),
          fmtPdf(e.net_salary),
          e.avans_amount > 0 ? fmtPdf(e.avans_amount) : '—',
          avansDate,
          fmtPdf(e.net_salary - e.avans_amount),
          fmtPdf(e.emplr_social),
          fmtPdf(e.emplr_health),
          fmtPdf(e.emplr_unemployment),
          fmtPdf(e.total_employer_cost),
        ]
      }),
      [
        lang==='az'?'CƏMİ':'TOTAL', '',
        fmtPdf(totals.gross), '', fmtPdf(totals.pit), '', '', '',
        fmtPdf(totals.ded), fmtPdf(totals.net),
        fmtPdf(totals.avans), '',
        fmtPdf(totals.finalPay),
        '', '', '',
        fmtPdf(totals.cost),
      ],
    ],
    headStyles:  { fillColor: blue, fontSize: 6, halign: 'right' },
    bodyStyles:  { fontSize: 6, halign: 'right' },
    columnStyles: { 0: { halign: 'left' }, 1: { halign: 'left' }, 11: { halign: 'center' } },
    footStyles:  { fillColor: [243,244,246], fontStyle: 'bold', fontSize: 6 },
  })

  doc.save(`payroll_${year}_${String(entries[0]?.run_id ?? 0).padStart(2,'0')}.pdf`)
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PayrollClient() {
  const { t, lang } = useLanguage()
  const { company } = useCompany()
  const months = lang === 'az' ? MONTHS_AZ : MONTHS_EN
  const now    = new Date()

  // ── Shared data
  const [employees,       setEmployees]       = useState<Employee[]>([])
  const [loading,         setLoading]         = useState(true)
  const [companySettings, setCompanySettings] = useState<{ company_name: string; tax_id: string } | null>(null)

  // ── Tabs
  const [tab, setTab] = useState<TabKey>('employees')

  // ── Employee modal
  const [showEmpModal, setShowEmpModal] = useState(false)
  const [editingEmpId, setEditingEmpId] = useState<number | null>(null)
  const [empForm,      setEmpForm]      = useState(EMPTY_EMP_FORM)
  const [empSaving,    setEmpSaving]    = useState(false)

  // ── Payroll Run tab
  const [calcMonth,  setCalcMonth]  = useState(now.getMonth() + 1)
  const [calcYear,   setCalcYear]   = useState(now.getFullYear())
  const [currentRun, setCurrentRun] = useState<PayrollRun | null | undefined>(undefined) // undefined = not yet fetched
  const [entries,    setEntries]    = useState<PayrollEntry[]>([])
  const [editForms,  setEditForms]  = useState<Record<number, EntryForm>>({})
  const [runLoading, setRunLoading] = useState(false)
  const [runSaving,  setRunSaving]  = useState(false)

  // ── History tab
  const [history,     setHistory]     = useState<PayrollRun[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [histAvans,   setHistAvans]   = useState<Record<number, { total: number; paid: number }>>( {})

  // ── Working-days override
  const [wdAdjustment, setWdAdjustment] = useState(0)
  const [editingWd,    setEditingWd]    = useState(false)
  const [wdInput,      setWdInput]      = useState('0')
  const [wdSaving,     setWdSaving]     = useState(false)

  // ── Payslip email
  const [payslipEmailModal, setPayslipEmailModal] = useState<{ entry: PayrollEntry; emp: Employee } | null>(null)
  const [payslipEmailTo,    setPayslipEmailTo]    = useState('')
  const [payslipSending,    setPayslipSending]    = useState(false)

  // ── Toast
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleSendPayslip(e: React.FormEvent) {
    e.preventDefault()
    if (!payslipEmailModal) return
    const { entry, emp } = payslipEmailModal
    setPayslipSending(true)
    try {
      const pdfBase64 = await generatePayslipPDF(
        entry, emp, calcMonth, months[calcMonth - 1], calcYear, lang,
        companySettings, 'base64',
      ) as string
      const netStr = `₼ ${entry.net_salary.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      const res = await fetch('/api/email/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type: 'payslip',
          to:   payslipEmailTo.trim(),
          data: {
            employeeName: emp.full_name,
            monthName:    months[calcMonth - 1],
            year:         String(calcYear),
            netSalary:    netStr,
            companyName:  companySettings?.company_name ?? 'AzFinance',
          },
          attachmentBase64: pdfBase64,
        }),
      })
      const result = await res.json()
      showToast(result.ok ? `Sent to ${payslipEmailTo}` : (result.error ?? 'Send failed'), result.ok)
      if (result.ok) { setPayslipEmailModal(null); setPayslipEmailTo('') }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Send failed', false)
    } finally {
      setPayslipSending(false)
    }
  }

  // ── Fetch employees + company settings
  useEffect(() => {
    supabase.from('employees').select('*').order('full_name')
      .then(({ data }) => { setEmployees((data as Employee[]) ?? []); setLoading(false) })
    supabase.from('company_settings').select('company_name, tax_id').maybeSingle()
      .then(({ data }) => setCompanySettings(data as { company_name: string; tax_id: string } | null))
  }, [])

  // ── Fetch run when month/year or tab changes
  const loadRun = useCallback(async (month: number, year: number) => {
    setRunLoading(true)
    setCurrentRun(undefined)
    setEntries([])
    const { data: run } = await supabase
      .from('payroll_runs').select('*')
      .eq('month', month).eq('year', year)
      .maybeSingle()
    if (!run) { setCurrentRun(null); setRunLoading(false); return }
    setCurrentRun(run as PayrollRun)
    const { data: ents } = await supabase
      .from('payroll_entries').select('*')
      .eq('run_id', run.id).order('employee_id')
    const loadedEntries = (ents as PayrollEntry[]) ?? []
    setEntries(loadedEntries)
    const forms: Record<number, EntryForm> = {}
    for (const e of loadedEntries) {
      forms[e.employee_id] = {
        vacation_days:    String(e.vacation_days),
        sick_days:        String(e.sick_days),
        overtime_hours:   String(e.overtime_hours),
        bonus:            String(e.bonus),
        other_additions:  String(e.other_additions),
        other_deductions: String(e.other_deductions),
        avans:            String(e.avans_amount ?? 0),
      }
    }
    setEditForms(forms)
    setRunLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'run') loadRun(calcMonth, calcYear)
  }, [tab, calcMonth, calcYear, loadRun])

  // ── Fetch history
  useEffect(() => {
    if (tab !== 'history') return
    setHistLoading(true)
    supabase.from('payroll_runs').select('*').order('year', { ascending: false }).order('month', { ascending: false })
      .then(async ({ data }) => {
        const runs = (data as PayrollRun[]) ?? []
        setHistory(runs)
        if (runs.length > 0) {
          const runIds = runs.map(r => r.id)
          const { data: ents } = await supabase
            .from('payroll_entries').select('run_id, avans_amount, avans_paid')
            .in('run_id', runIds)
          const map: Record<number, { total: number; paid: number }> = {}
          for (const e of ents ?? []) {
            if (!map[e.run_id]) map[e.run_id] = { total: 0, paid: 0 }
            map[e.run_id].total += e.avans_amount ?? 0
            if (e.avans_paid) map[e.run_id].paid += e.avans_amount ?? 0
          }
          setHistAvans(map)
        }
        setHistLoading(false)
      })
  }, [tab])

  // ── Load working-days override for selected period
  useEffect(() => {
    if (tab !== 'run') return
    setWdAdjustment(0)
    setWdInput('0')
    setEditingWd(false)
    supabase.from('payroll_wd_overrides')
      .select('adjustment').eq('year', calcYear).eq('month', calcMonth)
      .maybeSingle()
      .then(({ data }) => {
        const adj = data?.adjustment ?? 0
        setWdAdjustment(adj)
        setWdInput(String(adj))
      })
  }, [tab, calcMonth, calcYear])

  // ── Working days for current period
  const officialWd = workingDaysInMonth(calcYear, calcMonth)
  const wd         = officialWd + wdAdjustment
  const activeEmployees = employees.filter(e => e.status === 'active')

  // Active employees not yet included in the current run's entries.
  // Only meaningful when a run is loaded (currentRun is not null/undefined).
  const entryEmployeeIds = new Set(entries.map(e => e.employee_id))
  const missingEmployees = currentRun
    ? activeEmployees.filter(emp => !entryEmployeeIds.has(emp.id))
    : []

  // ── Live-computed row (using local forms, not DB entries)
  function liveCalc(emp: Employee): GrossBreakdown & PayrollResult {
    const f   = editForms[emp.id] ?? EMPTY_FORM()
    const ms  = monthsSinceStart(emp.start_date, calcYear, calcMonth)
    const breakdown = calcGross(
      emp.gross_salary, num(f.vacation_days), num(f.overtime_hours),
      num(f.bonus), num(f.other_additions), num(f.other_deductions),
      wd, ms >= 12,
    )
    const tax = calcPayroll(breakdown.gross, emp.payroll_sector, emp.is_main_workplace)
    return { ...breakdown, ...tax }
  }

  // ── Create a new run
  async function handleCreateRun() {
    setRunSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { showToast(t('pay.runError'), false); setRunSaving(false); return }
    const { data: run, error } = await supabase
      .from('payroll_runs').insert({ user_id: user.id, month: calcMonth, year: calcYear })
      .select().single()
    if (error || !run) { showToast(t('pay.runError'), false); setRunSaving(false); return }
    const newRun = run as PayrollRun
    // Compute entries first to derive 50% default avans from net salary
    const basePayloads = activeEmployees.map(emp =>
      buildEntryPayload(emp, EMPTY_FORM(), newRun.id, wd, calcYear, calcMonth)
    )
    const payloads = basePayloads.map(p => ({
      ...p,
      avans_amount: Math.round(p.net_salary * 0.5 * 100) / 100,
    }))
    await supabase.from('payroll_entries').insert(payloads)
    const forms: Record<number, EntryForm> = {}
    for (let i = 0; i < activeEmployees.length; i++) {
      forms[activeEmployees[i].id] = { ...EMPTY_FORM(), avans: String(payloads[i].avans_amount) }
    }
    setCurrentRun(newRun)
    setEntries([])
    setEditForms(forms)
    setRunSaving(false)
    await loadRun(calcMonth, calcYear)
  }

  // ── Add missing employees to an existing draft run
  async function handleRefreshEmployees() {
    if (!currentRun || currentRun.status !== 'draft' || missingEmployees.length === 0) return
    setRunSaving(true)
    const payloads = missingEmployees.map(emp => {
      const p = buildEntryPayload(emp, EMPTY_FORM(), currentRun.id, wd, calcYear, calcMonth)
      return { ...p, avans_amount: Math.round(p.net_salary * 0.5 * 100) / 100 }
    })
    const { error } = await supabase.from('payroll_entries').insert(payloads)
    if (error) { showToast(t('pay.runError'), false); setRunSaving(false); return }
    const added = missingEmployees.map(e => e.full_name).join(', ')
    showToast(lang === 'az' ? `${added} əlavə edildi` : `Added: ${added}`, true)
    setRunSaving(false)
    await loadRun(calcMonth, calcYear)
  }

  // ── Save draft
  async function handleSaveDraft() {
    if (!currentRun) return
    setRunSaving(true)
    const payloads = activeEmployees.map(emp =>
      buildEntryPayload(emp, editForms[emp.id] ?? EMPTY_FORM(), currentRun.id, wd, calcYear, calcMonth)
    )
    const { error } = await supabase.from('payroll_entries').upsert(payloads, { onConflict: 'run_id,employee_id' })
    if (error) { showToast(t('pay.runError'), false); setRunSaving(false); return }
    showToast(t('pay.savedDraftOk'), true)
    setRunSaving(false)
    await loadRun(calcMonth, calcYear)
  }

  // ── Approve payroll
  async function handleApprove() {
    if (!currentRun) return
    if (!window.confirm(t('pay.approveConfirm'))) return
    setRunSaving(true)

    // 1. Save all entries
    const payloads = activeEmployees.map(emp =>
      buildEntryPayload(emp, editForms[emp.id] ?? EMPTY_FORM(), currentRun.id, wd, calcYear, calcMonth)
    )
    await supabase.from('payroll_entries').upsert(payloads, { onConflict: 'run_id,employee_id' })

    // 2. Compute total employer cost for the expense entry
    const totalCost = payloads.reduce((s, p) => s + p.total_employer_cost, 0)
    const expDate   = `${calcYear}-${String(calcMonth).padStart(2,'0')}-01`
    const monthLabel = months[calcMonth - 1]

    // Check if a payroll expense already exists for this month
    const { data: existing } = await supabase.from('expenses')
      .select('id')
      .eq('is_payroll_generated', true)
      .eq('date', expDate)
      .maybeSingle()

    if (existing) {
      const ok = window.confirm(
        lang === 'az'
          ? 'Bu ay üçün maaş xərci artıq mövcuddur. Təkrar yaratmaq istəyirsiniz?'
          : 'A salary expense already exists for this month. Create another one?'
      )
      if (!ok) { setRunSaving(false); return }
    }

    const { data: exp } = await supabase.from('expenses').insert({
      date:                 expDate,
      description:          `${lang === 'az' ? 'Əmək haqqı' : 'Payroll'} — ${monthLabel} ${calcYear}`,
      category:             'Salaries',
      subcategory:          'Full-time Staff',
      amount:               parseFloat(totalCost.toFixed(2)),
      is_recurring:         false,
      is_payroll_generated: true,
    }).select().single()

    // 3. Approve the run
    await supabase.from('payroll_runs').update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      expense_id: exp?.id ?? null,
    }).eq('id', currentRun.id)

    showToast(t('pay.approvedOk'), true)
    logActivity({ supabase, action: 'approved', module: 'payroll', record_label: `${calcMonth}/${calcYear}`, company_id: company?.id })
    setRunSaving(false)
    await loadRun(calcMonth, calcYear)
  }

  // ── Mark avans as paid for one employee
  async function handleMarkAvansPaid(entryId: number) {
    const paidAt = new Date().toISOString()
    const { error } = await supabase.from('payroll_entries')
      .update({ avans_paid: true, avans_paid_at: paidAt })
      .eq('id', entryId)
    if (!error) {
      setEntries(prev => prev.map(e =>
        e.id === entryId ? { ...e, avans_paid: true, avans_paid_at: paidAt } : e
      ))
      showToast(t('pay.avansMarkedPaid'), true)
    }
  }

  // ── Save working-days adjustment
  async function handleSaveWd() {
    setWdSaving(true)
    const adj = parseInt(wdInput) || 0
    await supabase.from('payroll_wd_overrides')
      .upsert({ year: calcYear, month: calcMonth, adjustment: adj }, { onConflict: 'year,month' })
    setWdAdjustment(adj)
    setEditingWd(false)
    setWdSaving(false)
  }

  // ── Set 50% avans for all employees at once
  function handleSet50Avans() {
    setEditForms(prev => {
      const next: Record<number, EntryForm> = {}
      for (const emp of activeEmployees) {
        const form = prev[emp.id] ?? EMPTY_FORM()
        const ms   = monthsSinceStart(emp.start_date, calcYear, calcMonth)
        const bd   = calcGross(
          emp.gross_salary, num(form.vacation_days), num(form.overtime_hours),
          num(form.bonus), num(form.other_additions), num(form.other_deductions),
          wd, ms >= 12,
        )
        const tax  = calcPayroll(bd.gross, emp.payroll_sector, emp.is_main_workplace)
        next[emp.id] = { ...form, avans: String(Math.round(tax.netSalary * 0.5 * 100) / 100) }
      }
      return { ...prev, ...next }
    })
  }

  // ── Navigate to a historical run
  function openHistoryRun(run: PayrollRun) {
    setCalcMonth(run.month)
    setCalcYear(run.year)
    setTab('run')
  }

  // ── Employee CRUD helpers
  function empField<K extends keyof typeof EMPTY_EMP_FORM>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setEmpForm(p => ({ ...p, [key]: e.target.value }))
  }
  function closeEmpModal() { setShowEmpModal(false); setEmpForm(EMPTY_EMP_FORM); setEditingEmpId(null) }

  async function handleEmpSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEmpSaving(true)
    const payload = {
      full_name: empForm.full_name, position: empForm.position,
      gross_salary: parseFloat(empForm.gross_salary) || 0,
      employment_type: empForm.employment_type, status: empForm.status,
      start_date: empForm.start_date, is_main_workplace: empForm.is_main_workplace,
      payroll_sector: empForm.payroll_sector,
    }
    if (editingEmpId !== null) {
      const { data, error } = await supabase.from('employees').update(payload).eq('id', editingEmpId).select().single()
      if (!error && data) { setEmployees(prev => prev.map(e => e.id === editingEmpId ? data as Employee : e)); showToast(t('pay.updatedOk'), true); closeEmpModal() }
      else showToast(t('pay.saveError'), false)
    } else {
      const { data, error } = await supabase.from('employees').insert(payload).select().single()
      if (!error && data) { setEmployees(prev => [...prev, data as Employee].sort((a,b)=>a.full_name.localeCompare(b.full_name))); showToast(t('pay.savedOk'), true); closeEmpModal() }
      else showToast(t('pay.saveError'), false)
    }
    setEmpSaving(false)
  }

  async function handleEmpDelete(emp: Employee) {
    if (!window.confirm(`Remove ${emp.full_name}?`)) return
    const { error } = await supabase.from('employees').delete().eq('id', emp.id)
    if (!error) setEmployees(prev => prev.filter(e => e.id !== emp.id))
  }

  // ── Totals for run tab
  const runTotals = activeEmployees.reduce((acc, emp) => {
    const r = liveCalc(emp)
    const avans = num((editForms[emp.id] ?? EMPTY_FORM()).avans)
    return {
      gross:    acc.gross    + r.gross,
      pit:      acc.pit      + r.pit,
      ded:      acc.ded      + r.totalEmpDeductions,
      net:      acc.net      + r.netSalary,
      cost:     acc.cost     + r.totalEmployerCost,
      avans:    acc.avans    + avans,
      finalPay: acc.finalPay + (r.netSalary - avans),
    }
  }, { gross: 0, pit: 0, ded: 0, net: 0, cost: 0, avans: 0, finalPay: 0 })

  // ── Render ─────────────────────────────────────────────────────────────────

  const isApproved = currentRun?.status === 'approved'

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.payroll')}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {employees.length} {lang === 'az' ? 'işçi' : employees.length !== 1 ? 'employees' : 'employee'} &mdash;{' '}
            <span className="text-green-600 font-medium">{activeEmployees.length} {t('pay.active').toLowerCase()}</span>
          </p>
        </div>
        {tab === 'employees' && (
          <button onClick={() => { setEmpForm(EMPTY_EMP_FORM); setEditingEmpId(null); setShowEmpModal(true) }}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('pay.addEmployee')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
        {(['employees', 'run', 'history'] as TabKey[]).map(k => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === k ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}>
            {t(k === 'employees' ? 'pay.employees' : k === 'run' ? 'pay.payrollRun' : 'pay.history')}
          </button>
        ))}
      </div>

      {/* ══ EMPLOYEES TAB ══════════════════════════════════════════════════════ */}
      {tab === 'employees' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400">{t('cli.loading')}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[750px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {[t('pay.fullName'), t('pay.position'), t('pay.grossSalary'), t('pay.employmentType'), t('pay.sector'), t('pay.status'), ''].map((h, i) => (
                        <th key={i} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3.5 last:w-24">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {employees.map(emp => (
                      <tr key={emp.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-5 py-3.5">
                          <p className="text-sm font-semibold text-gray-900">{emp.full_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{t('pay.isMainWorkplace')}: {emp.is_main_workplace ? t('pay.yes') : t('pay.no')}</p>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-700">{emp.position}</td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 tabular-nums">{fmt(emp.gross_salary)}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${EMPLOYMENT_TYPE_STYLES[emp.employment_type]}`}>
                            {t(`pay.${emp.employment_type === 'full-time' ? 'fullTime' : emp.employment_type === 'part-time' ? 'partTime' : 'contractor'}` as TranslationKey)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${SECTOR_STYLES[emp.payroll_sector]}`}>
                            {t(emp.payroll_sector === 'private_non_oil' ? 'pay.privateNonOil' : 'pay.oilGasPublic')}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {t(emp.status === 'active' ? 'pay.active' : 'pay.inactive')}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <button onClick={() => { setEditingEmpId(emp.id); setEmpForm({ full_name: emp.full_name, position: emp.position, gross_salary: String(emp.gross_salary), employment_type: emp.employment_type, status: emp.status, start_date: emp.start_date, is_main_workplace: emp.is_main_workplace, payroll_sector: emp.payroll_sector }); setShowEmpModal(true) }}
                              className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 transition-colors">
                              {t('common.edit')}
                            </button>
                            <button onClick={() => handleEmpDelete(emp)} className="text-gray-300 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {employees.length === 0 && <div className="text-center py-16 text-gray-400 text-sm">{t('pay.noEmployees')}</div>}
            </>
          )}
        </div>
      )}

      {/* ══ PAYROLL RUN TAB ══════════════════════════════════════════════════ */}
      {tab === 'run' && (
        <div>
          {/* Period selector + status + action buttons */}
          <div className="flex flex-wrap items-end gap-3 mb-6">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{t('pay.selectMonth')}</label>
              <select value={calcMonth} onChange={e => setCalcMonth(Number(e.target.value))} disabled={currentRun?.status === 'draft'}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                {months.map((name, i) => <option key={i+1} value={i+1}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{t('pay.year')}</label>
              <select value={calcYear} onChange={e => setCalcYear(Number(e.target.value))} disabled={currentRun?.status === 'draft'}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="self-end pb-2 flex flex-col gap-1">
              <div className="text-xs text-gray-500 tabular-nums">
                {lang === 'az'
                  ? `Rəsmi: ${officialWd} | Düzəliş: ${wdAdjustment >= 0 ? '+' : ''}${wdAdjustment} | Faktiki: ${wd}`
                  : `Official: ${officialWd} | Adj: ${wdAdjustment >= 0 ? '+' : ''}${wdAdjustment} | Effective: ${wd}`
                }
              </div>
              {!isApproved && (
                editingWd
                  ? <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={wdInput}
                        onChange={e => setWdInput(e.target.value)}
                        className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <button onClick={handleSaveWd} disabled={wdSaving}
                        className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-2 py-0.5 rounded disabled:opacity-50">
                        {wdSaving ? '…' : '✓'}
                      </button>
                      <button onClick={() => { setEditingWd(false); setWdInput(String(wdAdjustment)) }}
                        className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
                    </div>
                  : <button onClick={() => setEditingWd(true)}
                      className="text-[10px] text-blue-500 hover:text-blue-700 underline text-left">
                      {lang === 'az' ? 'Düzəliş et' : 'Edit working days'}
                    </button>
              )}
            </div>

            {currentRun && (
              <span className={`self-end mb-1 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${
                isApproved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isApproved ? 'bg-green-500' : 'bg-amber-500'}`} />
                {t(isApproved ? 'pay.runApproved' : 'pay.runDraft')}
              </span>
            )}

            <div className="flex gap-2 ml-auto">
              {currentRun && !isApproved && (
                <button onClick={handleSet50Avans}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  {lang === 'az' ? '50% Avans' : 'Set 50% Avans'}
                </button>
              )}
              {currentRun && isApproved && entries.length > 0 && (
                <button
                  onClick={async () => {
                    const empMap = new Map(employees.map(e => [e.id, e]))
                    await generateRunPDF(entries, empMap, months[calcMonth-1], calcYear, lang)
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {t('pay.downloadRunPDF')}
                </button>
              )}
              {currentRun && !isApproved && (
                <>
                  <button onClick={handleSaveDraft} disabled={runSaving}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50">
                    {runSaving ? t('common.saving') : t('pay.saveDraft')}
                  </button>
                  <button onClick={handleApprove} disabled={runSaving}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm disabled:opacity-50">
                    {t('pay.approvePayroll')}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Loading state */}
          {(runLoading || currentRun === undefined) && (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400">{t('common.loading')}</div>
          )}

          {/* No run — CTA */}
          {!runLoading && currentRun === null && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm text-center py-20">
              <p className="text-gray-500 text-sm mb-4">{t('pay.noRun')}</p>
              <button onClick={handleCreateRun} disabled={runSaving || activeEmployees.length === 0}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {runSaving ? t('common.saving') : t('pay.createRun')}
              </button>
              {activeEmployees.length === 0 && (
                <p className="text-xs text-amber-600 mt-3">{t('pay.noActiveEmployees')}</p>
              )}
            </div>
          )}

          {/* Run exists — summary cards + table */}
          {!runLoading && currentRun && (
            <>
              {/* Missing-employee warning banner */}
              {missingEmployees.length > 0 && (
                <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-800">
                        {lang === 'az' ? 'Diqqət' : 'Warning'}
                      </p>
                      <p className="text-sm text-amber-700 mt-0.5 leading-relaxed">
                        {lang === 'az'
                          ? `Aşağıdakı işçilər bu ay əlavə edilib, lakin mövcud əmək haqqı hesabına daxil edilməyib: ${missingEmployees.map(e => e.full_name).join(', ')}.`
                          : `The following employees were added this month but are not included in the current payroll run: ${missingEmployees.map(e => e.full_name).join(', ')}.`
                        }
                      </p>
                    </div>
                    {currentRun.status === 'draft' && (
                      <button
                        onClick={handleRefreshEmployees}
                        disabled={runSaving}
                        className="shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {lang === 'az' ? 'İşçiləri Yenilə' : 'Refresh Employees'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                {[
                  { label: t('pay.totalGross'),        value: runTotals.gross,    border: 'border-l-blue-500',    from: 'from-blue-50' },
                  { label: t('pay.totalNet'),           value: runTotals.net,      border: 'border-l-green-500',   from: 'from-green-50' },
                  { label: t('pay.avans'),              value: runTotals.avans,    border: 'border-l-purple-500',  from: 'from-purple-50' },
                  { label: t('pay.totalEmployerCost'), value: runTotals.cost,     border: 'border-l-orange-500',  from: 'from-orange-50' },
                ].map(c => (
                  <div key={c.label} className={`bg-gradient-to-br ${c.from} to-white border border-gray-100 border-l-4 ${c.border} rounded-xl p-5 shadow-sm`}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{c.label}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1.5 tabular-nums">{fmt(c.value)}</p>
                  </div>
                ))}
              </div>

              {/* Editable / read-only run table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1800px] text-sm">
                    <thead>
                      <tr className="text-xs font-semibold uppercase tracking-wider border-b border-gray-100">
                        <th colSpan={2} className="px-4 py-2.5 text-left text-gray-500 bg-gray-50 border-r border-gray-100">{t('pay.employees')}</th>
                        <th className="px-3 py-2.5 text-right text-blue-700 bg-blue-50 border-r border-blue-100">{t('pay.baseSalary')}</th>
                        <th colSpan={6} className="px-3 py-2.5 text-center text-violet-700 bg-violet-50 border-r border-violet-100">
                          {lang === 'az' ? '← Düzəlişlər →' : '← Adjustments →'}
                        </th>
                        <th className="px-3 py-2.5 text-right text-blue-700 bg-blue-50 border-r border-blue-100">{t('pay.adjustedGross')}</th>
                        <th colSpan={6} className="px-3 py-2.5 text-center text-red-700 bg-red-50 border-r border-red-100">
                          {lang === 'az' ? '← İşçi Tutulmaları →' : '← Employee Deductions →'}
                        </th>
                        <th className="px-3 py-2.5 text-center text-green-700 bg-green-50 border-r border-green-100">{t('pay.netSalary')}</th>
                        <th colSpan={2} className="px-3 py-2.5 text-center text-purple-700 bg-purple-50 border-r border-purple-100">
                          {lang === 'az' ? '← Avans →' : '← Advance →'}
                        </th>
                        <th colSpan={4} className="px-3 py-2.5 text-center text-orange-700 bg-orange-50">
                          {lang === 'az' ? '← İşəgötürən →' : '← Employer Costs →'}
                        </th>
                        <th className="px-2 py-2.5 bg-gray-50 border-l border-gray-100 w-20"></th>
                      </tr>
                      <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="text-left px-4 py-3 sticky left-0 bg-gray-50 z-10 border-r border-gray-100">{t('pay.fullName')}</th>
                        <th className="text-left px-3 py-3 border-r border-gray-100">{t('pay.position')}</th>
                        <th className="text-right px-3 py-3 text-blue-600 border-r border-blue-100">{lang==='az'?'Əsas':'Base'}</th>
                        <th className="text-right px-3 py-3 text-violet-600">{t('pay.vacationDays')}</th>
                        <th className="text-right px-3 py-3 text-violet-600">{t('pay.sickDays')}</th>
                        <th className="text-right px-3 py-3 text-violet-600">{t('pay.overtimeHours')}</th>
                        <th className="text-right px-3 py-3 text-violet-600">{t('pay.bonus')}</th>
                        <th className="text-right px-3 py-3 text-violet-600 cursor-help" title={lang === 'az' ? 'Ezamiyyət, yemək pulu və s.' : 'Travel allowance, meal allowance, etc.'}>{t('pay.otherAdditions')}</th>
                        <th className="text-right px-3 py-3 text-violet-600 border-r border-violet-100 cursor-help" title={lang === 'az' ? 'Məhkəmə tutulmaları, borc və s.' : 'Court deductions, debt recovery, etc.'}>{t('pay.otherDeductions')}</th>
                        <th className="text-right px-3 py-3 font-bold text-blue-700 border-r border-blue-100">{lang==='az'?'Adj. Brüt':'Adj. Gross'}</th>
                        <th className="text-right px-3 py-3 text-gray-500">{t('pay.pitDeduction')}</th>
                        <th className="text-right px-3 py-3 text-red-500">{t('pay.pit')}</th>
                        <th className="text-right px-3 py-3 text-red-500">{t('pay.empSocial')}</th>
                        <th className="text-right px-3 py-3 text-red-500">{t('pay.empHealth')}</th>
                        <th className="text-right px-3 py-3 text-red-500">{lang==='az'?'İşsizlik Sığ.':'Unemp. Ins.'}</th>
                        <th className="text-right px-3 py-3 font-bold text-red-700 border-r border-red-100">{t('pay.totalDeductions')}</th>
                        <th className="text-right px-3 py-3 font-bold text-green-700 border-r border-green-100">{t('pay.netSalary')}</th>
                        <th className="text-center px-3 py-3 text-purple-600">{t('pay.avans')}</th>
                        <th className="text-right px-3 py-3 font-bold text-purple-700 border-r border-purple-100">{t('pay.finalPayment')}</th>
                        <th className="text-right px-3 py-3 text-orange-500">{t('pay.emplrSocial')}</th>
                        <th className="text-right px-3 py-3 text-orange-500">{t('pay.emplrHealth')}</th>
                        <th className="text-right px-3 py-3 text-orange-500">{t('pay.emplrUnemployment')}</th>
                        <th className="text-right px-3 py-3 font-bold text-orange-700">{t('pay.totalCost')}</th>
                        <th className="px-2 py-3 border-l border-gray-100"></th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-50">
                      {activeEmployees.map(emp => {
                        const f   = editForms[emp.id] ?? EMPTY_FORM()
                        const r   = liveCalc(emp)
                        const dbEntry = entries.find(e => e.employee_id === emp.id)

                        function setField(key: keyof EntryForm, val: string) {
                          setEditForms(prev => ({ ...prev, [emp.id]: { ...(prev[emp.id] ?? EMPTY_FORM()), [key]: val } }))
                        }
                        function numInput(key: keyof EntryForm, placeholder = '0') {
                          return isApproved
                            ? <span className="tabular-nums">{f[key]}</span>
                            : (
                              <input
                                type="number" min="0" step="any"
                                value={f[key]}
                                onChange={e => setField(key, e.target.value)}
                                placeholder={placeholder}
                                className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400 tabular-nums"
                              />
                            )
                        }

                        return (
                          <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 sticky left-0 bg-white hover:bg-slate-50 z-10 border-r border-gray-100">
                              <p className="font-semibold text-gray-900 whitespace-nowrap text-xs">{emp.full_name}</p>
                              <span className={`inline-block text-xs px-1.5 py-0.5 rounded-full mt-0.5 ${SECTOR_STYLES[emp.payroll_sector]}`}>
                                {emp.payroll_sector === 'private_non_oil' ? (lang==='az'?'Özəl':'Priv.') : (lang==='az'?'Neft':'Oil')}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap border-r border-gray-100">{emp.position}</td>
                            <td className="px-3 py-3 text-right font-semibold text-blue-700 tabular-nums text-xs border-r border-blue-100">
                              {n2(emp.gross_salary)}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {numInput('vacation_days')}
                              {r.hasLimitedHistory && num(f.vacation_days) > 0 && (
                                <div title={t('pay.limitedHistory')} className="text-[9px] text-amber-500 mt-0.5 cursor-help">⚠ &lt;12m</div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {numInput('sick_days')}
                              {num(f.sick_days) > 0 && (
                                <div className="text-[9px] text-amber-600 mt-0.5 leading-tight">DSMF</div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">{numInput('overtime_hours')}</td>
                            <td className="px-3 py-3 text-center">{numInput('bonus')}</td>
                            <td className="px-3 py-3 text-center">{numInput('other_additions')}</td>
                            <td className="px-3 py-3 text-center border-r border-violet-100">{numInput('other_deductions')}</td>
                            <td className="px-3 py-3 text-right font-bold text-blue-700 tabular-nums text-xs border-r border-blue-100">
                              {n2(r.gross)}
                              {num(f.vacation_days) > 0 && (
                                <div className="text-[9px] text-gray-400 font-normal mt-0.5 space-y-0.5">
                                  <div>{lang==='az'?'İş':'Work'}: {n2(r.workingDaysPay)}</div>
                                  <div>
                                    {lang==='az'?'Məz':'Vac'}{' '}
                                    ({r.vacationMethodUsed === 'floor'
                                      ? (lang==='az'?'iş':'wd')
                                      : r.vacationMethodUsed}): {n2(r.vacationPay)}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right text-gray-400 tabular-nums text-xs">{n2(r.pitDeduction)}</td>
                            <td className="px-3 py-3 text-right text-red-600 tabular-nums text-xs">{n2(r.pit)}</td>
                            <td className="px-3 py-3 text-right text-red-600 tabular-nums text-xs">{n2(r.empSocial)}</td>
                            <td className="px-3 py-3 text-right text-red-600 tabular-nums text-xs">{n2(r.empHealth)}</td>
                            <td className="px-3 py-3 text-right text-red-600 tabular-nums text-xs">{n2(r.empUnemployment)}</td>
                            <td className="px-3 py-3 text-right font-bold text-red-700 tabular-nums text-xs border-r border-red-100">{n2(r.totalEmpDeductions)}</td>
                            <td className="px-3 py-3 text-right font-bold text-green-700 tabular-nums text-xs border-r border-green-100">{n2(r.netSalary)}</td>
                            {/* ── Avans ── */}
                            <td className="px-3 py-3 text-center">
                              <div className="flex flex-col items-center gap-1">
                                {isApproved
                                  ? <span className="tabular-nums text-xs font-semibold text-purple-700">
                                      {num(f.avans) > 0 ? n2(num(f.avans)) : '—'}
                                    </span>
                                  : (
                                    <input
                                      type="number" min="0" step="0.01"
                                      value={f.avans}
                                      onChange={e => {
                                        const empId = emp.id
                                        const val   = e.target.value
                                        setEditForms(prev => ({
                                          ...prev,
                                          [empId]: { ...(prev[empId] ?? EMPTY_FORM()), avans: val },
                                        }))
                                      }}
                                      className="w-20 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-purple-400 tabular-nums"
                                    />
                                  )
                                }
                                {dbEntry ? (
                                  dbEntry.avans_paid ? (
                                    <span className="text-[9px] text-green-600 font-semibold whitespace-nowrap">
                                      ✓ {lang === 'az' ? 'Ödənilib' : 'Paid'}{' '}
                                      {new Intl.DateTimeFormat('az-AZ').format(new Date(dbEntry.avans_paid_at!))}
                                    </span>
                                  ) : num(f.avans) > 0 ? (
                                    <button
                                      onClick={() => handleMarkAvansPaid(dbEntry.id)}
                                      className="text-[9px] font-semibold text-amber-600 hover:text-white hover:bg-amber-500 border border-amber-300 px-2 py-0.5 rounded transition-colors whitespace-nowrap">
                                      {lang === 'az' ? 'Ödənilməyib' : 'Not paid'}
                                    </button>
                                  ) : null
                                ) : null}
                              </div>
                            </td>
                            {/* ── Final Payment ── */}
                            <td className="px-3 py-3 text-right font-bold text-purple-700 tabular-nums text-xs border-r border-purple-100">
                              {n2(Math.max(0, r.netSalary - num(f.avans)))}
                            </td>
                            <td className="px-3 py-3 text-right text-orange-600 tabular-nums text-xs">{n2(r.emplrSocial)}</td>
                            <td className="px-3 py-3 text-right text-orange-600 tabular-nums text-xs">{n2(r.emplrHealth)}</td>
                            <td className="px-3 py-3 text-right text-orange-600 tabular-nums text-xs">{n2(r.emplrUnemployment)}</td>
                            <td className="px-3 py-3 text-right font-bold text-orange-700 tabular-nums text-xs">{n2(r.totalEmployerCost)}</td>
                            <td className="px-2 py-3 border-l border-gray-100">
                              {dbEntry && (
                                <div className="flex items-center gap-0.5">
                                  <button
                                    onClick={async () => generatePayslipPDF(dbEntry, emp, calcMonth, months[calcMonth-1], calcYear, lang, companySettings)}
                                    title={t('pay.downloadPayslip')}
                                    className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => { setPayslipEmailModal({ entry: dbEntry, emp }); setPayslipEmailTo('') }}
                                    title={lang === 'az' ? 'E-poçtla göndər' : 'Send by email'}
                                    className="text-gray-400 hover:text-green-600 p-1 rounded hover:bg-green-50 transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>

                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-900 text-xs">
                        <td colSpan={2} className="px-4 py-3 sticky left-0 bg-gray-50 border-r border-gray-100">
                          {lang === 'az' ? 'CƏMİ' : 'TOTAL'} ({activeEmployees.length})
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-blue-700 border-r border-blue-100">
                          {n2(activeEmployees.reduce((s,e)=>s+e.gross_salary,0))}
                        </td>
                        <td colSpan={6} className="border-r border-violet-100"></td>
                        <td className="px-3 py-3 text-right tabular-nums text-blue-800 border-r border-blue-100">{n2(runTotals.gross)}</td>
                        <td></td>
                        <td className="px-3 py-3 text-right tabular-nums text-red-700">{n2(runTotals.pit)}</td>
                        <td colSpan={3}></td>
                        <td className="px-3 py-3 text-right tabular-nums text-red-800 border-r border-red-100">{n2(runTotals.ded)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-green-800 border-r border-green-100">{n2(runTotals.net)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-purple-700">{n2(runTotals.avans)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-purple-800 border-r border-purple-100">{n2(runTotals.finalPay)}</td>
                        <td colSpan={3}></td>
                        <td className="px-3 py-3 text-right tabular-nums text-orange-800">{n2(runTotals.cost)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ HISTORY TAB ════════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {histLoading ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400">{t('common.loading')}</div>
          ) : history.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">{t('pay.noHistory')}</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {[
                    lang==='az' ? 'Dövr'         : 'Period',
                    t('common.status'),
                    lang==='az' ? 'Avans'         : 'Advance',
                    lang==='az' ? 'Təsdiq Tarixi' : 'Approved On',
                    lang==='az' ? 'Yaradılma'     : 'Created',
                    '',
                  ].map((h,i) => (
                    <th key={i} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3.5 last:w-32">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map(run => {
                  const av = histAvans[run.id]
                  return (
                  <tr key={run.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-900">{months[run.month - 1]} {run.year}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                        run.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${run.status === 'approved' ? 'bg-green-500' : 'bg-amber-500'}`} />
                        {t(run.status === 'approved' ? 'pay.runApproved' : 'pay.runDraft')}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {av && av.total > 0 ? (
                        <div>
                          <p className="text-sm font-semibold text-purple-700 tabular-nums">{fmt(av.total)}</p>
                          <p className={`text-[11px] font-medium mt-0.5 ${av.paid >= av.total ? 'text-green-600' : 'text-amber-600'}`}>
                            {av.paid >= av.total
                              ? (lang === 'az' ? '✓ Ödənilib' : '✓ Paid')
                              : av.paid > 0
                                ? `${fmt(av.paid)} ${lang === 'az' ? 'ödənilib' : 'paid'}`
                                : (lang === 'az' ? 'Ödənilməyib' : 'Not paid')
                            }
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-500">
                      {run.approved_at ? new Intl.DateTimeFormat('az-AZ').format(new Date(run.approved_at)) : '—'}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-400">
                      {new Intl.DateTimeFormat('az-AZ').format(new Date(run.created_at))}
                    </td>
                    <td className="px-5 py-4">
                      <button onClick={() => openHistoryRun(run)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors">
                        {t('pay.viewRun')}
                      </button>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══ EMPLOYEE MODAL ════════════════════════════════════════════════════ */}
      {showEmpModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) closeEmpModal() }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingEmpId !== null ? t('pay.editEmployee') : t('pay.addEmployee')}
              </h3>
              <button onClick={closeEmpModal} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleEmpSubmit}>
              <div className="px-6 py-5 space-y-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pay.fullName')}</label>
                  <input type="text" required value={empForm.full_name} onChange={empField('full_name')} placeholder="e.g. Elşad Əliyev"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pay.position')}</label>
                    <input type="text" required value={empForm.position} onChange={empField('position')} placeholder="e.g. Manager"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pay.grossSalary')}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">₼</span>
                      <input type="number" required min="0" step="0.01" value={empForm.gross_salary} onChange={empField('gross_salary')} placeholder="0.00"
                        className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pay.employmentType')}</label>
                    <select value={empForm.employment_type} onChange={empField('employment_type')}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="full-time">{t('pay.fullTime')}</option>
                      <option value="part-time">{t('pay.partTime')}</option>
                      <option value="contractor">{t('pay.contractor')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pay.startDate')}</label>
                    <input type="date" required value={empForm.start_date} onChange={empField('start_date')}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pay.payrollSector')}</label>
                    <select value={empForm.payroll_sector} onChange={empField('payroll_sector')}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="private_non_oil">{t('pay.privateNonOil')}</option>
                      <option value="oil_gas_public">{t('pay.oilGasPublic')}</option>
                    </select>
                  </div>
                  {editingEmpId !== null && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pay.status')}</label>
                      <select value={empForm.status} onChange={empField('status')}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="active">{t('pay.active')}</option>
                        <option value="inactive">{t('pay.inactive')}</option>
                      </select>
                    </div>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{t('pay.isMainWorkplace')}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{lang==='az'?'₼200 GV güzəşti ≤₼2,500 üçün':'₼200 PIT deduction if gross ≤ ₼2,500'}</p>
                  </div>
                  <button type="button" onClick={() => setEmpForm(p => ({ ...p, is_main_workplace: !p.is_main_workplace }))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${empForm.is_main_workplace ? 'bg-blue-600' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${empForm.is_main_workplace ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button type="button" onClick={closeEmpModal}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={empSaving}
                  className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm disabled:opacity-60">
                  {empSaving ? t('common.saving') : editingEmpId !== null ? t('common.saveChanges') : t('pay.addEmployee')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payslip email dialog */}
      {payslipEmailModal && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center px-4"
          onClick={e => { if (e.target === e.currentTarget) setPayslipEmailModal(null) }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {lang === 'az' ? 'Maaş Vərəqəsini Göndər' : 'Send Payslip'}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">{payslipEmailModal.emp.full_name}</p>
              </div>
              <button onClick={() => setPayslipEmailModal(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSendPayslip} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {lang === 'az' ? 'E-poçt ünvanı' : 'Email address'}
                </label>
                <input type="email" required autoFocus
                  value={payslipEmailTo}
                  onChange={e => setPayslipEmailTo(e.target.value)}
                  placeholder="employee@company.az"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setPayslipEmailModal(null)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
                  {lang === 'az' ? 'Ləğv et' : 'Cancel'}
                </button>
                <button type="submit" disabled={payslipSending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-60">
                  {payslipSending ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )}
                  {payslipSending ? (lang === 'az' ? 'Göndərilir…' : 'Sending…') : (lang === 'az' ? 'Göndər' : 'Send')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${
          toast.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {toast.ok
            ? <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            : <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          }
          {toast.msg}
        </div>
      )}
    </div>
  )
}
