export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  // Accept the Supabase access_token via Authorization header (avoids cookie timing issues)
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '').trim()
  if (!token) {
    return NextResponse.json({ ok: false, status: null, found: false, error: 'No token' }, { status: 401 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ ok: false, status: null, found: false, error: 'Server misconfigured' }, { status: 500 })
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Validate the JWT and get the user — reliable since token just came from signInWithPassword
  const { data: { user }, error: authErr } = await admin.auth.getUser(token)
  if (!user?.email) {
    console.error('[vendor/check-access] token validation failed:', authErr?.message)
    return NextResponse.json({ ok: false, status: null, found: false, error: 'Invalid token' }, { status: 401 })
  }

  const email = user.email.toLowerCase().trim()
  console.log('[vendor/check-access] checking email:', email)

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
