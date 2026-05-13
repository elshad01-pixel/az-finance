'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import type { User } from '@supabase/supabase-js'

const PATH_TITLE: Record<string, TranslationKey> = {
  '/':                  'page.dashboard',
  '/invoices':          'page.invoices',
  '/expenses':          'page.expenses',
  '/clients':           'page.clients',
  '/vendors':           'page.vendors',
  '/reports':           'page.reports',
  '/tax-settings':      'page.taxSettings',
  '/company-settings':  'page.companySettings',
}

export default function Header() {
  const pathname = usePathname()
  const router   = useRouter()
  const { lang, setLang, t } = useLanguage()

  const titleKey = PATH_TITLE[pathname]
  const title    = titleKey ? t(titleKey) : 'AzFinance'

  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const now = new Date()
  const monthYear = now.toLocaleDateString(lang === 'az' ? 'az-AZ' : 'en-GB', { month: 'long', year: 'numeric' })

  const initials   = user?.email?.[0].toUpperCase() ?? 'U'
  const displayName = user?.email?.split('@')[0] ?? 'User'

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm px-6 py-4 flex items-center justify-between shrink-0">
      <div>
        <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
        <p className="text-xs text-gray-400 mt-0.5 capitalize">{monthYear}</p>
      </div>

      <div className="flex items-center gap-3">

        {/* ── Language toggle ── */}
        <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          {(['az', 'en'] as const).map(l => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-2.5 py-1.5 text-xs font-bold transition-colors ${
                lang === l
                  ? 'bg-blue-700 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        {/* ── Notification bell ── */}
        <button className="relative text-gray-500 hover:text-gray-700 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* ── User avatar ── */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white text-sm font-semibold shrink-0">
            {initials}
          </div>
          <span className="text-sm font-medium text-gray-700 hidden sm:block">{displayName}</span>
        </div>

        {/* ── Sign out ── */}
        <button
          onClick={handleLogout}
          title={t('header.signOut')}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-200 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {t('header.signOut')}
        </button>
      </div>
    </header>
  )
}
