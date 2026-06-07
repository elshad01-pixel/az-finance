'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface VendorAccess {
  id:         string
  company_id: string
  vendor_id:  number
  email:      string
  status:     'pending' | 'active' | 'suspended'
}

interface VendorInfo {
  id:    number
  name:  string
  email: string | null
  voen:  string | null
}

interface VendorContextValue {
  user:       User | null
  access:     VendorAccess | null
  vendor:     VendorInfo | null
  loading:    boolean
  denied:     boolean
  needsLogin: boolean
  signOut:    () => Promise<void>
}

const VendorContext = createContext<VendorContextValue>({
  user: null, access: null, vendor: null,
  loading: true, denied: false, needsLogin: false,
  signOut: async () => {},
})

export function VendorProvider({ children }: { children: React.ReactNode }) {
  const [user,       setUser]       = useState<User | null>(null)
  const [access,     setAccess]     = useState<VendorAccess | null>(null)
  const [vendor,     setVendor]     = useState<VendorInfo | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [denied,     setDenied]     = useState(false)
  const [needsLogin, setNeedsLogin] = useState(false)

  async function load() {
    setLoading(true)
    setDenied(false)
    setNeedsLogin(false)

    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.user) {
      setUser(null)
      setAccess(null)
      setVendor(null)
      setNeedsLogin(true)
      setLoading(false)
      return
    }

    setUser(session.user)

    // Look up vendor_portal_access by email
    const { data: accessRow } = await supabase
      .from('vendor_portal_access')
      .select('id, company_id, vendor_id, email, status')
      .eq('email', session.user.email ?? '')
      .eq('status', 'active')
      .maybeSingle()

    if (!accessRow) {
      setDenied(true)
      setLoading(false)
      return
    }

    setAccess(accessRow as VendorAccess)

    // Update last_login
    await supabase
      .from('vendor_portal_access')
      .update({ last_login: new Date().toISOString() })
      .eq('id', accessRow.id)

    // Load vendor info
    const { data: vendorRow } = await supabase
      .from('vendors')
      .select('id, name, email, voen')
      .eq('id', accessRow.vendor_id)
      .maybeSingle()

    if (vendorRow) setVendor(vendorRow as VendorInfo)

    setLoading(false)
  }

  useEffect(() => {
    load()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        load()
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <VendorContext.Provider value={{ user, access, vendor, loading, denied, needsLogin, signOut }}>
      {children}
    </VendorContext.Provider>
  )
}

export function useVendor() {
  return useContext(VendorContext)
}
