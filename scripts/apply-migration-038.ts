/**
 * Apply migration 038 data changes via Supabase service role.
 * DDL parts (ALTER TABLE) must be applied in the Supabase SQL editor first.
 * Run: npx tsx scripts/apply-migration-038.ts
 */

import dotenv from 'dotenv'
import path   from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function run() {
  console.log('\n🔧 Migration 038 — applying data fixes...\n')

  // ── 1. Fix Table product sale_price ────────────────────────────────────────
  {
    const { data: tbl, error: e1 } = await db
      .from('products')
      .select('id, name, cost_price, sale_price')
      .ilike('name', '%table%')
      .eq('sale_price', 0)

    if (e1) { console.error('  ❌ products query:', e1.message); return }

    for (const p of tbl ?? []) {
      const newPrice = Math.round(Number(p.cost_price) * 1.3 * 100) / 100
      const { error } = await db.from('products').update({ sale_price: newPrice }).eq('id', p.id)
      if (error) {
        console.error(`  ❌ update products ${p.name}: ${error.message}`)
      } else {
        console.log(`  ✅ products.${p.name}: sale_price ${p.sale_price} → ${newPrice} AZN (cost ${p.cost_price} × 1.3)`)
      }
    }
    if ((tbl ?? []).length === 0) {
      console.log('  ℹ️  No Table products with sale_price=0 found (already fixed?)')
    }
  }

  // ── 2. Backfill stock_movements for DEL-004 (500 Kreslo × ₼30) ─────────────
  {
    // Try by notes first
    const { error: e2a } = await db
      .from('stock_movements')
      .update({ unit_cost: 30, total_cost: 15000 })
      .eq('movement_type', 'out')
      .eq('notes', 'DEL: DEL-2026-004')
      .is('unit_cost', null)

    if (e2a) {
      console.error('  ❌ stock_movements DEL-004 (notes):', e2a.message)
    } else {
      console.log('  ✅ stock_movements: DEL-2026-004 unit_cost/total_cost set (notes match)')
    }

    // Fallback: match by qty + product join (Kreslo -500)
    const { data: rows, error: e2b } = await db
      .from('stock_movements')
      .select('id, quantity, unit_cost, product_id')
      .eq('movement_type', 'out')
      .eq('quantity', -500)
      .is('unit_cost', null)

    if (e2b) {
      console.error('  ❌ stock_movements DEL-004 query (fallback):', e2b.message)
    } else if (rows && rows.length > 0) {
      for (const row of rows) {
        const { data: prod } = await db.from('products').select('name').eq('id', row.product_id).single()
        if (prod?.name?.toLowerCase().includes('kreslo')) {
          const { error } = await db.from('stock_movements')
            .update({ unit_cost: 30, total_cost: 15000 })
            .eq('id', row.id)
          if (error) console.error(`  ❌ fallback update DEL-004: ${error.message}`)
          else console.log(`  ✅ stock_movements fallback: DEL-004 Kreslo unit_cost=30, total_cost=15000`)
        }
      }
    }
  }

  // ── 3. Backfill stock_movements for DEL-005 (798 Table × ₼8) ───────────────
  {
    const { error: e3a } = await db
      .from('stock_movements')
      .update({ unit_cost: 8, total_cost: 6384 })
      .eq('movement_type', 'out')
      .eq('notes', 'DEL: DEL-2026-005')
      .is('unit_cost', null)

    if (e3a) {
      console.error('  ❌ stock_movements DEL-005 (notes):', e3a.message)
    } else {
      console.log('  ✅ stock_movements: DEL-2026-005 unit_cost/total_cost set (notes match)')
    }

    // Fallback: match by qty + product join (Table -798)
    const { data: rows, error: e3b } = await db
      .from('stock_movements')
      .select('id, quantity, unit_cost, product_id')
      .eq('movement_type', 'out')
      .eq('quantity', -798)
      .is('unit_cost', null)

    if (e3b) {
      console.error('  ❌ stock_movements DEL-005 query (fallback):', e3b.message)
    } else if (rows && rows.length > 0) {
      for (const row of rows) {
        const { data: prod } = await db.from('products').select('name').eq('id', row.product_id).single()
        if (prod?.name?.toLowerCase().includes('table')) {
          const { error } = await db.from('stock_movements')
            .update({ unit_cost: 8, total_cost: 6384 })
            .eq('id', row.id)
          if (error) console.error(`  ❌ fallback update DEL-005: ${error.message}`)
          else console.log(`  ✅ stock_movements fallback: DEL-005 Table unit_cost=8, total_cost=6384`)
        }
      }
    }
  }

  // ── 4. tax_settings: vat_threshold_exceeded + employee_count ───────────────
  //    These columns are added by the DDL part of migration 038.
  //    If columns don't exist yet, the UPDATE will fail — that's OK.
  {
    const { error: e4 } = await db
      .from('tax_settings')
      .update({
        vat_threshold_exceeded: true,
        vat_next_filing_date:   '2026-06-20',
        employee_count:         6,
      } as Record<string, unknown>)
      .eq('vat_registered', true)

    if (e4) {
      if (e4.message.includes('vat_threshold_exceeded') || e4.message.includes('column')) {
        console.log('  ⚠️  tax_settings DDL not applied yet — apply ALTER TABLE section of migration 038 in Supabase SQL editor first')
      } else {
        console.error('  ❌ tax_settings update:', e4.message)
      }
    } else {
      console.log('  ✅ tax_settings: vat_threshold_exceeded=true, vat_next_filing_date=2026-06-20, employee_count=6')
    }
  }

  // ── Verify ─────────────────────────────────────────────────────────────────
  console.log('\n🔍 Verification:\n')

  const { data: prod } = await db.from('products').select('name, sale_price, cost_price').ilike('name', '%table%').single()
  console.log(`  products Table: sale_price=${prod?.sale_price ?? 'N/A'}  cost_price=${prod?.cost_price ?? 'N/A'}`)

  const { data: smDel4 } = await db.from('stock_movements').select('quantity, unit_cost, total_cost, notes')
    .eq('movement_type', 'out').or('notes.eq.DEL: DEL-2026-004,quantity.eq.-500').limit(3)
  console.log('  stock_movements DEL-004 candidates:', JSON.stringify(smDel4?.slice(0,2) ?? []))

  const { data: smDel5 } = await db.from('stock_movements').select('quantity, unit_cost, total_cost, notes')
    .eq('movement_type', 'out').or('notes.eq.DEL: DEL-2026-005,quantity.eq.-798').limit(3)
  console.log('  stock_movements DEL-005 candidates:', JSON.stringify(smDel5?.slice(0,2) ?? []))

  console.log('\n✅ Migration 038 data fixes complete.\n')
}

run().catch(console.error)
