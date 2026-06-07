# AzFinance ERP — System Specification for AI Testing

> Version: 2026-06-07  
> Stack: Next.js 16 (App Router) + Supabase (PostgreSQL) + Vercel  
> Currency: AZN (Azerbaijani Manat). All monetary amounts in AZN unless stated otherwise.

---

## 1. SYSTEM OVERVIEW

AzFinance is a cloud-based ERP for small and medium Azerbaijani businesses. It manages the full business cycle: procurement → warehouse → sales → invoicing → payroll → reporting, with built-in Azerbaijan tax compliance.

### Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.2.5, App Router, React Server Components |
| Auth proxy | `proxy.ts` (NOT `middleware.ts` — this version uses a custom file name) |
| Backend | Supabase (PostgreSQL 15), Row-Level Security on every table |
| Auth | Supabase Auth (email/password + magic link) |
| Hosting | Vercel (Fluid Compute) |
| Language | TypeScript 5 throughout |

### Multi-tenancy Model

Every row in every data table carries `company_id`. RLS enforces isolation via a SECURITY DEFINER function:

```sql
get_my_company_id() → UUID
-- Returns company_id from company_members WHERE user_id = auth.uid() AND status = 'active'
```

All mutations auto-stamp `company_id` via `BEFORE INSERT` triggers (`auto_set_company_id()`).

### Onboarding Flow

1. `/signup` — create Supabase account → redirect to `/create-company`
2. `/create-company` — enter company name, industry (required), tax ID; creates `companies` row + `company_members` (role=admin) + `tax_settings` with AZ defaults + auto-creates 14-day trial subscription
3. Dashboard loads — `useCompany()` hook hydrates `company`, `role`, feature access

---

## 2. MODULES & FEATURES

### Subscription Packages

| Package | Price/month | Features |
|---------|------------|----------|
| **Light** | 29 AZN | Dashboard, Invoices, Expenses, Clients, Vendors, Reports, Tax, Payroll, Company Settings, Billing |
| **Mid** | 79 AZN | Light + Purchase Requests, Purchase Orders, Goods Receipt, Inventory Basic, Sales Orders |
| **Enterprise** | 199 AZN | Mid + Vendor Portal, Inventory Advanced, Multi-Company, API Access |
| **Trial** | Free / 14 days | Mid-level features |

Expired/cancelled subscriptions fall back to Light feature set.

### Feature Gating

```typescript
resolveFeatureSet(pkg, status, isTrialActive) → string[]
// expired/cancelled → LIGHT features only
// isTrialActive → MID features
// else → package features
```

### Module Inventory

#### 2.1 Dashboard (`/`)
- KPI cards: Revenue (current month), Expenses (current month), Outstanding Invoices, Net Cash Position
- Recent Activity card — live feed from `activity_logs` with 30-second auto-refresh
- Charts: monthly revenue vs expenses bar chart, expense breakdown pie chart
- Quick-action buttons: New Invoice, New Expense, New Employee

#### 2.2 Invoices (`/invoices`)
- Create invoices with line items (description, quantity, unit price)
- Optional VAT (18%) per invoice — `vat_applied` boolean
- Statuses: `Draft` → `Sent` → `Paid` (or `Overdue`)
- Auto-number: `INV-{sequential}` starting from 1001
- Mark as Paid action
- Delete action
- PDF export (browser print)
- Logged actions: `created`, `marked_paid`, `deleted`

#### 2.3 Expenses (`/expenses`)
- Categories: Office, Utilities, Salaries, Transport, Marketing, Professional Services, Bank & Finance, Other, COGS, Depreciation
- Subcategories per category (e.g., Office → Rent, Supplies, Equipment, Repairs)
- Recurring expenses: frequency = `monthly | quarterly | annual`; auto-calculates `next_due_date`
- `is_recurring` flag; `source` field: `manual | procurement | payroll`
- VAT-enabled expenses
- Payment status: `pending | paid`
- Templates for frequently-used expenses
- Logged actions: `created`, `marked_paid`

#### 2.4 Clients (`/clients`)
- Fields: company name, contact person, email, phone, address, VÖEN (tax ID)
- Linked to invoices and sales orders

#### 2.5 Vendors (`/vendors`)
- Fields: company name, contact, email, phone, address, VÖEN
- Linked to purchase orders and expenses

