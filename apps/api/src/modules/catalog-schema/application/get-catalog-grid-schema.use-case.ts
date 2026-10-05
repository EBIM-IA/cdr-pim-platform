import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, assertUuid } from '@cdr/shared';

import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import type { DynamicCatalogSchema } from '../domain/entities/catalog-schema';
import {
  DYNAMIC_CATALOG_REPOSITORY,
  type DynamicCatalogRepositoryPort,
} from '../domain/ports/dynamic-catalog.repository.port';
import { catalogBusinessRoles } from './catalog-business-roles';

@Injectable()
export class GetCatalogGridSchemaUseCase {
  constructor(
    @Inject(DYNAMIC_CATALOG_REPOSITORY)
    private readonly catalog: DynamicCatalogRepositoryPort,
  ) {}

  async execute(rawCategoryId: string, actor: AuthenticatedActor): Promise<DynamicCatalogSchema> {
    const categoryId = assertUuid(rawCategoryId, 'categoryId');
    const schema = await this.catalog.getActiveSchema(categoryId, catalogBusinessRoles(actor));
    if (!schema) throw new NotFoundError('Active category template', rawCategoryId);
    return schema;
  }
}
