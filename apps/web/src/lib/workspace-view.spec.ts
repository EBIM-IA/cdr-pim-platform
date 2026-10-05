import { describe, expect, it } from 'vitest';

import {
  filterWorkspaceRows,
  formatWorkspaceCell,
  formatWorkspaceMetric,
  isCompactWorkspaceStatus,
} from './workspace-view';

const columns = [
  { key: 'name', label: 'Nombre', type: 'text' as const },
  { key: 'active', label: 'Activo', type: 'status' as const },
];
const rows = [
  { id: 'row-1', values: { name: 'Rodamientos rígidos', active: true } },
  { id: 'row-2', values: { name: 'Aceites sintéticos', active: false } },
];

describe('workspace presentation helpers', () => {
  it('searches every visible value without being sensitive to accents or case', () => {
    expect(filterWorkspaceRows(rows, columns, 'RIGIDOS')).toEqual([rows[0]]);
    expect(filterWorkspaceRows(rows, columns, 'sinteticos')).toEqual([rows[1]]);
    expect(filterWorkspaceRows(rows, columns, 'row-2')).toEqual([rows[1]]);
  });

  it('formats contract values without inventing missing data', () => {
    expect(formatWorkspaceCell(true, columns[1]!)).toBe('Sí');
    expect(formatWorkspaceCell(null, columns[0]!)).toBe('—');
    expect(
      formatWorkspaceMetric({ key: 'total', label: 'Total', value: 1200, format: 'integer' }),
    ).toMatch(/1[.,]200/);
  });

  it('reserves status pills for short labels', () => {
    expect(isCompactWorkspaceStatus('En revisión')).toBe(true);
    expect(
      isCompactWorkspaceStatus('Bloqueado hasta que el proveedor confirme el contrato definitivo'),
    ).toBe(false);
  });
});
