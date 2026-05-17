'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface InviteInfo {
  company_name: string
  role:         string
  invited_email: string
}

function SignupForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const inviteToken  = searchParams.get('invite')

  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken)

  // Resolve invite token → company/role info
  useEffect(() => {
    if (!inviteToken) return
    supabase
      .rpc('get_invitation_by_token', { p_token: inviteToken })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const inv = data[0] as InviteInfo
          setInviteInfo(inv)
          setEmail(inv.invited_email)
        }
        setInviteLoading(false)
      })
  }, [inviteToken])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 6)  { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    setError('')

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // If signup gave us an immediate session, go to dashboard
    // CompanyContext will auto-accept the pending invitation on load
    if (data.session) {
      router.push('/')
      router.refresh()
    } else {
      setSuccess('Account created! Check your email for a confirmation link.')
      setLoading(false)
    }
  }

  if (inviteLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800">
        <div className="text-blue-200 text-sm">Loading invitation…</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800">

      {/* Decorative blobs */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-blue-400/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative w-full max-w-lg">

        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-4xl font-bold tracking-tight text-white">
            Az<span className="text-blue-300">Finance</span>
          </span>
          <p className="text-blue-200 text-sm mt-2">Financial Management Platform</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-10">

          {success ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Check your email</h3>
              <p className="text-sm text-gray-500 mb-7">{success}</p>
              <Link href="/login" className="text-blue-600 hover:text-blue-700 text-sm font-semibold">
                Back to sign in →
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-7">
                {inviteInfo ? (
                  <>
                    <h2 className="text-xl font-bold text-gray-900">You&apos;ve been invited</h2>
                    <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5">
                        {inviteInfo.company_name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{inviteInfo.company_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Joining as{' '}
                          <span className="font-semibold capitalize text-blue-700">{inviteInfo.role}</span>
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-gray-900">Create your account</h2>
                    <p className="text-sm text-gray-500 mt-1">Get started — it only takes a minute</p>
                  </>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    readOnly={!!inviteInfo}
                    placeholder="you@example.com"
                    className={`w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${inviteInfo ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                  />
                  {inviteInfo && (
                    <p className="text-xs text-gray-400 mt-1">
                      This email was specified in the invitation.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
                  <input
                    type="password"
                    required
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 rounded-lg transition-colors shadow-sm disabled:opacity-60 text-sm"
                >
                  {loading
                    ? 'Creating account…'
                    : inviteInfo
                      ? `Join ${inviteInfo.company_name}`
                      : 'Create Account'}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-7">
                Already have an account?{' '}
                <Link href="/login" className="text-blue-600 hover:text-blue-700 font-semibold">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>

        <p className="text-center text-xs text-blue-300/60 mt-6">
          AzFinance &copy; 2026 · All rights reserved
        </p>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 text-blue-200 text-sm">Yüklənir...</div>}>
      <SignupForm />
    </Suspense>
  )
}
