import type {
  CatalogWorkbookResultDto,
  ProductExperienceDto,
  ProductNameSettingsDto,
} from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';
import {
  fetchProductNameSettings,
  previewProductName,
  saveProductNameSettings,
} from '@/lib/product-experience-api';

import { ProductNameSettings } from './product-name-settings';

vi.mock('@/lib/dynamic-catalog-api', () => ({ fetchCatalogWorkbook: vi.fn() }));
vi.mock('@/lib/product-experience-api', () => ({
  fetchProductNameSettings: vi.fn(),
  previewProductName: vi.fn(),
  saveProductNameSettings: vi.fn(),
}));

const productId = '11111111-1111-4111-8111-111111111111';
const secondProductId = '22222222-2222-4222-8222-222222222222';
const applicationId = '33333333-3333-4333-8333-333333333333';
const settings: ProductNameSettingsDto = {
  version: 4,
  config: {
    enabled: true,
    mixedMode: 'applications',
    maxApplications: 2,
    moreApplications: true,
    automotive: [
      { field: 'category:name', before: '', after: '', format: 'auto' },
      { field: 'erp:marca', before: 'Marca ', after: '', format: 'title' },
      { field: 'application:model', before: 'Para ', after: '', format: 'original' },
    ],
    industrial: [
      { field: 'erp:codigo_articulo', before: '', after: '', format: 'original' },
      { field: 'category:name', before: '', after: '', format: 'auto' },
    ],
  },
};
const workbook: CatalogWorkbookResultDto = {
  columns: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      key: 'diametro',
      label: 'Diámetro',
      dataType: 'measurement',
      unit: 'mm',
      allowedValues: [],
      required: false,
      replicable: true,
      searchable: true,
      includeInTechnicalSheet: true,
      sourceAuthority: 'pim',
      position: 1,
      permissions: { edit: true, import: true, export: true },
      applicableTemplateIds: ['55555555-5555-4555-8555-555555555555'],
    },
  ],
  facets: {
    brands: ['SKF', 'FAG'],
    applicationTypes: ['INDUSTRIAL', 'AUTOMOTRIZ'],
    statuses: ['published'],
  },
  items: [
    {
      id: productId,
      sku: '6205-2RS1',
      name: 'Rodamiento 6205-2RS1',
      brand: 'SKF',
      description: null,
      status: 'published',
      updatedAt: '2026-10-28T12:00:00.000Z',
      category: null,
      template: null,
      providerCode: '6205-2RS1',
      unifiedCode: '6205',
      applicationTypes: ['AUTOMOTRIZ', 'INDUSTRIAL'],
      completeness: null,
      attributes: {},
    },
    {
      id: secondProductId,
      sku: '22207',
      name: 'Rodamiento 22207',
      brand: 'FAG',
      description: null,
      status: 'published',
      updatedAt: '2026-10-28T12:00:00.000Z',
      category: null,
      template: null,
      providerCode: '22207-E1',
      unifiedCode: '22207',
      applicationTypes: ['INDUSTRIAL'],
      completeness: null,
      attributes: {},
    },
  ],
  page: 1,
  pageSize: 20,
  total: 2,
};
const experience: ProductExperienceDto = {
  nombreGeneral: 'Rodamiento de bolas rígido Marca Skf Para Corolla',
  fields: [
    { field: 'category:name', label: 'Categoría', group: 'Categoría' },
    { field: 'erp:codigo_articulo', label: 'Código de artículo', group: 'Datos base ERP' },
    { field: 'erp:marca', label: 'Marca', group: 'Datos base ERP' },
    { field: 'application:model', label: 'Modelo', group: 'Aplicación' },
  ],
  variants: [
    {
      productId,
      codigoArticulo: '6205-2RS1',
      nombreAmigable: 'Rodamiento Skf para Toyota Corolla 2014–2018',
      tipo: 'automotriz',
      marca: 'SKF',
      codigoProveedor: '6205-2RS1',
      codigoUnificador: '6205',
      aplicacion: {
        id: applicationId,
        marcaVehiculo: 'Toyota',
        modelo: 'Corolla',
        tipo: 'SEDAN',
        combustible: 'GASOLINA',
        traccion: '4X2',
        cilindraje: '1.8L',
        anioDesde: 2014,
        anioHasta: 2018,
        area: 'MOTOR',
        subarea: 'ALTERNADOR',
        motor: '1.8',
      },
      ficha: `/products/${productId}?aplicacion=${applicationId}`,
    },
    {
      productId,
      codigoArticulo: '6205-2RS1',
      nombreAmigable: '6205-2RS1 Rodamiento industrial Skf',
      tipo: 'industrial',
      marca: 'SKF',
      codigoProveedor: '6205-2RS1',
      codigoUnificador: '6205',
      aplicacion: null,
      ficha: `/products/${productId}?uso=industrial`,
    },
  ],
};

afterEach(cleanup);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchProductNameSettings).mockResolvedValue(settings);
  vi.mocked(fetchCatalogWorkbook).mockResolvedValue(workbook);
  vi.mocked(previewProductName).mockResolvedValue(experience);
  vi.mocked(saveProductNameSettings).mockImplementation(async (input) => ({
    ...input,
    version: input.version + 1,
  }));
});

