import { describe, expect, it } from 'vitest';

import { workspaceSchema, workspaceSlugSchema } from './workspace';

describe('workspace contract', () => {
  it('keeps the eleven web workspaces in one validated list', () => {
    expect(workspaceSlugSchema.options).toHaveLength(11);
    expect(workspaceSlugSchema.options).toContain('equivalences');
    expect(workspaceSlugSchema.options).toContain('administration');
    expect(workspaceSlugSchema.safeParse('products').success).toBe(false);
  });

  it('accepts an honest operational projection', () => {
    const parsed = workspaceSchema.parse({
      slug: 'reports',
      operationalStatus: 'operational',
      generatedAt: '2026-10-01T12:00:00.000Z',
      metrics: [{ key: 'products', label: 'Productos', value: 7, format: 'integer' }],
      columns: [
        { key: 'status', label: 'Estado', type: 'status' },
        { key: 'products', label: 'Productos', type: 'number' },
      ],
      rows: [{ id: 'draft', values: { status: 'draft', products: 3 } }],
      totalRows: 1,
      notices: [],
      actions: [
        {
          id: 'refresh',
          label: 'Actualizar',
          availability: 'supported',
          method: 'GET',
          endpoint: '/api/v1/workspaces/reports',
        },
      ],
    });

    expect(parsed.slug).toBe('reports');
    expect(parsed.rows[0]?.values.products).toBe(3);
  });

  it('requires a reason for blocked actions and an API endpoint for supported ones', () => {
    const base = {
      slug: 'templates',
      operationalStatus: 'blocked',
      generatedAt: '2026-10-01T12:00:00.000Z',
      metrics: [],
      columns: [],
      rows: [],
      totalRows: 0,
      notices: [],
    };

    expect(
      workspaceSchema.safeParse({
        ...base,
        actions: [{ id: 'create', label: 'Crear', availability: 'blocked' }],
      }).success,
    ).toBe(false);
    expect(
      workspaceSchema.safeParse({
        ...base,
        actions: [
          {
            id: 'refresh',
            label: 'Actualizar',
            availability: 'supported',
            method: 'GET',
            endpoint: '/templates',
          },
        ],
      }).success,
    ).toBe(false);
  });
});