#### 2.6 Payroll (`/payroll`) — requires Light
- Employee management: full_name, position, gross_salary, employment_type, payroll_sector, is_main_workplace, start_date
- Monthly payroll run with individual employee entries
- Working-day overrides per month (`payroll_wd_overrides`)
- Vacation days, overtime hours, bonus, other additions/deductions per entry
- Payroll run statuses: `draft` → `approved`
- Auto-creates salary expense row on approval (source = `payroll`)
- Logged action: `approved`

#### 2.7 Purchase Requests (`/procurement/requests`) — requires Mid
- Raised by any user; approved by manager/admin
- Auto-number: `PR-YYYY-NNN`
- Statuses: `draft → submitted → approved → rejected → ordered`
- Priority: `low | normal | high | urgent`
- Links to vendor, contains items JSONB

#### 2.8 Purchase Orders (`/procurement/orders`) — requires Mid
- Created from approved PR or standalone
- Auto-number: `PO-YYYY-NNN`
- Line items with quantity, unit price, VAT
- Subtotal + VAT amount + total
- Statuses: `draft → sent → confirmed → partially_received → received → cancelled`
- Logged action: `created`

#### 2.9 Goods Receipts (`/procurement/receipts`) — requires Mid
- Created against a PO
- Auto-number: `GR-YYYY-NNN`
- Confirm action (`confirm_goods_receipt` RPC):
  - Creates `pending` expense (source=procurement, linked to vendor)
  - Updates stock via weighted average cost
  - Updates PO status to `received`
  - Creates `stock_movements` (type=`in`) to default warehouse
- Logged action: `confirmed`

#### 2.10 Sales Orders (`/sales/orders`) — requires Mid
- Auto-number: `SO-YYYY-NNN`
- Line items from product catalog or manual
- Statuses: `draft → confirmed → delivered → invoiced → cancelled`
- Linked to client, contains items JSONB with product_id, quantity, unit_price
- Logged action: `created`

#### 2.11 Deliveries (`/sales/deliveries`) — requires Mid
- Created from confirmed SO
- Auto-number: `DEL-YYYY-NNN`
- Confirm action (`confirm_delivery` RPC):
  - Deducts stock FIFO from `product_batches`
  - Calculates COGS per item from FIFO batches
  - Creates draft invoice linked to SO
  - Updates SO status to `delivered` + links invoice
- Logged action: `confirmed`

#### 2.12 Inventory / Warehouse (`/inventory`) — requires Mid (basic) / Enterprise (advanced)
- Product catalog with SKU, name, description, category, unit, cost_price, sale_price, stock_qty, min_stock_level
- Units: əd (piece), kq, q, litr, ml, m, m², m³, qutu, dəst
- Warehouses table (default warehouse auto-created on company setup, named "Əsas Anbar")
- `warehouse_stock`: per-product per-warehouse quantity + avg_cost
- `stock_movements`: full movement log (in/out/adjustment/transfer)
- `product_batches`: FIFO batch tracking — each GR creates a batch
- Stock adjustment via `adjust_stock()` RPC
- Resale flag (`is_resale`) on products

#### 2.13 Reports (`/reports`)
- Profit & Loss report (Revenue - COGS - Operating Expenses)
- Expense Breakdown by category
- VAT Summary (input VAT vs output VAT)
- Payroll Summary
- **Gross Margin Report** — Revenue from SO items using `products.sale_price` as live price override, COGS from FIFO batches

#### 2.14 Tax (`/tax`)
- Tax settings display: regime, VAT registration status, VAT threshold flag
- Tax calendar with AZ filing deadlines

#### 2.15 Company Settings (`/company-settings`)
- **Company Tab** (admin): name, address, city, tax ID, phone, email, bank details
- **Team Tab** (admin): invite members by email + role; manage existing members; delete members
  - Invitation token system — 7-day expiry, accepted via `/signup?invite=TOKEN`
  - Logged actions: `invited`, `removed`
- **Activity Log Tab** (admin + manager): full audit trail from `activity_logs`

#### 2.16 Billing (`/billing`) — admin only
- View current subscription package, status, trial end date
- Upgrade/downgrade package

---

## 3. AZERBAIJAN COMPLIANCE

### 3.1 VAT (ƏDV) — Vergi Məcəlləsi Art. 159-177

