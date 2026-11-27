import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { NarvizImageSourceAdapter } from './narviz-image-source.adapter';

const BASE_URL = 'https://store.example.test/pim-bridge/v1';
const TOKEN = 'test-token';
const SKU = 'Mixed-00577+A /?#ñ';
const CONTENT = new Uint8Array([0xff, 0xd8, 0xff, 0x01]);
const IMAGE = {
  assetId: 'a_abc123',
  position: 1,
  cover: true,
  filename: 'sample.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: CONTENT.length,
  checksumSha256: createHash('sha256').update(CONTENT).digest('hex'),
  downloadPath: '/pim-bridge/v1/images/a_abc123/download',
};

function client(transport = vi.fn<typeof fetch>()) {
  return {
    transport,
    adapter: new NarvizImageSourceAdapter({ baseUrl: BASE_URL, token: TOKEN, fetch: transport }),
  };
}

function imageResponse(
  headers?: Record<string, string>,
  content: ConstructorParameters<typeof Response>[0] = CONTENT,
): Response {
  return new Response(content, {
    headers: {
      'Content-Type': IMAGE.mimeType,
      'Content-Length': String(IMAGE.sizeBytes),
      'X-Checksum-Sha256': IMAGE.checksumSha256,
      ...headers,
    },
  });
}

