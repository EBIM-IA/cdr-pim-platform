import type {
  ProductCatalogDetailDto,
  ProductCatalogDto,
  ProductCatalogListDto,
  ProductCatalogShareDto,
} from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ProductCatalogsApi from '@/lib/product-catalogs-api';

const api = vi.hoisted(() => ({
  listAllProductCatalogs: vi.fn(),
  getProductCatalog: vi.fn(),
  createProductCatalog: vi.fn(),
  updateProductCatalog: vi.fn(),
  deleteProductCatalog: vi.fn(),
  restoreProductCatalog: vi.fn(),
  createProductCatalogShare: vi.fn(),
  revokeProductCatalogShare: vi.fn(),
}));
const exports = vi.hoisted(() => ({ xlsx: vi.fn() }));
vi.mock('@/lib/tabular-export', () => ({ downloadXlsx: exports.xlsx }));
vi.mock('@/lib/product-catalogs-api', async (original) => ({
  ...(await original<typeof ProductCatalogsApi>()),
  ...api,
}));

import { ProductCatalogsApiError } from '@/lib/product-catalogs-api';

import { ProductCatalogsWorkspace } from './product-catalogs-workspace';

const catalog: ProductCatalogDto = {
  id: '10000000-0000-4000-8000-000000000001',
  code: 'CAT-0001',
  title: 'Catálogo de rodamientos',
  description: 'Línea industrial SKF',
  validFrom: '2026-01-01',
  validUntil: '2026-12-31',
  status: 'Vigente',
  fileName: 'rodamientos.pdf',
  fileSize: 1024,
  activeLinks: 0,
  totalLinks: 0,
  createdBy: 'compras@prueba.local',
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedBy: 'compras@prueba.local',
  updatedAt: '2026-10-23T12:00:00.000Z',
  deletedAt: null,
  deletedBy: null,
};
const share: ProductCatalogShareDto = {
  id: '20000000-0000-4000-8000-000000000001',
  term: '7d',
  note: 'Cliente industrial',
  status: 'Activo',
  expiresAt: '2026-10-30T12:00:00.000Z',
  createdBy: 'ventas@prueba.local',
  createdAt: '2026-10-23T12:00:00.000Z',
  updatedAt: '2026-10-23T12:00:01.000Z',
  revokedAt: null,
  revokedBy: null,
  views: 3,
  lastViewedAt: null,
};
const list = (items: ProductCatalogDto[] = [catalog]): ProductCatalogListDto => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 100,
  metrics: {
    catalogs: items.filter((row) => !row.deletedAt).length,
    current: items.filter((row) => !row.deletedAt && ['Vigente', 'Por vencer'].includes(row.status))
      .length,
    expiring: items.filter((row) => !row.deletedAt && row.status === 'Por vencer').length,
    expired: items.filter((row) => !row.deletedAt && row.status === 'Vencido').length,
    scheduled: items.filter((row) => !row.deletedAt && row.status === 'Programado').length,
    activeLinks: items
      .filter((row) => !row.deletedAt && ['Vigente', 'Por vencer'].includes(row.status))
      .reduce((sum, row) => sum + row.activeLinks, 0),
    deleted: items.filter((row) => row.deletedAt).length,
  },
});
const detail = (overrides: Partial<ProductCatalogDetailDto> = {}): ProductCatalogDetailDto => ({
  catalog,
  shares: [],
  audit: [],
  ...overrides,
});
const mount = (canManage = true, canShare = true) =>
  render(<ProductCatalogsWorkspace canManage={canManage} canShare={canShare} />);
const toolbar = () => within(screen.getByRole('toolbar', { name: 'Acciones de catálogos' }));
const openDetail = async () => {
  fireEvent.click(await screen.findByRole('button', { name: catalog.title }));
  const drawer = screen.getByRole('dialog', { name: `${catalog.code} · ${catalog.title}` });
  await waitFor(() =>
    expect(within(drawer).queryByText('Cargando enlaces e historial…')).not.toBeInTheDocument(),
  );
  return within(drawer);
};

