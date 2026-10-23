import 'server-only';

import { API_PREFIX } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import type { ZodType, ZodTypeAny } from 'zod';

import { clientAddressFromForwardedFor, hasExpectedOrigin } from '@/lib/auth';
import { env } from '@/lib/env';
import { securePrivateResponse, upstreamTimeoutSignal } from '@/lib/http-security';

const MAX_PUBLIC_BODY_BYTES = 4 * 1024;
const CATALOG_TIMEOUT_MS = 60_000;

function failure(message: string, status: number): NextResponse {
  return securePrivateResponse(NextResponse.json({ message }, { status }));
}

async function readPublicInput(request: NextRequest): Promise<unknown> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/u.test(declared) || Number(declared) > MAX_PUBLIC_BODY_BYTES)) {
    throw new RangeError('Request body exceeds its limit');
  }
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_PUBLIC_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError('Request body exceeds its limit');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } finally {
    reader.releaseLock();
  }
}

/** Only these two public POST operations may forward an anonymous share credential. */
export async function proxyPublicCatalog(
  request: NextRequest,
  options: {
    readonly operation: 'resolve' | 'file';
    readonly inputSchema: ZodType<{ token: string }>;
    readonly outputSchema?: ZodTypeAny;
    readonly maxFileBytes: number;
  },
): Promise<NextResponse> {
  if (!hasExpectedOrigin(request.headers.get('origin'), env.PUBLIC_APP_ORIGIN)) {
    return failure('Origen de solicitud no permitido.', 403);
  }
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json') {
    return failure('La solicitud debe usar application/json.', 415);
  }
  let body: unknown;
  try {
    body = await readPublicInput(request);
  } catch (cause) {
    return failure(
      'La solicitud del enlace no es válida.',
      cause instanceof RangeError ? 413 : 400,
    );
  }
  const parsed = options.inputSchema.safeParse(body);
  if (!parsed.success) return failure('El enlace compartido no es válido.', 400);

  const headers: Record<string, string> = {
    accept: options.operation === 'file' ? 'application/pdf' : 'application/json',
    'content-type': 'application/json',
    'x-correlation-id': crypto.randomUUID(),
  };
  const address = clientAddressFromForwardedFor(request.headers.get('x-forwarded-for'));
  if (address) headers['x-forwarded-for'] = address;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${env.API_BASE_URL}${API_PREFIX}/product-catalogs/shared/${options.operation}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ token: parsed.data.token }),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: upstreamTimeoutSignal(CATALOG_TIMEOUT_MS),
      },
    );
  } catch {
    return failure('No fue posible conectar con el servicio de catálogos.', 502);
  }
  if (!upstream.ok) {
    const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    const response = failure(
      status === 429
        ? 'Hay demasiadas solicitudes. Espera un momento y vuelve a intentarlo.'
        : status >= 500
          ? 'El servicio de catálogos no está disponible. Inténtalo nuevamente.'
          : 'El enlace no está disponible o ha vencido.',
      status,
    );
    const retryAfter = upstream.headers.get('retry-after');
    if (status === 429 && retryAfter && /^\d+$/u.test(retryAfter)) {
      response.headers.set('Retry-After', retryAfter);
    }
    return response;
  }
  if (options.operation === 'resolve') {
    const responseBody: unknown = await upstream.json().catch(() => null);
    const result = options.outputSchema?.safeParse(responseBody);
    if (!result?.success) return failure('La respuesta del catálogo no es válida.', 502);
    return securePrivateResponse(NextResponse.json(result.data));
  }

  const contentType = upstream.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/pdf' || !upstream.body) {
    return failure('El archivo del catálogo no tiene el formato PDF esperado.', 502);
  }
  const contentLength = upstream.headers.get('content-length');
  if (
    contentLength &&
    (!/^\d+$/u.test(contentLength) || Number(contentLength) > options.maxFileBytes)
  ) {
    await upstream.body.cancel();
    return failure('El archivo del catálogo supera el tamaño permitido.', 502);
  }
  const reader = upstream.body.getReader();
  let received = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          controller.close();
          return;
        }
        received += chunk.value.byteLength;
        if (received > options.maxFileBytes) {
          await reader.cancel();
          controller.error(new Error('El PDF supera el tamaño permitido.'));
          return;
        }
        controller.enqueue(chunk.value);
      } catch {
        controller.error(new Error('No fue posible completar la descarga del PDF.'));
      }
    },
    cancel: () => reader.cancel(),
  });
  return securePrivateResponse(
    new NextResponse(stream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          upstream.headers.get('content-disposition') ?? 'attachment; filename="catalogo.pdf"',
        'X-Content-Type-Options': 'nosniff',
        ...(contentLength ? { 'Content-Length': contentLength } : {}),
      },
    }),
  );
}
