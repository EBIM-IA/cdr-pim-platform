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
  readonly timeoutMs?: number;
}

interface PrivateApiDownloadOptions {
  readonly path: string;
  readonly request: NextRequest;
  readonly accept: string;
  readonly allowedContentTypes?: readonly string[];
  readonly timeoutMs?: number;
}

interface PrivateApiMultipartOptions<TOutput extends ZodTypeAny> {
  readonly path: string;
  readonly request: NextRequest;
  readonly outputSchema: TOutput;
  readonly maxBytes: number;
  readonly timeoutMs?: number;
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
      signal: upstreamTimeoutSignal(options.timeoutMs),
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

/** Proxies a bounded multipart upload while retaining the browser-controlled boundary. */
export async function proxyPrivateMultipart<TOutput extends ZodTypeAny>(
  options: PrivateApiMultipartOptions<TOutput>,
): Promise<NextResponse> {
  if (!hasExpectedOrigin(options.request.headers.get('origin'), options.request.nextUrl.origin)) {
    return jsonError('Origen de solicitud no permitido.', 403);
  }
  const accessToken = await getAccessToken();
  if (!accessToken) return jsonError('Debes iniciar sesión.', 401);

  const contentType = options.request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    return jsonError('La solicitud debe usar multipart/form-data.', 415);
  }
  const declaredLength = Number(options.request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
    return jsonError('El archivo supera el límite permitido.', 413);
  }

  const body = await options.request.arrayBuffer().catch(() => null);
  if (!body) return jsonError('No fue posible leer el archivo enviado.', 400);
  if (body.byteLength > options.maxBytes) {
    return jsonError('El archivo supera el límite permitido.', 413);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${env.API_BASE_URL}${API_PREFIX}${options.path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
        'content-type': contentType,
        'x-correlation-id': options.request.headers.get('x-correlation-id') ?? crypto.randomUUID(),
      },
      body,
      cache: 'no-store',
      signal: upstreamTimeoutSignal(options.timeoutMs),
    });
  } catch {
    return jsonError('No fue posible conectar con el servicio operativo.', 502);
  }

  const responseBody: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const parsedError = apiErrorSchema.safeParse(responseBody);
    const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    return jsonError(
      parsedError.success ? parsedError.data.error.message : 'La carga no pudo completarse.',
      status,
      parsedError.success ? { correlationId: parsedError.data.error.correlationId } : undefined,
    );
  }
  const parsed = options.outputSchema.safeParse(responseBody);
  if (!parsed.success) {
    return jsonError('La respuesta del servicio no coincide con el contrato esperado.', 502);
  }
  return securePrivateResponse(NextResponse.json(parsed.data, { status: upstream.status }));
}

/** Streams an authenticated export without exposing the upstream bearer token to the browser. */
export async function proxyPrivateDownload(
  options: PrivateApiDownloadOptions,
): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) return jsonError('Debes iniciar sesión.', 401);

  let upstream: Response;
  try {
    upstream = await fetch(`${env.API_BASE_URL}${API_PREFIX}${options.path}`, {
      method: 'GET',
      headers: {
        accept: options.accept,
        authorization: `Bearer ${accessToken}`,
        'x-correlation-id': options.request.headers.get('x-correlation-id') ?? crypto.randomUUID(),
      },
      cache: 'no-store',
      signal: upstreamTimeoutSignal(options.timeoutMs),
    });
  } catch {
    return jsonError('No fue posible conectar con el servicio operativo.', 502);
  }

  if (!upstream.ok) {
    const body: unknown = await upstream.json().catch(() => null);
    const parsed = apiErrorSchema.safeParse(body);
    const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    return jsonError(
      parsed.success ? parsed.data.error.message : 'La exportación no pudo completarse.',
      status,
      parsed.success ? { correlationId: parsed.data.error.correlationId } : undefined,
    );
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  const normalizedContentType = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const allowed = options.allowedContentTypes?.map((value) => value.toLowerCase());
  if (
    allowed
      ? !allowed.includes(normalizedContentType)
      : !contentType.toLowerCase().startsWith(options.accept.toLowerCase())
  ) {
    return jsonError('La exportación respondió con un formato inesperado.', 502);
  }

  const response = new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition':
        upstream.headers.get('content-disposition') ?? 'attachment; filename="exportacion.csv"',
      'X-Content-Type-Options': 'nosniff',
      ...(upstream.headers.get('content-length')
        ? { 'Content-Length': upstream.headers.get('content-length') as string }
        : {}),
    },
  });
  return securePrivateResponse(response);
}