beforeEach(() => {
  vi.clearAllMocks();
  api.listAllProductCatalogs.mockResolvedValue(list());
  api.getProductCatalog.mockResolvedValue(detail());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ProductCatalogsWorkspace', () => {
  it('keeps all four real summary indicators visible when there are no catalogs', async () => {
    api.listAllProductCatalogs.mockResolvedValue(list([]));
    mount();
    await screen.findByRole('heading', { name: 'Todavía no hay catálogos' });
    const indicators = within(screen.getByLabelText('Indicadores de catálogos'));
    for (const label of ['Catálogos', 'Vigentes', 'Vencidos / programados', 'Enlaces activos'])
      expect(indicators.getByText(label)).toBeVisible();
    expect(indicators.getAllByText('0')).toHaveLength(3);
    expect(indicators.getByText('0 / 0')).toBeVisible();
    expect(api.listAllProductCatalogs).toHaveBeenCalledTimes(1);
  });

  it('shows server summary totals rather than counts from the current local table page', async () => {
    const items = Array.from({ length: 31 }, (_, index) => ({
      ...catalog,
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      code: `CAT-${index + 1}`,
      title: `Catálogo ${index + 1}`,
    }));
    api.listAllProductCatalogs.mockResolvedValue({
      ...list(items),
      metrics: {
        catalogs: 31,
        current: 27,
        expiring: 4,
        expired: 3,
        scheduled: 1,
        activeLinks: 8,
        deleted: 0,
      },
    });
    mount();
    await screen.findByRole('button', { name: 'Catálogo 1' });
    const indicators = within(screen.getByLabelText('Indicadores de catálogos'));
    expect(indicators.getByText('31')).toBeVisible();
    expect(indicators.getByText('27')).toBeVisible();
    expect(indicators.getByText('3 / 1')).toBeVisible();
    expect(indicators.getByText('8')).toBeVisible();
    expect(indicators.getByText('4 por vencer en 30 días')).toBeVisible();
    expect(indicators.getByText('PDF en la búsqueda')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(indicators.getByText('31')).toBeVisible();
    expect(api.listAllProductCatalogs).toHaveBeenCalledTimes(1);
  });

  it('keeps consultation and downloads while hiding all mutation and sharing actions for readers', async () => {
    mount(false, false);
    await screen.findByRole('button', { name: catalog.title });
    for (const name of ['Subir catálogo', 'Editar', 'Compartir', 'Eliminar']) {
      expect(toolbar().queryByRole('button', { name })).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('checkbox', { name: `Seleccionar ${catalog.title}` }));
    expect(toolbar().getByRole('button', { name: 'Exportar Excel' })).toBeEnabled();
    const drawer = await openDetail();
    expect(drawer.getByRole('link', { name: 'Descargar' })).toBeVisible();
    expect(drawer.queryByRole('button', { name: 'Generar enlace' })).not.toBeInTheDocument();
  });

  it('shows real metrics, PDF actions and role permissions without placeholder blocks', async () => {
    mount(false, true);
    expect(await screen.findByRole('button', { name: catalog.title })).toBeVisible();
    expect(within(screen.getByRole('table')).getAllByRole('columnheader')).toHaveLength(13);
    expect(api.listAllProductCatalogs).toHaveBeenCalledWith(
      { q: '', includeDeleted: false },
      expect.any(AbortSignal),
    );
    expect(toolbar().queryByRole('button', { name: 'Subir catálogo' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: `Seleccionar ${catalog.title}` }));
    expect(toolbar().queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(toolbar().getByRole('button', { name: 'Compartir' })).toBeEnabled();
    const drawer = await openDetail();
    expect(drawer.getByRole('link', { name: 'Ver PDF' })).toHaveAttribute(
      'href',
      `/api/product-catalogs/${catalog.id}/file?disposition=inline`,
    );
    expect(drawer.getByRole('link', { name: 'Descargar' })).toHaveAttribute(
      'href',
      `/api/product-catalogs/${catalog.id}/file?disposition=attachment`,
    );
    expect(drawer.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByText(/todavía no está habilitad/)).not.toBeInTheDocument();
  });

  it('uploads a validated PDF with metadata, then refreshes the list', async () => {
    api.listAllProductCatalogs.mockResolvedValue(list([]));
    api.createProductCatalog.mockResolvedValue(catalog);
    mount();
    await screen.findByRole('heading', { name: 'Todavía no hay catálogos' });
    fireEvent.click(toolbar().getByRole('button', { name: 'Subir catálogo' }));
    const drawer = within(screen.getByRole('dialog', { name: 'Subir catálogo' }));
    fireEvent.change(drawer.getByLabelText('Título *'), { target: { value: 'Nuevo catálogo' } });
    fireEvent.change(drawer.getByLabelText('Vigente desde *'), { target: { value: '2026-10-23' } });
    const pdf = new File(['%PDF-1.7\ncontenido'], 'nuevo.pdf', { type: 'application/pdf' });
    fireEvent.change(drawer.getByLabelText(/Catálogo en PDF/), { target: { files: [pdf] } });
    fireEvent.click(drawer.getByRole('button', { name: 'Subir catálogo' }));
    await waitFor(() =>
      expect(api.createProductCatalog).toHaveBeenCalledWith(
        { title: 'Nuevo catálogo', description: '', validFrom: '2026-10-23', validUntil: null },
        pdf,
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.listAllProductCatalogs).toHaveBeenCalledTimes(2);
  });

  it('rejects a disguised PDF and inverted validity without sending a write', async () => {
    mount();
    await screen.findByRole('button', { name: catalog.title });
    fireEvent.click(toolbar().getByRole('button', { name: 'Subir catálogo' }));
    const drawer = within(screen.getByRole('dialog', { name: 'Subir catálogo' }));
    fireEvent.change(drawer.getByLabelText('Título *'), { target: { value: 'Intento' } });
    fireEvent.change(drawer.getByLabelText('Vigente desde *'), { target: { value: '2026-10-23' } });
    fireEvent.change(drawer.getByLabelText(/Vigente hasta/), { target: { value: '2026-10-22' } });
    fireEvent.change(drawer.getByLabelText(/Catálogo en PDF/), {
      target: { files: [new File(['texto'], 'falso.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(drawer.getByRole('button', { name: 'Subir catálogo' }));
    expect(await drawer.findByText('El archivo no es un PDF válido.')).toBeVisible();
    expect(drawer.getByText('La fecha de fin no puede ser anterior a la de inicio.')).toBeVisible();
    expect(api.createProductCatalog).not.toHaveBeenCalled();
  });

  it('edits metadata without replacing the PDF and preserves the draft on a version conflict', async () => {
    api.updateProductCatalog.mockRejectedValue(
      new ProductCatalogsApiError('Conflicto de versión.', 409),
    );
    mount();
    await screen.findByRole('button', { name: catalog.title });
    fireEvent.click(screen.getByRole('checkbox', { name: `Seleccionar ${catalog.title}` }));
    fireEvent.click(toolbar().getByRole('button', { name: 'Editar' }));
    const drawer = within(
      screen.getByRole('dialog', { name: `Editar catálogo · ${catalog.code}` }),
    );
    fireEvent.change(drawer.getByLabelText('Título *'), {
      target: { value: 'Borrador que conservar' },
    });
    fireEvent.click(drawer.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(api.updateProductCatalog).toHaveBeenCalledWith(
        catalog.id,
        expect.objectContaining({
          title: 'Borrador que conservar',
          expectedUpdatedAt: catalog.updatedAt,
        }),
        undefined,
      ),
    );
    expect(await drawer.findByRole('alert')).toHaveTextContent('Los datos cambiaron');
    expect(drawer.getByLabelText('Título *')).toHaveValue('Borrador que conservar');
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(drawer.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('generates a one-time link, keeps it while refreshing and forgets it after closing', async () => {
    const revised = {
      ...catalog,
      activeLinks: 1,
      totalLinks: 1,
      updatedAt: '2026-10-23T12:01:00.000Z',
    };
    const token = 'q'.repeat(43);
    api.createProductCatalogShare.mockResolvedValue({ share, token });
    api.getProductCatalog
      .mockResolvedValueOnce(detail())
      .mockResolvedValue(detail({ catalog: revised, shares: [share] }));
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const clipboard = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboard },
    });
    mount();
    let drawer = await openDetail();
    fireEvent.click(drawer.getByRole('radio', { name: '1 mes' }));
    fireEvent.change(drawer.getByRole('textbox', { name: 'Nota del enlace' }), {
      target: { value: 'Campaña' },
    });
    fireEvent.click(drawer.getByRole('button', { name: 'Generar enlace' }));
    expect(await drawer.findByRole('textbox', { name: 'Enlace generado' })).toHaveValue(
      `${window.location.origin}/shared/catalogs#${token}`,
    );
    await waitFor(() => expect(api.getProductCatalog).toHaveBeenCalledTimes(2));
    expect(api.createProductCatalogShare).toHaveBeenCalledWith(catalog.id, {
      term: '1m',
      note: 'Campaña',
      expectedUpdatedAt: catalog.updatedAt,
    });
    fireEvent.click(drawer.getByRole('button', { name: 'Copiar' }));
    await waitFor(() =>
      expect(clipboard).toHaveBeenCalledWith(`${window.location.origin}/shared/catalogs#${token}`),
    );
    expect(storage).not.toHaveBeenCalled();
    fireEvent.click(drawer.getByRole('button', { name: 'Cerrar configuración' }));
    drawer = await openDetail();
    expect(drawer.queryByRole('textbox', { name: 'Enlace generado' })).not.toBeInTheDocument();
    expect(drawer.queryByRole('button', { name: 'Copiar' })).not.toBeInTheDocument();
    expect(drawer.getByText('Cliente industrial')).toBeVisible();
  });

  it('revokes with the share version and records the real history state', async () => {
    const revoked = {
      ...share,
      status: 'Revocado' as const,
      revokedAt: '2026-10-23T12:02:00.000Z',
      revokedBy: 'ventas@prueba.local',
    };
    api.getProductCatalog
      .mockResolvedValueOnce(detail({ shares: [share] }))
      .mockResolvedValue(detail({ shares: [revoked] }));
    api.revokeProductCatalogShare.mockResolvedValue(revoked);
    mount();
    const drawer = await openDetail();
    fireEvent.click(drawer.getByRole('button', { name: 'Revocar' }));
    await waitFor(() =>
      expect(api.revokeProductCatalogShare).toHaveBeenCalledWith(
        catalog.id,
        share.id,
        share.updatedAt,
      ),
    );
    expect(await drawer.findByText('Revocado')).toBeVisible();
    expect(drawer.queryByRole('button', { name: 'Revocar' })).not.toBeInTheDocument();
  });

  it('requires confirmation to delete and can restore the persisted deleted record after refresh', async () => {
    const deleted = {
      ...catalog,
      status: 'Eliminado' as const,
      deletedAt: '2026-10-23T12:03:00.000Z',
      deletedBy: catalog.updatedBy,
      updatedAt: '2026-10-23T12:03:00.000Z',
    };
    api.listAllProductCatalogs.mockResolvedValueOnce(list()).mockResolvedValue(list([deleted]));
    api.deleteProductCatalog.mockResolvedValue(deleted);
    api.restoreProductCatalog.mockResolvedValue(catalog);
    mount();
    await screen.findByRole('button', { name: catalog.title });
    fireEvent.click(screen.getByRole('checkbox', { name: `Seleccionar ${catalog.title}` }));
    fireEvent.click(toolbar().getByRole('button', { name: 'Eliminar (1)' }));
    expect(api.deleteProductCatalog).not.toHaveBeenCalled();
    const confirmation = within(screen.getByRole('dialog', { name: 'Eliminar catálogos' }));
    expect(confirmation.getByText(/La baja es reversible/)).toBeVisible();
    fireEvent.click(confirmation.getByRole('button', { name: 'Eliminar' }));
    await waitFor(() =>
      expect(api.deleteProductCatalog).toHaveBeenCalledWith(catalog.id, catalog.updatedAt),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox', { name: 'Mostrar catálogos' }), {
      target: { value: 'deleted' },
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: `Seleccionar ${catalog.title}` }));
    fireEvent.click(toolbar().getByRole('button', { name: 'Restaurar' }));
    await waitFor(() =>
      expect(api.restoreProductCatalog).toHaveBeenCalledWith(catalog.id, deleted.updatedAt),
    );
  });

  it('disables sharing for scheduled catalogs while retaining the detail explanation', async () => {
    const scheduled = { ...catalog, status: 'Programado' as const, validFrom: '2027-01-01' };
    api.listAllProductCatalogs.mockResolvedValue(list([scheduled]));
    api.getProductCatalog.mockResolvedValue(detail({ catalog: scheduled }));
    mount();
    await screen.findByRole('button', { name: catalog.title });
    fireEvent.click(screen.getByRole('checkbox', { name: `Seleccionar ${catalog.title}` }));
    expect(toolbar().getByRole('button', { name: 'Compartir' })).toBeDisabled();
    const drawer = await openDetail();
    expect(drawer.queryByRole('button', { name: 'Generar enlace' })).not.toBeInTheDocument();
    expect(drawer.getByText(/solo se comparten catálogos vigentes/)).toBeVisible();
  });

  it('paginates locally and exports every filtered result, including later pages', async () => {
    const items = Array.from({ length: 31 }, (_, index) => ({
      ...catalog,
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      code: `CAT-${index + 1}`,
      title: `Catálogo ${index + 1}`,
    }));
    api.listAllProductCatalogs.mockResolvedValue(list(items));
    mount();
    await screen.findByRole('button', { name: 'Catálogo 1' });
    expect(screen.queryByRole('button', { name: 'Catálogo 31' })).not.toBeInTheDocument();
    fireEvent.click(toolbar().getByRole('button', { name: 'Exportar Excel' }));
    expect(exports.xlsx.mock.calls[0]?.[0].rows).toHaveLength(31);
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByRole('button', { name: 'Catálogo 31' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Título: filtrar u ordenar' }));
    const filter = within(screen.getByRole('dialog', { name: 'Filtrar Título' }));
    expect(filter.getByText('Catálogo 1')).toBeVisible();
    expect(filter.getByText('Catálogo 31')).toBeVisible();
  });
});
