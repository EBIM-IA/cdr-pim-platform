import 'server-only';

import { NextResponse } from 'next/server';

import { ApiClientError } from '@/lib/api-client';
import { securePrivateResponse } from '@/lib/http-security';

export function unauthenticatedCatalogResponse() {
  return securePrivateResponse(
    NextResponse.json({ message: 'Debes iniciar sesión.' }, { status: 401 }),
  );
}

export function invalidCatalogRequest(message: string, issues?: unknown) {
  return securePrivateResponse(
    NextResponse.json({ message, ...(issues ? { issues } : {}) }, { status: 400 }),
  );
}

export function catalogRouteError(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return securePrivateResponse(
      NextResponse.json(
        { message: error.message, code: error.code, correlationId: error.correlationId },
        { status: error.status },
      ),
    );
  }
  return securePrivateResponse(NextResponse.json({ message: fallback }, { status: 502 }));
}
