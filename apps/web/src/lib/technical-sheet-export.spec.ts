import type { ProductAttributeSheetDto } from '@cdr/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeBulkTechnicalSheets, technicalSheetDocument } from './technical-sheet-export';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/bff-client', () => ({ authenticatedBffFetch: mocks.fetch }));
vi.mock('@/lib/catalog-home-api', () => ({
  catalogHomeSettings: vi.fn(async () => ({ config: { brands: [], categories: [] }, version: 0 })),
}));
beforeEach(() => mocks.fetch.mockReset());
const column = {
  id: '11111111-1111-4111-8111-111111111111',
  key: 'codigo_unificador',
  label: 'Código unificador',
  dataType: 'text' as const,
  unit: null,
  allowedValues: [],
  required: false,
  replicable: false,
  searchable: true,
  includeInTechnicalSheet: true,
  sourceAuthority: 'pim' as const,
  position: 0,
  permissions: { edit: false, import: false, export: false },
};
const sheet: ProductAttributeSheetDto = {
  schema: {
    category: { id: '11111111-1111-4111-8111-111111111111', slug: 'rod', name: 'Rodamientos' },
    template: {
      id: '22222222-2222-4222-8222-222222222222',
      variantKey: '22.1',
      name: 'Rodamiento',
      version: 1,
    },
    columns: [
      column,
      {
        ...column,
        key: 'diametro',
        label: 'Diámetro',
        unit: 'mm',
        dataType: 'measurement',
        position: 1,
        permissions: { edit: false, import: false, export: true },
      },
      { ...column, key: 'vacío', permissions: { edit: false, import: false, export: true } },
    ],
  },
  product: {
    id: '33333333-3333-4333-8333-333333333333',
    sku: '6205',
    name: 'Rodamiento',
    brand: null,
    status: 'draft',
    attributes: {
      codigo_unificador: {
        value: 'NO EXPORTAR',
        version: 1,
        source: 'manual',
        updatedAt: '2026-11-01T00:00:00Z',
      },
      diametro: { value: 25, version: 1, source: 'manual', updatedAt: '2026-11-01T00:00:00Z' },
      vacío: { value: '', version: 1, source: 'manual', updatedAt: '2026-11-01T00:00:00Z' },
    },
  },
};
describe('Technical sheet export authorization', () => {
  it('omits non-exportable and empty values, including the unifier summary field', () => {
    const output = technicalSheetDocument(sheet, 'metric');
    expect(output.attributes).toEqual([{ key: 'diametro', label: 'Diámetro', value: '25 mm' }]);
    expect(output.technicalDescription).toBe('Diámetro: 25 mm');
    expect(output.unifiedCode).toBeUndefined();
    expect(JSON.stringify(output)).not.toContain('NO EXPORTAR');
  });

  it('uses the canonical supplier code for the approved title and keeps the product name available', () => {
    const output = technicalSheetDocument(
      {
        ...sheet,
        product: {
          ...sheet.product,
          attributes: {
            ...sheet.product.attributes,
            codigo_proveedor: { ...sheet.product.attributes.diametro!, value: '6205-2RS1' },
            codigoProveedor: { ...sheet.product.attributes.diametro!, value: 'LEGACY-CODE' },
          },
        },
      },
      'metric',
    );
    expect(output.supplierCode).toBe('6205-2RS1');
    expect(output.friendlyName).toBe(sheet.product.name);
  });

  it('builds the technical summary only from exportable populated attributes and retains numeric zero', () => {
    const output = technicalSheetDocument(
      {
        ...sheet,
        schema: {
          ...sheet.schema,
          columns: [
            ...sheet.schema.columns,
            {
              ...column,
              key: 'internal',
              label: 'Dato interno',
              includeInTechnicalSheet: false,
              permissions: { edit: false, import: false, export: true },
            },
            {
              ...column,
              key: 'null',
              label: 'Sin valor',
              permissions: { edit: false, import: false, export: true },
            },
            {
              ...column,
              key: 'blank',
              label: 'Solo espacios',
              permissions: { edit: false, import: false, export: true },
            },
            {
              ...column,
              key: 'zero',
              label: 'Cero válido',
              dataType: 'number',
              position: 2,
              permissions: { edit: false, import: false, export: true },
            },
          ],
        },
        product: {
          ...sheet.product,
          attributes: {
            ...sheet.product.attributes,
            internal: { ...sheet.product.attributes.diametro!, value: 'CONFIDENTIAL' },
            null: { ...sheet.product.attributes.diametro!, value: null },
            blank: { ...sheet.product.attributes.diametro!, value: '   ' },
            zero: { ...sheet.product.attributes.diametro!, value: 0 },
          },
        },
      },
      'metric',
    );
    expect(output.technicalDescription).toContain('Diámetro: 25 mm');
    expect(output.technicalDescription).toContain('Cero válido: 0');
    expect(output.technicalDescription).not.toMatch(
      /CONFIDENTIAL|NO EXPORTAR|Dato interno|Sin valor|Solo espacios/u,
    );
    expect(output.attributes.map((attribute) => attribute.key)).toEqual(['diametro', 'zero']);
  });
});

describe('Bulk technical sheet authorization', () => {
  it('uses a fresh authenticated GET before permitting bulk generation', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ allowed: true }));
    const request = new AbortController();
    await authorizeBulkTechnicalSheets(request.signal);
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith('/api/catalog/technical-sheets/authorize', {
      cache: 'no-store',
      signal: request.signal,
    });
  });

  it('explains the role restriction when the server returns 403', async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 403 }));
    await expect(authorizeBulkTechnicalSheets()).rejects.toThrow(
      'Tu perfil no tiene habilitada la generación masiva de fichas técnicas PDF.',
    );
  });

  it.each([
    ['server unavailable', () => new Response(null, { status: 503 })],
    ['denied response', () => Response.json({ allowed: false })],
    ['missing permission', () => Response.json({})],
    ['invalid response', () => Response.json(null)],
  ])('rejects generation when permission is unconfirmed: %s', async (_name, response) => {
    mocks.fetch.mockResolvedValue(response());
    await expect(authorizeBulkTechnicalSheets()).rejects.toThrow(
      'No se pudo comprobar el permiso de fichas técnicas.',
    );
  });
});
