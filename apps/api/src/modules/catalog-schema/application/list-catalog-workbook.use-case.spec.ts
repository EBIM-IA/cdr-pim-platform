import { newUuid } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import type { DynamicCatalogRepositoryPort } from '../domain/ports/dynamic-catalog.repository.port';
import {
  ListCatalogWorkbookUseCase,
  parseWorkbookColumnFilter,
} from './list-catalog-workbook.use-case';

const actor: AuthenticatedActor = {
  id: 'buyer-1',
  email: 'compras@casadelruliman.com',
  roles: [Role.Purchasing],
};

describe('ListCatalogWorkbookUseCase', () => {
  it('normalises category, roles and dynamic filters before querying the repository', async () => {
    const categoryId = newUuid();
    const listWorkbook = vi.fn().mockResolvedValue({ columns: [], items: [], total: 0 });
    const repository = { listWorkbook } as unknown as DynamicCatalogRepositoryPort;
    const useCase = new ListCatalogWorkbookUseCase(repository);

    await useCase.execute(
      {
        categoryId,
        page: 2,
        pageSize: 50,
        q: 'C3',
        brand: 'FAG',
        status: 'in_review',
        applicationType: 'INDUSTRIAL',
        completeness: 'critical',
        filter: ['diametro:gte:25'],
        columnFilter: [
          JSON.stringify({ key: 'base:unifier', expression: '*trilo' }),
          JSON.stringify({ key: 'base:brand', values: ['value:FAG'] }),
        ],
      },
      actor,
    );

    expect(listWorkbook).toHaveBeenCalledWith({
      categoryId,
      roles: ['COMPRAS'],
      page: 2,
      pageSize: 50,
      q: 'C3',
      brand: 'FAG',
      status: 'in_review',
      applicationType: 'INDUSTRIAL',
      completeness: 'critical',
      filters: [{ key: 'diametro', operator: 'gte', value: '25' }],
      columnFilters: [
        { key: 'base:unifier', expression: '*trilo' },
        { key: 'base:brand', values: ['value:FAG'] },
      ],
      sort: undefined,
    });
  });

  it('rejects ambiguous or unbounded workbook column expressions', () => {
    expect(() =>
      parseWorkbookColumnFilter(
        JSON.stringify({ key: 'base:unifier', values: ['value:A'], expression: 'A*' }),
      ),
    ).toThrow('Invalid workbook column filter');
    expect(() =>
      parseWorkbookColumnFilter(
        JSON.stringify({ key: 'base:unifier', expression: `${'a'.repeat(301)}` }),
      ),
    ).toThrow('Invalid workbook column filter');
    expect(() =>
      parseWorkbookColumnFilter(JSON.stringify({ key: 'base:unifier', expression: 'A||B' })),
    ).toThrow('Invalid workbook column filter');
    expect(() =>
      parseWorkbookColumnFilter(JSON.stringify({ key: 'base:unifier', expression: '!' })),
    ).toThrow('Invalid workbook column filter');
    expect(() =>
      parseWorkbookColumnFilter(
        JSON.stringify({ key: 'base:unifier', expression: '!!!!!!!!!!!A' }),
      ),
    ).toThrow('Invalid workbook column filter');
  });
});
