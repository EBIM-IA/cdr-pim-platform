import { Inject, Injectable } from '@nestjs/common';
import type { QualitySimulationInput } from '@cdr/contracts';
import { assertUuid, ForbiddenError, NotFoundError, ValidationError } from '@cdr/shared';
import {
  DYNAMIC_CATALOG_REPOSITORY,
  type DynamicCatalogRepositoryPort,
} from '../../catalog-schema/domain/ports/dynamic-catalog.repository.port';
import { validateAttributeValue } from '../../catalog-schema/domain/entities/catalog-schema';
import {
  PRODUCT_ASSET_REPOSITORY,
  type ProductAssetRepositoryPort,
} from '../../product-assets/domain/ports/product-asset-repository.port';
import {
  actorHasCapability,
  Capability,
  normalizeBusinessRole,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
@Injectable()
export class SimulateQualityUseCase {
  constructor(
    @Inject(DYNAMIC_CATALOG_REPOSITORY) private readonly catalog: DynamicCatalogRepositoryPort,
    @Inject(PRODUCT_ASSET_REPOSITORY) private readonly assets: ProductAssetRepositoryPort,
  ) {}
  async execute(input: QualitySimulationInput, actor: AuthenticatedActor) {
    if (!actorHasCapability(actor, Capability.AdministrationManage))
      throw new ForbiddenError('Solo Administración puede simular la carga.');
    const productId = assertUuid(input.productId);
    const sheet = await this.catalog.getProductSheet(
      productId,
      actor.roles.map(normalizeBusinessRole),
    );
    if (!sheet) throw new NotFoundError('ProductAttributeSheet', productId);
    const assets = await this.assets.listByProductId(productId);
    const currentAssets = new Set(
      assets
        .filter((value) => !value.toSnapshot().deletedAt)
        .map((value) => value.toSnapshot().type),
    );
    const current = Object.fromEntries(
      Object.entries(sheet.product.attributes).map(([key, cell]) => [key, cell.value]),
    );
    for (const [key, value] of Object.entries(input.values)) {
      const definition = sheet.schema.attributes.find((attribute) => attribute.key === key);
      if (!definition)
        throw new ValidationError('El atributo no pertenece a la plantilla.', {
          attributeKey: key,
        });
      if (!definition.permissions.edit || definition.sourceAuthority === 'erp')
        throw new ForbiddenError('Los datos ERP no se modifican en la simulación.');
      validateAttributeValue(definition, value, false);
    }
    const required = sheet.schema.attributes.filter((value) => value.required);
    const requiredAssets = (sheet.assetRequirements ?? []).filter((value) => value.required);
    const score = (values: typeof current, types: Set<string>) => {
      const missing = [
        ...required
          .filter((attribute) => {
            const value = values[attribute.key];
            return (
              value === null ||
              value === undefined ||
              (typeof value === 'string' && value.trim() === '')
            );
          })
          .map((value) => value.label),
        ...requiredAssets.filter((value) => !types.has(value.type)).map((value) => value.type),
      ];
      const count = required.length + requiredAssets.length;
      return {
        required: count,
        completed: count - missing.length,
        percentage: count ? Math.round(((count - missing.length) * 100) / count) : 100,
        missing,
      };
    };
    return {
      productId,
      persisted: false as const,
      before: score(current, currentAssets),
      after: score(
        { ...current, ...input.values },
        input.assets ? new Set(input.assets) : currentAssets,
      ),
    };
  }
}
