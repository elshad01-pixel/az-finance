export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { Resend } from 'resend'

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

  // Load vendor + company names for the email
  const [{ data: vendor }, { data: company }] = await Promise.all([
    supabaseAdmin.from('vendors').select('name').eq('id', vendor_id).maybeSingle(),
    supabaseAdmin.from('companies').select('name').eq('id', companyId).maybeSingle(),
  ])

  // Send invite email directly via Resend (no internal fetch)
  const emailTo      = email.toLowerCase().trim()
  const companyName  = company?.name ?? 'Your buyer'
  const vendorName   = vendor?.name ?? emailTo
  // Use request origin so the link works on any env (localhost:3001, vercel, etc.)
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
  const portalUrl    = `${appUrl}/vendor/login`
  const fromAddress  = 'AzFinance <onboarding@resend.dev>'

  console.log('[vendor/invite] from:', fromAddress, '→ to:', emailTo)

  let emailSent  = false
  let emailError: string | null = null
  let emailId:    string | null = null

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    emailError = 'RESEND_API_KEY not configured'
    console.error('[vendor/invite]', emailError)
  } else {
    const resend = new Resend(resendKey)
    const { data, error } = await resend.emails.send({
      from:    fromAddress,
      to:      [emailTo],
      subject: `You've been invited to ${companyName} Vendor Portal`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#f1f5f9;font-family:sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
                <tr><td style="background:#0f766e;padding:28px 36px;">
                  <span style="font-size:22px;font-weight:700;color:#fff;">Az</span><span style="font-size:22px;font-weight:700;color:#99f6e4;">Finance</span>
                  <p style="margin:4px 0 0;font-size:11px;color:#99f6e4;">Vendor Portal</p>
                </td></tr>
                <tr><td style="padding:32px 36px;">
                  <h2 style="margin:0 0 12px;color:#134e4a;font-size:18px;">You've been invited!</h2>
                  <p style="margin:0 0 16px;font-size:14px;color:#334155;">
                    Dear <strong>${vendorName}</strong>,<br><br>
                    <strong>${companyName}</strong> has invited you to access their Vendor Portal on AzFinance.
                    You can view your purchase orders, submit invoices, and track payment status online.
                  </p>
                  <p style="text-align:center;margin:24px 0;">
                    <a href="${portalUrl}" style="display:inline-block;background:#0f766e;color:#fff;font-size:14px;font-weight:600;padding:13px 32px;border-radius:8px;text-decoration:none;">
                      Access Vendor Portal
                    </a>
                  </p>
                  <p style="margin:0;font-size:12px;color:#94a3b8;">
                    If you don't have an account, sign up at the portal link above using this email address.
                  </p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    })

    if (error) {
      emailError = error.message
      console.error('[vendor/invite] Resend error:', error)
    } else {
      emailSent = true
      emailId   = data?.id ?? null
      console.log('[vendor/invite] Email sent, id:', emailId)
    }
  }

  return NextResponse.json({ ok: true, emailSent, emailError, emailId })
}
