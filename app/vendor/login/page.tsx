'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function VendorLoginPage() {
  const router = useRouter()
  const [mode,        setMode]        = useState<'login' | 'signup' | 'reset' | 'set-password'>('login')
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [resetSent,   setResetSent]   = useState(false)

  // Detect Supabase password-recovery redirect (URL hash contains type=recovery)
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      setMode('set-password')
    }
  }, [])

  async function checkAccess(accessToken: string): Promise<{ found: boolean; status: string | null; error: string | null }> {
    try {
      const res = await fetch('/api/vendor/check-access', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      })
      const data = await res.json()
      console.log('[vendor] access check result:', data)
      return data
    } catch (e) {
      console.error('[vendor] check-access fetch error:', e)
      return { found: false, status: null, error: 'Network error' }
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { session }, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    if (authErr || !session) {
      setError(authErr?.message ?? 'Sign in failed')
      setLoading(false)
      return
    }

    const checkResult = await checkAccess(session.access_token)

    if (!checkResult.found) {
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
      if (signUpErr.message.toLowerCase().includes('already') || signUpErr.message.toLowerCase().includes('registered')) {
        setMode('login')
        setError('An account with this email already exists. Please sign in with your existing password.')
      } else {
        setError(signUpErr.message)
      }
      setLoading(false)
      return
    }

    // Try to sign in immediately (works when email confirmation is disabled)
    const { data: { session }, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr || !session) {
      if (!session && !signInErr) {
        setResetSent(true) // email confirmation required
      } else if (signInErr?.message.toLowerCase().includes('invalid') || signInErr?.message.toLowerCase().includes('credentials')) {
        setMode('login')
        setError('An account with this email already exists. Please sign in with your existing password.')
      } else {
        setResetSent(true)
      }
      setLoading(false)
      return
    }

    const checkResult = await checkAccess(session.access_token)
    if (!checkResult.found) {
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

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    setError(null)

    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      return
    }

    // Password updated — now check vendor access and redirect
    const { data: { session: updatedSession } } = await supabase.auth.getSession()
    let checkResult: { found: boolean; status: string | null; error: string | null } | null = null
    if (updatedSession) {
      checkResult = await checkAccess(updatedSession.access_token)
    }

    setLoading(false)
    if (checkResult?.found && checkResult.status !== 'suspended') {
      router.push('/vendor/dashboard')
    } else {
      // Access not granted — go to sign-in so they can try the main app
      router.push('/vendor/login')
      setMode('login')
      setError('Password updated. Please sign in.')
    }
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
          {mode === 'set-password' ? (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900">Set New Password</h2>
                <p className="text-sm text-gray-500 mt-1">Choose a password for your vendor portal account.</p>
              </div>
              {error && (
                <div className="mb-5 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                  <input
                    type="password"
                    required
                    autoFocus
                    minLength={6}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-lg transition-colors shadow-sm disabled:opacity-60 text-sm mt-2"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      Saving…
                    </span>
                  ) : 'Save Password & Sign In'}
                </button>
              </form>
            </>
          ) : resetSent ? (
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
