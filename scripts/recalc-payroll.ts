/**
 * Recalculates payroll_entries for given months using the corrected lib/payroll.ts.
 * Uses stored adjusted_gross + payroll_sector + is_main_workplace from the entry
 * (the gross calculation was already correct; only the tax rates were wrong).
 *
 * Run:  npx tsx scripts/recalc-payroll.ts
 */

import dotenv from 'dotenv'
import path   from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { calcPayroll, type PayrollSector } from '../lib/payroll'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ── Reference check (no DB needed) ───────────────────────────────────────────

function referenceCheck() {
  // 9,000 AZN gross, private_non_oil, not main workplace (no Art.102 deduction)
  // HI 2026: (2,500×2%) + (6,500×0.5%) = 50 + 32.5 = 82.5 AZN
  // Net: 9,000 − PIT(1,370) − SI(270) − HI(82.5) − UI(45) = 7,232.5 AZN
  console.log('\n📐 Reference check — Gross 9,000 AZN (private_non_oil, not main workplace):')
  const r = calcPayroll(9000, 'private_non_oil', false)
  const ok = (field: string, got: number, exp: number) => {
    const pass = Math.abs(got - exp) < 0.001
    console.log(`   ${pass ? '✅' : '❌'} ${field.padEnd(20)} got=${got}  expected=${exp}`)
    return pass
  }
  const all = [
    ok('PIT',              r.pit,              1370),
    ok('empSocial',        r.empSocial,          270),
    ok('empHealth',        r.empHealth,           82.5),   // (2,500×2%)+(6,500×0.5%)
    ok('empUnemployment',  r.empUnemployment,      45),
    ok('netSalary',        r.netSalary,         7232.5),
    ok('emplrSocial',      r.emplrSocial,        1980),
    ok('emplrHealth',      r.emplrHealth,          82.5),
    ok('emplrUnemployment',r.emplrUnemployment,    45),
    ok('totalEmployerCost',r.totalEmployerCost, 11107.5),  // 9000+1980+82.5+45
  ]
  return all.every(Boolean)
}

// ── Per-month recalculation ───────────────────────────────────────────────────

async function recalcMonth(year: number, month: number) {
  const label = `${year}-${String(month).padStart(2, '0')}`
  console.log(`\n── ${label} ─────────────────────────────────────`)

  const { data: runs, error: runErr } = await db
    .from('payroll_runs')
    .select('id, status, expense_id')
    .eq('year', year)
    .eq('month', month)

  if (runErr) { console.error('  ❌ Run query error:', runErr.message); return }
  if (!runs?.length) { console.log('  ⚠️  No payroll run found — skipping'); return }

  for (const run of runs) {
    console.log(`  Run #${run.id}  status=${run.status}  expense_id=${run.expense_id ?? 'none'}`)

    const { data: entries, error: entryErr } = await db
      .from('payroll_entries')
      .select('id, employee_id, adjusted_gross, payroll_sector, is_main_workplace, net_salary, pit')
      .eq('run_id', run.id)

    if (entryErr) { console.error('  ❌ Entry query error:', entryErr.message); continue }
    if (!entries?.length) { console.log('  ⚠️  No entries — skipping'); continue }

    // Recalculate each entry using corrected calcPayroll
    const updates: Record<string, unknown>[] = []
    for (const e of entries) {
      const tax = calcPayroll(
        Number(e.adjusted_gross),
        e.payroll_sector as PayrollSector,
        e.is_main_workplace,
      )
      console.log(
        `  emp#${String(e.employee_id).padEnd(3)} gross=${e.adjusted_gross}` +
        `  PIT ${e.pit}→${tax.pit}` +
        `  net ${e.net_salary}→${tax.netSalary}`,
      )
      updates.push({
        id:                   e.id,
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
      })
    }

    // Update each entry by primary key (GENERATED ALWAYS AS IDENTITY — can't upsert)
    let failed = 0
    for (const u of updates) {
      const { id, ...fields } = u as { id: number } & Record<string, unknown>
      const { error: upErr } = await db.from('payroll_entries').update(fields).eq('id', id)
      if (upErr) { console.error(`    ❌ Entry #${id}: ${upErr.message}`); failed++ }
    }
    if (failed) { console.log(`  ❌ ${failed} entries failed`); continue }
    console.log(`  ✅ ${updates.length} entries corrected`)

    // Update total_employer_cost on the linked expense if present
    if (run.expense_id) {
      const totalCost = updates.reduce((s, u) => s + Number(u.total_employer_cost), 0)
      const { error: expErr } = await db
        .from('expenses')
        .update({ amount: Math.round(totalCost * 100) / 100 })
        .eq('id', run.expense_id)
      if (expErr) console.log(`  ⚠️  Expense update error: ${expErr.message}`)
      else console.log(`  ✅ Expense #${run.expense_id} amount updated to ${Math.round(totalCost * 100) / 100}`)
    }

    // Re-approve the run (it was already approved — just refresh approved_at)
    if (run.status === 'approved') {
      const { error: approveErr } = await db
        .from('payroll_runs')
        .update({ approved_at: new Date().toISOString() })
        .eq('id', run.id)
      if (approveErr) console.log(`  ⚠️  Run re-approve error: ${approveErr.message}`)
      else console.log(`  ✅ Run #${run.id} re-approved`)
    }
  }
}

