'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { translations, type Lang, type TranslationKey } from './i18n'

interface LanguageContextValue {
  lang:    Lang
  setLang: (lang: Lang) => void
  t:       (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  lang:    'en',
  setLang: () => {},
  t:       (key) => translations.en[key],
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    const saved = localStorage.getItem('azfinance-lang')
    if (saved === 'en' || saved === 'az') setLangState(saved)
  }, [])

  function setLang(newLang: Lang) {
    setLangState(newLang)
    localStorage.setItem('azfinance-lang', newLang)
  }

  function t(key: TranslationKey): string {
    return translations[lang][key]
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
