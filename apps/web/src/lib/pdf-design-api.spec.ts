import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultPdfDesignConfig } from '@cdr/contracts';
import { authenticatedBffFetch } from './bff-client';
import { fetchPdfDesignSettings, savePdfDesignSettings } from './pdf-design-api';
vi.mock('./bff-client', () => ({ authenticatedBffFetch: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
describe('PDF design API', () => {
  it('reads settings without caching and sends exact optimistic concurrency on save', async () => {
    const settings = {
      config: createDefaultPdfDesignConfig(),
      updatedAt: '2026-11-20T10:00:00.000Z',
    };
    vi.mocked(authenticatedBffFetch).mockImplementation(
      async () => new Response(JSON.stringify(settings), { status: 200 }),
    );
    await expect(fetchPdfDesignSettings()).resolves.toEqual(settings);
    await expect(savePdfDesignSettings(settings)).resolves.toEqual(settings);
    expect(authenticatedBffFetch).toHaveBeenLastCalledWith(
      '/api/catalog/admin/pdf-design',
      expect.objectContaining({ method: 'PUT', cache: 'no-store', body: JSON.stringify(settings) }),
    );
  });
  it('surfaces stale-version errors and rejects malformed server configuration', async () => {
    vi.mocked(authenticatedBffFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Cambió en otra sesión' }), { status: 409 }),
    );
    await expect(fetchPdfDesignSettings()).rejects.toThrow('Cambió en otra sesión');
    vi.mocked(authenticatedBffFetch).mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await expect(fetchPdfDesignSettings()).rejects.toThrow();
  });
});
