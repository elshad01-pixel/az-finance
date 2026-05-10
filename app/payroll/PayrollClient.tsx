'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import { calcPayroll, type PayrollSector } from '@/lib/payroll'
import type { TranslationKey } from '@/lib/i18n'

// ── Types ──────────────────────────────────────────────────────────────────

type EmploymentType = 'full-time' | 'part-time' | 'contractor'
type EmployeeStatus = 'active' | 'inactive'

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

// ── Constants ──────────────────────────────────────────────────────────────

const EMPLOYMENT_TYPE_STYLES: Record<EmploymentType, string> = {
  'full-time':  'bg-blue-100   text-blue-700',
  'part-time':  'bg-purple-100 text-purple-700',
  'contractor': 'bg-amber-100  text-amber-700',
}

const SECTOR_STYLES: Record<PayrollSector, string> = {
  'private_non_oil': 'bg-green-100  text-green-700',
  'oil_gas_public':  'bg-orange-100 text-orange-700',
}

const MONTHS_EN = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const MONTHS_AZ = [
  'Yanvar','Fevral','Mart','Aprel','May','İyun',
  'İyul','Avqust','Sentyabr','Oktyabr','Noyabr','Dekabr',
]

const EMPTY_FORM = {
  full_name:         '',
  position:          '',
  gross_salary:      '',
  employment_type:   'full-time'      as EmploymentType,
  status:            'active'         as EmployeeStatus,
  start_date:        '',
  is_main_workplace: true,
  payroll_sector:    'private_non_oil' as PayrollSector,
}