// ── Verify final DB state ─────────────────────────────────────────────────────

async function verifyDb(year: number, month: number) {
  const { data: runs } = await db.from('payroll_runs').select('id').eq('year', year).eq('month', month)
  if (!runs?.length) return
  for (const run of runs) {
    const { data: entries } = await db
      .from('payroll_entries')
      .select('employee_id, adjusted_gross, payroll_sector, is_main_workplace, pit, net_salary, emp_social, emp_health, emp_unemployment')
      .eq('run_id', run.id)
    console.log(`\n  Verification — Run #${run.id} (${year}-${String(month).padStart(2,'0')}):`)
    console.log('  emp#  gross     PIT       empSI    empHI   UI      net       pitDed  check')
    console.log('  ' + '─'.repeat(80))
    let allPass = true
    for (const e of entries ?? []) {
      const ref = calcPayroll(Number(e.adjusted_gross), e.payroll_sector as PayrollSector, e.is_main_workplace)
      const pitMatch = Math.abs(Number(e.pit) - ref.pit) < 0.01
      const netMatch = Math.abs(Number(e.net_salary) - ref.netSalary) < 0.01
      const pass = pitMatch && netMatch
      if (!pass) allPass = false
      console.log(
        `  ${String(e.employee_id).padEnd(4)}  ${String(e.adjusted_gross).padEnd(8)}  ${String(e.pit).padEnd(8)}  ` +
        `${String(e.emp_social).padEnd(7)}  ${String(e.emp_health).padEnd(6)}  ${String(e.emp_unemployment).padEnd(6)}  ` +
        `${String(e.net_salary).padEnd(8)}  ${String(ref.pitDeduction).padEnd(6)}  ` +
        (pass ? '✅' : `❌ expect PIT=${ref.pit} net=${ref.netSalary}`)
      )
    }
    if (allPass) console.log(`\n  ✅ All entries match corrected calcPayroll`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║  AzFinance Payroll Recalculation — Corrected Tax Rates  ║')
  console.log('╚══════════════════════════════════════════════════════════╝')

  // Step 1: Verify the reference math before touching the DB
  const refOk = referenceCheck()
  if (!refOk) {
    console.error('\n❌ Reference check failed — lib/payroll.ts has errors. Aborting.')
    process.exit(1)
  }
  console.log('\n✅ Reference check passed — proceeding with DB update\n')

  // Step 2: Recalculate
  await recalcMonth(2026, 5)   // May 2026
  await recalcMonth(2026, 6)   // June 2026

  // Step 3: Verify DB state
  console.log('\n── Post-update verification ──────────────────────────────')
  await verifyDb(2026, 5)
  await verifyDb(2026, 6)

  console.log('\n' + '─'.repeat(60))
  console.log('Done. Re-run npm run test:agent:payroll to confirm full audit.')
}

main().catch(e => { console.error('\n❌', e); process.exit(1) })
