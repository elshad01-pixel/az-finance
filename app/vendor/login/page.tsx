'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function VendorLoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)
  const [showReset, setShowReset] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    if (authErr) {
      setError(authErr.message)
      setLoading(false)
      return
    }

    // Check vendor_portal_access — only active records are allowed in
    const { data: access } = await supabase
      .from('vendor_portal_access')
      .select('id, status')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle()

    if (!access) {
      await supabase.auth.signOut()
      setError('Access denied. Contact your supplier to request portal access.')
      setLoading(false)
      return
    }

    if (access.status === 'pending') {
      await supabase.auth.signOut()
      setError('Your access is pending activation. Contact your supplier to confirm your invitation.')
      setLoading(false)
      return
    }

    if (access.status === 'suspended') {
      await supabase.auth.signOut()
      setError('Your portal access has been suspended. Contact your supplier.')
      setLoading(false)
      return
    }

    router.push('/vendor/dashboard')
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email) { setError('Enter your email address first'); return }
    setLoading(true)
    setError(null)

    const appUrl = window.location.origin
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/vendor/login`,
    })

    setLoading(false)
    if (resetErr) { setError(resetErr.message); return }
    setResetSent(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-950 via-teal-900 to-teal-800 flex items-center justify-center p-6 relative overflow-hidden">

      {/* Decorative blobs */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-teal-700/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-4xl font-bold tracking-tight text-white">
            Az<span className="text-teal-300">Finance</span>
          </span>
          <p className="text-teal-200 text-sm mt-1">Vendor Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {resetSent ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Check your email</h3>
              <p className="text-sm text-gray-500 mb-4">
                Password reset instructions have been sent to <strong>{email}</strong>.
              </p>
              <button
                onClick={() => { setResetSent(false); setShowReset(false) }}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium"
              >
                ← Back to login
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {showReset ? 'Reset Password' : 'Sign in to Vendor Portal'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {showReset
                    ? "We'll send you a reset link."
                    : 'Access your purchase orders and invoices.'}
                </p>
              </div>

              {error && (
                <div className="mb-5 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <form onSubmit={showReset ? handleForgotPassword : handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="vendor@company.com"
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                  />
                </div>

                {!showReset && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-semibold py-3 rounded-lg transition-colors shadow-sm disabled:opacity-60 text-sm mt-2"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      {showReset ? 'Sending…' : 'Signing in…'}
                    </span>
                  ) : showReset ? 'Send Reset Link' : 'Sign In'}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={() => { setShowReset(v => !v); setError(null) }}
                  className="text-sm text-teal-600 hover:text-teal-700"
                >
                  {showReset ? '← Back to login' : 'Forgot password?'}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-teal-300/60 mt-6">
          AzFinance Vendor Portal &copy; 2026
        </p>
      </div>
    </div>
  )
}
