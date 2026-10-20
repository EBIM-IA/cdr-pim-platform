import type { WorkspaceDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  QualitySecondaryWorkspace,
  coerceExtractedValue,
  type QualitySecondaryView,
} from './quality-secondary-workspace';

const mocks = vi.hoisted(() => ({
  extractAssetCandidates: vi.fn(),
  generateCommercialProposal: vi.fn(),
  fetchProducts: vi.fn(),
  fetchProductAttributeSheet: vi.fn(),
  patchProductAttributes: vi.fn(),
  listProductAssets: vi.fn(),
}));

vi.mock('@/lib/ai-api', () => ({
  extractAssetCandidates: mocks.extractAssetCandidates,
  generateCommercialProposal: mocks.generateCommercialProposal,
}));
vi.mock('@/lib/catalog-api', () => ({ fetchProducts: mocks.fetchProducts }));
vi.mock('@/lib/dynamic-catalog-api', () => ({
  fetchProductAttributeSheet: mocks.fetchProductAttributeSheet,
  patchProductAttributes: mocks.patchProductAttributes,
}));
vi.mock('@/lib/product-assets-api', () => ({
  listProductAssets: mocks.listProductAssets,
  productAssetDownloadUrl: (id: string) => `/assets/${id}`,
}));
vi.mock('@/lib/catalog-admin-api', () => ({
  listAdminCategories: vi.fn().mockResolvedValue([
    {
      id: '11111111-1111-4111-8111-111111111111',
      parentId: null,
      slug: 'pastillas-de-freno',
      name: 'Pastillas de freno',
      path: 'pastillas-de-freno',
      application: 'AUTOMOTRIZ',
      sourcePriority: { tecdoc: 1, fabricante: 2, archivo: 3, manual: 4 },
      position: 0,
      active: true,
      updatedAt: '2026-10-05T10:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      parentId: null,
      slug: 'kit-distribucion',
      name: 'Kit de distribución',
      path: 'kit-distribucion',
      application: null,
      sourcePriority: {},
      position: 1,
      active: false,
      updatedAt: '2026-10-05T10:00:00.000Z',
    },
  ]),
}));

const workspace: WorkspaceDto = {
  slug: 'quality',
  operationalStatus: 'partial',
  generatedAt: '2026-10-05T10:00:00.000Z',
  metrics: [],
  columns: [],
  rows: [],
  totalRows: 0,
  notices: [],
  actions: [
    {
      id: 'generate-commercial-proposal',
      label: 'Generar propuesta comercial',
      availability: 'supported',
      method: 'POST',
      endpoint: '/api/v1/ai/products/:productId/commercial-proposal',
    },
    {
      id: 'extract-asset-candidates',
      label: 'Extraer candidatos',
      availability: 'supported',
      method: 'POST',
      endpoint: '/api/v1/ai/assets/:assetId/extraction-candidates',
    },
    {
      id: 'persist-ai-candidate',
      label: 'Persistir candidato',
      availability: 'blocked',
      reason: 'La persistencia automática permanece deshabilitada.',
    },
  ],
};

const product = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  sku: '6202-2RS',
  name: 'Rodamiento rígido de bolas',
  description: 'Rodamiento con descripción técnica aprobada.',
  brand: 'FAG',
  category: 'Rodamientos',
  application: 'AUTOMOTRIZ',
  status: 'in_review' as const,
  completeness: 80,
  attributes: [],
};

const numberColumn = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  key: 'diametro',
  label: 'Diámetro',
  dataType: 'measurement' as const,
  unit: 'mm',
  allowedValues: [],
  required: false,
  replicable: false,
  searchable: true,
  includeInTechnicalSheet: true,
  sourceAuthority: 'pim' as const,
  position: 0,
  permissions: { edit: true, import: true, export: true },
};

const sheet = {
  schema: {
    category: {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      slug: 'rodamientos',
      name: 'Rodamientos',
    },
    template: {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      name: 'Rodamiento',
      version: 1,
    },
    columns: [
      numberColumn,
      {
        ...numberColumn,
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        key: 'solo_erp',
        label: 'Solo ERP',
        sourceAuthority: 'erp' as const,
        permissions: { edit: false, import: false, export: true },
      },
    ],
  },
  product: {
    id: product.id,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    status: product.status,
    attributes: {
      diametro: {
        value: 20,
        version: 4,
        source: 'manual' as const,
        updatedAt: '2026-10-07T12:00:00.000Z',
      },
    },
  },
};

const asset = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  productId: product.id,
  sku: product.sku,
  kind: 'document' as const,
  type: 'FT' as const,
  filename: 'ficha-tecnica.pdf',
  mimeType: 'application/pdf',
  size: 1_024,
  checksum: 'checksum',
  position: null,
  source: 'manual' as const,
  uploadedBy: 'admin',
  uploadedAt: '2026-10-07T12:00:00.000Z',
  replacesAssetId: null,
};

const expectedHeading: Record<QualitySecondaryView, string> = {
  extraction: 'Atributos sugeridos',
  commercial: 'Comparación técnica y comercial',
  duplicates: 'Alertas para revisión humana',
  review: 'Solicitudes',
  sources: 'Prioridad de fuentes por categoría',
  conflict: 'Candidatos por fuente',
};

