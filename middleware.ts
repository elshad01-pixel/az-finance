import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Pages that never require auth
const PUBLIC_PREFIXES = ['/login', '/signup', '/create-company', '/api', '/_next', '/favicon']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Supabase stores the session in cookies named sb-<ref>-auth-token (may be split into .0, .1, …)
  const hasSession = request.cookies.getAll().some(
    c => c.name.startsWith('sb-') && c.name.includes('-auth-token'),
  )

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Match all routes except static assets
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\..*).*)',],
}
