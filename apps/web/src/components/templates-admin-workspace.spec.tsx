import type { AdminTemplateAttributeDto, AdminTemplateDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAdminTemplate,
  listAdminCategories,
  listAdminTemplates,
  updateAdminTemplateAttribute,
} from '@/lib/catalog-admin-api';

import { TemplatesAdminWorkspace } from './templates-admin-workspace';

vi.mock('@/lib/catalog-admin-api', () => ({
  CatalogAdminApiError: class extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
  getAdminTemplate: vi.fn(),
  listAdminCategories: vi.fn(),
  listAdminTemplates: vi.fn(),
  updateAdminTemplateAttribute: vi.fn(),
}));

const diameter: AdminTemplateAttributeDto = {
  id: 'diameter',
  key: 'diametro',
  label: 'Diámetro interior',
  dataType: 'measurement',
  unit: 'mm',
  allowedValues: [],
  sourceAuthority: 'pim',
  required: true,
  replicable: true,
  searchable: true,
  includeInTechnicalSheet: true,
  active: true,
  position: 3,
  updatedAt: '2026-10-23T10:00:00Z',
  roleAccess: [
    { role: 'COMPRAS', canView: true, canEdit: true, canImport: true, canExport: true },
    { role: 'VENTAS', canView: false, canEdit: false, canImport: false, canExport: false },
  ],
};
const sku: AdminTemplateAttributeDto = {
  ...diameter,
  id: 'sku',
  key: 'codigo_articulo',
  label: 'Código artículo',
  dataType: 'text',
  sourceAuthority: 'erp',
  unit: null,
  replicable: false,
  position: 0,
};
const template: AdminTemplateDto = {
  id: 'template-14',
  categoryId: 'category',
  categoryName: 'Rodamientos',
  variantKey: '14',
  name: 'Rodamiento rígido de bolas',
  version: 1,
  status: 'active',
  createdAt: diameter.updatedAt,
  updatedAt: diameter.updatedAt,
  attributes: [sku, diameter],
  assetRequirements: [
    { type: 'FT', required: true },
    { type: 'FOTO', required: false },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/templates');
  vi.mocked(listAdminCategories).mockResolvedValue([
    {
      id: 'category',
      parentId: null,
      slug: 'rodamientos',
      name: 'Rodamientos',
      path: 'RODAMIENTOS',
      application: 'INDUSTRIAL',
      sourcePriority: { tecdoc: 4, manual: 3, archivo: 2, fabricante: 1 },
      position: 0,
      active: true,
      updatedAt: diameter.updatedAt,
    },
    {
      id: 'pending',
      parentId: null,
      slug: 'pendiente',
      name: 'Categoría sin plantilla',
      path: 'PENDIENTE',
      application: null,
      sourcePriority: {},
      position: 1,
      active: false,
      updatedAt: diameter.updatedAt,
    },
  ]);
  vi.mocked(listAdminTemplates).mockResolvedValue([{ ...template, attributes: undefined }]);
  vi.mocked(getAdminTemplate).mockResolvedValue(template);
  vi.mocked(updateAdminTemplateAttribute).mockResolvedValue({
    ...diameter,
    required: false,
    updatedAt: '2026-10-23T10:01:00Z',
  });
});
afterEach(cleanup);

describe('template reference layout', () => {
  it('shows the BUSQUEDA priorities, compact template summary and inheritance policy without simulating AX', async () => {
    render(<TemplatesAdminWorkspace canManageTemplate />);
    const table = await screen.findByRole('table', {
      name: 'Atributos y permisos de Rodamiento rígido de bolas',
    });
    const priorities = screen.getByRole('heading', { name: 'Prioridad de fuentes' }).parentElement!;
    expect(
      within(priorities)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['1Fabricante', '2Archivo', '3Manual', '4TecDoc']);
    expect(screen.getByRole('heading', { name: '¿Qué hereda un SKU nuevo?' })).toBeInTheDocument();
    expect(screen.getByText('Archivo / imagen', { selector: 'dt' })).toBeInTheDocument();
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual([
      'Orden',
      'Atributo',
      'Activo',
      'Tipo',
      'Unidad',
      'Fuente',
      'Obligatorio',
      'Replicable',
      'COMPRAS',
      'VENTAS',
      'Exportable',
      'Muestra',
      'Acción',
    ]);
    expect(screen.queryByRole('button', { name: /Simular llegada/ })).not.toBeInTheDocument();
    expect(getAdminTemplate).toHaveBeenCalledTimes(1);
  });

  it('filters real document policies and focuses the real replicable attributes', async () => {
    render(<TemplatesAdminWorkspace canManageTemplate />);
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Sección'), { target: { value: 'asset' } });
    expect(screen.getByText('Ficha técnica')).toBeVisible();
    expect(screen.getByText('Fotografía del producto')).toBeVisible();
    expect(screen.queryByText('Diámetro interior')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver atributos replicables' }));
    expect(screen.getByText('Diámetro interior')).toBeVisible();
    expect(screen.queryByText('Código artículo')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Replicable')).toHaveValue('true');
  });

  it('keeps undefined categories selectable without inventing a fallback template', async () => {
    render(<TemplatesAdminWorkspace canManageTemplate />);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: /Categoría sin plantilla/ }));
    expect(screen.getByRole('heading', { name: 'Categoría sin plantilla' })).toBeVisible();
    expect(screen.getByText('Pendiente de definición')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(getAdminTemplate).toHaveBeenCalledTimes(1);
  });

  it('saves an authorized switch with its concurrency token and keeps read-only controls disabled', async () => {
    const { unmount } = render(<TemplatesAdminWorkspace canManageTemplate />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Obligatorio: Diámetro interior' }));
    await waitFor(() =>
      expect(updateAdminTemplateAttribute).toHaveBeenCalledWith(template.id, diameter.id, {
        required: false,
        expectedUpdatedAt: diameter.updatedAt,
      }),
    );
    expect(screen.getByRole('switch', { name: 'Obligatorio: Diámetro interior' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    unmount();
    render(<TemplatesAdminWorkspace canManageTemplate={false} />);
    expect(
      await screen.findByRole('switch', { name: 'Obligatorio: Diámetro interior' }),
    ).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Configurar' })).not.toBeInTheDocument();
  });
});
