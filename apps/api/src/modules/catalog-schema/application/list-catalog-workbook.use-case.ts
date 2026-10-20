import { Inject, Injectable } from '@nestjs/common';
import { ValidationError, assertUuid } from '@cdr/shared';

import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  DYNAMIC_CATALOG_REPOSITORY,
  type DynamicCatalogRepositoryPort,
  type CatalogWorkbookColumnFilter,
  type CatalogWorkbookSort,
} from '../domain/ports/dynamic-catalog.repository.port';
import { catalogBusinessRoles } from './catalog-business-roles';
import { parseFilter } from './list-catalog-grid.use-case';

export interface ListCatalogWorkbookQuery {
  readonly categoryId?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly q?: string;
  readonly brand?: string;
  readonly status?: string;
  readonly applicationType?: string;
  readonly completeness?: 'complete' | 'attention' | 'critical';
  readonly filter: readonly string[];
  readonly columnFilter?: readonly string[];
  readonly sort?: string;
}

@Injectable()
export class ListCatalogWorkbookUseCase {
  constructor(
    @Inject(DYNAMIC_CATALOG_REPOSITORY)
    private readonly catalog: DynamicCatalogRepositoryPort,
  ) {}

  execute(query: ListCatalogWorkbookQuery, actor: AuthenticatedActor) {
    return this.catalog.listWorkbook({
      categoryId: query.categoryId ? assertUuid(query.categoryId, 'categoryId') : undefined,
      roles: catalogBusinessRoles(actor),
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      brand: query.brand,
      status: query.status,
      applicationType: query.applicationType,
      completeness: query.completeness,
      filters: query.filter.map(parseFilter),
      columnFilters: (query.columnFilter ?? []).map(parseWorkbookColumnFilter),
      sort: query.sort ? parseWorkbookSort(query.sort) : undefined,
    });
  }
}

const COLUMN_KEY = /^(?:base:[a-z]+|attribute:[a-z0-9_]+)$/u;

export function parseWorkbookColumnFilter(raw: string): CatalogWorkbookColumnFilter {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== 'object' ||
      !('key' in value) ||
      typeof value.key !== 'string' ||
      !COLUMN_KEY.test(value.key) ||
      !('values' in value) ||
      !Array.isArray(value.values) ||
      value.values.length === 0 ||
      value.values.length > 100 ||
      value.values.some((entry) => typeof entry !== 'string' || entry.length > 500)
    ) {
      throw new Error('shape');
    }
    return { key: value.key, values: [...new Set(value.values)] };
  } catch {
    throw new ValidationError('Invalid workbook column filter', { filter: raw });
  }
}

export function parseWorkbookSort(raw: string): CatalogWorkbookSort {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== 'object' ||
      !('key' in value) ||
      typeof value.key !== 'string' ||
      !COLUMN_KEY.test(value.key) ||
      !('direction' in value) ||
      (value.direction !== 'asc' && value.direction !== 'desc')
    ) {
      throw new Error('shape');
    }
    return { key: value.key, direction: value.direction };
  } catch {
    throw new ValidationError('Invalid workbook sort', { sort: raw });
  }
}
