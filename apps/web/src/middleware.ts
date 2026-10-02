import { type NextRequest, NextResponse } from 'next/server';

import { authCookieName } from '@/lib/auth';
import {
  applyBrowserSecurityHeaders,
  contentSecurityPolicy,
  securePrivateResponse,
} from '@/lib/http-security';

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/logout']);

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const production = process.env.NODE_ENV === 'production';
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const policy = contentSecurityPolicy(nonce, !production);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next extracts the nonce from the request CSP and applies it to framework scripts.
  requestHeaders.set('Content-Security-Policy', policy);

  let response: NextResponse;
  if (PUBLIC_PATHS.has(pathname)) {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    const accessToken = request.cookies.get(authCookieName(production))?.value;
    if (accessToken) {
      requestHeaders.set('x-cdr-return-to', `${pathname}${search}`);
      response = NextResponse.next({ request: { headers: requestHeaders } });
    } else if (pathname.startsWith('/api/')) {
      response = NextResponse.json({ message: 'Debes iniciar sesión.' }, { status: 401 });
    } else {
      const login = new URL('/login', request.url);
      login.searchParams.set('returnTo', `${pathname}${search}`);
      response = NextResponse.redirect(login);
    }
  }

  applyBrowserSecurityHeaders(response.headers, {
    contentSecurityPolicy: policy,
    production,
  });
  return securePrivateResponse(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|brand/|favicon.ico|robots.txt|sitemap.xml).*)'],
};
