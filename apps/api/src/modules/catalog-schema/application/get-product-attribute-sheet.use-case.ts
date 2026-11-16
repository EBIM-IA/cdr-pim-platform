import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, assertUuid } from '@cdr/shared';
import { actorHasCapability, Capability } from '../../identity/domain/entities/role';
import {
  TECHNICAL_SHEET_VISIBILITY,
  type TechnicalSheetVisibilityPort,
} from '../../product-assets/domain/ports/technical-sheet-visibility.port';

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
    @Inject(TECHNICAL_SHEET_VISIBILITY)
    private readonly visibility: TechnicalSheetVisibilityPort,
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
  async executeTechnicalSheet(rawProductId: string, actor: AuthenticatedActor) {
    const productId = assertUuid(rawProductId, 'productId');
    if (
      !actorHasCapability(actor, Capability.AdministrationManage) &&
      !(await this.visibility.get(productId)).visible
    )
      throw new NotFoundError('Product technical sheet', rawProductId);
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
