import type { WorkspaceDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const exports = vi.hoisted(() => ({ xlsx: vi.fn() }));
vi.mock('@/lib/tabular-export', () => ({ downloadXlsx: exports.xlsx }));

import { ProductCatalogsWorkspace } from './product-catalogs-workspace';

const workspace: WorkspaceDto = {
  slug: 'catalogs',
  operationalStatus: 'blocked',
  generatedAt: '2026-10-23T12:00:00.000Z',
  metrics: [{ key: 'catalogs', label: 'Catálogos registrados', value: 0, format: 'integer' }],
  columns: [],
  rows: [],
  totalRows: 0,
  notices: [],
  actions: [
    {
      id: 'upload-catalog',
      label: 'Cargar catálogo PDF',
      availability: 'blocked',
      reason: 'Pending approved PDF storage policy',
    },
    {
      id: 'share-catalog',
      label: 'Compartir catálogo',
      availability: 'blocked',
      reason: 'Pending approved link contract',
    },
  ],
};
const withRows: WorkspaceDto = {
  ...workspace,
  metrics: [{ key: 'catalogs', label: 'Catálogos registrados', value: 2, format: 'integer' }],
  totalRows: 2,
  rows: [
    {
      id: 'catalog-record-1',
      values: {
        title: 'Catálogo de prueba uno',
        description: 'Línea de rodamientos',
        fileName: 'rodamiento.pdf',
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
        status: 'Vigente',
        links: null,
        createdBy: 'Actor de prueba',
        createdAt: '2026-01-01T12:00:00.000Z',
        updatedBy: null,
        updatedAt: null,
      },
    },
    {
      id: 'catalog-record-2',
      values: {
        title: 'Catálogo de prueba dos',
        description: 'Línea de retenes',
        fileName: 'retenes.pdf',
        validFrom: '2026-02-01',
        validUntil: null,
        status: 'Programado',
        links: null,
        createdBy: 'Actor de prueba',
        createdAt: '2026-02-01T12:00:00.000Z',
        updatedBy: null,
        updatedAt: null,
      },
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProductCatalogsWorkspace', () => {
  it('preserves the reference toolbar and empty catalogue card without displaying an invented table or KPIs', () => {
    render(<ProductCatalogsWorkspace workspace={workspace} />);
    const toolbar = screen.getByRole('toolbar', { name: 'Acciones de catálogos' });
    for (const name of ['Subir catálogo', 'Editar', 'Compartir', 'Eliminar', 'Exportar Excel'])
      expect(within(toolbar).getByRole('button', { name })).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Vigentes')).not.toBeInTheDocument();
    expect(screen.queryByText('Enlaces activos')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Todavía no hay catálogos' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'Compartir' })).toBeDisabled();
    expect(within(toolbar).getByRole('button', { name: 'Exportar Excel' })).toBeDisabled();
  });
  it('shows the PDF form without accepting files or claiming an upload', () => {
    render(<ProductCatalogsWorkspace workspace={workspace} />);
    fireEvent.click(screen.getByRole('button', { name: 'Subir catálogo' }));
    const drawer = screen.getByRole('dialog', { name: 'Subir catálogo' });
    expect(within(drawer).getByLabelText('Título *')).toBeDisabled();
    expect(within(drawer).getByLabelText('Descripción')).toBeDisabled();
    expect(within(drawer).getByLabelText('Vigente desde *')).toBeDisabled();
    expect(within(drawer).getByLabelText('Vigente hasta')).toBeDisabled();
    expect(within(drawer).getByLabelText('Catálogo en PDF *')).toBeDisabled();
    expect(within(drawer).getByRole('button', { name: 'Subir catálogo' })).toBeDisabled();
    expect(
      within(drawer).getByText(/no permite adjuntar, enviar ni guardar archivos/),
    ).toBeVisible();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(exports.xlsx).not.toHaveBeenCalled();
  });
  it('searches the supplied records and exports only the same visible rows', () => {
    render(<ProductCatalogsWorkspace workspace={withRows} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar catálogos' }), {
      target: { value: 'retenes' },
    });
    expect(
      screen.queryByRole('button', { name: 'Catálogo de prueba uno' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Catálogo de prueba dos' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    const [document, name] = exports.xlsx.mock.calls[0]!;
    expect(name).toBe('catalogos.xlsx');
    expect(document.headers).toHaveLength(12);
    expect(document.rows).toHaveLength(1);
    expect(document.rows[0][0]).toBe('catalog-record-2');
    expect(document.rows[0][3]).toBe('retenes.pdf');
  });
  it('offers spreadsheet column filters without manufacturing value options', () => {
    render(<ProductCatalogsWorkspace workspace={withRows} />);
    fireEvent.click(screen.getByRole('button', { name: 'Título: filtrar u ordenar' }));
    const dialog = screen.getByRole('dialog', { name: 'Filtrar Título' });
    expect(within(dialog).getByText('Catálogo de prueba uno')).toBeVisible();
    expect(within(dialog).getByText('Catálogo de prueba dos')).toBeVisible();
    expect(within(dialog).queryByText('Catálogo ficticio')).not.toBeInTheDocument();
  });
  it('can reset an empty search and reload only on an explicit user action', () => {
    const reload = vi.fn();
    render(<ProductCatalogsWorkspace workspace={withRows} onReload={reload} />);
    expect(reload).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar catálogos' }), {
      target: { value: 'inexistente' },
    });
    expect(screen.getByRole('heading', { name: 'Sin catálogos para estos filtros' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(screen.getByRole('searchbox', { name: 'Buscar catálogos' })).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('shows supplied catalogue detail without generating a PDF or share URL', () => {
    render(<ProductCatalogsWorkspace workspace={withRows} />);
    fireEvent.click(screen.getByRole('button', { name: 'Catálogo de prueba uno' }));
    const dialog = screen.getByRole('dialog', { name: 'Catálogo de prueba uno' });
    expect(within(dialog).getByText('rodamiento.pdf')).toBeVisible();
    expect(within(dialog).getByText('01/01/2026')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Compartir' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Ver PDF' })).toBeDisabled();
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
  });
});
