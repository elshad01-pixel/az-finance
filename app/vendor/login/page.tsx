'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function VendorLoginPage() {
  const router = useRouter()
  const [mode,     setMode]     = useState<'login' | 'signup' | 'reset'>('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)

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

    // Check vendor_portal_access via server-side API (uses service role — bypasses RLS)
    let checkResult: { ok: boolean; found: boolean; status: string | null; email: string; error: string | null } | null = null
    try {
      const res = await fetch('/api/vendor/check-access', { method: 'POST' })
      checkResult = await res.json()
      console.log('[vendor-login] access check result:', checkResult)
    } catch (e) {
      console.error('[vendor-login] check-access fetch error:', e)
    }

    if (!checkResult?.found) {
      await supabase.auth.signOut()
      setError('Access denied. Contact your supplier to request portal access.')
      setLoading(false)
      return
    }

    if (checkResult.status === 'suspended') {
      await supabase.auth.signOut()
      setError('Your portal access has been suspended. Contact your supplier.')
      setLoading(false)
      return
    }

    router.push('/vendor/dashboard')
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signUpErr } = await supabase.auth.signUp({ email, password })
    if (signUpErr) {
      setError(signUpErr.message)
      setLoading(false)
      return
    }

    // After sign-up, immediately sign in (email confirmation may be disabled)
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr) {
      // If email confirmation is required, show a helpful message
      setError(null)
      setResetSent(true) // reuse the "check email" screen
      setLoading(false)
      return
    }

    // Check access
    let checkResult: { ok: boolean; found: boolean; status: string | null; email: string; error: string | null } | null = null
    try {
      const res = await fetch('/api/vendor/check-access', { method: 'POST' })
      checkResult = await res.json()
      console.log('[vendor-signup] access check result:', checkResult)
    } catch (e) {
      console.error('[vendor-signup] check-access fetch error:', e)
    }

    if (!checkResult?.found) {
      await supabase.auth.signOut()
      setError('Your email is not on the vendor access list. Check that you are using the invited email address.')
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Check your email</h3>
              <p className="text-sm text-gray-500 mb-4">
                {mode === 'signup'
                  ? <>A confirmation link has been sent to <strong>{email}</strong>. Click it to activate your account, then sign in.</>
                  : <>Password reset instructions have been sent to <strong>{email}</strong>.</>
                }
              </p>
              <button
                onClick={() => { setResetSent(false); setMode('login') }}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium"
              >
                ← Back to login
              </button>
            </div>
          ) : (
            <>
              {/* Mode tabs */}
              {mode !== 'reset' && (
                <div className="flex border border-gray-200 rounded-lg p-1 mb-6">
                  <button
                    onClick={() => { setMode('login'); setError(null) }}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'login' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => { setMode('signup'); setError(null) }}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'signup' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Create Account
                  </button>
                </div>
              )}

              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {mode === 'reset' ? 'Reset Password' : mode === 'signup' ? 'Create Your Account' : 'Sign in to Vendor Portal'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {mode === 'reset'
                    ? "We'll send you a reset link."
                    : mode === 'signup'
                    ? 'Use the email address your supplier invited.'
                    : 'Access your purchase orders and invoices.'}
                </p>
              </div>

              {error && (
                <div className="mb-5 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <form
                onSubmit={mode === 'reset' ? handleForgotPassword : mode === 'signup' ? handleSignUp : handleLogin}
                className="space-y-4"
              >
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

                {mode !== 'reset' && (
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
                      {mode === 'reset' ? 'Sending…' : mode === 'signup' ? 'Creating account…' : 'Signing in…'}
                    </span>
                  ) : mode === 'reset' ? 'Send Reset Link' : mode === 'signup' ? 'Create Account' : 'Sign In'}
                </button>
              </form>

              <div className="mt-4 text-center">
                {mode === 'reset' ? (
                  <button
                    onClick={() => { setMode('login'); setError(null) }}
                    className="text-sm text-teal-600 hover:text-teal-700"
                  >
                    ← Back to login
                  </button>
                ) : (
                  <button
                    onClick={() => { setMode('reset'); setError(null) }}
                    className="text-sm text-teal-600 hover:text-teal-700"
                  >
                    Forgot password?
                  </button>
                )}
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
