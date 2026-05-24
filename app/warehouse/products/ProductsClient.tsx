'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { generateSKU, validateSKU, parseSKU } from '@/lib/sku'

type ProductStatus = 'active' | 'inactive'
type ProductUnit   = 'əd' | 'kq' | 'q' | 'litr' | 'ml' | 'm' | 'm²' | 'm³' | 'qutu' | 'dəst'

interface Product {
  id:               string
  sku:              string
  name:             string
  description:      string | null
  category:         string | null
  unit:             ProductUnit
  cost_price:       number
  sale_price:       number
  stock_qty:        number
  min_stock_level:  number
  status:           ProductStatus
  sku_manually_set?: boolean
  sku_generated_at?: string | null
}

const UNITS: ProductUnit[] = ['əd','kq','q','litr','ml','m','m²','m³','qutu','dəst']

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtQty(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')
}
function stockClass(p: Product) {
  if (p.min_stock_level <= 0) return ''
  if (p.stock_qty < p.min_stock_level) return 'bg-red-50'
  if (p.stock_qty < p.min_stock_level * 1.5) return 'bg-yellow-50'
  return ''
}

type SkuState = 'idle' | 'valid' | 'invalid' | 'duplicate' | 'legacy'

export default function ProductsClient() {
  const { t, lang } = useLanguage()

  const [products,       setProducts]       = useState<Product[]>([])
  const [loading,        setLoading]        = useState(true)
  const [search,         setSearch]         = useState('')
  const [filterCat,      setFilterCat]      = useState('')
  const [filterStatus,   setFilterStatus]   = useState<'all' | 'active' | 'inactive' | 'low'>('all')
  const [showModal,      setShowModal]       = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [saveError,      setSaveError]      = useState<string | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [toast,          setToast]          = useState<string | null>(null)

  // Adjustment modal
  const [showAdjModal, setShowAdjModal] = useState(false)
  const [adjProduct,   setAdjProduct]   = useState<Product | null>(null)
  const [adjQty,       setAdjQty]       = useState('')
  const [adjNotes,     setAdjNotes]     = useState('')
  const [adjSaving,    setAdjSaving]    = useState(false)
  const [adjError,     setAdjError]     = useState<string | null>(null)

  // Form fields
  const [sku,          setSku]          = useState('')
  const [skuState,     setSkuState]     = useState<SkuState>('idle')
  const [skuManual,    setSkuManual]    = useState(false)
  const [vendorName,   setVendorName]   = useState('')
  const [name,         setName]         = useState('')
  const [description,  setDescription]  = useState('')
  const [category,     setCategory]     = useState('')
  const [unit,         setUnit]         = useState<ProductUnit>('əd')
  const [costPrice,    setCostPrice]    = useState('')
  const [salePrice,    setSalePrice]    = useState('')
  const [stockQty,     setStockQty]     = useState('')
  const [minStock,     setMinStock]     = useState('')
  const [status,       setStatus]       = useState<ProductStatus>('active')

  const toastTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const productsRef  = useRef<Product[]>([])

  useEffect(() => { productsRef.current = products }, [products])

  function notify(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  async function load() {
    const { data } = await supabase.from('products').select('*').order('name')
    setProducts((data as Product[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // ── SKU auto-generation ─────────────────────────────────────────────────────
  useEffect(() => {
    if (editingProduct || skuManual || !category) return
    const existing = productsRef.current.map(p => p.sku)
    setSku(generateSKU(category, vendorName, existing))
  }, [category, vendorName, editingProduct, skuManual])

  // ── SKU validation ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sku) { setSkuState('idle'); return }
    const formatOk = validateSKU(sku)
    if (!formatOk) {
      // If editing and SKU is unchanged → treat as legacy (don't flag red)
      if (editingProduct && sku === editingProduct.sku) { setSkuState('legacy'); return }
      setSkuState('invalid'); return
    }
    const isDupe = products.some(p => p.sku === sku && p.id !== editingProduct?.id)
    setSkuState(isDupe ? 'duplicate' : 'valid')
  }, [sku, products, editingProduct])

  // ── Computed SKU breakdown (for tooltip) ────────────────────────────────────
  const parsedSKU = useMemo(() => parseSKU(sku), [sku])

  const categories = [...new Set(products.map(p => p.category).filter(Boolean) as string[])].sort()

  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false
    if (filterCat && p.category !== filterCat) return false
    if (filterStatus === 'active'   && p.status !== 'active')   return false
    if (filterStatus === 'inactive' && p.status !== 'inactive') return false
    if (filterStatus === 'low' && p.min_stock_level > 0 && p.stock_qty >= p.min_stock_level) return false
    return true
  })

  function resetForm() {
    setSku(''); setSkuState('idle'); setSkuManual(false); setVendorName('')
    setName(''); setDescription(''); setCategory('')
    setUnit('əd'); setCostPrice(''); setSalePrice('')
    setStockQty(''); setMinStock(''); setStatus('active')
    setEditingProduct(null); setSaveError(null)
  }

  function openAdd() { resetForm(); setShowModal(true) }

  function openEdit(p: Product) {
    setEditingProduct(p)
    setSku(p.sku)
    setSkuManual(p.sku_manually_set ?? false)
    // Pre-fill vendor from parsed SKU supplier code
    const parsed = parseSKU(p.sku)
    setVendorName(parsed?.supplier ?? '')
    setName(p.name); setDescription(p.description ?? '')
    setCategory(p.category ?? ''); setUnit(p.unit)
    setCostPrice(String(p.cost_price)); setSalePrice(String(p.sale_price))
    setStockQty(String(p.stock_qty)); setMinStock(String(p.min_stock_level))
    setStatus(p.status); setSaveError(null)
    setShowModal(true)
  }

  function openAdj(p: Product) {
    setAdjProduct(p)
    setAdjQty(String(p.stock_qty))
    setAdjNotes(''); setAdjError(null)
    setShowAdjModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (skuState === 'duplicate') {
      setSaveError(lang === 'az' ? 'Bu SKU artıq mövcuddur' : 'This SKU already exists')
      return
    }
    setSaving(true); setSaveError(null)
    const payload: Record<string, unknown> = {
      sku:              sku.trim(),
      name:             name.trim(),
      description:      description.trim() || null,
      category:         category.trim() || null,
      unit,
      cost_price:       parseFloat(costPrice) || 0,
      sale_price:       parseFloat(salePrice)  || 0,
      stock_qty:        parseFloat(stockQty)   || 0,
      min_stock_level:  parseFloat(minStock)   || 0,
      status,
      sku_manually_set: skuManual,
    }
    if (editingProduct) {
      const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('products').insert(payload)
      if (error) { setSaveError(error.message); setSaving(false); return }
    }
    setSaving(false); setShowModal(false); resetForm(); await load()
    notify(t('wh.productSaved'))
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault()
    if (!adjProduct) return
    setAdjSaving(true); setAdjError(null)
    const newQty = parseFloat(adjQty)
    if (isNaN(newQty) || newQty < 0) {
      setAdjError(lang === 'az' ? 'Düzgün miqdar daxil edin' : 'Enter a valid quantity')
      setAdjSaving(false); return
    }
    const { data, error } = await supabase.rpc('adjust_stock', {
      p_product_id: adjProduct.id,
      p_new_qty:    newQty,
      p_notes:      adjNotes.trim() || null,
    })
    if (error || data?.error) {
      setAdjError(error?.message ?? data?.error ?? 'Error')
      setAdjSaving(false); return
    }
    setAdjSaving(false); setShowAdjModal(false); await load()
    notify(t('wh.adjustSaved'))
  }

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 bg-gray-100 rounded-lg" />
      <div className="h-96 bg-gray-100 rounded-xl" />
    </div>
  )

  // ── Border colour helper ────────────────────────────────────────────────────
  function skuBorder() {
    if (skuState === 'valid')    return 'border-green-400 focus:ring-green-400 bg-green-50/30'
    if (skuState === 'duplicate' || skuState === 'invalid')
                                 return 'border-red-400 focus:ring-red-400 bg-red-50/30'
    if (skuState === 'legacy')   return 'border-yellow-300 focus:ring-yellow-400 bg-yellow-50/30'
    return 'border-gray-200 focus:ring-blue-500'
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('page.whProducts')}</h2>
          <p className="text-gray-500 text-sm mt-1">{filtered.length} {lang === 'az' ? 'məhsul' : 'products'}</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('wh.addProduct')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={lang === 'az' ? 'Ad və ya artikul ilə axtar…' : 'Search by name or SKU…'}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">{t('wh.allCategories')}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex gap-1.5 bg-gray-100 rounded-lg p-1">
          {([
            { v: 'all',      l: lang === 'az' ? 'Hamısı' : 'All' },
            { v: 'active',   l: t('wh.active') },
            { v: 'inactive', l: t('wh.inactive') },
            { v: 'low',      l: t('wh.lowStockOnly') },
          ] as const).map(opt => (
            <button key={opt.v} onClick={() => setFilterStatus(opt.v)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                filterStatus === opt.v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{opt.l}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {(['wh.sku','wh.productName','wh.category','wh.unit',
                  'wh.stockQty','wh.minStockLevel','wh.costPrice','wh.salePrice'] as TranslationKey[]).map(k => (
                  <th key={k} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                    {t(k)}
                  </th>
                ))}
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{t('common.status')}</th>
                <th className="w-28 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(p => {
                const rowCls = stockClass(p)
                const isLow  = p.min_stock_level > 0 && p.stock_qty < p.min_stock_level
                const isWarn = !isLow && p.min_stock_level > 0 && p.stock_qty < p.min_stock_level * 1.5
                return (
                  <tr key={p.id} className={`transition-colors ${rowCls || 'hover:bg-slate-50'}`}>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-gray-600">{p.sku}</span>
                      {p.sku_manually_set && (
                        <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-yellow-600 bg-yellow-50 px-1 py-0.5 rounded">
                          {lang === 'az' ? 'Əl' : 'Manual'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      {p.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{p.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{p.category ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.unit}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-semibold ${isLow ? 'text-red-600' : isWarn ? 'text-yellow-600' : 'text-gray-900'}`}>
                        {fmtQty(p.stock_qty)}
                      </span>
                      {isLow  && <span className="ml-1.5 text-xs text-red-500">▼</span>}
                      {isWarn && <span className="ml-1.5 text-xs text-yellow-500">!</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{fmtQty(p.min_stock_level)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 tabular-nums">{fmt(p.cost_price)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 tabular-nums">{fmt(p.sale_price)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                        p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {t(p.status === 'active' ? 'wh.active' : 'wh.inactive')}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openAdj(p)} title={t('wh.stockAdjustment')}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1.5 rounded-lg border border-blue-200 transition-colors">
                          ±
                        </button>
                        <button onClick={() => openEdit(p)} title={t('common.edit')}
                          className="text-gray-400 hover:text-blue-500 p-1.5 rounded hover:bg-blue-50 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">
            {search || filterCat || filterStatus !== 'all'
              ? (lang === 'az' ? 'Nəticə tapılmadı' : 'No results')
              : t('wh.noProducts')}
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ───────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm() } }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingProduct ? t('wh.editProduct') : t('wh.addProduct')}
              </h3>
              <button onClick={() => { setShowModal(false); resetForm() }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-4">

                {/* ── SKU field ────────────────────────────────────────────── */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-gray-700">{t('wh.sku')}</label>
                    <button type="button"
                      onClick={() => {
                        const next = !skuManual
                        setSkuManual(next)
                        // Re-generate when switching back to auto
                        if (!next && !editingProduct && category) {
                          setSku(generateSKU(category, vendorName, productsRef.current.map(p => p.sku)))
                        }
                      }}
                      title={skuManual
                        ? (lang === 'az' ? 'Avtomatik rejimə qayıt' : 'Switch back to auto-generate')
                        : (lang === 'az' ? 'SKU-nu əl ilə dəyiş'   : 'Override SKU manually')}
                      className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors ${
                        skuManual
                          ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                          : 'text-gray-400 hover:text-yellow-600 hover:bg-yellow-50'
                      }`}>
                      {/* Pencil icon */}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      {skuManual
                        ? (lang === 'az' ? 'Əl ilə' : 'Manual')
                        : (lang === 'az' ? 'Avtomatik' : 'Auto')}
                    </button>
                  </div>

                  {/* Input + tooltip wrapper */}
                  <div className="relative group">
                    <input
                      type="text" required
                      value={sku}
                      onChange={e => {
                        const val = e.target.value.toUpperCase()
                        setSku(val)
                        if (!skuManual) setSkuManual(true)
                      }}
                      readOnly={!skuManual && !editingProduct}
                      placeholder="ELEC-BAK-2605-0001-4"
                      className={`w-full border rounded-lg px-3 py-2.5 text-sm font-mono pr-8 focus:outline-none focus:ring-2 transition ${skuBorder()} ${
                        !skuManual && !editingProduct ? 'cursor-default select-none' : ''
                      }`}
                    />

                    {/* Status icon */}
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm select-none pointer-events-none">
                      {skuState === 'valid'                             && <span className="text-green-500">✓</span>}
                      {(skuState === 'invalid' || skuState === 'duplicate') && <span className="text-red-500">✗</span>}
                      {skuState === 'legacy'                            && <span className="text-yellow-500 text-xs font-bold">!</span>}
                    </span>

                    {/* Breakdown tooltip (only when SKU is valid new-format) */}
                    {parsedSKU && (
                      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-20 pointer-events-none">
                        <div className="bg-gray-900 text-white rounded-xl px-4 py-3 shadow-2xl whitespace-nowrap">
                          {/* Values row */}
                          <div className="flex items-end gap-2 font-mono text-xs mb-1">
                            {[
                              { v: parsedSKU.category, l: lang === 'az' ? 'Kat' : 'Cat'  },
                              { v: '-',                l: ''                              },
                              { v: parsedSKU.supplier, l: lang === 'az' ? 'Sat' : 'Sup'  },
                              { v: '-',                l: ''                              },
                              { v: parsedSKU.date,     l: lang === 'az' ? 'Tar' : 'Date' },
                              { v: '-',                l: ''                              },
                              { v: parsedSKU.sequence, l: lang === 'az' ? 'Sır' : 'Seq'  },
                              { v: '-',                l: ''                              },
                              { v: parsedSKU.check,    l: lang === 'az' ? 'Çex' : 'Chk'  },
                            ].map((part, i) => (
                              <div key={i} className="flex flex-col items-center">
                                <span className={part.l ? 'text-yellow-300' : 'text-gray-500'}>
                                  {part.v}
                                </span>
                                {part.l && (
                                  <span className="text-gray-400 text-[9px] mt-0.5">{part.l}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Caret */}
                        <div className="ml-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900" />
                      </div>
                    )}
                  </div>

                  {/* Helper text */}
                  {skuState === 'invalid' && (
                    <p className="text-xs text-red-500 mt-1">
                      {lang === 'az' ? 'Format: KAT-SAT-AYYY-SSSS-C (məs. ELEC-BAK-2605-0001-4)' : 'Format: CAT-SUP-YYMM-SEQ#-CHECK (e.g. ELEC-BAK-2605-0001-4)'}
                    </p>
                  )}
                  {skuState === 'duplicate' && (
                    <p className="text-xs text-red-500 mt-1">
                      {lang === 'az' ? 'Bu SKU artıq mövcuddur' : 'SKU already in use'}
                    </p>
                  )}
                  {skuState === 'legacy' && (
                    <p className="text-xs text-yellow-600 mt-1">
                      {lang === 'az' ? 'Köhnə format — saxlanmağa davam edər' : 'Legacy format — will still save'}
                    </p>
                  )}
                </div>

                {/* ── Name ─────────────────────────────────────────────────── */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.productName')}</label>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                </div>

                {/* ── Category + Supplier ───────────────────────────────────── */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.category')}</label>
                    <input type="text" value={category} onChange={e => setCategory(e.target.value)}
                      placeholder={lang === 'az' ? 'məs. Elektronika' : 'e.g. Electronics'}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {lang === 'az' ? 'Satıcı (SKU üçün)' : 'Supplier (for SKU)'}
                    </label>
                    <input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)}
                      placeholder={lang === 'az' ? 'məs. Bakı Elektronika' : 'e.g. Baku Electronics'}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {lang === 'az' ? 'SKU-da ilk 3 hərf istifadə olunur' : 'First 3 chars used in SKU'}
                    </p>
                  </div>
                </div>

                {/* ── Unit ─────────────────────────────────────────────────── */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.unit')}</label>
                  <div className="relative">
                    <select value={unit} onChange={e => setUnit(e.target.value as ProductUnit)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition pr-8">
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* ── Cost + Sale price ─────────────────────────────────────── */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.costPrice')}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 select-none">₼</span>
                      <input type="number" min="0" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.salePrice')}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 select-none">₼</span>
                      <input type="number" min="0" step="0.01" value={salePrice} onChange={e => setSalePrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                    </div>
                  </div>
                </div>

                {/* ── Stock + Min level ─────────────────────────────────────── */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {editingProduct ? t('wh.stockQty') : (lang === 'az' ? 'Açılış Stoку' : 'Opening Stock')}
                    </label>
                    <input type="number" min="0" step="0.001" value={stockQty} onChange={e => setStockQty(e.target.value)}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.minStockLevel')}</label>
                    <input type="number" min="0" step="0.001" value={minStock} onChange={e => setMinStock(e.target.value)}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                  </div>
                </div>

                {/* ── Description ───────────────────────────────────────────── */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.description')}</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none" />
                </div>

                {/* ── Status ────────────────────────────────────────────────── */}
                <div className="flex gap-3">
                  {(['active','inactive'] as ProductStatus[]).map(s => (
                    <button key={s} type="button" onClick={() => setStatus(s)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        status === s
                          ? s === 'active' ? 'bg-green-600 text-white border-green-600' : 'bg-gray-400 text-white border-gray-400'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}>
                      {t(s === 'active' ? 'wh.active' : 'wh.inactive')}
                    </button>
                  ))}
                </div>
              </div>

              {saveError && (
                <div className="mx-6 mb-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                  {saveError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button type="button" onClick={() => { setShowModal(false); resetForm() }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={saving || skuState === 'duplicate'}
                  className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm disabled:opacity-60">
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Stock Adjustment Modal ─────────────────────────────────────────── */}
      {showAdjModal && adjProduct && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
          onClick={e => { if (e.target === e.currentTarget) setShowAdjModal(false) }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{t('wh.stockAdjustment')}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{adjProduct.name}</p>
              </div>
              <button onClick={() => setShowAdjModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAdjust}>
              <div className="px-6 py-5 space-y-4">
                <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-gray-500">{t('wh.currentQty')}</span>
                  <span className="text-lg font-bold text-gray-900">{fmtQty(adjProduct.stock_qty)} {adjProduct.unit}</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.newQty')}</label>
                  <input type="number" required min="0" step="0.001" value={adjQty}
                    onChange={e => { setAdjQty(e.target.value); setAdjError(null) }}
                    autoFocus
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.adjustmentReason')}</label>
                  <textarea value={adjNotes} onChange={e => setAdjNotes(e.target.value)} rows={2}
                    placeholder={lang === 'az' ? 'məs. İnventar sayımı, zay mal…' : 'e.g. Physical count, damaged goods…'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none" />
                </div>
                {adjError && <p className="text-xs text-red-600 font-medium">{adjError}</p>}
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button type="button" onClick={() => setShowAdjModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={adjSaving}
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-60">
                  {adjSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
