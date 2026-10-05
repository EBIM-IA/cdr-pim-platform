import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, assertUuid } from '@cdr/shared';

import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  DYNAMIC_CATALOG_REPOSITORY,
  type DynamicCatalogRepositoryPort,
} from '../domain/ports/dynamic-catalog.repository.port';
import { catalogBusinessRoles } from './catalog-business-roles';

@Injectable()
export class GetProductAttributeSheetUseCase {
  constructor(
    @Inject(DYNAMIC_CATALOG_REPOSITORY)
    private readonly catalog: DynamicCatalogRepositoryPort,
  ) {}

  async execute(rawProductId: string, actor: AuthenticatedActor) {
    const productId = assertUuid(rawProductId, 'productId');
    const sheet = await this.catalog.getProductSheet(productId, catalogBusinessRoles(actor));
    if (!sheet) throw new NotFoundError('Product attribute sheet', rawProductId);
    return sheet;
  }
}
