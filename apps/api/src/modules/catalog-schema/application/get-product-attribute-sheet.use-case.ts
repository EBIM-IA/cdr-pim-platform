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

  /**
   * The customer-facing technical sheet is one commercial document, not a role-specific
   * screen export. The backend applies the explicit export permission and returns only
   * attributes configured for that document.
   */
  async executeTechnicalSheet(rawProductId: string) {
    const productId = assertUuid(rawProductId, 'productId');
    const sheet = await this.catalog.getProductSheet(productId, [
      'ADMINISTRADOR',
      'COMPRAS',
      'VENTAS',
    ]);
    if (!sheet) throw new NotFoundError('Product technical sheet', rawProductId);
    const attributes = sheet.schema.attributes.filter(
      (attribute) => attribute.includeInTechnicalSheet && attribute.permissions.export,
    );
    const exportedKeys = new Set(attributes.map((attribute) => attribute.key));
    return {
      schema: { ...sheet.schema, attributes },
      product: {
        ...sheet.product,
        attributes: Object.fromEntries(
          Object.entries(sheet.product.attributes).filter(([key]) => exportedKeys.has(key)),
        ),
      },
    };
  }
}
