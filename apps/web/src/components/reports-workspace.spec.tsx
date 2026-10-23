import type { WorkspaceDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  view: '',
  push: vi.fn(),
  fetchWorkspace: vi.fn(),
  downloadWorkbookXlsx: vi.fn(),
  downloadReportPdf: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.view),
  usePathname: () => '/reports',
}));
vi.mock('@/lib/workspace-api', () => ({ fetchWorkspace: mocks.fetchWorkspace }));
vi.mock('@/lib/tabular-export', () => ({ downloadWorkbookXlsx: mocks.downloadWorkbookXlsx }));
vi.mock('@/lib/report-pdf', () => ({ downloadReportPdf: mocks.downloadReportPdf }));

import { ReportsWorkspace } from './reports-workspace';

const base: WorkspaceDto = {
  slug: 'reports',
  operationalStatus: 'operational',
  generatedAt: '2026-10-22T00:00:00.000Z',
  metrics: [],
  columns: [
    { key: 'sku', label: 'Código artículo', type: 'text' },
    { key: 'name', label: 'Descripción', type: 'text' },
  ],
  rows: [
    { id: '1', values: { sku: '6205', name: 'Rodamiento' } },
    { id: '2', values: { sku: '6206', name: 'Otro producto' } },
  ],
  totalRows: 2,
  notices: [],
  actions: [],
  reportCategories: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Rodamientos',
      parentId: null,
      path: '01 · Rodamientos',
    },
  ],
  reportFields: [
    { id: 'sku', label: 'Código artículo', type: 'text' },
    { id: 'name', label: 'Descripción', type: 'text' },
  ],
  reportFormats: [
    {
      format: 'products_by_category',
      title: 'Productos por categoría',
      totalRows: 105,
      columnCount: 13,
    },
  ],
  reportIndicators: [
    { key: 'catalog', value: 105, status: 'available', detail: 'Productos reales del catálogo.' },
    { key: 'quality', value: 64, status: 'available', detail: 'Completitud real.' },
    {
      key: 'duplicates',
      value: null,
      status: 'unavailable',
      detail: 'No hay alertas persistidas.',
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.view = '';
  mocks.fetchWorkspace.mockResolvedValue(base);
});
afterEach(cleanup);
const capabilities = ['menu:ai-quality:view', 'menu:products:view', 'menu:reports:view'];
describe('ReportsWorkspace', () => {
  it('renders the designer structure with seven reports and eight real indicator cards', async () => {
    render(<ReportsWorkspace actorId="admin" canManageFormats capabilities={capabilities} />);
    await waitFor(() =>
      expect(
        within(screen.getByRole('article', { name: 'Catálogo / exportación' })).getByText('105'),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByRole('article')).toHaveLength(15);
    expect(screen.getAllByRole('button', { name: /^Excel /u })).toHaveLength(7);
    expect(screen.getByRole('heading', { name: 'Reportes del cliente' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir Calidad del catálogo' })).toHaveAttribute(
      'href',
      '/quality',
    );
    expect(screen.getByRole('link', { name: 'Abrir Catálogo / exportación' })).toHaveAttribute(
      'href',
      '/products',
    );
    expect(
      within(screen.getByRole('article', { name: 'Posibles duplicados' })).getByText('Sin datos'),
    ).toBeInTheDocument();
    expect(screen.queryByText('18.420')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar todo (Excel)' }));
    await waitFor(() => expect(mocks.downloadWorkbookXlsx).toHaveBeenCalled());
    expect(mocks.downloadWorkbookXlsx.mock.calls[0]?.[0]).toHaveLength(7);
  });
  it('applies category filters to the API and preserves visible columns and filters in both exports', async () => {
    mocks.view = 'view=products-by-category';
    render(<ReportsWorkspace actorId="admin" canManageFormats capabilities={capabilities} />);
    await screen.findByRole('region', { name: 'Resultado del reporte' });
    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: base.reportCategories![0]!.id },
    });
    await waitFor(() =>
      expect(mocks.fetchWorkspace).toHaveBeenCalledWith(
        'reports',
        expect.any(AbortSignal),
        expect.objectContaining({
          categoryId: base.reportCategories![0]!.id,
          report: 'products_by_category',
        }),
      ),
    );
    await screen.findByRole('region', { name: 'Resultado del reporte' });
    fireEvent.change(screen.getByLabelText('Filtrar Código artículo'), {
      target: { value: '6206' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Columnas · 2' }));
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Columnas del reporte' })).getByRole('checkbox', {
        name: 'Descripción',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    await waitFor(() => expect(mocks.downloadWorkbookXlsx).toHaveBeenCalled());
    expect(mocks.downloadWorkbookXlsx.mock.calls[0]?.[0][0]).toMatchObject({
      headers: ['Código artículo'],
      rows: [['6206']],
    });
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(mocks.downloadReportPdf).toHaveBeenCalled());
    expect(mocks.downloadReportPdf.mock.calls[0]?.[0]).toEqual({
      headers: ['Código artículo'],
      rows: [['6206']],
    });
    expect(localStorage.getItem('cdr:reports:columns:admin:products-by-category')).toContain(
      'name',
    );
  });
  it('reads client CSV headers, maps them and stores only personal configuration', async () => {
    render(<ReportsWorkspace actorId="admin" canManageFormats capabilities={capabilities} />);
    const button = await screen.findByRole('button', {
      name: 'Nuevo formato desde plantilla del cliente (Excel)',
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    const file = {
      name: 'Cliente.csv',
      size: 50,
      text: async () => 'Código artículo;Descripción;Nota\n6205;No debe guardarse;Datos',
    };
    fireEvent.change(screen.getByLabelText('Plantilla del reporte'), { target: { files: [file] } });
    await screen.findByLabelText('Nombre del formato');
    expect(screen.getByLabelText('Campo PIM para Código artículo')).toHaveValue('sku');
    expect(screen.getByLabelText('Campo PIM para Nota')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar formato' }));
    const saved = localStorage.getItem('cdr:reports:personal:admin:v1');
    expect(saved).toContain('Cliente');
    expect(saved).not.toContain('No debe guardarse');
    expect(saved).not.toContain('6205');
    expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('/reports?view=personal-'));
  });
  it('keeps format creation restricted to administrators and disables unavailable module links', async () => {
    render(<ReportsWorkspace actorId="reader" capabilities={['menu:reports:view']} />);
    await waitFor(() => expect(mocks.fetchWorkspace).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: 'Nuevo formato desde plantilla del cliente (Excel)' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Abrir Calidad del catálogo' }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('article', { name: 'Calidad del catálogo' })).getByRole('button', {
        name: 'Abrir',
      }),
    ).toBeDisabled();
  });
});
