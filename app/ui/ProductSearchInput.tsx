'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'

export interface ProductOption {
  id:         string
  sku:        string
  name:       string
  unit:       string
  price:      number
  stock_qty?: number
  category?:  string
}

interface Props {
  products:     ProductOption[]
  selectedId:   string | null
  value:        string
  onChange:     (val: string) => void
  onSelect:     (p: ProductOption) => void
  onClear:      () => void
  placeholder?: string
  lang:         string
  className?:   string
}

const PAGE = 50

export default function ProductSearchInput({
  products, selectedId, value, onChange, onSelect, onClear,
  placeholder, lang, className = '',
}: Props) {
  const [open,    setOpen]    = useState(false)
  const [hiIdx,   setHiIdx]   = useState(0)
  const [visible, setVisible] = useState(PAGE)
  const [mounted, setMounted] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 })

  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  const selected = selectedId ? (products.find(p => p.id === selectedId) ?? null) : null

  const calcPos = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
  }, [])

  function openDrop() {
    calcPos()
    setOpen(true)
    setHiIdx(0)
  }

  // Reposition on any scroll while open (so dropdown tracks input in scrollable modals)
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', calcPos, true)
    return () => window.removeEventListener('scroll', calcPos, true)
  }, [open, calcPos])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        !wrapRef.current?.contains(e.target as Node) &&
        !listRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Reset pagination + highlight when query changes
  useEffect(() => { setHiIdx(0); setVisible(PAGE) }, [value])

  const filtered = useMemo(() => {
    const q = value.toLowerCase().trim()
    if (!q) return products
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.category ?? '').toLowerCase().includes(q)
    )
  }, [products, value])

  const shown      = filtered.slice(0, visible)
  const hasMore    = visible < filtered.length
  const showManual = value.trim().length > 0

  function pick(p: ProductOption) {
    onSelect(p)
    setOpen(false)
  }

  function keepManual() {
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const total = shown.length + (showManual ? 1 : 0)
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); openDrop() }
      return
    }
    if      (e.key === 'ArrowDown')  { e.preventDefault(); setHiIdx(i => Math.min(i + 1, total - 1)) }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); setHiIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (hiIdx < shown.length) pick(shown[hiIdx])
      else if (showManual) keepManual()
    }
    else if (e.key === 'Escape') setOpen(false)
  }

  function handleListScroll() {
    const el = listRef.current
    if (!el || !hasMore) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) setVisible(v => v + PAGE)
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.children[hiIdx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [hiIdx])

  // ── Selected state ─────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div className={`flex items-center gap-1.5 py-1 min-w-0 ${className}`}>
        <span className="font-mono text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded flex-shrink-0">
          {selected.sku}
        </span>
        <span className="text-sm text-gray-800 truncate flex-1 min-w-0">{selected.name}</span>
        <button type="button" onClick={onClear}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-0.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  // ── Search / manual state ─────────────────────────────────────────────────
  const dropdown = mounted && open && createPortal(
    <div
      ref={listRef}
      onScroll={handleListScroll}
      style={{
        position:  'fixed',
        top:       dropPos.top,
        left:      dropPos.left,
        width:     Math.max(dropPos.width, 280),
        maxHeight: 300,
        zIndex:    9999,
      }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-y-auto"
    >
      {shown.length === 0 && !showManual && (
        <div className="px-3 py-4 text-xs text-gray-400 text-center">
          {lang === 'az' ? 'Nəticə tapılmadı' : 'No results found'}
        </div>
      )}
      {shown.map((p, i) => (
        <button key={p.id} type="button"
          onMouseDown={e => { e.preventDefault(); pick(p) }}
          onMouseEnter={() => setHiIdx(i)}
          className={`w-full text-left px-3 py-2.5 border-b border-gray-50 last:border-0 transition-colors ${
            hiIdx === i ? 'bg-blue-50' : 'hover:bg-gray-50'
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="font-mono text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
              {p.sku}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-sm font-medium text-gray-800">{p.name}</span>
                {p.category && <span className="text-xs text-gray-400">— {p.category}</span>}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                {p.stock_qty !== undefined && (
                  <span>
                    {'Stock: '}
                    <strong className={p.stock_qty > 0 ? 'text-green-600' : 'text-red-500'}>
                      {p.stock_qty}
                    </strong>
                    {' '}{p.unit}
                  </span>
                )}
                <span>₼ {p.price.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </button>
      ))}
      {hasMore && (
        <div className="px-3 py-2 text-xs text-gray-400 text-center border-t border-gray-100 bg-gray-50 sticky bottom-0">
          {lang === 'az'
            ? `Daha ${filtered.length - visible} nəticə — aşağı diyirin`
            : `${filtered.length - visible} more — scroll to load`}
        </div>
      )}
      {showManual && (
        <button type="button"
          onMouseDown={e => { e.preventDefault(); keepManual() }}
          onMouseEnter={() => setHiIdx(shown.length)}
          className={`w-full text-left px-3 py-2.5 border-t border-dashed border-gray-200 transition-colors ${
            hiIdx === shown.length ? 'bg-blue-50' : 'hover:bg-gray-50'
          }`}
        >
          <p className="text-sm text-blue-600 font-medium">
            + {lang === 'az' ? `Manual giriş: "${value}"` : `Manual entry: "${value}"`}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {lang === 'az' ? 'Azad mətn kimi saxla' : 'Save as free text description'}
          </p>
        </button>
      )}
    </div>,
    document.body
  )

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="flex items-center border-b border-gray-200 focus-within:border-blue-500 transition-colors">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); if (!open) openDrop(); else calcPos() }}
          onFocus={openDrop}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? (lang === 'az' ? 'Məhsul axtar...' : 'Search product...')}
          className="flex-1 text-sm outline-none py-1 bg-transparent min-w-0 placeholder:text-gray-400"
        />
        {value ? (
          <button type="button" onClick={onClear}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-0.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <svg className="flex-shrink-0 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        )}
      </div>
      {dropdown}
    </div>
  )
}
