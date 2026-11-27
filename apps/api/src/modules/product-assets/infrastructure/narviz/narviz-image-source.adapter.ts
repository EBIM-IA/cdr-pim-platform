import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { ECOMMERCE_IMAGE_LOOKUP_LIMIT, ECOMMERCE_PHOTO_MAX_BYTES } from '@cdr/contracts';
import { ValidationError } from '@cdr/shared';
import { z } from 'zod';

import {
  type EcommerceImage,
  type EcommerceImageBatchItem,
  type EcommerceImageLookup,
  type EcommerceImageMode,
  type EcommerceImageSourcePort,
  EcommerceImageSourceError,
} from '../../domain/ports/ecommerce-image-source.port';
import { InMemoryNarvizRequestBudget, type NarvizRequestBudget } from './narviz-request-budget';

const MAX_ATTEMPTS = 3;
const MAX_INLINE_RETRY_DELAY_MS = 5_000;
const ATTEMPT_TIMEOUT_MS = 10_000;
const OPERATION_TIMEOUT_MS = 15_000;
const ASSET_ID_PATTERN = /^[\w-]+$/;
const SHA256_PATTERN = /^[a-f\d]{64}$/i;
const IMAGE_MIME_PATTERN = /^image\/[a-z\d.+-]+$/i;

const imageSchema = z.object({
  assetId: z.string().max(180).regex(ASSET_ID_PATTERN),
  position: z.number().int().nonnegative(),
  cover: z.boolean(),
  filename: z.string().min(1).max(260),
  mimeType: z
    .string()
    .max(120)
    .regex(IMAGE_MIME_PATTERN)
    .transform((mime) => mime.toLowerCase()),
  sizeBytes: z.number().int().positive(),
  checksumSha256: z
    .string()
    .regex(SHA256_PATTERN)
    .transform((hash) => hash.toLowerCase()),
  width: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((size) => size ?? undefined),
  height: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((size) => size ?? undefined),
  downloadPath: z.string().min(1),
});

const lookupSchema = z.object({
  sku: z.string().optional(),
  images: z.array(imageSchema),
  generatedAt: z.iso.datetime({ offset: true }).optional(),
});

const issueSchema = z.object({
  code: z
    .string()
    .regex(/^[A-Z0-9_]{1,80}$/)
    .optional()
    .catch(undefined),
  correlationId: z
    .string()
    .regex(/^[A-Za-z0-9._:-]{1,128}$/)
    .optional()
    .catch(undefined),
  timestamp: z.iso.datetime({ offset: true }).optional().catch(undefined),
});

const batchItemSchema = z.object({
  index: z.number().int().nonnegative(),
  sku: z.string(),
  data: lookupSchema.optional(),
  status: z.number().int().min(200).max(599).optional(),
  error: issueSchema.optional(),
});

const batchSchema = z.object({ items: z.array(batchItemSchema) });

type ProviderIssue = z.infer<typeof issueSchema>;

interface NarvizRequest<T> {
  readonly url: URL;
  readonly units: number;
  readonly init?: {
    readonly method?: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
  };
  readonly read: (response: Response) => Promise<T>;
  readonly download?: boolean;
}

export class NarvizImageSourceAdapter implements EcommerceImageSourcePort {
  private readonly baseUrl: URL;
  private readonly token: string;
  private readonly fetch: typeof fetch;
  private readonly budget: NarvizRequestBudget;

  constructor(options: {
    readonly baseUrl: string;
    readonly token: string;
    readonly fetch?: typeof fetch;
    readonly budget?: NarvizRequestBudget;
  }) {
    const baseUrl = URL.parse(options.baseUrl);
    if (
      !baseUrl ||
      baseUrl.protocol !== 'https:' ||
      baseUrl.pathname !== '/pim-bridge/v1' ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.search ||
      baseUrl.hash ||
      !/^[A-Za-z0-9._~+/-]+=*$/.test(options.token)
    ) {
      throw new EcommerceImageSourceError({ upstreamCode: 'INVALID_CONFIGURATION' });
    }
    this.baseUrl = baseUrl;
    this.token = options.token;
    this.fetch = options.fetch ?? fetch;
    this.budget = options.budget ?? new InMemoryNarvizRequestBudget();
  }

  async lookup(sku: string, mode: EcommerceImageMode = 'resolved'): Promise<EcommerceImageLookup> {
    validateMode(mode);
    validateSku(sku);
    const url = this.endpoint('/images');
    url.searchParams.set('sku', sku);
    url.searchParams.set('mode', mode);
    return this.request({
      url,
      units: 1,
      read: async (response) => {
        const data = await readJson(response, lookupSchema);
        if (data.sku !== sku) throw invalidResponse();
        return gallery(data, sku);
      },
    });
  }

