import type { AdminCatalogCategoryDto, AdminTemplateDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAdminCategory,
  configureAdminCategoryTemplate,
  addAdminTemplateAttribute,
  previewAdminTemplateInheritance,
} from '@/lib/catalog-admin-api';
import { CatalogDesignDrawer } from './catalog-design-drawer';
import { AddTemplateAttributeDrawer, TemplateInheritanceSimulator } from './template-design-tools';
vi.mock('@/lib/catalog-admin-api', () => ({
  createAdminCategory: vi.fn(),
  moveAdminCategory: vi.fn(),
  configureAdminCategoryTemplate: vi.fn(),
  addAdminTemplateAttribute: vi.fn(),
  previewAdminTemplateInheritance: vi.fn(),
}));
const instant = '2026-11-10T10:00:00Z';
const category: AdminCatalogCategoryDto = {
  id: 'category',
  parentId: null,
  name: 'Rodamientos',
  path: 'rodamientos',
  slug: 'rodamientos',
  active: true,
  application: null,
  sourcePriority: {},
  position: 0,
  updatedAt: instant,
};
const template: AdminTemplateDto = {
  id: 'template',
  categoryId: category.id,
  categoryName: category.name,
  variantKey: 'default',
  name: 'Bolas',
  version: 1,
  status: 'active',
  createdAt: instant,
  updatedAt: instant,
};
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
describe('catalog administration workflows', () => {
  it('creates a category with the selected parent and refreshes the tree', async () => {
    vi.mocked(createAdminCategory).mockResolvedValue(category);
    const saved = vi.fn(async () => {}),
      close = vi.fn();
    render(
      <CatalogDesignDrawer
        categories={[category]}
        templates={[]}
        category={null}
        operation="create"
        onClose={close}
        onSaved={saved}
      />,
    );
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Especiales' } });
    fireEvent.change(screen.getByLabelText(/Código PIM/), { target: { value: 'especiales' } });
    fireEvent.change(screen.getByLabelText(/Categoría padre/), { target: { value: category.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    await waitFor(() =>
      expect(createAdminCategory).toHaveBeenCalledWith({
        name: 'Especiales',
        slug: 'especiales',
        parentId: category.id,
        position: 0,
      }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(close).toHaveBeenCalled();
  });
  it('shows a version conflict without silently closing the category template change', async () => {
    vi.mocked(configureAdminCategoryTemplate).mockRejectedValue(
      new Error('Otra persona modificó la configuración'),
    );
    const close = vi.fn();
    render(
      <CatalogDesignDrawer
        categories={[category]}
        templates={[template]}
        category={category}
        operation="template"
        onClose={close}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Plantilla de origen'), {
      target: { value: template.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Otra persona');
    expect(close).not.toHaveBeenCalled();
    expect(configureAdminCategoryTemplate).toHaveBeenCalledWith(
      category.id,
      expect.objectContaining({ expectedUpdatedAt: instant, sourceTemplateId: template.id }),
    );
  });
  it('adds a typed attribute and returns the refreshed definition', async () => {
    vi.mocked(addAdminTemplateAttribute).mockResolvedValue(template);
    const saved = vi.fn();
    render(<AddTemplateAttributeDrawer template={template} onClose={vi.fn()} onSaved={saved} />);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Presión' } });
    fireEvent.change(screen.getByLabelText('Clave técnica única'), {
      target: { value: 'presion' },
    });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'number' } });
    fireEvent.change(screen.getByLabelText('Unidad'), { target: { value: 'bar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir atributo' }));
    await waitFor(() =>
      expect(addAdminTemplateAttribute).toHaveBeenCalledWith(
        template.id,
        expect.objectContaining({
          key: 'presion',
          label: 'Presión',
          dataType: 'number',
          unit: 'bar',
          expectedUpdatedAt: instant,
        }),
      ),
    );
    await waitFor(() => expect(saved).toHaveBeenCalledWith(template));
  });
  it('queries the selected unifier and exposes conflicts instead of a fabricated inherited value', async () => {
    vi.mocked(previewAdminTemplateInheritance).mockResolvedValue({
      unifiedCode: '6205',
      sourceSkus: ['SKU-1', 'SKU-2'],
      attributes: [
        {
          key: 'diametro',
          label: 'Diámetro',
          value: null,
          conflict: true,
          required: true,
          replicable: true,
        },
      ],
    });
    render(<TemplateInheritanceSimulator templateId={template.id} />);
    fireEvent.change(screen.getByLabelText('Código unificador existente'), {
      target: { value: '6205' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simular herencia' }));
    expect(await screen.findByText('Conflicto: valores distintos en el grupo')).toBeInTheDocument();
    expect(previewAdminTemplateInheritance).toHaveBeenCalledWith(template.id, '6205');
  });
});
