import { describe, expect, it } from 'vitest';

import { catalogGridColumnSchema } from './dynamic-catalog';
import {
  reportFormatSchema,
  workspaceColumnSchema,
  workspaceQuerySchema,
  workspaceSchema,
  workspaceSlugSchema,
} from './workspace';

describe('workspace contract', () => {
  it('keeps the twelve web workspaces in one validated list', () => {
    expect(workspaceSlugSchema.options).toHaveLength(12);
    expect(workspaceSlugSchema.options).toContain('equivalences');
    expect(workspaceSlugSchema.options).toContain('administration');
    expect(workspaceSlugSchema.options).toContain('catalogs');
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

  it('validates the seven report layouts and summary', () => {
    expect(reportFormatSchema.options).toEqual([
      'summary',
      'attribute_changes',
      'general_results',
      'period_results',
      'products_by_category',
      'edited_information',
      'documents_by_sku',
      'publication_by_sku',
    ]);
    expect(workspaceQuerySchema.parse({ report: 'general_results' })).toEqual({
      report: 'general_results',
    });
    expect(workspaceQuerySchema.safeParse({ report: 'invented' }).success).toBe(false);
  });

  it('validates inclusive calendar dates, bounded pagination and repeated custom field selectors', () => {
    expect(
      workspaceQuerySchema.parse({
        report: 'products_by_category',
        from: '2026-10-01',
        to: '2026-10-31',
        page: '2',
        pageSize: '1000',
        field: 'sku',
      }),
    ).toMatchObject({ page: 2, pageSize: 1000, field: ['sku'] });
    expect(workspaceQuerySchema.safeParse({ from: '2026-02-30' }).success).toBe(false);
    expect(workspaceQuerySchema.safeParse({ from: '2026-11-01', to: '2026-10-31' }).success).toBe(
      false,
    );
    expect(workspaceQuerySchema.safeParse({ pageSize: 1001 }).success).toBe(false);
    expect(workspaceQuerySchema.safeParse({ categoryId: 'not-a-uuid' }).success).toBe(false);
  });

  it('accepts report attribute selectors for a maximum length definition key and enforces 160 characters', () => {
    const definitionKey = 'a'.repeat(100);
    expect(catalogGridColumnSchema.shape.key.parse(definitionKey)).toBe(definitionKey);
    const reportKey = `attribute:${definitionKey}`;
    expect(reportKey).toHaveLength(110);
    expect(
      workspaceQuerySchema.parse({ report: 'products_by_category', field: [reportKey] }).field,
    ).toEqual([reportKey]);
    expect(
      workspaceColumnSchema.parse({ key: reportKey, label: 'Atributo', type: 'text' }).key,
    ).toBe(reportKey);
    for (const length of [160, 161]) {
      const key = 'a'.repeat(length);
      expect(workspaceColumnSchema.safeParse({ key, label: 'Atributo' }).success).toBe(
        length === 160,
      );
      expect(workspaceQuerySchema.safeParse({ field: [key] }).success).toBe(length === 160);
    }
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

  it('accepts a blocked catalog projection without invented records or write endpoints', () => {
    const parsed = workspaceSchema.parse({
      slug: 'catalogs',
      operationalStatus: 'blocked',
      generatedAt: '2026-10-20T12:00:00.000Z',
      metrics: [
        {
          key: 'persistence',
          label: 'Registro persistente',
          value: 'Pendiente de contrato',
          format: 'text',
        },
      ],
      columns: [],
      rows: [],
      totalRows: 0,
      notices: [
        {
          id: 'catalogs-blocked',
          severity: 'warning',
          title: 'Capacidad no operativa',
          message: 'No existe persistencia aprobada para catálogos PDF.',
        },
      ],
      actions: [
        {
          id: 'upload-catalog',
          label: 'Cargar catálogo PDF',
          availability: 'blocked',
          reason: 'Faltan permisos, límites y almacenamiento.',
        },
        {
          id: 'share-catalog',
          label: 'Compartir catálogo',
          availability: 'blocked',
          reason: 'Falta el contrato de enlaces públicos.',
        },
      ],
    });

    expect(parsed.rows).toEqual([]);
    expect(parsed.actions.every((action) => action.availability === 'blocked')).toBe(true);
  });
});