describe('QualitySecondaryWorkspace', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchProducts.mockResolvedValue({
      items: [product],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
    mocks.fetchProductAttributeSheet.mockResolvedValue(sheet);
    mocks.listProductAssets.mockResolvedValue([asset]);
    mocks.patchProductAttributes.mockResolvedValue({ productId: product.id, attributes: [] });
    mocks.generateCommercialProposal.mockResolvedValue({
      productId: product.id,
      sku: product.sku,
      channel: 'b2c',
      model: 'gpt-6-luna',
      proposal: 'Propuesta comercial verificable.',
      usage: { inputTokens: 120, outputTokens: 24 },
      persisted: false,
      requiresHumanReview: true,
    });
    mocks.extractAssetCandidates.mockResolvedValue({
      assetId: asset.id,
      productId: product.id,
      sku: product.sku,
      filename: asset.filename,
      model: 'gpt-6-luna',
      candidates: [{ key: 'diametro', value: '25,5', confidence: 0.91 }],
      persisted: false,
      requiresHumanReview: true,
    });
  });

  it.each(Object.entries(expectedHeading) as [QualitySecondaryView, string][])(
    'renders the approved %s hierarchy without invented records',
    (view, heading) => {
      const { unmount } = render(<QualitySecondaryWorkspace view={view} workspace={workspace} />);
      expect(screen.getByText(heading)).toBeInTheDocument();
      if (view === 'sources') {
        expect(
          screen.getByText('Consultando prioridades persistidas por categoría…'),
        ).toBeInTheDocument();
      }
      expect(screen.queryByText('DUP-127')).not.toBeInTheDocument();
      expect(screen.queryByText('REV-224')).not.toBeInTheDocument();
      unmount();
    },
  );

  it('keeps automatic merges at zero as an explicit invariant', () => {
    render(<QualitySecondaryWorkspace view="duplicates" workspace={workspace} />);
    expect(screen.getByText('Fusiones automáticas')).toBeInTheDocument();
    expect(screen.getByText('El PIM nunca fusiona SKU')).toBeInTheDocument();
  });

  it('shows source priorities from persisted category metadata and keeps gaps explicit', async () => {
    render(<QualitySecondaryWorkspace view="sources" workspace={workspace} />);
    expect(await screen.findByText('1 configuradas · 1 pendientes')).toBeInTheDocument();
    expect(screen.getByText('Pastillas de freno')).toBeInTheDocument();
    expect(screen.getByText('Kit de distribución')).toBeInTheDocument();
    expect(screen.getByText('Configuración persistida')).toBeInTheDocument();
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0);
  });

  it('generates and copies an explicitly unpersisted commercial proposal for a real product', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<QualitySecondaryWorkspace view="commercial" workspace={workspace} />);

    fireEvent.change(await screen.findByLabelText('Producto real del catálogo'), {
      target: { value: product.id },
    });
    fireEvent.change(screen.getByLabelText('Canal'), { target: { value: 'b2b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar propuesta' }));

    expect(await screen.findByText('Propuesta comercial verificable.')).toBeInTheDocument();
    expect(screen.getByText('gpt-6-luna')).toBeInTheDocument();
    expect(screen.getByText('120 tokens')).toBeInTheDocument();
    expect(screen.getByText('No persistida')).toBeInTheDocument();
    expect(screen.getByText('Revisión humana')).toBeInTheDocument();
    expect(mocks.generateCommercialProposal).toHaveBeenCalledWith(
      product.id,
      { channel: 'b2b', maxOutputTokens: 320 },
      expect.any(AbortSignal),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Propuesta comercial verificable.'));
  });

  it('extracts only visible editable keys and atomically applies a human-selected candidate', async () => {
    render(<QualitySecondaryWorkspace view="extraction" workspace={workspace} />);

    fireEvent.change(await screen.findByLabelText('Producto real del catálogo'), {
      target: { value: product.id },
    });
    expect(await screen.findByText('ficha-tecnica.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Extraer candidatos' }));

    expect(await screen.findByText('Confianza 91%')).toBeInTheDocument();
    expect(mocks.extractAssetCandidates).toHaveBeenCalledWith(
      asset.id,
      { expectedAttributes: ['diametro'] },
      expect.any(AbortSignal),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar seleccionados' }));

    await waitFor(() =>
      expect(mocks.patchProductAttributes).toHaveBeenCalledWith(
        product.id,
        { updates: [{ attributeKey: 'diametro', value: 25.5, expectedVersion: 4 }] },
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByText(/1 atributo fue aplicado mediante una confirmación humana y atómica/),
    ).toBeInTheDocument();
  });

  it('aborts an in-flight commercial generation from the visible cancel control', async () => {
    mocks.generateCommercialProposal.mockImplementation(
      (_productId: string, _input: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted', 'AbortError')),
          );
        }),
    );
    render(<QualitySecondaryWorkspace view="commercial" workspace={workspace} />);
    fireEvent.change(await screen.findByLabelText('Producto real del catálogo'), {
      target: { value: product.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generar propuesta' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Generando propuesta…');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByText('Generando propuesta…')).not.toBeInTheDocument());
  });

  it('coerces extraction values conservatively by catalog data type', () => {
    expect(coerceExtractedValue(numberColumn, '25,5')).toEqual({ ok: true, value: 25.5 });
    expect(coerceExtractedValue(numberColumn, '25 mm')).toEqual({
      ok: false,
      message: 'Diámetro requiere un número sin texto ni unidad adicional.',
    });
    expect(
      coerceExtractedValue({ ...numberColumn, dataType: 'boolean', label: 'Sellado' }, 'sí'),
    ).toEqual({ ok: true, value: true });
    expect(
      coerceExtractedValue({ ...numberColumn, dataType: 'date', label: 'Fecha' }, '2026-02-30'),
    ).toEqual({ ok: false, message: 'Fecha requiere una fecha válida.' });
  });
});
