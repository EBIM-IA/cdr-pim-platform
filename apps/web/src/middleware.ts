import { type NextRequest, NextResponse } from 'next/server';

import { authCookieName } from '@/lib/auth';
import { env } from '@/lib/env';
import {
  applyBrowserSecurityHeaders,
  contentSecurityPolicy,
  securePrivateResponse,
} from '@/lib/http-security';

// `/healthz` is the anonymous load-balancer probe: it must answer 200, never redirect.
const PUBLIC_PATHS = new Set(['/healthz', '/login', '/api/auth/login', '/api/auth/logout']);

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
      // The public origin, not request.url: behind the ALB that is the bind address.
      const login = new URL('/login', env.PUBLIC_APP_ORIGIN);
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
