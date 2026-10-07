import { afterEach, describe, expect, it, vi } from 'vitest';

import { listCodeAffixes, parseCode, validateCodeAffix } from './code-affix-api';

const dto = {
  id: 'a127ee1f-d635-436c-8666-daa0dd1efa79',
  kind: 'suffix',
  token: 'C3',
  meaning: 'Juego radial mayor al normal',
  attribute: 'Juego radial',
  impliedValue: 'C3',
  brand: null,
  family: 'Rodamientos',
  source: 'manufacturer',
  confidence: 1,
  status: 'validated',
  evidence: 'Catálogo FAG',
  boreRule: 'none',
  priority: 10,
  active: true,
  createdBy: 'admin',
  validatedBy: 'admin',
  validatedAt: '2026-10-07T12:00:00.000Z',
  createdAt: '2026-10-07T11:00:00.000Z',
  updatedAt: '2026-10-07T12:00:00.000Z',
} as const;

afterEach(() => vi.unstubAllGlobals());

describe('code-affix API client', () => {
  it('serializes filters through its independent BFF route', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([dto]), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await listCodeAffixes({ includeInactive: false, kind: 'suffix', q: 'C3' });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      '/api/operations/code-affixes?includeInactive=false&q=C3&kind=suffix',
    );
  });

  it('sends validation and parser operations to explicit endpoints', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(dto), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: '6205', normalizedCode: '6205', segments: [] }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    await validateCodeAffix(dto.id, {
      decision: 'validated',
      expectedUpdatedAt: dto.updatedAt,
    });
    await parseCode({ code: '6205' });
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      `/api/operations/code-affixes/${dto.id}/validation`,
      '/api/operations/code-affixes/parse',
    ]);
  });
});
