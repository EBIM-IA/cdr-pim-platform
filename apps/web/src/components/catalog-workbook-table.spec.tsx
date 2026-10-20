import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogWorkbookTable, parseWorkbookDraft } from '@/components/catalog-workbook-table';

const mocks = vi.hoisted(() => ({
  fetchWorkbook: vi.fn(),
  patchAttribute: vi.fn(),
  downloadCsv: vi.fn(),
  downloadXlsx: vi.fn(),
}));

vi.mock('@/lib/dynamic-catalog-api', () => ({
  DynamicCatalogApiError: class DynamicCatalogApiError extends Error {
    constructor(
      message: string,
      readonly status?: number,
    ) {
      super(message);
    }
  },
  fetchCatalogWorkbook: mocks.fetchWorkbook,
  patchProductAttribute: mocks.patchAttribute,
}));

vi.mock('@/lib/tabular-export', () => ({
  downloadCsv: mocks.downloadCsv,
  downloadXlsx: mocks.downloadXlsx,
}));

const templateId = '22222222-2222-4222-8222-222222222222';
const categoryId = '33333333-3333-4333-8333-333333333333';
const productOne = '44444444-4444-4444-8444-444444444444';
const productTwo = '55555555-5555-4555-8555-555555555555';
const updatedAt = '2026-10-05T10:00:00.000Z';
const descriptionColumn = {
  id: '11111111-1111-4111-8111-111111111111',
  key: 'descripcion_tecnica',
  label: 'Descripción técnica',
  dataType: 'text' as const,
  unit: null,
  allowedValues: [],
  required: false,
  replicable: true,
  searchable: true,
  includeInTechnicalSheet: true,
  sourceAuthority: 'pim' as const,
  position: 0,
  permissions: { edit: true, import: true, export: true },
  applicableTemplateIds: [templateId],
};

const workbook = {
  columns: [descriptionColumn],
  facets: {
    brands: ['FAG', 'Mobil'],
    applicationTypes: ['INDUSTRIAL'],
    statuses: ['draft', 'in_review'],
  },
  items: [
    {
      id: productOne,
      sku: 'SKU-1',
      name: 'Rodamiento uno',
      description: null,
      brand: 'FAG',
      status: 'in_review',
      updatedAt,
      category: { id: categoryId, name: 'Rodamientos' },
      template: { id: templateId, name: 'Rodamientos', version: 1 },
      providerCode: 'PROV-1',
      unifiedCode: 'UNI-1',
      applicationTypes: ['INDUSTRIAL'],
      completeness: 80,
      attributes: {
        descripcion_tecnica: {
          applicable: true as const,
          value: 'C3',
          version: 2,
          source: 'manual' as const,
          updatedAt,
          required: false,
          permissions: { edit: true, export: true },
        },
      },
    },
    {
      id: productTwo,
      sku: 'SKU-2',
      name: 'Aceite dos',
      description: null,
      brand: 'Mobil',
      status: 'draft',
      updatedAt,
      category: { id: categoryId, name: 'Lubricantes' },
      template: {
        id: '66666666-6666-4666-8666-666666666666',
        name: 'Lubricantes',
        version: 1,
      },
      providerCode: null,
      unifiedCode: 'UNI-2',
      applicationTypes: [],
      completeness: 100,
      attributes: { descripcion_tecnica: { applicable: false as const } },
    },
  ],
  page: 1,
  pageSize: 25,
  total: 2,
};

afterEach(cleanup);

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.fetchWorkbook.mockResolvedValue(workbook);
  mocks.patchAttribute.mockResolvedValue({
    productId: productOne,
    attributeKey: 'descripcion_tecnica',
    value: null,
    version: 3,
    source: 'manual',
    updatedAt,
    replicatedProductIds: [productTwo],
  });
});

describe('CatalogWorkbookTable', () => {
  it('renders the dynamic union, marks non-applicable cells and exports displayed columns', async () => {
    const onFacetsChange = vi.fn();
    render(
      <CatalogWorkbookTable
        canEdit
        q="C3"
        applicationType="INDUSTRIAL"
        completeness="attention"
        onFacetsChange={onFacetsChange}
      />,
    );

    expect(await screen.findByRole('link', { name: 'SKU-1' })).toBeVisible();
    expect(screen.getByLabelText('Descripción técnica: no aplica')).toHaveTextContent('No aplica');
    expect(mocks.fetchWorkbook).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'C3',
        applicationType: 'INDUSTRIAL',
        completeness: 'attention',
        page: 1,
        pageSize: 25,
      }),
      expect.any(AbortSignal),
    );
    expect(onFacetsChange).toHaveBeenCalledWith(workbook.facets);

    fireEvent.click(screen.getByRole('button', { name: /CSV · 2 filas$/u }));
    await waitFor(() => {
      expect(mocks.downloadCsv).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.arrayContaining(['SKU', 'Descripción técnica']),
          rows: expect.arrayContaining([expect.arrayContaining(['SKU-2', '(No aplica)'])]),
        }),
        'catalogo-pim-vista-filtrada',
      );
    });
  });

  it('uses optimistic concurrency, treats a blank as no-op and a dash as clear', async () => {
    render(<CatalogWorkbookTable canEdit />);
    const edit = await screen.findByRole('button', {
      name: 'Editar Descripción técnica de SKU-1',
    });
    fireEvent.click(edit);
    let input = screen.getByRole('textbox', {
      name: 'Editar Descripción técnica de SKU-1',
    });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mocks.patchAttribute).not.toHaveBeenCalled();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Descripción técnica de SKU-1' }),
    );
    input = screen.getByRole('textbox', { name: 'Editar Descripción técnica de SKU-1' });
    fireEvent.change(input, { target: { value: '-' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(mocks.patchAttribute).toHaveBeenCalledWith(productOne, 'descripcion_tecnica', {
        value: null,
        expectedVersion: 2,
      }),
    );
    expect(await screen.findByText(/replicado a 1 SKU/u)).toBeVisible();
  });
});

describe('parseWorkbookDraft', () => {
  it('parses typed values without turning blank cells into destructive clears', () => {
    expect(parseWorkbookDraft(descriptionColumn, '')).toEqual({ kind: 'noop' });
    expect(parseWorkbookDraft(descriptionColumn, '-')).toEqual({ kind: 'value', value: null });
    expect(parseWorkbookDraft({ ...descriptionColumn, dataType: 'measurement' }, '25,4')).toEqual({
      kind: 'value',
      value: 25.4,
    });
    expect(parseWorkbookDraft({ ...descriptionColumn, dataType: 'boolean' }, 'sí')).toEqual({
      kind: 'value',
      value: true,
    });
  });
});