  async lookupBatch(
    skus: readonly string[],
    mode: EcommerceImageMode = 'resolved',
  ): Promise<readonly EcommerceImageBatchItem[]> {
    validateMode(mode);
    if (skus.length === 0 || skus.length > ECOMMERCE_IMAGE_LOOKUP_LIMIT) {
      throw new ValidationError('El lote debe contener entre 1 y 100 SKU.');
    }
    skus.forEach(validateSku);

    return this.request({
      url: this.endpoint('/images/batch'),
      units: skus.length,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus, mode }),
      },
      read: async (response) => {
        const { items } = await readJson(response, batchSchema);
        if (items.length !== skus.length) throw invalidResponse();
        return items.map((item, index): EcommerceImageBatchItem => {
          const { sku, status } = item;
          if (item.index !== index || sku !== skus[index]) throw invalidResponse();
          if (item.data && !item.error && (status === undefined || status < 300)) {
            if (item.data.sku !== undefined && item.data.sku !== sku) throw invalidResponse();
            return { index, sku, data: gallery(item.data, sku) };
          }
          if (item.error && !item.data && status !== undefined && status >= 400) {
            return { index, sku, status, error: this.safeIssue(status, item.error) };
          }
          throw invalidResponse();
        });
      },
    });
  }

  async download(image: EcommerceImage): Promise<Uint8Array> {
    if (
      !ASSET_ID_PATTERN.test(image.assetId) ||
      !SHA256_PATTERN.test(image.checksumSha256) ||
      !IMAGE_MIME_PATTERN.test(image.mimeType) ||
      !Number.isSafeInteger(image.sizeBytes) ||
      image.sizeBytes <= 0 ||
      image.sizeBytes > ECOMMERCE_PHOTO_MAX_BYTES
    ) {
      throw invalidDownload();
    }
    const url = this.endpoint(`/images/${image.assetId}/download`);
    if (image.downloadPath !== url.pathname) throw invalidDownload();

    return this.request({
      url,
      units: 1,
      init: { headers: { Accept: image.mimeType, 'Accept-Encoding': 'identity' } },
      read: (response) => readImage(response, image),
      download: true,
    });
  }

  async health(): Promise<void> {
    return this.request({ url: this.endpoint('/health'), units: 1, read: discardBody });
  }

  private endpoint(path: string): URL {
    return new URL(`${this.baseUrl.pathname}${path}`, this.baseUrl.origin);
  }

  private request<T>(request: NarvizRequest<T>): Promise<T> {
    const deadline = performance.now() + OPERATION_TIMEOUT_MS;
    const signal = AbortSignal.timeout(OPERATION_TIMEOUT_MS);
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(operationTimeout());
      const run = () => this.requestAttempts(request, deadline, signal);
      signal.addEventListener('abort', onAbort, { once: true });
      const pending = request.download ? this.budget.withDownload(run) : run();
      void pending
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', onAbort));
    });
  }

  private async requestAttempts<T>(
    { url, units, init, read }: NarvizRequest<T>,
    deadline: number,
    signal: AbortSignal,
  ): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      if (signal.aborted || performance.now() >= deadline) throw operationTimeout();
      await this.budget.reserve(units);
      const remaining = Math.ceil(deadline - performance.now());
      if (signal.aborted || remaining <= 0) throw operationTimeout();

      const backoff = 250 * 2 ** (attempt - 1);
      const attemptSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining)),
      ]);
      let response: Response;
      try {
        response = await this.fetch(url, {
          ...init,
          headers: {
            Accept: 'application/json',
            ...init?.headers,
            Authorization: `Bearer ${this.token}`,
          },
          redirect: 'manual',
          signal: attemptSignal,
        });
        if (response.ok) return await read(response);
      } catch (error) {
        if (signal.aborted) throw operationTimeout();
        if (error instanceof EcommerceImageSourceError && !attemptSignal.aborted) throw error;
        if (attempt >= MAX_ATTEMPTS || backoff >= deadline - performance.now()) {
          throw new EcommerceImageSourceError({ upstreamCode: 'NETWORK_FAILURE' });
        }
        await sleep(backoff, undefined, { signal }).catch(() => {
          throw operationTimeout();
        });
        continue;
      }

      const retryable = response.status === 429 || response.status === 503;
      const delay = retryable ? retryAfterMs(response.headers.get('retry-after'), backoff) : 0;
      if (response.status === 429) await this.budget.pause(delay);

      if (
        !retryable ||
        attempt >= MAX_ATTEMPTS ||
        delay > MAX_INLINE_RETRY_DELAY_MS ||
        delay >= deadline - performance.now()
      ) {
        const issue = this.safeIssue(response.status, await readIssue(response));
        throw new EcommerceImageSourceError({
          status: response.status,
          upstreamCode: issue.code,
          ...(issue.correlationId ? { correlationId: issue.correlationId } : {}),
          ...(retryable ? { retryAfterSeconds: Math.ceil(delay / 1000) } : {}),
        });
      }
      await discardBody(response);
      await sleep(delay, undefined, { signal }).catch(() => {
        throw operationTimeout();
      });
    }
  }

  private safeIssue(status: number, provider?: ProviderIssue) {
    // Vendor messages are free-form. Keep only support identifiers and use fixed public text.
    const code = this.safeDiagnostic(provider?.code) ?? `UPSTREAM_HTTP_${status}`;
    const correlationId = this.safeDiagnostic(provider?.correlationId);
    const timestamp = this.safeDiagnostic(provider?.timestamp);
    return {
      code,
      message: issueMessage(status),
      ...(correlationId ? { correlationId } : {}),
      ...(timestamp ? { timestamp } : {}),
    };
  }

  private safeDiagnostic(value?: string): string | undefined {
    return value && !value.includes(this.token) ? value : undefined;
  }
}

