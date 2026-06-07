'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { VendorProvider, useVendor } from '@/lib/VendorContext'

function VendorShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const { user, vendor, loading, denied, needsLogin, signOut } = useVendor()
  const [menuOpen, setMenuOpen] = useState(false)

  // Login page renders its own full-page UI — no shell needed
  if (pathname === '/vendor/login') return <>{children}</>

  // Still loading
  if (loading) {
    return (
      <div className="min-h-screen bg-teal-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-teal-300 border-t-white animate-spin" />
      </div>
    )
  }

  // Not logged in → send to vendor login
  if (needsLogin) {
    router.replace('/vendor/login')
    return null
  }

  // Access denied
  if (denied) {
    return (
      <div className="min-h-screen bg-teal-950 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-500 text-sm mb-6">
            Your account is not registered as a vendor in this portal. Please contact your buyer to request access.
          </p>
          <p className="text-xs text-gray-400 mb-4">Logged in as: {user?.email}</p>
          <button
            onClick={signOut}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const navLinks = [
    { href: '/vendor/dashboard',        label: 'Dashboard' },
    { href: '/vendor/purchase-orders',  label: 'Purchase Orders' },
    { href: '/vendor/invoices',         label: 'Invoices' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top navigation */}
      <nav className="bg-teal-700 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">

            {/* Brand */}
            <div className="flex items-center gap-3">
              <Link href="/vendor/dashboard" className="flex items-center gap-2">
                <span className="text-lg font-bold text-white">
                  Az<span className="text-teal-200">Finance</span>
                </span>
                <span className="hidden sm:block text-xs text-teal-300 border-l border-teal-500 pl-3">
                  Vendor Portal
                </span>
              </Link>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname.startsWith(link.href)
                      ? 'bg-teal-600 text-white'
                      : 'text-teal-100 hover:bg-teal-600/60'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <span className="hidden sm:block text-sm text-teal-200 truncate max-w-48">
                {vendor?.name ?? user?.email}
              </span>
              <button
                onClick={signOut}
                className="text-xs text-teal-300 hover:text-white border border-teal-500 hover:border-teal-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                Sign out
              </button>

              {/* Mobile hamburger */}
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="md:hidden text-teal-200 hover:text-white p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {menuOpen
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  }
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {menuOpen && (
            <div className="md:hidden pb-3 border-t border-teal-600 pt-2">
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block px-4 py-2.5 text-sm font-medium rounded-lg mb-1 ${
                    pathname.startsWith(link.href)
                      ? 'bg-teal-600 text-white'
                      : 'text-teal-100 hover:bg-teal-600/60'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <p className="px-4 py-2 text-xs text-teal-400">{vendor?.name ?? user?.email}</p>
            </div>
          )}
        </div>
      </nav>

      {/* Page content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  )
}

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <VendorProvider>
      <VendorShell>{children}</VendorShell>
    </VendorProvider>
  )
}
