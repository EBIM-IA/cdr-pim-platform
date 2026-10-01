import { type NextRequest, NextResponse } from 'next/server';

import {
  AUTH_COOKIE_NAME,
  hasExpectedOrigin,
  safeReturnTo,
  sessionCookieOptions,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function readReturnTo(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body: unknown = await request.json().catch(() => null);
    return body && typeof body === 'object' && 'returnTo' in body ? body.returnTo : undefined;
  }
  const body = await request.formData().catch(() => null);
  return body?.get('returnTo');
}

export async function POST(request: NextRequest) {
  if (!hasExpectedOrigin(request.headers.get('origin'), request.nextUrl.origin)) {
    return NextResponse.json({ message: 'Origen de solicitud no permitido.' }, { status: 403 });
  }

  const redirectTo = safeReturnTo(await readReturnTo(request), '/login');
  const acceptsJson = request.headers.get('accept')?.includes('application/json') ?? false;
  const response = acceptsJson
    ? NextResponse.json({ redirectTo })
    : NextResponse.redirect(new URL(redirectTo, request.url), 303);

  response.cookies.set(AUTH_COOKIE_NAME, '', {
    ...sessionCookieOptions('1s', process.env.NODE_ENV === 'production'),
    maxAge: 0,
  });
  return response;
}
