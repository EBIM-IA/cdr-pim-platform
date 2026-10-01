import { type NextRequest, NextResponse } from 'next/server';

import { AUTH_COOKIE_NAME } from '@/lib/auth';

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/logout']);

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const accessToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (accessToken) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-cdr-return-to', `${pathname}${search}`);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ message: 'Debes iniciar sesión.' }, { status: 401 });
  }

  const login = new URL('/login', request.url);
  login.searchParams.set('returnTo', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|brand/|favicon.ico|robots.txt|sitemap.xml).*)'],
};
