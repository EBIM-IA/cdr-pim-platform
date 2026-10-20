import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError, assertUuid } from '@cdr/shared';

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

  async execute(
    rawCategoryId: string,
    selector: { readonly templateId?: string; readonly variantKey?: string },
    actor: AuthenticatedActor,
  ): Promise<DynamicCatalogSchema> {
    const categoryId = assertUuid(rawCategoryId, 'categoryId');
    if (Boolean(selector.templateId) === Boolean(selector.variantKey)) {
      throw new ValidationError('Exactly one template selector is required');
    }
    const templateSelector = selector.templateId
      ? { templateId: assertUuid(selector.templateId, 'templateId') }
      : { variantKey: selector.variantKey as string };
    const schema = await this.catalog.getActiveSchema(
      categoryId,
      templateSelector,
      catalogBusinessRoles(actor),
    );
    if (!schema) throw new NotFoundError('Active category template', rawCategoryId);
    return schema;
  }
}
