import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TableActionTooltip } from '@/components/table-action-tooltip';

function Harness() {
  return (
    <div className="cdr-app">
      <p id="existing-help">Acción disponible</p>
      <table>
        <tbody>
          <tr>
            <td>
              <a href="/products/product-1">6205 SKF</a>
            </td>
            <td>
              <button title="Abrir detalle del grupo" aria-describedby="existing-help">
                Detalle
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <TableActionTooltip scopeKey="catalog" />
    </div>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ayuda inmediata de acciones de tabla', () => {
  it('muestra la ayuda a los 250ms de hover y cancela al salir', () => {
    render(<Harness />);
    const link = screen.getByRole('link', { name: '6205 SKF' });
    fireEvent.pointerOver(link);
    act(() => vi.advanceTimersByTime(249));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ver ficha de 6205 SKF');
    expect(link).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
    fireEvent.pointerOut(link);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(link).not.toHaveAttribute('aria-describedby');
  });

  it('describe la acción enfocada y conserva la descripción previa al cerrar con Escape', () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Detalle' });
    fireEvent.focusIn(button);
    act(() => vi.runOnlyPendingTimers());
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Abrir detalle del grupo');
    expect(button).toHaveAttribute('aria-describedby', `existing-help ${tooltip.id}`);
    expect(button).not.toHaveAttribute('title');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-describedby', 'existing-help');
    expect(button).toHaveAttribute('title', 'Abrir detalle del grupo');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('limpia el temporizador y restaura atributos al desmontar la pantalla', () => {
    const view = render(<Harness />);
    const button = screen.getByRole('button', { name: 'Detalle' });
    fireEvent.pointerOver(button);
    view.unmount();
    act(() => vi.runOnlyPendingTimers());
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(button).toHaveAttribute('title', 'Abrir detalle del grupo');
    expect(button).toHaveAttribute('aria-describedby', 'existing-help');
  });
});
