import 'server-only';

import { API_PREFIX, apiErrorSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import type { ZodTypeAny, z } from 'zod';

import { hasExpectedOrigin } from '@/lib/auth';
import { env } from '@/lib/env';
import { securePrivateResponse, upstreamTimeoutSignal } from '@/lib/http-security';
import { getAccessToken } from '@/lib/server-auth';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface PrivateApiProxyOptions<
  TInput extends ZodTypeAny | undefined,
  TOutput extends ZodTypeAny,
> {
  readonly path: string;
  readonly method: HttpMethod;
  readonly request: NextRequest;
  readonly inputSchema?: TInput;
  readonly outputSchema: TOutput;
}

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return securePrivateResponse(NextResponse.json({ message, ...extra }, { status }));
}

/**
 * Authenticated, same-origin server proxy for operational screens. The browser never receives
 * the bearer token and every successful upstream response is checked against the shared schema.
 */
export async function proxyPrivateApi<
  TInput extends ZodTypeAny | undefined,
  TOutput extends ZodTypeAny,
>(options: PrivateApiProxyOptions<TInput, TOutput>): Promise<NextResponse> {
  const { method, request } = options;
  if (
    method !== 'GET' &&
    !hasExpectedOrigin(request.headers.get('origin'), request.nextUrl.origin)
  ) {
    return jsonError('Origen de solicitud no permitido.', 403);
  }

  const accessToken = await getAccessToken();
  if (!accessToken) return jsonError('Debes iniciar sesión.', 401);

  let input: z.infer<Exclude<TInput, undefined>> | undefined;
  if (options.inputSchema) {
    const body: unknown = await request.json().catch(() => null);
    const parsed = options.inputSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Los datos enviados no son válidos.', 400, { issues: parsed.error.issues });
    }
    input = parsed.data;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${env.API_BASE_URL}${API_PREFIX}${options.path}`, {
      method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
        'x-correlation-id': request.headers.get('x-correlation-id') ?? crypto.randomUUID(),
        ...(input === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      cache: 'no-store',
      signal: upstreamTimeoutSignal(),
    });
  } catch {
    return jsonError('No fue posible conectar con el servicio operativo.', 502);
  }

  const body: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    return jsonError(
      parsed.success ? parsed.data.error.message : 'La operación no pudo completarse.',
      status,
      parsed.success ? { correlationId: parsed.data.error.correlationId } : undefined,
    );
  }

  const parsed = options.outputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('La respuesta del servicio no coincide con el contrato esperado.', 502);
  }
  return securePrivateResponse(NextResponse.json(parsed.data));
}
