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
  refresh:      () => Promise<void>
}

const CompanyContext = createContext<CompanyContextValue>({
  company:   null,
  membership: null,
  role:      null,
  isAdmin:   false,
  isManager: false,
  isFinance: false,
  user:      null,
  loading:   true,
  refresh:   async () => {},
})

export function useCompany() {
  return useContext(CompanyContext)
}

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [company,    setCompany]    = useState<Company | null>(null)
  const [membership, setMembership] = useState<CompanyMember | null>(null)
  const [user,       setUser]       = useState<User | null>(null)
  const [loading,    setLoading]    = useState(true)

  const load = useCallback(async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    setUser(authUser)

    if (!authUser) {
      setCompany(null)
      setMembership(null)
      setLoading(false)
      return
    }

    // Auto-accept any pending invitation for this email
    const { data: pendingInv } = await supabase
      .from('company_invitations')
      .select('token')
      .eq('invited_email', authUser.email?.toLowerCase() ?? '')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (pendingInv?.token) {
      await supabase.rpc('accept_invitation', { p_token: pendingInv.token })
    }

    // Load membership + company in one query
    const { data: mem } = await supabase
      .from('company_members')
      .select('*, companies(*)')
      .eq('user_id', authUser.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!mem) {
      // New user with no company — create one automatically
      await supabase.rpc('ensure_user_has_company')
      const { data: mem2 } = await supabase
        .from('company_members')
        .select('*, companies(*)')
        .eq('user_id', authUser.id)
        .eq('status', 'active')
        .maybeSingle()
      if (mem2) {
        setMembership(mem2 as CompanyMember)
        setCompany((mem2 as unknown as { companies: Company }).companies)
      }
    } else {
      setMembership(mem as CompanyMember)
      setCompany((mem as unknown as { companies: Company }).companies)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
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
      company, membership, role, isAdmin, isManager, isFinance, user, loading, refresh: load,
    }}>
      {children}
    </CompanyContext.Provider>
  )
}
