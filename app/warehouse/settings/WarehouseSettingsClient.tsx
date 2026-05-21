'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'

interface Warehouse {
  id:         string
  name:       string
  location:   string | null
  is_default: boolean
  created_at: string
}

export default function WarehouseSettingsClient() {
  const { t, lang } = useLanguage()

  const [warehouses,     setWarehouses]     = useState<Warehouse[]>([])
  const [loading,        setLoading]        = useState(true)
  const [showModal,      setShowModal]      = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [saveError,      setSaveError]      = useState<string | null>(null)
  const [editingWh,      setEditingWh]      = useState<Warehouse | null>(null)
  const [toast,          setToast]          = useState<string | null>(null)

  const [whName,     setWhName]     = useState('')
  const [whLocation, setWhLocation] = useState('')

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function notify(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  async function load() {
    const { data } = await supabase.from('warehouses').select('*').order('is_default', { ascending: false }).order('name')
    setWarehouses((data as Warehouse[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setEditingWh(null); setWhName(''); setWhLocation(''); setSaveError(null)
    setShowModal(true)
  }

  function openEdit(wh: Warehouse) {
    setEditingWh(wh); setWhName(wh.name); setWhLocation(wh.location ?? ''); setSaveError(null)
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setSaveError(null)
    const payload = { name: whName.trim(), location: whLocation.trim() || null }
    if (editingWh) {
      const { error } = await supabase.from('warehouses').update(payload).eq('id', editingWh.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('warehouses').insert(payload)
      if (error) { setSaveError(error.message); setSaving(false); return }
    }
    setSaving(false); setShowModal(false)
    await load()
    notify(t('wh.warehouseSaved'))
  }

  async function setDefault(wh: Warehouse) {
    if (wh.is_default) return
    // Clear existing default, then set new one
    await supabase.from('warehouses').update({ is_default: false }).neq('id', wh.id)
    await supabase.from('warehouses').update({ is_default: true }).eq('id', wh.id)
    await load()
    notify(t('wh.warehouseSaved'))
  }

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 bg-gray-100 rounded-lg" />
      <div className="h-48 bg-gray-100 rounded-xl" />
    </div>
  )

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('page.whSettings')}</h2>
          <p className="text-gray-500 text-sm mt-1">{warehouses.length} {lang === 'az' ? 'anbar' : 'warehouses'}</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('wh.addWarehouse')}
        </button>
      </div>

      <div className="space-y-3">
        {warehouses.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-xl border border-gray-100">
            {t('wh.noWarehouses')}
          </div>
        )}
        {warehouses.map(wh => (
          <div key={wh.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900">{wh.name}</p>
                {wh.is_default && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    {t('wh.default')}
                  </span>
                )}
              </div>
              {wh.location && <p className="text-sm text-gray-500 mt-0.5">{wh.location}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!wh.is_default && (
                <button onClick={() => setDefault(wh)}
                  className="text-xs font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
                  {t('wh.setDefault')}
                </button>
              )}
              <button onClick={() => openEdit(wh)}
                className="text-gray-400 hover:text-blue-500 p-1.5 rounded hover:bg-blue-50 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingWh ? t('wh.editWarehouse') : t('wh.addWarehouse')}
              </h3>
              <button onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.warehouseName')}</label>
                  <input type="text" required value={whName} onChange={e => setWhName(e.target.value)}
                    autoFocus placeholder={lang === 'az' ? 'məs. Əsas Anbar' : 'e.g. Main Warehouse'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('wh.location')}</label>
                  <input type="text" value={whLocation} onChange={e => setWhLocation(e.target.value)}
                    placeholder={lang === 'az' ? 'Ünvan (istəyə bağlı)' : 'Address (optional)'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                </div>
                {saveError && (
                  <p className="text-xs text-red-600 font-medium">{saveError}</p>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button type="button" onClick={() => setShowModal(false)}
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
    </div>
  )
}
