import { describe, expect, it } from 'vitest';

import { nextSortDirection, sortTableRows } from './sortable-table-header';

describe('sortable table helpers', () => {
  it('toggles direction and sorts text with numeric segments', () => {
    expect(nextSortDirection(false, 'desc')).toBe('asc');
    expect(nextSortDirection(true, 'asc')).toBe('desc');
    expect(sortTableRows([{ sku: 'SKU-10' }, { sku: 'SKU-2' }], 'asc', (row) => row.sku)).toEqual([
      { sku: 'SKU-2' },
      { sku: 'SKU-10' },
    ]);
  });

  it('keeps unavailable values at the end in both directions', () => {
    const rows = [{ value: null }, { value: 2 }, { value: 1 }];
    expect(sortTableRows(rows, 'desc', (row) => row.value)).toEqual([
      { value: 2 },
      { value: 1 },
      { value: null },
    ]);
  });
});
