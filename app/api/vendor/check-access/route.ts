export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST() {
  // Get the authenticated user's session (set by signInWithPassword just before this call)
  const cookieStore = await cookies()
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ ok: false, status: null, error: 'Not authenticated' }, { status: 401 })
  }

  const email = user.email.toLowerCase().trim()
  console.log('[vendor/check-access] checking email:', email)

  // Service role bypasses RLS so any vendor email is readable regardless of company membership
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ ok: false, status: null, error: 'Server misconfigured' }, { status: 500 })
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  const { data, error } = await admin
    .from('vendor_portal_access')
    .select('id, status, company_id, vendor_id')
    .eq('email', email)
    .maybeSingle()

  console.log('[vendor/check-access] result:', JSON.stringify(data), 'error:', error?.message ?? null)

  return NextResponse.json({
    ok:     true,
    email,
    status: data?.status ?? null,
    found:  !!data,
    error:  error?.message ?? null,
  })
}
