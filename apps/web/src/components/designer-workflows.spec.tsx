import type {
  AdminCatalogCategoryDto,
  AdminTemplateAttributeDto,
  AdminTemplateDto,
} from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoryTreePanel } from '@/components/category-tree-panel';
import { CategoriesAdminWorkspace } from '@/components/categories-admin-workspace';
import { TemplatesAdminWorkspace } from '@/components/templates-admin-workspace';
import { CatalogAdminApiError } from '@/lib/catalog-admin-api';
import type * as CatalogAdminApi from '@/lib/catalog-admin-api';

const api = vi.hoisted(() => ({
  listAdminCategories: vi.fn(),
  listAdminTemplates: vi.fn(),
  getAdminTemplate: vi.fn(),
  updateAdminTemplateAttribute: vi.fn(),
}));

vi.mock('@/lib/catalog-admin-api', async (importOriginal) => ({
  ...(await importOriginal<typeof CatalogAdminApi>()),
  ...api,
}));

const updatedAt = '2026-10-22T12:00:00.000Z';
const category: AdminCatalogCategoryDto = {
  id: '11111111-1111-4111-8111-111111111111',
  parentId: null,
  name: 'Rodamientos',
  slug: 'rodamientos',
  path: 'rodamientos',
  application: null,
  position: 0,
  active: true,
  sourcePriority: {},
  updatedAt,
};
const child: AdminCatalogCategoryDto = {
  ...category,
  id: '22222222-2222-4222-8222-222222222222',
  parentId: category.id,
  name: 'Rígidos',
  slug: 'rigidos',
  path: 'rodamientos/rigidos',
};
const attribute: AdminTemplateAttributeDto = {
  id: '33333333-3333-4333-8333-333333333333',
  key: 'diametro',
  label: 'Diámetro',
  dataType: 'measurement',
  unit: 'mm',
  allowedValues: [],
  required: true,
  replicable: false,
  searchable: true,
  includeInTechnicalSheet: true,
  sourceAuthority: 'pim',
  position: 0,
  active: true,
  updatedAt,
  roleAccess: [
    { role: 'VENTAS', canView: true, canEdit: false, canImport: false, canExport: true },
  ],
};
const template: AdminTemplateDto = {
  id: '44444444-4444-4444-8444-444444444444',
  categoryId: child.id,
  categoryName: child.name,
  variantKey: '22.1',
  name: 'Rodamiento rígido',
  version: 1,
  status: 'active',
  createdAt: updatedAt,
  updatedAt,
  attributes: [attribute],
};

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/templates');
  api.listAdminCategories.mockResolvedValue([category, child]);
  api.listAdminTemplates.mockResolvedValue([template]);
  api.getAdminTemplate.mockResolvedValue(template);
  api.updateAdminTemplateAttribute.mockResolvedValue({ ...attribute, replicable: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('flujos del diseño conectados al catálogo', () => {
  it('carga definiciones de plantilla solo al consultar una categoría final', async () => {
    api.listAdminTemplates.mockResolvedValue([{ ...template, attributes: undefined }]);
    render(<CategoriesAdminWorkspace />);
    const leaf = await screen.findByRole('button', { name: 'Seleccionar categoría Rígidos' });
    expect(api.getAdminTemplate).not.toHaveBeenCalled();
    fireEvent.click(leaf);
    await waitFor(() => expect(api.getAdminTemplate).toHaveBeenCalledWith(template.id));
    expect(api.getAdminTemplate).toHaveBeenCalledTimes(1);
  });

  it('muestra el árbol AX con columnas fijas y abre y oculta el detalle sin perder la selección', () => {
    render(
      <CategoryTreePanel
        rows={[
          { category: { ...category, skuCount: 4 }, depth: 0, leaf: false },
          { category: { ...child, skuCount: 4 }, depth: 1, leaf: true },
        ]}
        templatesForCategory={(id) => (id === child.id ? [template] : [])}
        searching={false}
        savingId={null}
        onEdit={vi.fn()}
        onSetActive={vi.fn()}
      />,
    );
    expect(screen.getByText('Categoría', { exact: true })).toBeVisible();
    expect(screen.getByText('Plantilla', { exact: true })).toBeVisible();
    expect(screen.getByText('SKU', { exact: true })).toBeVisible();
    expect(screen.getByLabelText('SKU en Rodamientos')).toHaveTextContent('4');
    expect(screen.queryByLabelText('Detalle de la categoría')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Contraer Rodamientos' }));
    expect(
      screen.queryByRole('button', { name: 'Seleccionar categoría Rígidos' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Rodamientos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar categoría Rígidos' }));
    expect(screen.getByRole('link', { name: template.name })).toHaveAttribute(
      'href',
      `/templates?template=${template.id}`,
    );
    expect(screen.getByRole('link', { name: 'Ver productos' })).toHaveAttribute(
      'href',
      `/products?category=${child.id}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar detalle' }));
    expect(screen.queryByLabelText('Detalle de la categoría')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Detalle' }));
    expect(screen.getByRole('link', { name: template.name })).toBeVisible();
  });

  it('guarda el interruptor con la versión vigente y refleja la respuesta persistida', async () => {
    render(<TemplatesAdminWorkspace canManageTemplate />);
    const toggle = await screen.findByRole('switch', { name: 'Replicable: Diámetro' });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(api.updateAdminTemplateAttribute).toHaveBeenCalledWith(template.id, attribute.id, {
        replicable: true,
        expectedUpdatedAt: updatedAt,
      }),
    );
    expect(
      await screen.findByRole('switch', { name: 'Replicable: Diámetro', checked: true }),
    ).toBeEnabled();
  });

  it('recarga un conflicto y mantiene los interruptores bloqueados para consulta', async () => {
    api.updateAdminTemplateAttribute.mockRejectedValue(new CatalogAdminApiError('Conflicto', 409));
    const view = render(<TemplatesAdminWorkspace canManageTemplate />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Activo: Diámetro' }));
    expect(await screen.findByText(/Otra persona modificó este atributo/)).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Activo: Diámetro' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    view.unmount();
    render(<TemplatesAdminWorkspace canManageTemplate={false} />);
    expect(await screen.findByRole('switch', { name: 'Activo: Diámetro' })).toBeDisabled();
  });

  it('abre la configuración en un drawer y restaura el foco al cerrarlo', async () => {
    render(<TemplatesAdminWorkspace canManageTemplate />);
    const configure = await screen.findByRole('button', { name: 'Configurar' });
    configure.focus();
    fireEvent.click(configure);
    expect(screen.getByRole('dialog', { name: 'Configurar atributo' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(configure).toHaveFocus();
  });

  it('conserva el borrador si se cancela el descarte de cambios sin guardar', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<TemplatesAdminWorkspace canManageTemplate />);
    fireEvent.click(await screen.findByRole('button', { name: 'Configurar' }));
    fireEvent.change(screen.getByLabelText('Posición'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog', { name: 'Configurar atributo' })).toBeVisible();
    expect(screen.getByLabelText('Posición')).toHaveValue(2);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.updateAdminTemplateAttribute).not.toHaveBeenCalled();
  });
});
