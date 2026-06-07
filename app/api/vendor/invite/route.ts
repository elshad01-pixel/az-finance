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

  // Send invite email — capture result so errors are visible to the caller
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const emailTo = email.toLowerCase().trim()
  let emailResult: { ok: boolean; error?: string; id?: string } = { ok: false, error: 'not attempted' }

  console.log('[vendor/invite] sending to:', emailTo, 'from:', process.env.EMAIL_FROM ?? 'onboarding@resend.dev (fallback)')

  try {
    const emailRes = await fetch(`${appUrl}/api/email/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'vendor_invite',
        to:   emailTo,
        data: {
          vendorName:  vendor?.name ?? emailTo,
          companyName: company?.name ?? 'Your buyer',
          portalUrl:   `${appUrl}/vendor/login`,
        },
      }),
    })
    emailResult = await emailRes.json() as typeof emailResult
  } catch (e) {
    emailResult = { ok: false, error: String(e) }
  }

  if (!emailResult.ok) {
    console.error('[vendor/invite] Resend error:', emailResult.error)
  } else {
    console.log('[vendor/invite] Email sent, id:', emailResult.id)
  }

  // Invite record was created regardless — email failure is non-fatal but visible
  return NextResponse.json({ ok: true, emailSent: emailResult.ok, emailError: emailResult.error ?? null })
}
