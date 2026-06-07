export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  // Parse body
  let body: { vendor_id: number; email: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { vendor_id, email } = body
  if (!vendor_id || !email) {
    return NextResponse.json({ ok: false, error: 'vendor_id and email required' }, { status: 400 })
  }

  // Verify caller is authenticated company user
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
  const { data: { session } } = await supabaseUser.auth.getSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  }

  // Get company_id via RPC
  const { data: companyId } = await supabaseUser.rpc('get_my_company_id')
  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'No company found' }, { status: 403 })
  }

  // Use service role to bypass RLS for the insert
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ ok: false, error: 'Service role key not configured' }, { status: 500 })
  }
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  // Upsert vendor_portal_access (re-invite resets to pending)
  const { error: insertErr } = await supabaseAdmin
    .from('vendor_portal_access')
    .upsert(
      {
        company_id: companyId,
        vendor_id,
        email:      email.toLowerCase().trim(),
        status:     'pending',
        invited_at: new Date().toISOString(),
        created_by: session.user.id,
      },
      { onConflict: 'company_id,vendor_id,email' }
    )

  if (insertErr) {
    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 })
  }

  // Load vendor name for the email
  const { data: vendor } = await supabaseAdmin
    .from('vendors')
    .select('name')
    .eq('id', vendor_id)
    .maybeSingle()

  // Load company name
  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle()

  // Send invite email (fire-and-forget — don't block on email failure)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    await fetch(`${appUrl}/api/email/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'vendor_invite',
        to:   email.toLowerCase().trim(),
        data: {
          vendorName:  vendor?.name ?? email,
          companyName: company?.name ?? 'Your buyer',
          portalUrl:   `${appUrl}/vendor/login`,
        },
      }),
    })
  } catch {
    // Non-fatal: invite record was created, email is best-effort
  }

  return NextResponse.json({ ok: true })
}
