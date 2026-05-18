'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export type Role = 'admin' | 'manager' | 'finance' | 'employee'

export interface Company {
  id:         string
  name:       string
  owner_id:   string
  created_at: string
}

export interface CompanyMember {
  id:            number
  company_id:    string
  user_id:       string
  role:          Role
  invited_email: string | null
  status:        'active' | 'pending'
  created_at:    string
}

interface CompanyContextValue {
  company:      Company | null
  membership:   CompanyMember | null
  role:         Role | null
  isAdmin:      boolean
  isManager:    boolean
  isFinance:    boolean
  user:         User | null
  loading:      boolean
  setupError:   string | null
  refresh:      () => Promise<void>
}

const CompanyContext = createContext<CompanyContextValue>({
  company:    null,
  membership: null,
  role:       null,
  isAdmin:    false,
  isManager:  false,
  isFinance:  false,
  user:       null,
  loading:    true,
  setupError: null,
  refresh:    async () => {},
})

export function useCompany() {
  return useContext(CompanyContext)
}

function log(msg: string, data?: unknown) {
  if (data !== undefined) {
    console.log(`[CompanyContext] ${msg}`, data)
  } else {
    console.log(`[CompanyContext] ${msg}`)
  }
}

function logError(msg: string, err?: unknown) {
  console.error(`[CompanyContext] ${msg}`, err)
}

async function fetchMembership(userId: string) {
  return supabase
    .from('company_members')
    .select('*, companies(*)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
}

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [company,    setCompany]    = useState<Company | null>(null)
  const [membership, setMembership] = useState<CompanyMember | null>(null)
  const [user,       setUser]       = useState<User | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [setupError, setSetupError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setSetupError(null)

    // Use getSession() — reads from localStorage, never throws AuthSessionMissingError.
    // getUser() makes a network call and fails with AuthSessionMissingError when no session exists.
    const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
    if (sessionErr) logError('getSession failed', sessionErr)

    const authUser = session?.user ?? null
    setUser(authUser)

    if (!authUser) {
      log('No session — clearing state')
      setCompany(null)
      setMembership(null)
      setLoading(false)
      return
    }

    log(`Session active for ${authUser.email} (${authUser.id})`)

    // ── Step 1: Auto-accept any pending invitation for this email ──────────
    // Invitations are stored as company_members rows with status='pending'.
    // The members_read RLS policy allows reading pending rows by email even
    // before the user has a company membership.
    try {
      const { data: pendingInv, error: invErr } = await supabase
        .from('company_members')
        .select('token')
        .eq('invited_email', (authUser.email ?? '').toLowerCase())
        .eq('status', 'pending')
        .maybeSingle()

      if (invErr) {
        log('Pending invite lookup error', invErr)
      } else if (pendingInv?.token) {
        log('Found pending invitation — auto-accepting', pendingInv.token)
        const { error: acceptErr } = await supabase.rpc('accept_invitation', { p_token: pendingInv.token })
        if (acceptErr) logError('accept_invitation failed', acceptErr)
        else log('Invitation accepted successfully')
      } else {
        log('No pending invitation found')
      }
    } catch (e) {
      log('Invitation check threw', e)
    }

    // ── Step 2: Load existing membership ──────────────────────────────────
    const { data: mem, error: memErr } = await fetchMembership(authUser.id)
    if (memErr) logError('membership fetch failed', memErr)

    if (mem) {
      log('Existing membership found', { role: mem.role, company_id: mem.company_id })
      setMembership(mem as CompanyMember)
      setCompany((mem as unknown as { companies: Company }).companies)
      setLoading(false)
      return
    }

    log('No active membership — will create company for new user')

    // ── Step 3a: Try direct insert (primary path, needs migration 016) ────
    const companyName = (authUser.email ?? 'My Company').split('@')[0]
    log(`Attempting direct company insert: name="${companyName}"`)

    const { data: newCompany, error: compInsertErr } = await supabase
      .from('companies')
      .insert({ name: companyName, owner_id: authUser.id })
      .select()
      .single()

    if (compInsertErr) {
      logError('Direct company insert failed', compInsertErr)
    } else {
      log('Company created directly', newCompany)

      const { error: memInsertErr } = await supabase
        .from('company_members')
        .insert({
          company_id:    newCompany.id,
          user_id:       authUser.id,
          role:          'admin',
          status:        'active',
          invited_email: authUser.email ?? null,
        })

      if (memInsertErr) {
        logError('Direct company_members insert failed', memInsertErr)
      } else {
        log('company_members row inserted directly')
        const { data: mem3, error: mem3Err } = await fetchMembership(authUser.id)
        if (mem3Err) logError('Re-fetch after direct insert failed', mem3Err)
        if (mem3) {
          setMembership(mem3 as CompanyMember)
          setCompany((mem3 as unknown as { companies: Company }).companies)
          setLoading(false)
          return
        }
      }
    }

    // ── Step 3b: Fall back to SECURITY DEFINER RPC ────────────────────────
    log('Falling back to ensure_user_has_company() RPC')
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('ensure_user_has_company')
    if (rpcErr) logError('ensure_user_has_company RPC failed', rpcErr)
    else log('ensure_user_has_company returned', rpcResult)

    const { data: mem4, error: mem4Err } = await fetchMembership(authUser.id)
    if (mem4Err) logError('Re-fetch after RPC failed', mem4Err)

    if (mem4) {
      log('Membership found after RPC', { role: mem4.role })
      setMembership(mem4 as CompanyMember)
      setCompany((mem4 as unknown as { companies: Company }).companies)
    } else {
      const errMsg = rpcErr
        ? `Company setup failed: ${rpcErr.message}`
        : 'Company setup failed: no membership after all attempts. Check Supabase logs.'
      logError(errMsg)
      setSetupError(errMsg)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    load()

    // onAuthStateChange fires on login/logout/token-refresh with the new session.
    // The session object here is already validated — safe to use directly.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      log(`Auth state changed: ${_event}`)
      if (!session) {
        setUser(null)
        setCompany(null)
        setMembership(null)
        setLoading(false)
        return
      }
      // Re-run full load to pick up company/membership for new session
      load()
    })

    return () => subscription.unsubscribe()
  }, [load])

  const role      = membership?.role ?? null
  const isAdmin   = role === 'admin'
  const isManager = role === 'admin' || role === 'manager'
  const isFinance = role === 'admin' || role === 'manager' || role === 'finance'

  return (
    <CompanyContext.Provider value={{
      company, membership, role, isAdmin, isManager, isFinance,
      user, loading, setupError, refresh: load,
    }}>
      {children}
    </CompanyContext.Provider>
  )
}
