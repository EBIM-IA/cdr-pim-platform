import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ColumnOrderUserProvider,
  columnOrderStorageKey,
  moveColumnInOrder,
  reconcileColumnOrder,
  usePersistentColumnOrder,
} from '@/components/column-order';

describe('orden persistente de columnas', () => {
  beforeEach(() => window.localStorage.clear());

  it('restaura solo columnas vigentes, elimina duplicados y agrega nuevas columnas', () => {
    expect(
      reconcileColumnOrder(['model', 'removed', 'model', 'make'], [
        'make',
        'model',
        'year',
      ] as const),
    ).toEqual(['model', 'make', 'year']);
  });

  it('mueve una columna antes o después del destino según la dirección del arrastre', () => {
    expect(moveColumnInOrder(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
    expect(moveColumnInOrder(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
  });

  it('aísla la preferencia por usuario y pantalla', () => {
    expect(columnOrderStorageKey('user@example.com', 'applications')).toBe(
      'cdr:column-order:user%40example.com:applications',
    );
    expect(columnOrderStorageKey('other', 'applications')).not.toBe(
      columnOrderStorageKey('user@example.com', 'applications'),
    );
    expect(columnOrderStorageKey('user@example.com', 'equivalences')).not.toBe(
      columnOrderStorageKey('user@example.com', 'applications'),
    );
  });

  it('persiste los movimientos, los restaura y permite volver al orden original', async () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(ColumnOrderUserProvider, { userId: 'actor-1', children });
    const renderPreference = () =>
      renderHook(
        () =>
          usePersistentColumnOrder({
            screenKey: 'applications',
            columnKeys: ['make', 'model', 'year'] as const,
          }),
        { wrapper },
      );

    const first = renderPreference();
    act(() => first.result.current.getColumnControl('model', 'Modelo').onMoveLeft());

    expect(first.result.current.orderedColumnKeys).toEqual(['model', 'make', 'year']);
    expect(window.localStorage.getItem('cdr:column-order:actor-1:applications')).toBe(
      '["model","make","year"]',
    );
    first.unmount();

    const restored = renderPreference();
    await waitFor(() =>
      expect(restored.result.current.orderedColumnKeys).toEqual(['model', 'make', 'year']),
    );
    act(() => restored.result.current.resetOrder());

    expect(restored.result.current.orderedColumnKeys).toEqual(['make', 'model', 'year']);
    expect(window.localStorage.getItem('cdr:column-order:actor-1:applications')).toBeNull();
  });
});