| Rule | Detail |
|------|--------|
| Standard rate | 18% |
| Zero rate | Exports, international transport, medicines (Art. 164) |
| Exempt | Education, medical services, banking, insurance (Art. 163) |
| Registration threshold | 200,000 AZN cumulative 12-month revenue |
| `vat_threshold_exceeded` | Boolean flag in `tax_settings`; set when revenue > 200,000 AZN |
| Quarterly filing deadline | 20th of the month following the quarter |
| `vat_next_filing_date` | Stored in `tax_settings` |
| VAT invoice requirement | Required for registered businesses on all taxable supplies |

### 3.2 Profit Tax (Mənfəət Vergisi) — Art. 105-125

| Rule | Detail |
|------|--------|
| Standard rate | 20% on net profit |
| SME reduced rate | 3% for micro-enterprises (revenue < 200,000 AZN) |
| Non-deductible expenses | Fines, penalties, gifts > 100 AZN, entertainment > 1% revenue |
| Deductible depreciation | Buildings 7%, Machinery 20%, Vehicles 25%, Intangibles 10% |
| Annual filing | 31 March of the following year |
| Quarterly advance payments | By 15th of month following the quarter |

### 3.3 Simplified Tax (Sadələşdirilmiş Vergi) — Art. 218-232

| Rule | Detail |
|------|--------|
| Qualification | Revenue ≤ 200,000 AZN/year AND not VAT-registered |
| Rate (Baku) | 2% of revenue |
| Rate (other regions) | 0.5% of revenue |
| Excluded activities | Oil/gas, banking, insurance, professional services, import/export |
| Filing | Quarterly by 20th of the following month |

### 3.4 Income Tax (Gəlir Vergisi / PIT) — Art. 96-102

Progressive brackets:

| Gross | Rate |
|-------|------|
| 0–8,000 AZN | 14% |
| > 8,000 AZN | 1,120 AZN + 25% on excess |

**Art. 102 Exemption** (private non-oil sector, main workplace only):
- Monthly 200 AZN deduction from gross if gross ≤ 2,500 AZN

**Deadlines:**
- Monthly payroll tax: 20th of the following month
- Annual declaration: 31 March

### 3.5 Social Insurance (DSMF)

| Sector | Employee | Employer |
|--------|----------|----------|
| Private non-oil | 3% of gross | 22% of gross |
| Oil/gas & public | 3% of gross | 22% of gross |

### 3.6 Health Insurance (Mandatory — 2026 rates, private non-oil only)

| Portion | Employee | Employer |
|---------|----------|----------|
| Gross ≤ 2,500 AZN | 2% | 2% (same) |
| Gross > 2,500 AZN | 0.5% on excess | 0.5% on excess |

*Oil/gas and public sector employees: no health insurance deduction.*

### 3.7 Unemployment Insurance (private non-oil only)

- Employee: 0.5% of gross
- Employer: 0.5% of gross

### 3.8 Payroll Calculation Engine (`lib/payroll.ts`)

```
calcGross(base, vacationDays, overtimeHours, bonus, otherAdd, otherDed, wd, hasFullHistory)

Vacation pay = max(
  Method A: base × 12 / 365 × vacation_days,   -- annual-average daily rate
  Method B: base / 30 × vacation_days,           -- calendar-day rate
  Floor:    base / wd × vacation_days            -- working-day floor (vacation ≥ daily wage)
)

Overtime pay = (base / wd / 8) × 1.5 × overtime_hours

Gross = working_days_pay + vacation_pay + overtime_pay + bonus + otherAdd - otherDed
```

**Private non-oil net salary:**
```
PIT deduction = 200 if (isMainWorkplace AND gross ≤ 2,500) else 0
PIT = (gross - deduction) × 14%  [or 1,120 + (gross-deduction-8000) × 25%]
Employee deductions = PIT + social(3%) + health(bracket) + unemployment(0.5%)
Net = gross - employee deductions
Total employer cost = gross + employer_social(22%) + employer_health + employer_unemployment(0.5%)
```

---

## 4. DATABASE SCHEMA

All tables have RLS enabled. `company_id` is mandatory on all data tables.

### Core Org Tables

#### `companies`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | TEXT | |
| owner_id | UUID → auth.users | |
| tax_id | TEXT | VÖEN |
| created_at | TIMESTAMPTZ | |

#### `company_members`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| company_id | UUID → companies | |
| user_id | UUID → auth.users | |
| role | TEXT | admin \| manager \| finance \| employee |
| invited_email | TEXT | |
| status | TEXT | active \| pending |
| created_at | TIMESTAMPTZ | |

