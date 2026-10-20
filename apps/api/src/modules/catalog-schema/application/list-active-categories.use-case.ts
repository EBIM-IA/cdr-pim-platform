import { Inject, Injectable } from '@nestjs/common';

import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  DYNAMIC_CATALOG_REPOSITORY,
  type DynamicCatalogRepositoryPort,
} from '../domain/ports/dynamic-catalog.repository.port';
import { catalogBusinessRoles } from './catalog-business-roles';

@Injectable()
export class ListActiveCategoriesUseCase {
  constructor(
    @Inject(DYNAMIC_CATALOG_REPOSITORY)
    private readonly catalog: DynamicCatalogRepositoryPort,
  ) {}

  execute(
    actor: AuthenticatedActor,
  ): ReturnType<DynamicCatalogRepositoryPort['listActiveCategories']> {
    return this.catalog.listActiveCategories(catalogBusinessRoles(actor));
  }
}
