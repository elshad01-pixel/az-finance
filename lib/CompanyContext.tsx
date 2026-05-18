'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  PACKAGE_FEATURES, resolveFeatureSet,
  type Package, type SubscriptionStatus,
} from '@/lib/features'
import type { User } from '@supabase/supabase-js'

export type { Package, SubscriptionStatus }
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

export interface Subscription {
  id:            string
  company_id:    string
  package:       Package
  status:        SubscriptionStatus
  trial_ends_at: string
  paid_until:    string | null
  created_at:    string
  updated_at:    string
}

interface CompanyContextValue {
  company:        Company | null
  membership:     CompanyMember | null
  subscription:   Subscription | null
  role:           Role | null
  isAdmin:        boolean
  isManager:      boolean
  isFinance:      boolean
  currentPackage: Package
  isTrialActive:  boolean
  trialDaysLeft:  number
  canAccess:      (feature: string) => boolean
  user:           User | null
  loading:        boolean
  setupError:     string | null
  refresh:        () => Promise<void>
}

const CompanyContext = createContext<CompanyContextValue>({
  company:        null,
  membership:     null,
  subscription:   null,
  role:           null,
  isAdmin:        false,
  isManager:      false,
  isFinance:      false,
  currentPackage: 'light',
  isTrialActive:  false,
  trialDaysLeft:  0,
  canAccess:      () => true,
  user:           null,
  loading:        true,
  setupError:     null,
  refresh:        async () => {},
})

export function useCompany() {
  return useContext(CompanyContext)
}

function log(msg: string, data?: unknown) {
  if (data !== undefined) console.log(`[CompanyContext] ${msg}`, data)
  else console.log(`[CompanyContext] ${msg}`)
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

async function fetchSubscription(companyId: string) {
  return supabase
    .from('company_subscriptions')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle()
}

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [company,      setCompany]      = useState<Company | null>(null)
  const [membership,   setMembership]   = useState<CompanyMember | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [user,         setUser]         = useState<User | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [setupError,   setSetupError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setSetupError(null)

    const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
    if (sessionErr) logError('getSession failed', sessionErr)

    const authUser = session?.user ?? null
    setUser(authUser)

    if (!authUser) {
      log('No session — clearing state')
      setCompany(null)
      setMembership(null)
      setSubscription(null)
      setLoading(false)
      return
    }

    log(`Session active for ${authUser.email} (${authUser.id})`)

    // ── Step 1: Auto-accept any pending invitation ─────────────────────────
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
      }
    } catch (e) {
      log('Invitation check threw', e)
    }

    // ── Step 2: Load existing membership ──────────────────────────────────
    const { data: mem, error: memErr } = await fetchMembership(authUser.id)
    if (memErr) logError('membership fetch failed', memErr)

    if (mem) {
      log('Existing membership found', { role: mem.role, company_id: mem.company_id })
      const comp = (mem as unknown as { companies: Company }).companies
      setMembership(mem as CompanyMember)
      setCompany(comp)
      // Load subscription
      const { data: sub, error: subErr } = await fetchSubscription(comp.id)
      if (subErr) log('Subscription fetch error (table may not exist yet)', subErr)
      setSubscription(sub as Subscription | null)
      setLoading(false)
      return
    }

    log('No active membership — will create company for new user')

    // ── Step 3a: Direct insert ─────────────────────────────────────────────
    const companyName = (authUser.email ?? 'My Company').split('@')[0]
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
        const { data: mem3 } = await fetchMembership(authUser.id)
        if (mem3) {
          const comp3 = (mem3 as unknown as { companies: Company }).companies
          setMembership(mem3 as CompanyMember)
          setCompany(comp3)
          const { data: sub3 } = await fetchSubscription(comp3.id)
          setSubscription(sub3 as Subscription | null)
          setLoading(false)
          return
        }
      }
    }

    // ── Step 3b: RPC fallback ──────────────────────────────────────────────
    log('Falling back to ensure_user_has_company() RPC')
    const { error: rpcErr } = await supabase.rpc('ensure_user_has_company')
    if (rpcErr) logError('ensure_user_has_company RPC failed', rpcErr)

    const { data: mem4 } = await fetchMembership(authUser.id)
    if (mem4) {
      const comp4 = (mem4 as unknown as { companies: Company }).companies
      setMembership(mem4 as CompanyMember)
      setCompany(comp4)
      const { data: sub4 } = await fetchSubscription(comp4.id)
      setSubscription(sub4 as Subscription | null)
    } else {
      const errMsg = rpcErr
        ? `Company setup failed: ${rpcErr.message}`
        : 'Company setup failed: no membership after all attempts.'
      logError(errMsg)
      setSetupError(errMsg)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
      log(`Auth state changed: ${_event}`)
      if (!session) {
        setUser(null)
        setCompany(null)
        setMembership(null)
        setSubscription(null)
        setLoading(false)
        return
      }
      load()
    })
    return () => authSub.unsubscribe()
  }, [load])

  // ── Derived subscription values ────────────────────────────────────────────
  const trialDaysLeft = subscription
    ? Math.max(0, Math.ceil(
        (new Date(subscription.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ))
    : 0

  const isTrialActive  = subscription?.status === 'trial' && trialDaysLeft > 0
  const currentPackage: Package = subscription?.package ?? 'light'

  const canAccess = useCallback((feature: string): boolean => {
    if (!subscription) return true  // no subscription loaded yet → allow all
    const featureSet = resolveFeatureSet(
      subscription.package,
      subscription.status,
      isTrialActive,
    )
    return featureSet.includes(feature)
  }, [subscription, isTrialActive])

  const role      = membership?.role ?? null
  const isAdmin   = role === 'admin'
  const isManager = role === 'admin' || role === 'manager'
  const isFinance = role === 'admin' || role === 'manager' || role === 'finance'

  return (
    <CompanyContext.Provider value={{
      company, membership, subscription, role,
      isAdmin, isManager, isFinance,
      currentPackage, isTrialActive, trialDaysLeft, canAccess,
      user, loading, setupError, refresh: load,
    }}>
      {children}
    </CompanyContext.Provider>
  )
}