Unique constraint: `(company_id, user_id)`

#### `company_invitations`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| company_id | UUID | |
| invited_email | TEXT | |
| role | TEXT | admin \| manager \| finance \| employee |
| token | TEXT UNIQUE | 64-char hex, auto-generated |
| invited_by | UUID | |
| status | TEXT | pending \| accepted \| expired |
| expires_at | TIMESTAMPTZ | now() + 7 days |

#### `company_subscriptions`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| company_id | UUID UNIQUE | |
| package | TEXT | light \| mid \| enterprise |
| status | TEXT | trial \| active \| expired \| cancelled |
| trial_ends_at | TIMESTAMPTZ | now() + 14 days |
| paid_until | TIMESTAMPTZ | |

Auto-created by trigger on company insert.

#### `company_settings`
| Column | Type | Notes |
|--------|------|-------|
| company_id | UUID PK | |
| currency | TEXT | default 'AZN' |
| accounting_method | TEXT | accrual \| cash |
| industry | TEXT | |

Additional columns added in earlier migrations: `company_name`, `company_address`, `city`, `tax_id` (on old single-user rows), `phone`, `email`, `bank_name`, `bank_account`, `swift_code`.

#### `tax_settings`
| Column | Type | Notes |
|--------|------|-------|
| company_id | UUID | |
| user_id | UUID | legacy |
| tax_regime | TEXT | profit_tax \| simplified \| vat_only |
| business_type | TEXT | general \| oil_gas \| startup |
| vat_registered | BOOLEAN | |
| simplified_eligible | BOOLEAN | |
| payroll_sector | TEXT | private_non_oil \| oil_gas_public |
| employee_count | INT | |
| vat_threshold_exceeded | BOOLEAN | set when revenue > 200,000 AZN |
| vat_next_filing_date | DATE | quarterly deadline |

### Financial Tables

#### `invoices`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK (identity) | |
| company_id | UUID | |
| user_id | UUID | |
| number | TEXT | INV-1001, INV-1002, … |
| client | TEXT | |
| client_id | BIGINT → clients | |
| client_email | TEXT | |
| client_address | TEXT | |
| date | DATE | |
| due_date | DATE | |
| amount | NUMERIC(12,2) | total including VAT |
| status | TEXT | Draft \| Sent \| Paid \| Overdue |
| line_items | JSONB | [{description, quantity, unit_price, total}] |
| vat_applied | BOOLEAN | |
| subtotal | NUMERIC(12,2) | |
| vat_amount | NUMERIC(12,2) | |

#### `expenses`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK (identity) | |
| company_id | UUID | |
| user_id | UUID | |
| date | DATE | |
| description | TEXT | |
| category | TEXT | MainCategory enum |
| subcategory | TEXT | |
| amount | NUMERIC(12,2) | |
| is_recurring | BOOLEAN | |
| frequency | TEXT | monthly \| quarterly \| annual |
| next_due_date | DATE | auto-calculated |
| is_payroll_generated | BOOLEAN | |
| source | TEXT | manual \| procurement \| payroll |
| vendor_id | BIGINT → vendors | |
| payment_status | TEXT | pending \| paid |
| vat_enabled | BOOLEAN | |

#### `expense_templates`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| company_id | UUID | |
| user_id | UUID | |
| name | TEXT | |
| description | TEXT | |
| category | TEXT | |
| subcategory | TEXT | |
| amount | NUMERIC(12,2) | |
| is_recurring | BOOLEAN | |
| frequency | TEXT | |

### HR & Payroll Tables

#### `employees`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK (identity) | |
| company_id | UUID | |
| full_name | TEXT | |
| position | TEXT | |
| gross_salary | NUMERIC(12,2) | |
| employment_type | TEXT | full-time \| part-time \| contractor |
| status | TEXT | active \| inactive |
| start_date | DATE | |
| is_main_workplace | BOOLEAN | true = primary employer (Art.102 exemption) |
| payroll_sector | TEXT | private_non_oil \| oil_gas_public |

#### `payroll_runs`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| company_id | UUID | |
| user_id | UUID | |
| year | INT | |
| month | INT | 1–12 |
| status | TEXT | draft \| approved |
| total_gross | NUMERIC | |
| total_net | NUMERIC | |
| total_employer_cost | NUMERIC | |

