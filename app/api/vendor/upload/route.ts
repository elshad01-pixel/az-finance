export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

export async function POST(req: NextRequest) {
  // Verify auth
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

  // Parse multipart form
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 })
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ ok: false, error: 'Only PDF files are accepted' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ ok: false, error: 'File exceeds 5 MB limit' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ ok: false, error: 'Storage not configured' }, { status: 500 })
  }

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  // Build a path scoped to this user to prevent collisions
  const timestamp = Date.now()
  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path      = `${session.user.id}/${timestamp}_${safeName}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadErr } = await supabaseAdmin.storage
    .from('vendor-invoices')
    .upload(path, arrayBuffer, { contentType: 'application/pdf', upsert: false })

  if (uploadErr) {
    return NextResponse.json({ ok: false, error: uploadErr.message }, { status: 500 })
  }

  // Return a signed URL valid for 10 years (effectively permanent for this use case)
  const { data: signed } = await supabaseAdmin.storage
    .from('vendor-invoices')
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10)

  return NextResponse.json({ ok: true, url: signed?.signedUrl ?? path })
}
