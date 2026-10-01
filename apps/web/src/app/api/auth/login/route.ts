import { API_PREFIX } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import {
  AUTH_COOKIE_NAME,
  hasExpectedOrigin,
  loginFailureMessage,
  loginRequestSchema,
  loginResponseSchema,
  safeReturnTo,
  sessionCookieOptions,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!hasExpectedOrigin(request.headers.get('origin'), request.nextUrl.origin)) {
    return NextResponse.json({ message: 'Origen de solicitud no permitido.' }, { status: 403 });
  }

  const input: unknown = await request.json().catch(() => null);
  const parsed = loginRequestSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? 'Los datos de acceso no son válidos.' },
      { status: 400 },
    );
  }

  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';
  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl}${API_PREFIX}/auth/login`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: parsed.data.email, password: parsed.data.password }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { message: 'El servicio de autenticación no está disponible.' },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    return NextResponse.json({ message: loginFailureMessage(status) }, { status });
  }

  const body: unknown = await upstream.json().catch(() => null);
  const auth = loginResponseSchema.safeParse(body);
  if (!auth.success) {
    return NextResponse.json(
      { message: 'La respuesta del servicio de autenticación no es válida.' },
      { status: 502 },
    );
  }

  const response = NextResponse.json({
    actor: auth.data.actor,
    redirectTo: safeReturnTo(parsed.data.returnTo),
  });
  response.cookies.set(
    AUTH_COOKIE_NAME,
    auth.data.accessToken,
    sessionCookieOptions(auth.data.expiresIn, process.env.NODE_ENV === 'production'),
  );
  return response;
}