function gallery(data: z.infer<typeof lookupSchema>, sku: string): EcommerceImageLookup {
  return {
    ...data,
    sku,
    images: data.images.sort((left, right) => left.position - right.position),
  };
}

function validateSku(sku: string): void {
  if (!sku.trim()) throw new ValidationError('Indique un SKU completo.');
}

function validateMode(mode: EcommerceImageMode): void {
  if (mode !== 'resolved' && mode !== 'own') {
    throw new ValidationError('El modo de imágenes debe ser resolved u own.');
  }
}

async function readJson<S extends z.ZodType>(response: Response, schema: S): Promise<z.infer<S>> {
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
}

async function readIssue(response: Response): Promise<ProviderIssue | undefined> {
  const body: unknown = await response.json().catch(() => undefined);
  const envelope = z.object({ error: issueSchema }).safeParse(body);
  if (envelope.success) return envelope.data.error;
  const parsed = issueSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
}

async function discardBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

async function readImage(response: Response, image: EcommerceImage): Promise<Uint8Array> {
  const mime = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  const length = response.headers.get('content-length');
  const announcedHash = response.headers.get('x-checksum-sha256')?.trim().toLowerCase();
  const checksum = image.checksumSha256.toLowerCase();
  if (
    response.status !== 200 ||
    !response.body ||
    mime !== image.mimeType.toLowerCase() ||
    !length ||
    !/^\d+$/.test(length) ||
    Number(length) !== image.sizeBytes ||
    (announcedHash !== undefined && announcedHash !== checksum)
  ) {
    await discardBody(response);
    throw invalidDownload();
  }

  const content = new Uint8Array(image.sizeBytes);
  const hash = createHash('sha256');
  const reader = response.body.getReader();
  let offset = 0;
  let complete = false;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        complete = true;
        break;
      }
      if (chunk.value.byteLength > content.byteLength - offset) throw invalidDownload();
      content.set(chunk.value, offset);
      hash.update(chunk.value);
      offset += chunk.value.byteLength;
    }
  } catch {
    throw invalidDownload();
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  if (offset !== image.sizeBytes || hash.digest('hex') !== checksum) throw invalidDownload();
  return content;
}

function retryAfterMs(value: string | null, fallback: number): number {
  if (!value) return fallback;
  if (/^\d+$/.test(value)) {
    const milliseconds = Number(value) * 1000;
    return Number.isSafeInteger(milliseconds) &&
      Number.isFinite(new Date(Date.now() + milliseconds).getTime())
      ? milliseconds
      : fallback;
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? fallback : Math.max(0, date - Date.now());
}

function issueMessage(status: number): string {
  if (status === 404) return 'El servicio de imágenes no reconoce el SKU.';
  if (status === 409) return 'El SKU es ambiguo en el servicio de imágenes.';
  if (status === 429) return 'El servicio de imágenes alcanzó su límite de consultas.';
  return 'El servicio de imágenes no pudo procesar esta referencia.';
}

function invalidResponse(): EcommerceImageSourceError {
  return new EcommerceImageSourceError({ upstreamCode: 'INVALID_RESPONSE' });
}

function invalidDownload(): EcommerceImageSourceError {
  return new EcommerceImageSourceError({ upstreamCode: 'INVALID_DOWNLOAD' });
}

function operationTimeout(): EcommerceImageSourceError {
  return new EcommerceImageSourceError({ upstreamCode: 'TIMEOUT' });
}
