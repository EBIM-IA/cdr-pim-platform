import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAccessToken } = vi.hoisted(() => ({ getAccessToken: vi.fn() }));
vi.mock('@/lib/env', () => ({
  env: { API_BASE_URL: 'http://api.internal', PUBLIC_APP_ORIGIN: 'https://pim.example.test' },
}));
vi.mock('@/lib/server-auth', () => ({ getAccessToken }));

import { PATCH as assignTemplate } from './[id]/template/route';
import { PATCH as updateAttributes } from './[id]/attributes/route';
import { PATCH as updateAttribute } from './[id]/attributes/[attributeKey]/route';

const productId = '10000000-0000-4000-8000-000000000001';
const templateId = '10000000-0000-4000-8000-000000000002';
const previousTemplateId = '10000000-0000-4000-8000-000000000003';
const updatedAttribute = {
  productId,
  attributeKey: 'material',
  value: 'Acero templado',
  version: 5,
  source: 'manual',
  updatedAt: '2026-10-23T12:00:00.000Z',
  replicatedProductIds: [],
};
const routes = [
  {
    name: 'template assignment',
    path: '/template',
    patch: assignTemplate,
    input: { templateId, expectedTemplateId: previousTemplateId },
    output: {
      productId,
      category: {
        id: '10000000-0000-4000-8000-000000000004',
        slug: 'rodamientos',
        name: 'Rodamientos',
      },
      previousTemplateId,
      template: { id: templateId, variantKey: 'default', name: 'Rodamiento', version: 1 },
      assignedAt: '2026-10-23T12:00:00.000Z',
    },
  },
  {
    name: 'batch attribute update',
    path: '/attributes',
    patch: updateAttributes,
    input: { updates: [{ attributeKey: 'material', value: 'Acero templado', expectedVersion: 4 }] },
    output: { productId, attributes: [updatedAttribute] },
  },
  {
    name: 'single attribute update',
    path: '/attributes/material',
    patch: updateAttribute,
    input: { value: 'Acero templado', expectedVersion: 4 },
    output: updatedAttribute,
  },
];
const context = { params: Promise.resolve({ id: productId, attributeKey: 'material' }) };
const upstream = vi.fn();

function request(path: string, body: unknown, origin: string | null = 'https://pim.example.test') {
  return new NextRequest(`http://0.0.0.0:3000/api/catalog/dynamic/products/${productId}${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  getAccessToken.mockResolvedValue('server-session');
  vi.stubGlobal('fetch', upstream);
});
afterEach(() => vi.unstubAllGlobals());

describe.each(routes)('$name origin boundary', ({ path, patch, input, output }) => {
  it('accepts the configured public origin despite the internal ALB bind URL', async () => {
    upstream.mockResolvedValue(Response.json(output));
    const response = await patch(request(path, input), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(output);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://api.internal/api/v1/catalog/products/${productId}${path}`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual(input);
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer server-session');
    expect(init.cache).toBe('no-store');
    expect(response.headers.get('cache-control')).toContain('private, no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it.each([
    ['missing', null],
    ['internal bind', 'http://0.0.0.0:3000'],
    ['another site', 'https://attacker.example'],
    ['public host with the wrong scheme', 'http://pim.example.test'],
  ])(
    'rejects a %s origin before parsing the body, reading the session or fetching',
    async (_label, origin) => {
      const incoming = request(path, input, origin);
      const readBody = vi.spyOn(incoming, 'json');
      const response = await patch(incoming, context);

      expect(response.status).toBe(403);
      expect(response.headers.get('cache-control')).toContain('private, no-store');
      expect(readBody).not.toHaveBeenCalled();
      expect(getAccessToken).not.toHaveBeenCalled();
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it('still requires a server session after accepting the public origin', async () => {
    getAccessToken.mockResolvedValue(null);
    const response = await patch(request(path, input), context);
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('preserves payload and optimistic-version validation before forwarding', async () => {
    const response = await patch(request(path, {}), context);
    expect(response.status).toBe(400);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(upstream).not.toHaveBeenCalled();
  });
});