#### `payroll_entries` (child of payroll_runs)
| Column | Type | Notes |
|--------|------|-------|
| run_id | BIGINT → payroll_runs | |
| employee_id | BIGINT → employees | |
| vacation_days | NUMERIC | |
| overtime_hours | NUMERIC | |
| bonus | NUMERIC | |
| other_additions | NUMERIC | |
| other_deductions | NUMERIC | |
| gross | NUMERIC | calculated |
| pit | NUMERIC | |
| emp_social | NUMERIC | |
| emp_health | NUMERIC | |
| net_salary | NUMERIC | |
| emplr_social | NUMERIC | |
| total_employer_cost | NUMERIC | |

#### `payroll_wd_overrides`
Working-day override per company/year/month. Unique: `(company_id, year, month)`.

### CRM Tables

#### `clients`
| Column | Type |
|--------|------|
| id | BIGINT PK |
| company_id | UUID |
| company (name) | TEXT |
| contact_person | TEXT |
| email | TEXT |
| phone | TEXT |
| address | TEXT |
| voen | TEXT |

#### `vendors`
Same structure as clients.

### Procurement Tables

#### `purchase_requests`
Status flow: `draft → submitted → approved → rejected → ordered`

#### `purchase_orders`
Auto-number: `PO-YYYY-NNN`. Status flow: `draft → sent → confirmed → partially_received → received → cancelled`.

Items JSONB structure: `[{product_id, description, quantity, unit_price, total, vat_rate}]`

#### `goods_receipts`
Auto-number: `GR-YYYY-NNN`. Status: `draft → confirmed`. `expense_id` populated after confirmation.

### Warehouse Tables

#### `products`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| company_id | UUID | |
| sku | TEXT UNIQUE per company | |
| name | TEXT | |
| unit | TEXT | əd \| kq \| q \| litr \| ml \| m \| m² \| m³ \| qutu \| dəst |
| cost_price | NUMERIC(12,2) | |
| sale_price | NUMERIC(12,2) | |
| stock_qty | NUMERIC(12,3) | |
| min_stock_level | NUMERIC(12,3) | |
| status | TEXT | active \| inactive |
| is_resale | BOOLEAN | |

#### `warehouses`
Default warehouse "Əsas Anbar" auto-created per company.

#### `stock_movements`
Movement types: `in | out | adjustment | transfer`  
Reference types: `purchase_order | sales_order | adjustment | opening`

#### `warehouse_stock`
Per-product per-warehouse: `quantity`, `avg_cost`. Unique `(product_id, warehouse_id)`.

#### `product_batches`
FIFO batch tracking. Each confirmed GR creates one batch per line item. Consumed FIFO during delivery.

### Sales Tables

#### `sales_orders`
Auto-number: `SO-YYYY-NNN`. Status flow: `draft → confirmed → delivered → invoiced → cancelled`. Unique `(company_id, so_number)`.

#### `deliveries`
Auto-number: `DEL-YYYY-NNN`. Status: `draft → confirmed`. `cogs_amount` populated on confirmation.

### Audit

#### `activity_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| company_id | UUID | |
| user_id | UUID | |
| user_email | TEXT | |
| user_role | TEXT | |
| action | TEXT | created \| updated \| deleted \| approved \| confirmed \| marked_paid \| invited \| removed |
| module | TEXT | invoices \| expenses \| payroll \| sales_orders \| deliveries \| goods_receipts \| purchase_orders \| team |
| record_id | TEXT | |
| record_label | TEXT | human-readable identifier (invoice number, etc.) |
| details | JSONB | |
| ip_address | TEXT | |
| created_at | TIMESTAMPTZ | |

Indexes: `(company_id, created_at DESC)`, `(user_id, created_at DESC)`.

---

## 5. BUSINESS RULES

### 5.1 Auto-Chain: Procurement

```
Purchase Request → (approve) → Purchase Order → (confirm GR) → Goods Receipt
                                                                     ↓
                                                         Expense (pending, source=procurement)
                                                                     ↓
                                                         Stock movement (type=in)
                                                                     ↓
                                                         warehouse_stock updated (weighted avg cost)
```

### 5.2 Auto-Chain: Sales