// ── Formatters ─────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function n2(n: number): string {
  if (n === 0) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PayrollClient() {
  const { t, lang } = useLanguage()
  const months = lang === 'az' ? MONTHS_AZ : MONTHS_EN

  // ── Data ──────────────────────────────────────────────────────────────
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading]     = useState(true)

  // ── Tabs ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'employees' | 'calculator'>('employees')

  // ── Employee modal ────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)

  // ── Calculator period ─────────────────────────────────────────────────
  const now = new Date()
  const [calcMonth, setCalcMonth] = useState(now.getMonth() + 1)
  const [calcYear, setCalcYear]   = useState(now.getFullYear())

  // ── Toast ─────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('employees').select('*').order('full_name')
      .then(({ data }) => { setEmployees((data as Employee[]) ?? []); setLoading(false) })
  }, [])

  // ── Form helpers ──────────────────────────────────────────────────────
  function field<K extends keyof typeof EMPTY_FORM>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value }))
  }

  function resetForm() { setForm(EMPTY_FORM); setEditingId(null) }
  function closeModal() { setShowModal(false); resetForm() }

  function openAdd() { resetForm(); setShowModal(true) }

  function openEdit(emp: Employee) {
    setEditingId(emp.id)
    setForm({
      full_name:         emp.full_name,
      position:          emp.position,
      gross_salary:      String(emp.gross_salary),
      employment_type:   emp.employment_type,
      status:            emp.status,
      start_date:        emp.start_date,
      is_main_workplace: emp.is_main_workplace,
      payroll_sector:    emp.payroll_sector,
    })
    setShowModal(true)
  }

  // ── CRUD ──────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      full_name:         form.full_name,
      position:          form.position,
      gross_salary:      parseFloat(form.gross_salary) || 0,
      employment_type:   form.employment_type,
      status:            form.status,
      start_date:        form.start_date,
      is_main_workplace: form.is_main_workplace,
      payroll_sector:    form.payroll_sector,
    }

    if (editingId !== null) {
      const { data, error } = await supabase
        .from('employees').update(payload).eq('id', editingId).select().single()
      if (!error && data) {
        setEmployees(prev => prev.map(e => e.id === editingId ? data as Employee : e))
        showToast(t('pay.updatedOk'), true)
        closeModal()
      } else {
        showToast(t('pay.saveError'), false)
      }
    } else {
      const { data, error } = await supabase
        .from('employees').insert(payload).select().single()
      if (!error && data) {
        setEmployees(prev => [...prev, data as Employee].sort((a, b) => a.full_name.localeCompare(b.full_name)))
        showToast(t('pay.savedOk'), true)
        closeModal()
      } else {
        showToast(t('pay.saveError'), false)
      }
    }
    setSaving(false)
  }

  async function handleDelete(emp: Employee) {
    if (!window.confirm(`Remove ${emp.full_name}?`)) return
    const { error } = await supabase.from('employees').delete().eq('id', emp.id)
    if (!error) setEmployees(prev => prev.filter(e => e.id !== emp.id))
  }

  // ── Payroll calculation ───────────────────────────────────────────────
  const activeEmployees = employees.filter(e => e.status === 'active')
  const payrollRows = activeEmployees.map(emp => ({
    emp,
    r: calcPayroll(emp.gross_salary, emp.payroll_sector, emp.is_main_workplace),
  }))

  const totals = payrollRows.reduce(
    (acc, { r }) => ({
      gross:            acc.gross            + r.gross,
      pit:              acc.pit              + r.pit,
      empSocial:        acc.empSocial        + r.empSocial,
      empHealth:        acc.empHealth        + r.empHealth,
      empUnemployment:  acc.empUnemployment  + r.empUnemployment,
      totalEmpDed:      acc.totalEmpDed      + r.totalEmpDeductions,
      netSalary:        acc.netSalary        + r.netSalary,
      emplrSocial:      acc.emplrSocial      + r.emplrSocial,
      emplrHealth:      acc.emplrHealth      + r.emplrHealth,
      emplrUnemployment:acc.emplrUnemployment + r.emplrUnemployment,
      totalCost:        acc.totalCost        + r.totalEmployerCost,
    }),
    { gross:0, pit:0, empSocial:0, empHealth:0, empUnemployment:0,
      totalEmpDed:0, netSalary:0, emplrSocial:0, emplrHealth:0,
      emplrUnemployment:0, totalCost:0 },
  )

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div>

      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.payroll')}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {employees.length} {lang === 'az' ? 'işçi' : employees.length !== 1 ? 'employees' : 'employee'} &mdash;{' '}
            <span className="text-green-600 font-medium">{activeEmployees.length} {t('pay.active').toLowerCase()}</span>
          </p>
        </div>
        {tab === 'employees' && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('pay.addEmployee')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
        {(['employees', 'calculator'] as const).map(tabKey => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === tabKey
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t(tabKey === 'employees' ? 'pay.employees' : 'pay.calculator')}
          </button>
        ))}
      </div>

      {/* ══ EMPLOYEES TAB ══════════════════════════════════════════════════ */}
      {tab === 'employees' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400">
              {t('cli.loading')}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[750px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {[
                        t('pay.fullName'), t('pay.position'), t('pay.grossSalary'),
                        t('pay.employmentType'), t('pay.sector'), t('pay.status'), '',
                      ].map((h, i) => (
                        <th key={i} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3.5 last:w-24">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {employees.map(emp => (
                      <tr key={emp.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-5 py-3.5">
                          <p className="text-sm font-semibold text-gray-900">{emp.full_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {t('pay.isMainWorkplace')}: {emp.is_main_workplace ? t('pay.yes') : t('pay.no')}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-700">{emp.position}</td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 tabular-nums">
                          {fmt(emp.gross_salary)}
                        </td>
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
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                            emp.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {t(emp.status === 'active' ? 'pay.active' : 'pay.inactive')}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEdit(emp)}
                              className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 transition-colors"
                            >
                              {t('common.edit')}
                            </button>
                            <button
                              onClick={() => handleDelete(emp)}
                              className="text-gray-300 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {employees.length === 0 && (
                <div className="text-center py-16 text-gray-400 text-sm">
                  {t('pay.noEmployees')}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ CALCULATOR TAB ══════════════════════════════════════════════════ */}
      {tab === 'calculator' && (
        <div>
          {/* Period selector */}
          <div className="flex items-center gap-3 mb-6">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                {t('pay.selectMonth')}
              </label>
              <select
                value={calcMonth}
                onChange={e => setCalcMonth(Number(e.target.value))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {months.map((name, i) => (
                  <option key={i+1} value={i+1}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                {t('pay.year')}
              </label>
              <select
                value={calcYear}
                onChange={e => setCalcYear(Number(e.target.value))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {[2023,2024,2025,2026,2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="self-end mb-0.5 text-sm text-gray-500">
              — {activeEmployees.length} {lang === 'az' ? 'aktiv işçi' : 'active employees'}
            </div>
          </div>

          {/* Summary cards */}
          {payrollRows.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[
                { label: t('pay.totalGross'),        value: totals.gross,    border: 'border-l-blue-500',   bg: 'from-blue-50' },
                { label: t('pay.totalNet'),           value: totals.netSalary, border: 'border-l-green-500', bg: 'from-green-50' },
                { label: t('pay.totalEmployerCost'), value: totals.totalCost, border: 'border-l-orange-500', bg: 'from-orange-50' },
              ].map(card => (
                <div key={card.label} className={`bg-gradient-to-br ${card.bg} to-white border border-gray-100 border-l-4 ${card.border} rounded-xl p-5 shadow-sm`}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{card.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1.5 tabular-nums">{fmt(card.value)}</p>
                </div>
              ))}
            </div>
          )}

          {payrollRows.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm text-center py-16 text-gray-400 text-sm">
              {t('pay.noActiveEmployees')}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1280px] text-sm">
                  {/* Column group headers */}
                  <thead>
                    <tr className="text-xs font-semibold uppercase tracking-wider border-b border-gray-100">
                      <th colSpan={2} className="px-4 py-2.5 text-left text-gray-500 bg-gray-50 border-r border-gray-100">
                        {t('pay.employees')}
                      </th>
                      <th className="px-4 py-2.5 text-right text-blue-700 bg-blue-50 border-r border-blue-100">
                        {t('pay.grossSalary').replace(' (AZN)','')}
                      </th>
                      <th colSpan={6} className="px-4 py-2.5 text-center text-red-700 bg-red-50 border-r border-red-100">
                        ← {lang === 'az' ? 'İşçi Tutulmaları' : 'Employee Deductions'} →
                      </th>
                      <th className="px-4 py-2.5 text-center text-green-700 bg-green-50 border-r border-green-100">
                        {t('pay.netSalary')}
                      </th>
                      <th colSpan={4} className="px-4 py-2.5 text-center text-orange-700 bg-orange-50">
                        ← {lang === 'az' ? 'İşəgötürən Xərcləri' : 'Employer Costs'} →
                      </th>
                    </tr>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="text-left px-4 py-3 sticky left-0 bg-gray-50 z-10 border-r border-gray-100">{t('pay.fullName')}</th>
                      <th className="text-left px-4 py-3 border-r border-gray-100">{t('pay.position')}</th>
                      <th className="text-right px-4 py-3 text-blue-600 border-r border-blue-100">{lang === 'az' ? 'Brüt' : 'Gross'}</th>
                      <th className="text-right px-4 py-3 text-red-500">{t('pay.pitDeduction')}</th>
                      <th className="text-right px-4 py-3 text-red-500">{t('pay.pit')}</th>
                      <th className="text-right px-4 py-3 text-red-500">{t('pay.empSocial')}</th>
                      <th className="text-right px-4 py-3 text-red-500">{t('pay.empHealth')}</th>
                      <th className="text-right px-4 py-3 text-red-500">{t('pay.empUnemployment')}</th>
                      <th className="text-right px-4 py-3 font-bold text-red-700 border-r border-red-100">{t('pay.totalDeductions')}</th>
                      <th className="text-right px-4 py-3 font-bold text-green-700 border-r border-green-100">{t('pay.netSalary')}</th>
                      <th className="text-right px-4 py-3 text-orange-500">{t('pay.emplrSocial')}</th>
                      <th className="text-right px-4 py-3 text-orange-500">{t('pay.emplrHealth')}</th>
                      <th className="text-right px-4 py-3 text-orange-500">{t('pay.emplrUnemployment')}</th>
                      <th className="text-right px-4 py-3 font-bold text-orange-700">{t('pay.totalCost')}</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-50">
                    {payrollRows.map(({ emp, r }) => (
                      <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3.5 sticky left-0 bg-white hover:bg-slate-50 z-10 border-r border-gray-100">
                          <p className="font-semibold text-gray-900 whitespace-nowrap">{emp.full_name}</p>
                          <span className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded-full mt-0.5 ${SECTOR_STYLES[emp.payroll_sector]}`}>
                            {emp.payroll_sector === 'private_non_oil'
                              ? (lang === 'az' ? 'Özəl' : 'Private')
                              : (lang === 'az' ? 'Neft/Dövlət' : 'Oil/Public')}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap border-r border-gray-100">{emp.position}</td>
                        <td className="px-4 py-3.5 text-right font-semibold text-blue-700 tabular-nums border-r border-blue-100">
                          {n2(r.gross)}
                        </td>
                        <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{n2(r.pitDeduction)}</td>
                        <td className="px-4 py-3.5 text-right text-red-600 tabular-nums">{n2(r.pit)}</td>
                        <td className="px-4 py-3.5 text-right text-red-600 tabular-nums">{n2(r.empSocial)}</td>
                        <td className="px-4 py-3.5 text-right text-red-600 tabular-nums">{n2(r.empHealth)}</td>
                        <td className="px-4 py-3.5 text-right text-red-600 tabular-nums">{n2(r.empUnemployment)}</td>
                        <td className="px-4 py-3.5 text-right font-bold text-red-700 tabular-nums border-r border-red-100">
                          {n2(r.totalEmpDeductions)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold text-green-700 tabular-nums border-r border-green-100">
                          {n2(r.netSalary)}
                        </td>
                        <td className="px-4 py-3.5 text-right text-orange-600 tabular-nums">{n2(r.emplrSocial)}</td>
                        <td className="px-4 py-3.5 text-right text-orange-600 tabular-nums">{n2(r.emplrHealth)}</td>
                        <td className="px-4 py-3.5 text-right text-orange-600 tabular-nums">{n2(r.emplrUnemployment)}</td>
                        <td className="px-4 py-3.5 text-right font-bold text-orange-700 tabular-nums">
                          {n2(r.totalEmployerCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Totals row */}
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-900">
                      <td colSpan={2} className="px-4 py-3.5 sticky left-0 bg-gray-50 border-r border-gray-100 text-sm">
                        {lang === 'az' ? 'CƏMİ' : 'TOTAL'} ({payrollRows.length})
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-blue-700 border-r border-blue-100">
                        {n2(totals.gross)}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-gray-500">{n2(totals.pit > 0 ? 0 : 0)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-red-700">{n2(totals.pit)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-red-700">{n2(totals.empSocial)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-red-700">{n2(totals.empHealth)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-red-700">{n2(totals.empUnemployment)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-red-800 border-r border-red-100">
                        {n2(totals.totalEmpDed)}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-green-800 border-r border-green-100">
                        {n2(totals.netSalary)}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-orange-700">{n2(totals.emplrSocial)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-orange-700">{n2(totals.emplrHealth)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-orange-700">{n2(totals.emplrUnemployment)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-orange-800">
                        {n2(totals.totalCost)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Rate legend */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">
                {t('pay.privateNonOil')}
              </p>
              <div className="text-xs text-gray-500 space-y-1 leading-relaxed">
                <p><span className="font-semibold text-gray-700">PIT:</span> ≤2,500→3% · 2,500-8,000→₼75+10% · &gt;8,000→₼625+14%</p>
                <p><span className="font-semibold text-gray-700">{lang==='az'?'İşçi Sos.:':'Emp. Social:'}</span> ≤200→3% · &gt;200→₼6+10%</p>
                <p><span className="font-semibold text-gray-700">{lang==='az'?'İşv. Sos.:':'Empl. Social:'}</span> ≤200→22% · &gt;200→₼44+15%</p>
                <p><span className="font-semibold text-gray-700">{lang==='az'?'Sağlamlıq:':'Health:'}</span> ≤2,500→2% · &gt;2,500→₼50+0.5% (hər tərəf)</p>
                <p><span className="font-semibold text-gray-700">{lang==='az'?'İşsizlik:':'Unemp.:'}</span> 0.5% hər tərəf</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-2">
                {t('pay.oilGasPublic')}
              </p>
              <div className="text-xs text-gray-500 space-y-1 leading-relaxed">
                <p><span className="font-semibold text-gray-700">PIT:</span> ≤2,500→14% · &gt;2,500→₼350+25%</p>
                <p><span className="font-semibold text-gray-700">{lang==='az'?'İşçi Sos.:':'Emp. Social:'}</span> 3%</p>
                <p><span className="font-semibold text-gray-700">{lang==='az'?'İşv. Sos.:':'Empl. Social:'}</span> 22%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ ADD / EDIT EMPLOYEE MODAL ══════════════════════════════════════ */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingId !== null ? t('pay.editEmployee') : t('pay.addEmployee')}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {editingId !== null ? t('pay.updateDetails') : t('pay.fillDetails')}
                </p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-4">

                {/* Full Name + Position */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pay.fullName')}</label>
                    <input
                      type="text" required value={form.full_name} onChange={field('full_name')}
                      placeholder="e.g. Elşad Əliyev"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pay.position')}</label>
                    <input
                      type="text" required value={form.position} onChange={field('position')}
                      placeholder="e.g. Manager"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pay.grossSalary')}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium select-none">₼</span>
                      <input
                        type="number" required min="0" step="0.01" value={form.gross_salary}
                        onChange={field('gross_salary')}
                        placeholder="0.00"
                        className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Employment Type + Start Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pay.employmentType')}</label>
                    <div className="relative">
                      <select
                        value={form.employment_type} onChange={field('employment_type')}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-8"
                      >
                        <option value="full-time">{t('pay.fullTime')}</option>
                        <option value="part-time">{t('pay.partTime')}</option>
                        <option value="contractor">{t('pay.contractor')}</option>
                      </select>
                      <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pay.startDate')}</label>
                    <input
                      type="date" required value={form.start_date} onChange={field('start_date')}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                {/* Payroll Sector + Status (edit only) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pay.payrollSector')}</label>
                    <div className="relative">
                      <select
                        value={form.payroll_sector} onChange={field('payroll_sector')}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-8"
                      >
                        <option value="private_non_oil">{t('pay.privateNonOil')}</option>
                        <option value="oil_gas_public">{t('pay.oilGasPublic')}</option>
                      </select>
                      <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  {editingId !== null && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pay.status')}</label>
                      <div className="relative">
                        <select
                          value={form.status} onChange={field('status')}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-8"
                        >
                          <option value="active">{t('pay.active')}</option>
                          <option value="inactive">{t('pay.inactive')}</option>
                        </select>
                        <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>

                {/* Is Main Workplace toggle */}
                <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{t('pay.isMainWorkplace')}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {lang === 'az'
                        ? 'Aylıq maaş ≤₼2,500 üçün ₼200 GV güzəşti tətbiq edilir'
                        : 'AZN 200 PIT deduction applies if gross ≤ AZN 2,500'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, is_main_workplace: !p.is_main_workplace }))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${form.is_main_workplace ? 'bg-blue-600' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_main_workplace ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm disabled:opacity-60">
                  {saving ? t('common.saving') : editingId !== null ? t('common.saveChanges') : t('pay.addEmployee')}
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
          {toast.ok ? (
            <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}

    </div>
  )
}
