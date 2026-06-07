'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import Header from './Header'
import { useCompany } from '@/lib/CompanyContext'

const AUTH_PATHS = ['/login', '/signup', '/create-company', '/vendor']

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const { user, company, loading } = useCompany()

  // If authenticated but no company yet → send to setup wizard
  useEffect(() => {
    if (loading) return
    const isPublic = AUTH_PATHS.some(p => pathname.startsWith(p))
    if (user && !company && !isPublic) {
      router.replace('/create-company')
    }
  }, [loading, user, company, pathname, router])

  if (AUTH_PATHS.some(p => pathname.startsWith(p))) {
    return <>{children}</>
  }

  // Show blank while loading or redirecting to setup
  if (loading || (user && !company)) return null

  return (
    <>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">{children}</main>
      </div>
    </>
  )
}