```
Sales Order → (confirm) → Delivery → (confirm_delivery RPC)
                                          ↓
                              FIFO stock deduction from product_batches
                                          ↓
                              COGS calculated (sum of FIFO unit costs × qty)
                                          ↓
                              Draft Invoice auto-created (linked to SO)
                                          ↓
                              SO status → 'delivered', invoice linked
```

### 5.3 Invoice Numbering

Auto-incremented from MAX of existing INV-{number}. Starting point: 1000. Format: `INV-{seq}` (e.g., INV-1001).

### 5.4 FIFO Costing

On delivery confirmation, the system iterates `product_batches` ordered by `(received_date ASC, created_at ASC)`, consuming `quantity_remaining` until the delivery quantity is satisfied. Unit cost per batch multiplied by quantity taken = COGS component.

### 5.5 Recurring Expenses

When `is_recurring = true`, `next_due_date` is auto-calculated by trigger:
- monthly → 1st of next month
- quarterly → 1st of next quarter
- annual → same date next year

### 5.6 Payroll Approval

On payroll run approval:
1. Payroll entries frozen (status = `approved`)
2. Salary expense auto-created per employee (category=Salaries, source=payroll)
3. `activity_logs` entry written

### 5.7 Feature Access Guard

Every protected page checks `hasFeature(feature)` using `resolveFeatureSet()`. Expired subscriptions → Light features only. Activity Log tab visible only to `admin` or `manager` role.

### 5.8 VAT Calculation

- Invoices: if `vat_applied = true`, VAT = subtotal × 18%
- Purchase Orders: VAT per line item, summed to `vat_amount`
- `vat_threshold_exceeded` is set manually via migration/admin action when annual revenue crosses 200,000 AZN

### 5.9 Company Isolation

- `get_my_company_id()` is SECURITY DEFINER, runs as postgres, reads `company_members`
- All RLS policies: `USING (company_id = get_my_company_id())`
- Users with `status = 'pending'` in `company_members` have no data access

---

## 6. USER ROLES

| Role | Permissions |
|------|------------|
| **admin** | Full access to all modules + Team tab + Activity Log + Billing |
| **manager** | All operational modules + Activity Log; no Team tab, no Billing |
| **finance** | Dashboard, Invoices, Expenses, Reports, Tax, Payroll (read), no Activity Log |
| **employee** | Dashboard only (limited) |

Role assignment happens at invitation time. Only admins can invite/remove members and change roles.

The `useCompany()` hook exposes:
```typescript
{ company, role, isAdmin, isManager, isFinance, needsSetup, refresh }
```

---

## 7. TEST SCENARIOS

### Procurement Flow
1. Create vendor → create purchase request → approve PR → create PO linked to PR → confirm goods receipt → verify expense created (pending) + stock_movements row + warehouse_stock updated
2. Create PO without PR → confirm GR → verify stock updated

### Sales Flow
3. Create client → create sales order with stock products → confirm SO → create delivery → confirm delivery → verify: stock deducted FIFO, COGS recorded on delivery, draft invoice auto-created, SO status = 'delivered'
4. Confirm delivery for product with zero stock → expect error response from `confirm_delivery` RPC

### Invoicing
5. Create invoice with VAT → verify amount = subtotal + subtotal×18%
6. Mark invoice as Paid → verify status change + activity log entry
7. Delete invoice → verify deletion + activity log entry

### Payroll
8. Add employee (private_non_oil, isMainWorkplace=true, gross=1500) → run payroll → verify: PIT deduction=200, PIT=(1500-200)×14%=182, social=45, health bracket, net=1500-all-deductions
9. Add employee (oil_gas_public, gross=3000) → verify: no 200 deduction, PIT=3000×14%=420, no health/unemployment, employer=gross+22%
10. Add employee (private_non_oil, gross=9000) → verify progressive PIT: 1120 + (9000-8000)×25% = 1370

### Vacation Pay
11. Employee gross=2000, 5 vacation days in 22-wd month:
    - Method A: 2000×12/365×5 = 328.77
    - Method B: 2000/30×5 = 333.33
    - Floor: 2000/22×5 = 454.55
    - Expected: Method B wins (333.33 > 328.77), but Floor (454.55) wins overall → use Floor

### Subscriptions
12. Trial company → verify Mid feature set accessible (purchase_orders visible)
13. Expired company → verify only Light features accessible (purchase_orders hidden)
14. Light plan → attempt to access `/procurement/orders` → verify redirect or hidden menu

