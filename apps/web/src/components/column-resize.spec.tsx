import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  columnWidthStorageKey,
  resetColumnPreferences,
  tableColumnHeaders,
  TableColumnResizeController,
} from '@/components/column-resize';

function Harness({
  reverse = false,
  userId = 'actor-1',
  existingColumns = false,
}: {
  reverse?: boolean;
  userId?: string;
  existingColumns?: boolean;
}) {
  const keys = reverse ? ['brand', 'sku'] : ['sku', 'brand'];
  return (
    <div className="cdr-app">
      <table data-column-resize-key="catalog">
        {existingColumns ? (
          <colgroup>
            <col style={{ width: '30%' }} />
            <col style={{ width: '70%' }} />
          </colgroup>
        ) : null}
        <thead>
          <tr>
            <th colSpan={2}>Identidad</th>
          </tr>
          <tr>
            {keys.map((key) => (
              <th key={key} data-column-key={key} data-column-label={key}>
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {keys.map((key) => (
              <td key={key}>{key === 'sku' ? '6205' : 'SKF'}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <TableColumnResizeController userId={userId} scopeKey="products" />
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    right: 150,
    bottom: 30,
    left: 0,
    width: 150,
    height: 30,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('anchos persistentes de columnas', () => {
  it('resuelve cabeceras agrupadas y rowspan sin convertir grupos en columnas', () => {
    const table = document.createElement('table');
    table.innerHTML =
      '<thead><tr><th rowspan="2">SKU</th><th colspan="2">Atributos</th></tr><tr><th>Marca</th><th>Medida</th></tr><tr><th><input aria-label="Filtrar SKU" /></th><th><input /></th><th><input /></th></tr></thead>';
    expect(tableColumnHeaders(table).map((header) => header.textContent)).toEqual([
      'SKU',
      'Marca',
      'Medida',
    ]);
  });

  it('persiste el ancho por clave y lo conserva después de reordenar columnas', async () => {
    const view = render(<Harness />);
    const grip = screen.getByRole('separator', { name: 'Ancho de sku' });
    fireEvent.keyDown(grip, { key: 'ArrowRight' });
    const storageKey = columnWidthStorageKey('actor-1', 'products:catalog');
    expect(JSON.parse(window.localStorage.getItem(storageKey)!)).toEqual({ sku: 160, brand: 150 });

    view.rerender(<Harness reverse />);

    await waitFor(() => {
      const columns = screen.getByRole('table').querySelectorAll('col');
      expect(Array.from(columns).map((column) => column.style.width)).toEqual(['150px', '160px']);
    });
    view.unmount();
    render(<Harness />);
    expect(screen.getByRole('table')).toHaveStyle({ width: '310px' });
    expect(screen.getByRole('separator', { name: 'Ancho de sku' })).toHaveAttribute(
      'aria-valuenow',
      '160',
    );
  });

  it('limita anchos corruptos y aísla las preferencias entre usuarios', () => {
    window.localStorage.setItem(
      columnWidthStorageKey('actor-1', 'products:catalog'),
      JSON.stringify({ sku: -20, brand: '200' }),
    );
    const view = render(<Harness />);
    expect(screen.getByRole('table').querySelector('colgroup')).toBeNull();
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Ancho de sku' }), {
      key: 'ArrowLeft',
    });
    view.unmount();
    render(<Harness userId="actor-2" />);
    expect(screen.getByRole('table').querySelector('colgroup')).toBeNull();
  });

  it('reutiliza el colgroup existente y restaura sus anchos al restablecer', () => {
    render(<Harness existingColumns />);
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Ancho de sku' }), {
      key: 'ArrowRight',
    });
    expect(screen.getByRole('table').querySelectorAll('col')).toHaveLength(2);
    resetColumnPreferences('actor-1');
    expect(
      Array.from(screen.getByRole('table').querySelectorAll('col')).map(
        (column) => column.style.width,
      ),
    ).toEqual(['30%', '70%']);
  });

  it('arrastra el borde sin afectar el orden y termina el ajuste al soltar el puntero', () => {
    render(<Harness />);
    const grip = screen.getByRole('separator', { name: 'Ancho de sku' });
    fireEvent(grip, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100 }));
    fireEvent(window, new MouseEvent('pointermove', { clientX: 135 }));
    fireEvent(window, new MouseEvent('pointerup'));
    fireEvent(window, new MouseEvent('pointermove', { clientX: 200 }));
    expect(
      JSON.parse(window.localStorage.getItem(columnWidthStorageKey('actor-1', 'products:catalog'))!)
        .sku,
    ).toBe(185);
    expect(document.documentElement).not.toHaveClass('cdr-resizing-column');
    expect(screen.getByRole('table').querySelector('thead tr:last-child th')).toHaveAttribute(
      'data-column-key',
      'sku',
    );
  });

  it('ajusta al contenido con doble clic y restablece solo preferencias del usuario actual', async () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Ancho de sku' }), {
      key: 'ArrowRight',
    });
    fireEvent.doubleClick(screen.getByRole('separator', { name: 'Ancho de sku' }));
    expect(
      JSON.parse(window.localStorage.getItem(columnWidthStorageKey('actor-1', 'products:catalog'))!)
        .sku,
    ).toBe(150);
    window.localStorage.setItem('cdr:column-order:actor-1:catalog', '["brand","sku"]');
    window.localStorage.setItem('cdr:column-order:actor-2:catalog', '["brand","sku"]');
    window.localStorage.setItem('cdr:pim:sidebar', 'collapsed');

    resetColumnPreferences('actor-1');

    await waitFor(() => expect(screen.getByRole('table').querySelector('colgroup')).toBeNull());
    expect(window.localStorage.getItem('cdr:column-order:actor-1:catalog')).toBeNull();
    expect(window.localStorage.getItem('cdr:column-order:actor-2:catalog')).not.toBeNull();
    expect(window.localStorage.getItem('cdr:pim:sidebar')).toBe('collapsed');
  });
});
