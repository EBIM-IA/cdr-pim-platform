import { newUuid } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import type { DynamicCatalogRepositoryPort } from '../domain/ports/dynamic-catalog.repository.port';
import { ListCatalogWorkbookUseCase } from './list-catalog-workbook.use-case';

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
      columnFilters: [],
      sort: undefined,
    });
  });
});
