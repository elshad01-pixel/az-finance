'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800">

      {/* Decorative blobs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-blue-400/10 rounded-full blur-2xl pointer-events-none" />

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
          <div className="mb-7">
            <h2 className="text-xl font-bold text-gray-900">Sign in to your account</h2>
            <p className="text-sm text-gray-500 mt-1">Welcome back — enter your details below</p>
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
                placeholder="you@example.com"
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 rounded-lg transition-colors shadow-sm disabled:opacity-60 text-sm"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-7">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-blue-600 hover:text-blue-700 font-semibold">
              Sign up free
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-blue-300/60 mt-6">
          AzFinance &copy; 2026 · All rights reserved
        </p>
      </div>
    </div>
  )
}
