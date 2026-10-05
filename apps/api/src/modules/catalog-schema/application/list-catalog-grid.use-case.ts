import { Inject, Injectable } from '@nestjs/common';
import { ValidationError, assertUuid } from '@cdr/shared';

import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import type { CatalogGridProduct } from '../domain/entities/catalog-schema';
import {
  DYNAMIC_CATALOG_REPOSITORY,
  type AttributeFilterOperator,
  type CatalogAttributeFilter,
  type DynamicCatalogRepositoryPort,
} from '../domain/ports/dynamic-catalog.repository.port';
import { catalogBusinessRoles } from './catalog-business-roles';

const OPERATORS = new Set<AttributeFilterOperator>(['eq', 'contains', 'gt', 'gte', 'lt', 'lte']);

export interface ListCatalogGridQuery {
  readonly categoryId: string;
  readonly page: number;
  readonly pageSize: number;
  readonly q?: string;
  readonly filter: readonly string[];
}

@Injectable()
export class ListCatalogGridUseCase {
  constructor(
    @Inject(DYNAMIC_CATALOG_REPOSITORY)
    private readonly catalog: DynamicCatalogRepositoryPort,
  ) {}

  execute(
    query: ListCatalogGridQuery,
    actor: AuthenticatedActor,
  ): Promise<{ items: CatalogGridProduct[]; total: number }> {
    return this.catalog.listGrid({
      categoryId: assertUuid(query.categoryId, 'categoryId'),
      roles: catalogBusinessRoles(actor),
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      filters: query.filter.map(parseFilter),
    });
  }
}

/** Wire format: `attribute_key:operator:value`; the value may itself contain colons. */
export function parseFilter(raw: string): CatalogAttributeFilter {
  const first = raw.indexOf(':');
  const second = raw.indexOf(':', first + 1);
  const key = raw.slice(0, first).trim();
  const operator = raw.slice(first + 1, second) as AttributeFilterOperator;
  const value = raw.slice(second + 1).trim();
  if (first < 1 || second <= first + 1 || !value || !OPERATORS.has(operator)) {
    throw new ValidationError('Invalid attribute filter', {
      filter: raw,
      expected: 'attribute_key:(eq|contains|gt|gte|lt|lte):value',
    });
  }
  return { key, operator, value };
}
