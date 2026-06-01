'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'

interface ActivityLog {
  id:           string
  user_email:   string | null
  user_role:    string | null
  action:       string
  module:       string
  record_id:    string | null
  record_label: string | null
  details:      Record<string, unknown> | null
  created_at:   string
}

const ACTION_STYLE: Record<string, string> = {
  created:     'bg-green-100 text-green-700',
  approved:    'bg-green-100 text-green-700',
  confirmed:   'bg-green-100 text-green-700',
  marked_paid: 'bg-green-100 text-green-700',
  invited:     'bg-green-100 text-green-700',
  viewed:      'bg-blue-100 text-blue-700',
  exported:    'bg-blue-100 text-blue-700',
  updated:     'bg-orange-100 text-orange-700',
  edited:      'bg-orange-100 text-orange-700',
  deleted:     'bg-red-100 text-red-700',
  removed:     'bg-red-100 text-red-700',
}

function actionStyle(action: string) {
  return ACTION_STYLE[action] ?? 'bg-gray-100 text-gray-600'
}

const MODULE_LABELS: Record<string, string> = {
  invoices:       'Invoices',
  expenses:       'Expenses',
  payroll:        'Payroll',
  sales_orders:   'Sales Orders',
  deliveries:     'Deliveries',
  goods_receipts: 'Goods Receipts',
  purchase_orders:'Purchase Orders',
  team:           'Team',
  auth:           'Auth',
}

function fmtDateTime(iso: string, lang: string) {
  return new Intl.DateTimeFormat(lang === 'az' ? 'az-AZ' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

export default function ActivityLogTab() {
  const { lang } = useLanguage()

  const [logs,    setLogs]    = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  const [filterUser,   setFilterUser]   = useState('')
  const [filterModule, setFilterModule] = useState('')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')

  useEffect(() => {
    supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setLogs((data as ActivityLog[]) ?? [])
        setLoading(false)
      })
  }, [])

  const uniqueUsers = useMemo(() =>
    Array.from(new Set(logs.map(l => l.user_email).filter(Boolean))) as string[],
  [logs])

  const uniqueModules = useMemo(() =>
    Array.from(new Set(logs.map(l => l.module))),
  [logs])

  const filtered = useMemo(() => logs.filter(l => {
    if (filterUser   && l.user_email !== filterUser)   return false
    if (filterModule && l.module    !== filterModule)  return false
    if (filterFrom   && l.created_at < filterFrom)     return false
    if (filterTo     && l.created_at > filterTo + 'T23:59:59') return false
    return true
  }), [logs, filterUser, filterModule, filterFrom, filterTo])

  function exportCSV() {
    const header = 'Date,User,Action,Module,Record\n'
    const rows = filtered.map(l =>
      [
        fmtDateTime(l.created_at, lang),
        l.user_email ?? '',
        l.action,
        l.module,
        l.record_label ?? '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const INPUT = 'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white'

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* ── Filters + Export ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">
              {lang === 'az' ? 'İstifadəçi' : 'User'}
            </label>
            <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className={INPUT}>
              <option value="">{lang === 'az' ? 'Hamısı' : 'All users'}</option>
              {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">
              {lang === 'az' ? 'Modul' : 'Module'}
            </label>
            <select value={filterModule} onChange={e => setFilterModule(e.target.value)} className={INPUT}>
              <option value="">{lang === 'az' ? 'Hamısı' : 'All modules'}</option>
              {uniqueModules.map(m => (
                <option key={m} value={m}>{MODULE_LABELS[m] ?? m}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">
              {lang === 'az' ? 'Başdan' : 'From'}
            </label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className={INPUT} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">
              {lang === 'az' ? 'Sonra' : 'To'}
            </label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className={INPUT} />
          </div>

          <div className="flex items-end gap-2 ml-auto">
            {(filterUser || filterModule || filterFrom || filterTo) && (
              <button
                onClick={() => { setFilterUser(''); setFilterModule(''); setFilterFrom(''); setFilterTo('') }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {lang === 'az' ? 'Sıfırla' : 'Clear'}
              </button>
            )}
            <button
              onClick={exportCSV}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {lang === 'az' ? 'CSV İxrac' : 'Export CSV'}
            </button>
          </div>
        </div>

        {filtered.length !== logs.length && (
          <p className="text-xs text-gray-400 mt-3">
            {lang === 'az'
              ? `${filtered.length} / ${logs.length} nəticə`
              : `${filtered.length} of ${logs.length} entries`}
          </p>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">
            {lang === 'az' ? 'Fəaliyyət yoxdur.' : 'No activity yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {lang === 'az' ? 'Tarix' : 'Date / Time'}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {lang === 'az' ? 'İstifadəçi' : 'User'}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {lang === 'az' ? 'Əməliyyat' : 'Action'}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {lang === 'az' ? 'Modul' : 'Module'}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {lang === 'az' ? 'Qeyd' : 'Record'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap font-mono">
                      {fmtDateTime(l.created_at, lang)}
                    </td>
                    <td className="px-4 py-3 max-w-[160px]">
                      <p className="text-xs font-medium text-gray-800 truncate">{l.user_email ?? '—'}</p>
                      {l.user_role && (
                        <p className="text-xs text-gray-400 capitalize">{l.user_role}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${actionStyle(l.action)}`}>
                        {l.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 capitalize">
                      {MODULE_LABELS[l.module] ?? l.module}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 font-mono max-w-[160px] truncate">
                      {l.record_label ?? l.record_id ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
