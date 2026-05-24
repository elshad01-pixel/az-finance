'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompany, type Role } from '@/lib/CompanyContext'
import { useLanguage } from '@/lib/LanguageContext'

interface Member {
  id:            number
  user_id:       string
  role:          Role
  invited_email: string | null
  status:        'active'
  created_at:    string
}

interface PendingInvite {
  id:            number
  invited_email: string
  role:          Role
  token:         string
  created_at:    string
}

const ROLE_LABEL: Record<Role, string> = {
  admin:    'Admin',
  manager:  'Manager',
  finance:  'Finance',
  employee: 'Employee',
}

const ROLE_COLOR: Record<Role, string> = {
  admin:    'bg-red-100 text-red-700',
  manager:  'bg-purple-100 text-purple-700',
  finance:  'bg-blue-100 text-blue-700',
  employee: 'bg-gray-100 text-gray-600',
}

export default function TeamTab() {
  const { company, membership, isAdmin } = useCompany()
  const { lang } = useLanguage()

  const [members,     setMembers]     = useState<Member[]>([])
  const [invitations, setInvitations] = useState<PendingInvite[]>([])
  const [loading,     setLoading]     = useState(true)

  const [inviteEmail,   setInviteEmail]   = useState('')
  const [inviteRole,    setInviteRole]    = useState<Role>('employee')
  const [inviting,      setInviting]      = useState(false)
  const [inviteError,   setInviteError]   = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [copiedToken,   setCopiedToken]   = useState<string | null>(null)
  const [removing,      setRemoving]      = useState<number | null>(null)

  async function loadTeam() {
    if (!company) { setLoading(false); return }

    const [{ data: mems, error: memErr }, { data: invs, error: invErr }] = await Promise.all([
      supabase
        .from('company_members')
        .select('id, user_id, role, invited_email, status, created_at')
        .eq('company_id', company.id)
        .eq('status', 'active')
        .order('created_at'),
      supabase
        .from('company_members')
        .select('id, invited_email, role, token, created_at')
        .eq('company_id', company.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ])

    if (memErr) console.error('[TeamTab] members error:', memErr)
    if (invErr) console.error('[TeamTab] invitations error:', invErr)

    setMembers(mems ?? [])
    setInvitations((invs ?? []).filter(i => i.token) as PendingInvite[])
    setLoading(false)
  }

  useEffect(() => { loadTeam() }, [company])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteError('')
    setInviteSuccess('')

    if (!company) {
      setInviteError('Company not loaded — refresh the page.')
      return
    }

    const email = inviteEmail.toLowerCase().trim()
    if (!email) return

    setInviting(true)

    try {
      const { data, error } = await supabase
        .from('company_members')
        .insert({
          company_id:    company.id,
          invited_email: email,
          role:          inviteRole,
          status:        'pending',
          // user_id intentionally omitted — NULL until they sign up
        })
        .select('id, invited_email, role, token, created_at')
        .single()

      if (error) {
        const detail = `${error.message}${error.hint ? ` (${error.hint})` : ''} [${error.code}]`
        setInviteError(lang === 'az' ? `Dəvət yaradılmadı: ${detail}` : `Failed to create invitation: ${detail}`)
      } else if (data?.token) {
        setInviteEmail('')
        setInviteSuccess(lang === 'az' ? `Dəvət yaradıldı — ${email}` : `Invitation created for ${email}`)
        setInvitations(prev => [data as PendingInvite, ...prev])
      } else {
        setInviteError(lang === 'az' ? 'Token yaradılmadı. Migration 018-i yoxlayın.' : 'Token not generated. Check migration 018.')
      }
    } catch (err) {
      setInviteError(String(err))
    }

    setInviting(false)
  }

  async function removeMember(memberId: number, memberUserId: string) {
    if (memberUserId === membership?.user_id) return
    const ok = window.confirm(lang === 'az'
      ? 'Bu istifadəçini komandadan çıxarmaq istəyirsiniz?'
      : 'Remove this member from the team?')
    if (!ok) return
    setRemoving(memberId)
    await supabase.from('company_members').delete().eq('id', memberId)
    setMembers(prev => prev.filter(m => m.id !== memberId))
    setRemoving(null)
  }

  async function cancelInvitation(invId: number) {
    await supabase.from('company_members').delete().eq('id', invId)
    setInvitations(prev => prev.filter(i => i.id !== invId))
  }

  function copyLink(token: string) {
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    const url = `${base}/signup?invite=${token}`
    navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2500)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-32 mb-4" />
            <div className="space-y-3">
              <div className="h-10 bg-gray-50 rounded" />
              <div className="h-10 bg-gray-50 rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!company) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
        <p className="font-semibold mb-1">Company context not available</p>
        <p className="text-amber-700">
          Run migrations 015–018 in the Supabase SQL Editor, then refresh.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Active members ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            {lang === 'az' ? 'Komanda Üzvləri' : 'Team Members'}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {members.length} {lang === 'az' ? 'aktiv üzv' : 'active members'}
          </p>
        </div>

        <div className="divide-y divide-gray-50">
          {members.map(m => (
            <div key={m.id} className="flex items-center justify-between px-6 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold shrink-0">
                  {(m.invited_email ?? m.user_id)[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {m.invited_email ?? m.user_id}
                    {m.user_id === membership?.user_id && (
                      <span className="ml-2 text-xs text-gray-400">
                        ({lang === 'az' ? 'siz' : 'you'})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">
                    {lang === 'az' ? 'Qoşulub' : 'Joined'}{' '}
                    {new Date(m.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLOR[m.role]}`}>
                  {ROLE_LABEL[m.role]}
                </span>
                {isAdmin && m.user_id !== membership?.user_id && (
                  <button
                    onClick={() => removeMember(m.id, m.user_id)}
                    disabled={removing === m.id}
                    title={lang === 'az' ? 'Çıxar' : 'Remove'}
                    className="text-gray-300 hover:text-red-500 transition-colors p-1.5 rounded hover:bg-red-50 disabled:opacity-40"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}

          {members.length === 0 && (
            <p className="px-6 py-8 text-sm text-gray-400 text-center">
              {lang === 'az' ? 'Komanda üzvü yoxdur.' : 'No team members yet.'}
            </p>
          )}
        </div>
      </div>

      {/* ── Invite form (admin only) ──────────────────────────────── */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-0.5">
            {lang === 'az' ? 'İstifadəçi Dəvət Et' : 'Invite Team Member'}
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            {lang === 'az'
              ? 'Dəvət linki yaradın, kopyalayıb WhatsApp/email ilə göndərin.'
              : 'Generate a signup link, then share it via WhatsApp or email.'}
          </p>

          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder={lang === 'az' ? 'e-poçt@nümunə.az' : 'email@example.com'}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as Role)}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="finance">Finance</option>
              <option value="employee">Employee</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors shadow-sm disabled:opacity-60 whitespace-nowrap"
            >
              {inviting
                ? (lang === 'az' ? 'Yaradılır…' : 'Creating…')
                : (lang === 'az' ? 'Dəvət Et' : 'Invite')}
            </button>
          </form>

          {inviteSuccess && (
            <div className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2.5 rounded-lg">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {inviteSuccess}
            </div>
          )}

          {inviteError && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg break-words">
              <span className="font-semibold">Error: </span>{inviteError}
            </div>
          )}
        </div>
      )}

      {/* ── Pending invitations ───────────────────────────────────── */}
      {isAdmin && invitations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">
              {lang === 'az' ? 'Gözləyən Dəvətlər' : 'Pending Invitations'}
            </h3>
          </div>

          <div className="divide-y divide-gray-50">
            {invitations.map(inv => (
              <div key={inv.id} className="flex items-center justify-between px-6 py-3.5">
                <div>
                  <p className="text-sm font-medium text-gray-900">{inv.invited_email}</p>
                  <p className="text-xs text-gray-400">
                    <span className={`font-medium ${ROLE_COLOR[inv.role]} px-1.5 py-0.5 rounded text-xs`}>
                      {ROLE_LABEL[inv.role]}
                    </span>
                    {' · '}
                    {lang === 'az' ? 'Qoşulmayıb' : 'Not yet joined'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyLink(inv.token)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors whitespace-nowrap"
                  >
                    {copiedToken === inv.token
                      ? (lang === 'az' ? '✓ Kopyalandı' : '✓ Copied!')
                      : (lang === 'az' ? 'Linki Kopyala' : 'Copy Link')}
                  </button>
                  <button
                    onClick={() => cancelInvitation(inv.id)}
                    title={lang === 'az' ? 'Ləğv et' : 'Cancel'}
                    className="text-gray-300 hover:text-red-500 transition-colors p-1.5 rounded hover:bg-red-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Role guide ────────────────────────────────────────────── */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-5">
        <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
          {lang === 'az' ? 'Rol Xülasəsi' : 'Role Summary'}
        </p>
        <div className="space-y-2">
          {([
            ['admin',    lang === 'az' ? 'Tam giriş, dəvət, üzv idarəetməsi' : 'Full access, invite & manage members'],
            ['manager',  lang === 'az' ? 'Bütün maliyyə datası, sifariş təsdiqi' : 'All financial data, approve requests'],
            ['finance',  lang === 'az' ? 'Faktura, xərc, hesabat' : 'Invoices, expenses, reports'],
            ['employee', lang === 'az' ? 'Yalnız öz sorğuları' : 'Own purchase requests only'],
          ] as [Role, string][]).map(([r, desc]) => (
            <div key={r} className="flex items-center gap-2.5">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLOR[r as Role]} shrink-0`}>
                {ROLE_LABEL[r as Role]}
              </span>
              <span className="text-xs text-gray-500">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
