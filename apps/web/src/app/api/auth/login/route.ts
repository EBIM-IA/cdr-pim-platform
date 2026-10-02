import { API_PREFIX } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import {
  authCookieName,
  clientAddressFromForwardedFor,
  hasExpectedOrigin,
  loginFailureMessage,
  loginRequestSchema,
  loginResponseSchema,
  safeReturnTo,
  sessionCookieOptions,
} from '@/lib/auth';
import { env } from '@/lib/env';
import { securePrivateResponse, upstreamTimeoutSignal } from '@/lib/http-security';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Compared with the configured public origin, never with the server's own bind address.
  if (!hasExpectedOrigin(request.headers.get('origin'), env.PUBLIC_APP_ORIGIN)) {
    return securePrivateResponse(
      NextResponse.json({ message: 'Origen de solicitud no permitido.' }, { status: 403 }),
    );
  }

  const input: unknown = await request.json().catch(() => null);
  const parsed = loginRequestSchema.safeParse(input);
  if (!parsed.success) {
    return securePrivateResponse(
      NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? 'Los datos de acceso no son válidos.' },
        { status: 400 },
      ),
    );
  }

  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
  };
  const clientAddress = clientAddressFromForwardedFor(request.headers.get('x-forwarded-for'));
  if (clientAddress) headers['x-forwarded-for'] = clientAddress;

  let upstream: Response;
  try {
    upstream = await fetch(`${env.API_BASE_URL}${API_PREFIX}/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: parsed.data.email, password: parsed.data.password }),
      cache: 'no-store',
      signal: upstreamTimeoutSignal(),
    });
  } catch {
    return securePrivateResponse(
      NextResponse.json(
        { message: 'El servicio de autenticación no está disponible.' },
        { status: 502 },
      ),
    );
  }

  if (!upstream.ok) {
    const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    const response = securePrivateResponse(
      NextResponse.json({ message: loginFailureMessage(status) }, { status }),
    );
    const retryAfter = upstream.headers.get('retry-after');
    if (status === 429 && retryAfter && /^\d+$/.test(retryAfter)) {
      response.headers.set('Retry-After', retryAfter);
    }
    return response;
  }

  const body: unknown = await upstream.json().catch(() => null);
  const auth = loginResponseSchema.safeParse(body);
  if (!auth.success) {
    return securePrivateResponse(
      NextResponse.json(
        { message: 'La respuesta del servicio de autenticación no es válida.' },
        { status: 502 },
      ),
    );
  }

  const response = securePrivateResponse(
    NextResponse.json({
      actor: auth.data.actor,
      redirectTo: safeReturnTo(parsed.data.returnTo),
    }),
  );
  response.cookies.set(
    authCookieName(env.NODE_ENV === 'production'),
    auth.data.accessToken,
    sessionCookieOptions(auth.data.expiresIn, env.NODE_ENV === 'production'),
  );
  return response;
}
