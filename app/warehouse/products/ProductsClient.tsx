'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

type ProductStatus = 'active' | 'inactive'
type ProductUnit = 'əd' | 'kq' | 'q' | 'litr' | 'ml' | 'm' | 'm²' | 'm³' | 'qutu' | 'dəst'

interface Product {
  id:              string
  sku:             string
  name:            string
  description:     string | null
  category:        string | null
  unit:            ProductUnit
  cost_price:      number
  sale_price:      number
  stock_qty:       number
  min_stock_level: number
  status:          ProductStatus
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
  const [showAdjModal,   setShowAdjModal]   = useState(false)
  const [adjProduct,     setAdjProduct]     = useState<Product | null>(null)
  const [adjQty,         setAdjQty]         = useState('')
  const [adjNotes,       setAdjNotes]       = useState('')
  const [adjSaving,      setAdjSaving]      = useState(false)
  const [adjError,       setAdjError]       = useState<string | null>(null)

  // Form fields
  const [sku,           setSku]           = useState('')
  const [name,          setName]          = useState('')
  const [description,   setDescription]   = useState('')
  const [category,      setCategory]      = useState('')
  const [unit,          setUnit]          = useState<ProductUnit>('əd')
  const [costPrice,     setCostPrice]     = useState('')
  const [salePrice,     setSalePrice]     = useState('')
  const [stockQty,      setStockQty]      = useState('')
  const [minStock,      setMinStock]      = useState('')
  const [status,        setStatus]        = useState<ProductStatus>('active')

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    setSku(''); setName(''); setDescription(''); setCategory('')
    setUnit('əd'); setCostPrice(''); setSalePrice('')
    setStockQty(''); setMinStock(''); setStatus('active')
    setEditingProduct(null); setSaveError(null)
  }

  function openAdd() { resetForm(); setShowModal(true) }

  function openEdit(p: Product) {
    setEditingProduct(p)
    setSku(p.sku); setName(p.name); setDescription(p.description ?? '')
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
    setSaving(true); setSaveError(null)
    const payload = {
      sku: sku.trim(),
      name: name.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      unit,
      cost_price: parseFloat(costPrice) || 0,
      sale_price: parseFloat(salePrice) || 0,
      stock_qty:  parseFloat(stockQty)  || 0,
      min_stock_level: parseFloat(minStock) || 0,
      status,
    }
    if (editingProduct) {
      const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('products').insert(payload)
      if (error) { setSaveError(error.message); setSaving(false); return }
    }
    setSaving(false)
    setShowModal(false)
    resetForm()
    await load()
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
    setAdjSaving(false)
    setShowAdjModal(false)
    await load()
    notify(t('wh.adjustSaved'))
  }

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 bg-gray-100 rounded-lg" />
      <div className="h-96 bg-gray-100 rounded-xl" />
    </div>
  )

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
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
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
                {([
                  'wh.sku', 'wh.productName', 'wh.category', 'wh.unit',
                  'wh.stockQty', 'wh.minStockLevel', 'wh.costPrice', 'wh.salePrice',
                ] as TranslationKey[]).map(k => (
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
                    <td className="px-4 py-3 text-sm font-mono text-gray-600">{p.sku}</td>
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
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1.5 rounded-lg border border-blue-200 transition-colors whitespace-nowrap">
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
            {search || filterCat || filterStatus !== 'all' ? (lang === 'az' ? 'Nəticə tapılmadı' : 'No results') : t('wh.noProducts')}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
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
                {/* SKU + Name */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.sku')}</label>
                    <input type="text" required value={sku} onChange={e => setSku(e.target.value)}
                      placeholder="ART-001"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.productName')}</label>
                    <input type="text" required value={name} onChange={e => setName(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                  </div>
                </div>
                {/* Category + Unit */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.category')}</label>
                    <input type="text" value={category} onChange={e => setCategory(e.target.value)}
                      placeholder={lang === 'az' ? 'məs. Elektronika' : 'e.g. Electronics'}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                  </div>
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
                </div>
                {/* Cost + Sale price */}
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
                {/* Opening stock + Min level */}
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
                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.description')}</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none" />
                </div>
                {/* Status */}
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
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm disabled:opacity-60">
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
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
                {adjError && (
                  <p className="text-xs text-red-600 font-medium">{adjError}</p>
                )}
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