describe('NarvizImageSourceAdapter', () => {
  afterEach(() => vi.useRealTimers());

  it('encodes the complete case-sensitive SKU and preserves gallery order and cover', async () => {
    const { adapter, transport } = client();
    transport.mockResolvedValueOnce(
      Response.json({
        sku: SKU,
        images: [
          { ...IMAGE, position: 2, cover: true },
          { ...IMAGE, position: 1, cover: false },
        ],
        generatedAt: '2026-11-26T02:06:22Z',
      }),
    );
    const gallery = await adapter.lookup(SKU);
    expect(gallery.images.map(({ position, cover }) => ({ position, cover }))).toEqual([
      { position: 1, cover: false },
      { position: 2, cover: true },
    ]);
    const [url, init] = transport.mock.calls[0] ?? [];
    expect(url).toBeInstanceOf(URL);
    expect(new URL(String(url)).searchParams.get('sku')).toBe(SKU);
    expect(new URL(String(url)).searchParams.get('mode')).toBe('resolved');
    expect(init).toMatchObject({
      headers: { Authorization: `Bearer ${TOKEN}` },
      redirect: 'manual',
    });

    transport.mockResolvedValueOnce(Response.json({ sku: '00577', images: [] }));
    await expect(adapter.lookup('00577', 'own')).resolves.toEqual({ sku: '00577', images: [] });
    expect(new URL(String(transport.mock.calls[1]?.[0])).searchParams.get('mode')).toBe('own');
  });

  it('preserves repeated SKU and per-item batch errors without passing through vendor messages', async () => {
    const { adapter, transport } = client();
    const skus = ['00577', 'unknown', '00577'];
    const diagnostic = {
      code: 'PRODUCT_NOT_FOUND',
      correlationId: 'safe-id',
      timestamp: '2026-11-26T02:06:33Z',
    };
    transport.mockResolvedValueOnce(
      Response.json({
        items: [
          { index: 0, sku: '00577', data: { images: [IMAGE] } },
          { index: 1, sku: 'unknown', status: 404, error: { ...diagnostic, message: TOKEN } },
          { index: 2, sku: '00577', data: { sku: '00577', images: [] } },
        ],
      }),
    );
    await expect(adapter.lookupBatch(skus, 'own')).resolves.toEqual([
      { index: 0, sku: '00577', data: { sku: '00577', images: [IMAGE] } },
      {
        index: 1,
        sku: 'unknown',
        status: 404,
        error: { ...diagnostic, message: 'El servicio de imágenes no reconoce el SKU.' },
      },
      { index: 2, sku: '00577', data: { sku: '00577', images: [] } },
    ]);
    expect(String(transport.mock.calls[0]?.[0])).toBe(`${BASE_URL}/images/batch`);
    expect(transport.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ skus, mode: 'own' }),
    });

    await expect(adapter.lookupBatch(Array<string>(101).fill('00577'))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(adapter.lookupBatch([])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('rejects a batch response addressed to a different SKU', async () => {
    const { adapter, transport } = client();
    transport.mockResolvedValueOnce(
      Response.json({
        items: [
          { index: 0, sku: 'second', data: { images: [IMAGE] } },
          { index: 1, sku: 'first', data: { images: [IMAGE] } },
        ],
      }),
    );
    await expect(adapter.lookupBatch(['first', 'second'])).rejects.toMatchObject({
      upstreamCode: 'INVALID_RESPONSE',
    });
  });

  it('downloads authenticated binary data from the exact metadata path', async () => {
    const { adapter, transport } = client();
    transport.mockResolvedValueOnce(imageResponse());
    await expect(adapter.download(IMAGE)).resolves.toEqual(CONTENT);
    expect(String(transport.mock.calls[0]?.[0])).toBe(`${BASE_URL}/images/a_abc123/download`);
    expect(transport.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'image/jpeg',
        'Accept-Encoding': 'identity',
      },
      redirect: 'manual',
    });
  });

  it('rejects a different download path or a file above 30 MB before requesting it', async () => {
    const { adapter, transport } = client();
    await expect(
      adapter.download({ ...IMAGE, downloadPath: '/pim-bridge/v1/images/a_different/download' }),
    ).rejects.toMatchObject({ upstreamCode: 'INVALID_DOWNLOAD' });
    await expect(adapter.download({ ...IMAGE, sizeBytes: 30_000_001 })).rejects.toMatchObject({
      upstreamCode: 'INVALID_DOWNLOAD',
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it('does not follow redirects or retry an authorization failure', async () => {
    const { adapter, transport } = client();
    transport.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { Location: '/other' } }),
    );
    transport.mockResolvedValueOnce(
      Response.json(
        { error: { code: 'FORBIDDEN', correlationId: 'safe-id', message: TOKEN } },
        { status: 403 },
      ),
    );
    await expect(adapter.download(IMAGE)).rejects.toMatchObject({ status: 302 });
    await expect(adapter.health()).rejects.toMatchObject({
      status: 403,
      upstreamCode: 'FORBIDDEN',
      correlationId: 'safe-id',
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['MIME header', () => imageResponse({ 'Content-Type': 'image/png' })],
    ['length header', () => imageResponse({ 'Content-Length': '1' })],
    ['length of a truncated body', () => imageResponse({}, CONTENT.subarray(0, 1))],
    ['length of an oversized body', () => imageResponse({}, new Uint8Array(5))],
    ['checksum header', () => imageResponse({ 'X-Checksum-Sha256': '0'.repeat(64) })],
    ['checksum of the body', () => imageResponse({}, new Uint8Array(CONTENT.length))],
  ] as const)('rejects a mismatched %s', async (_label, response) => {
    const { adapter, transport } = client();
    transport.mockResolvedValueOnce(response());
    await expect(adapter.download(IMAGE)).rejects.toMatchObject({
      upstreamCode: 'INVALID_DOWNLOAD',
    });
  });

  it('keeps simultaneous downloads at two until their binaries are available', async () => {
    const { adapter, transport } = client();
    const pending: ReadableStreamDefaultController<Uint8Array>[] = [];
    transport.mockImplementation(async () =>
      imageResponse(
        {},
        new ReadableStream({
          start(controller) {
            pending.push(controller);
          },
        }),
      ),
    );
    const downloads = [adapter.download(IMAGE), adapter.download(IMAGE), adapter.download(IMAGE)];
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    finishDownload(pending[0]);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(3));
    finishDownload(pending[1]);
    finishDownload(pending[2]);
    await expect(Promise.all(downloads)).resolves.toEqual([CONTENT, CONTENT, CONTENT]);
  });

  it('shares the weighted per-minute allowance across batch, download, and health', async () => {
    const { adapter, transport } = client();
    const now = new Date('2026-11-26T02:06:22Z');
    vi.setSystemTime(now);
    const skus = Array<string>(100).fill('00577');
    transport.mockResolvedValueOnce(
      Response.json({ items: skus.map((sku, index) => ({ index, sku, data: { images: [] } })) }),
    );
    transport.mockResolvedValueOnce(imageResponse());
    transport.mockImplementation(async () => new Response(null, { status: 200 }));
    await adapter.lookupBatch(skus);
    await adapter.download(IMAGE);
    await Promise.all(Array.from({ length: 19 }, () => adapter.health()));
    await expect(adapter.health()).rejects.toMatchObject({ status: 429, retryAfterSeconds: 60 });
    expect(transport).toHaveBeenCalledTimes(21);
    vi.setSystemTime(new Date(now.getTime() + 60_000));
    await expect(adapter.health()).resolves.toBeUndefined();
  });

  it('aborts the transport at the overall deadline without issuing a retry', async () => {
    const { adapter, transport } = client();
    const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms) => originalTimeout(ms === 15_000 ? 20 : ms));
    transport.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('abort')), { once: true });
        }),
    );
    try {
      await expect(adapter.lookup('00577')).rejects.toMatchObject({ upstreamCode: 'TIMEOUT' });
      expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(timeout.mock.calls).toEqual([[15_000], [10_000]]);
    } finally {
      timeout.mockRestore();
    }
  });

  it('retries a 503 and a short 429 and shares a longer Retry-After cooldown', async () => {
    const { adapter, transport } = client();
    transport
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(adapter.health()).resolves.toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(3);

    const now = new Date(Math.ceil(Date.now() / 1000) * 1000);
    vi.setSystemTime(now);
    const retryAt = new Date(now.getTime() + 15_000);
    transport.mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { 'Retry-After': retryAt.toUTCString() } }),
    );
    await expect(adapter.health()).rejects.toMatchObject({ status: 429, retryAfterSeconds: 15 });
    await expect(adapter.lookup('00577')).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 15,
    });
    expect(transport).toHaveBeenCalledTimes(4);
    vi.setSystemTime(retryAt);
    transport.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(adapter.health()).resolves.toBeUndefined();
  });
});

function finishDownload(controller?: ReadableStreamDefaultController<Uint8Array>): void {
  if (!controller) throw new Error('Expected a pending image download');
  controller.enqueue(CONTENT);
  controller.close();
}