describe('ProductNameSettings', () => {
  it('previews real catalog samples, sales variants and the complete commerce JSON', async () => {
    render(<ProductNameSettings />);
    expect(await screen.findByText(experience.nombreGeneral)).toBeInTheDocument();
    expect(fetchCatalogWorkbook).toHaveBeenCalledWith(
      { q: undefined, page: 1, pageSize: 20, filter: [] },
      expect.any(AbortSignal),
    );
    expect(previewProductName).toHaveBeenCalledWith(
      productId,
      settings.config,
      expect.any(AbortSignal),
    );
    for (const variant of experience.variants) {
      expect(screen.getByText(variant.nombreAmigable)).toBeInTheDocument();
    }
    const contract = screen
      .getByText('Contrato de consumo para e-commerce (JSON)')
      .closest('details')!;
    expect(contract).not.toHaveAttribute('open');
    fireEvent.click(within(contract).getByText('Contrato de consumo para e-commerce (JSON)'));
    expect(JSON.parse(contract.querySelector('pre')!.textContent!)).toEqual(experience.variants);
    expect(contract.querySelector('pre')).toBeVisible();

    const automotive = screen.getByLabelText('Fórmula Automotriz');
    const industrial = screen.getByLabelText('Fórmula Industrial');
    expect(
      within(automotive).getByRole('combobox', { name: 'Campo 1 de Automotriz' }),
    ).toContainHTML('Diámetro');
    expect(within(industrial).queryByRole('option', { name: 'Modelo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar fórmulas' })).toBeDisabled();
  });

  it('edits affixes and format, reorders fields and saves with the current version', async () => {
    render(<ProductNameSettings />);
    await screen.findByText(experience.nombreGeneral);
    fireEvent.change(screen.getByRole('combobox', { name: 'Campo 1 de Automotriz' }), {
      target: { value: 'attribute:diametro' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Antes del campo 1 de Automotriz' }), {
      target: { value: 'Diámetro: ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Después del campo 1 de Automotriz' }), {
      target: { value: ' mm' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Formato del campo 1 de Automotriz' }), {
      target: { value: 'upper' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Bajar campo 1 de Automotriz' }));
    expect(screen.getByRole('combobox', { name: 'Campo 1 de Automotriz' })).toHaveValue(
      'erp:marca',
    );
    expect(screen.getByRole('textbox', { name: 'Antes del campo 2 de Automotriz' })).toHaveValue(
      'Diámetro: ',
    );
    expect(screen.getByRole('textbox', { name: 'Después del campo 2 de Automotriz' })).toHaveValue(
      ' mm',
    );
    const expectedConfig = {
      ...settings.config,
      automotive: [
        settings.config.automotive[1]!,
        {
          field: 'attribute:diametro',
          before: 'Diámetro: ',
          after: ' mm',
          format: 'upper' as const,
        },
        settings.config.automotive[2]!,
      ],
    };
    fireEvent.click(screen.getByRole('button', { name: 'Guardar fórmulas' }));
    await waitFor(() =>
      expect(saveProductNameSettings).toHaveBeenCalledWith({ config: expectedConfig, version: 4 }),
    );
    expect(await screen.findByText(/Fórmulas guardadas\./u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar fórmulas' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descartar cambios' })).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Después del campo 2 de Automotriz' }), {
      target: { value: ' milímetros' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.getByRole('textbox', { name: 'Después del campo 2 de Automotriz' })).toHaveValue(
      ' mm',
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Antes del campo 1 de Industrial' }), {
      target: { value: 'Código ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar fórmulas' }));
    await waitFor(() =>
      expect(saveProductNameSettings).toHaveBeenLastCalledWith({
        config: {
          ...expectedConfig,
          industrial: [
            { ...settings.config.industrial[0]!, before: 'Código ' },
            settings.config.industrial[1]!,
          ],
        },
        version: 5,
      }),
    );
  });

  it('retains the formula draft and saved version when a concurrent save is rejected', async () => {
    vi.mocked(saveProductNameSettings).mockRejectedValue(
      new Error('La configuración cambió. Recarga antes de guardar.'),
    );
    render(<ProductNameSettings />);
    await screen.findByRole('heading', { name: 'Nombre amigable del producto' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Antes del campo 2 de Automotriz' }), {
      target: { value: 'Fabricante ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar fórmulas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La configuración cambió. Recarga antes de guardar.',
    );
    expect(screen.getByRole('textbox', { name: 'Antes del campo 2 de Automotriz' })).toHaveValue(
      'Fabricante ',
    );
    expect(screen.getByRole('button', { name: 'Guardar fórmulas' })).toBeEnabled();
    expect(saveProductNameSettings).toHaveBeenCalledWith({
      config: {
        ...settings.config,
        automotive: settings.config.automotive.map((token, index) =>
          index === 1 ? { ...token, before: 'Fabricante ' } : token,
        ),
      },
      version: 4,
    });
    expect(fetchProductNameSettings).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.getByRole('textbox', { name: 'Antes del campo 2 de Automotriz' })).toHaveValue(
      'Marca ',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('previews the selected sample with the current draft and searches SKU through the catalog API', async () => {
    render(<ProductNameSettings />);
    await screen.findByText(experience.nombreGeneral);
    fireEvent.change(screen.getByLabelText('SKU de muestra'), {
      target: { value: secondProductId },
    });
    fireEvent.change(screen.getByLabelText('Aplicaciones en el nombre general'), {
      target: { value: '3' },
    });
    await waitFor(() =>
      expect(previewProductName).toHaveBeenLastCalledWith(
        secondProductId,
        { ...settings.config, maxApplications: 3 },
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByLabelText('Buscar SKU de muestra'), {
      target: { value: 'FAG 22207' },
    });
    await waitFor(() =>
      expect(fetchCatalogWorkbook).toHaveBeenLastCalledWith(
        { q: 'FAG 22207', page: 1, pageSize: 20, filter: [] },
        expect.any(AbortSignal),
      ),
    );
    expect(saveProductNameSettings).not.toHaveBeenCalled();
  });
});
