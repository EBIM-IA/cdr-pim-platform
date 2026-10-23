import { describe, expect, it } from 'vitest';

import { workspaceQueryParams } from './workspace-query';

describe('workspace query serialization', () => {
  it('preserves report filters, pages and multiple custom fields through the BFF', () => {
    const query = workspaceQueryParams({
      report: 'products_by_category',
      categoryId: '11111111-1111-4111-8111-111111111111',
      from: '2026-10-01',
      to: '2026-10-22',
      q: 'rodamiento + &',
      page: 2,
      pageSize: 1000,
      field: ['sku', 'attribute:diameter'],
    });
    expect(query.getAll('field')).toEqual(['sku', 'attribute:diameter']);
    expect(query.get('page')).toBe('2');
    expect(query.get('q')).toBe('rodamiento + &');
    expect(query.get('categoryId')).toBe('11111111-1111-4111-8111-111111111111');
  });
});
