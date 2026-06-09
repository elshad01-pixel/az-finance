export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST() {
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
  // eslint-disable-next-line @supabase/no-insecure-random -- getSession reads HttpOnly cookies; safe for server routes
  const { data: { session } } = await supabaseUser.auth.getSession()
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, status: null, error: 'Not authenticated' }, { status: 401 })
  }

  const email = session.user.email.toLowerCase().trim()
  console.log('[vendor/check-access] checking email:', email)

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

  if (error) {
    return NextResponse.json({ ok: false, status: null, found: false, email, error: error.message })
  }

  if (!data) {
    return NextResponse.json({ ok: true, email, status: null, found: false, error: null })
  }

  // Auto-activate on first login: pending → active
  if (data.status === 'pending') {
    const { error: updateErr } = await admin
      .from('vendor_portal_access')
      .update({ status: 'active', accepted_at: new Date().toISOString(), last_login: new Date().toISOString() })
      .eq('id', data.id)

    if (updateErr) {
      console.error('[vendor/check-access] failed to activate:', updateErr.message)
    } else {
      console.log('[vendor/check-access] auto-activated pending → active for', email)
      data.status = 'active'
    }
  } else if (data.status === 'active') {
    // Update last_login timestamp
    await admin
      .from('vendor_portal_access')
      .update({ last_login: new Date().toISOString() })
      .eq('id', data.id)
  }

  return NextResponse.json({
    ok:     true,
    email,
    status: data.status,
    found:  true,
    error:  null,
  })
}
