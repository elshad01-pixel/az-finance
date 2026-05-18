import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
          if (headers) {
            Object.entries(headers).forEach(([key, value]) =>
              response.headers.set(key, value)
            )
          }
        },
      },
    }
  )

  // getSession() reads from cookies — no network call, never throws AuthSessionMissingError.
  const { data: { session } } = await supabase.auth.getSession()

  const { pathname } = request.nextUrl
  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  // Redirect unauthenticated users to /login
  if (!session && !isPublicPath) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from login/signup to dashboard
  if (session && isPublicPath) {
    const dashUrl = request.nextUrl.clone()
    dashUrl.pathname = '/'
    return NextResponse.redirect(dashUrl)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - static assets (svg, png, jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