### Multi-user
15. Invite user as manager → accept invitation → verify manager can see Activity Log but not Team tab
16. Invite user as finance → verify finance cannot see Activity Log tab
17. Admin removes member → verify member loses data access (company_members deleted)

### Activity Log
18. Perform create invoice + mark paid + delete sequence → verify 3 activity_log entries with correct `action`, `module`, `record_label`
19. Access Activity Log as manager → verify rows visible, CSV export downloads
20. Access Activity Log as finance user → verify tab not visible in Company Settings

### Tax Compliance
21. Verify `tax_settings.vat_threshold_exceeded = true` when flagged → check `vat_next_filing_date` is set to upcoming quarterly 20th deadline
22. Company with `tax_regime = 'simplified'` → verify not VAT-registered, simplified_eligible = true

---

## 8. KNOWN LIMITATIONS

| Area | Limitation |
|------|-----------|
| Accounting | Cash basis not fully implemented (accrual is the only functioning mode) |
| Multi-currency | Not supported — AZN only |
| Multi-warehouse | Warehouse table exists but UI defaults to single "Əsas Anbar" warehouse |
| Partial delivery | Not supported — one delivery per SO |
| Credit notes | Not implemented |
| Bank reconciliation | Not implemented |
| E-invoice (ASAN İmza) | Not integrated |
| Tax filing submission | No direct integration with TAXES.GOV.AZ; reports only |
| Vendor portal | Defined in Enterprise package but not built |
| API access | Listed in Enterprise features but no REST API exposed |
| Payroll: DSMF portal export | Calculations correct but no XML/portal export |
| Stock: negative stock | System allows negative `stock_qty` if FIFO batches are exhausted — no hard block |
| Product batches | Must be manually seeded if GR was confirmed before migration 026 |

---

## 9. API STRUCTURE

AzFinance uses Supabase as the API layer — there is no custom REST API server. All data access goes through:

### Supabase Client (Browser)
```typescript
// lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'
const supabase = createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
```

### Supabase Server Client (Server Components)
Created via `@supabase/ssr` `createServerClient` with cookie passthrough. Used in `proxy.ts` for session validation.

### RPC Functions (SECURITY DEFINER)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `get_my_company_id()` | — | UUID | Current user's company_id |
| `accept_invitation(token)` | TEXT | JSONB `{ok, company_id}` | Accept invite by token |
| `ensure_user_has_company()` | — | UUID | Create company if none exists |
| `get_invitation_by_token(token)` | TEXT | TABLE | Public — pre-fill signup form |
| `get_next_pr_number(company_id)` | UUID | TEXT | `PR-YYYY-NNN` |
| `get_next_po_number(company_id)` | UUID | TEXT | `PO-YYYY-NNN` |
| `get_next_gr_number(company_id)` | UUID | TEXT | `GR-YYYY-NNN` |
| `confirm_goods_receipt(gr_id)` | UUID | JSONB `{ok, expense_id}` | Confirm GR → expense + stock in |
| `confirm_delivery(delivery_id)` | UUID | JSONB `{ok, invoice_id, invoice_number}` | Confirm delivery → FIFO deduct + invoice |
| `adjust_stock(product_id, new_qty, notes)` | UUID, NUMERIC, TEXT | JSONB `{ok, delta}` | Manual stock adjustment |

### Error Response Format (RPCs)
All RPCs return JSONB. On error: `{"error": "message string"}`. On success: `{"ok": true, ...fields}`.

### Next.js API Routes (`/api/*`)
The `/api` path is public (bypasses auth in `proxy.ts`). Currently no custom API routes are documented as active — all data flows through Supabase client directly.

### Auth Proxy (`proxy.ts`)
Public paths: `/login`, `/signup`, `/create-company`, `/api`

Logic:
- No session + non-public path → redirect to `/login`
- Session + public path → redirect to `/`
- Otherwise → pass through

---

## 10. LOCALIZATION

The app supports two languages switchable at runtime:
- **English** (`en`)
- **Azerbaijani** (`az`)

Language is stored in `localStorage` and toggled via a UI button. The `useTranslation()` hook returns a typed `t(key: TranslationKey)` function. All i18n keys are in `lib/i18n.ts`.

Key namespaces: `nav.*`, `page.*`, `btn.*`, `exp.*`, `inv.*`, `cat.*`, `sub.*`, `emp.*`, `pay.*`, `act.*`

---

*End of AzFinance ERP Specification*
