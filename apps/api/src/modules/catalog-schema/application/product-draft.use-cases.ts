import { Inject, Injectable } from '@nestjs/common';
import {
  type Clock,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  assertUuid,
  getCorrelationId,
  newUuid,
} from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import { createAuditEntry } from '../../audit/domain/entities/audit-entry';
import {
  Capability,
  actorHasCapability,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import {
  DYNAMIC_CATALOG_REPOSITORY,
  type DynamicCatalogRepositoryPort,
} from '../domain/ports/dynamic-catalog.repository.port';
import {
  PRODUCT_DRAFT,
  type ProductDraftPort,
  type ProductDraftEntry,
} from '../domain/ports/product-draft.port';
import { catalogBusinessRoles } from './catalog-business-roles';

@Injectable()
export class ProductDraftUseCases {
  constructor(
    @Inject(PRODUCT_DRAFT) private readonly drafts: ProductDraftPort,
    @Inject(DYNAMIC_CATALOG_REPOSITORY) private readonly catalog: DynamicCatalogRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async sheet(rawProductId: string, actor: AuthenticatedActor) {
    if (!actorHasCapability(actor, Capability.AttributesWrite))
      throw new ForbiddenError('No puedes editar atributos de producto.');
    const productId = assertUuid(rawProductId, 'productId');
    const sheet = await this.catalog.getProductSheet(productId, catalogBusinessRoles(actor));
    if (!sheet) throw new NotFoundError('Product attribute sheet', productId);
    return { productId, sheet };
  }

  async get(rawProductId: string, actor: AuthenticatedActor) {
    const { productId, sheet } = await this.sheet(rawProductId, actor);
    const draft = await this.drafts.get(productId, actor.id);
    const editable = new Set(
      sheet.schema.attributes
        .filter((attribute) => attribute.permissions.edit && attribute.sourceAuthority === 'pim')
        .map((attribute) => attribute.key),
    );
    return draft
      ? { ...draft, entries: draft.entries.filter((entry) => editable.has(entry.attributeKey)) }
      : {
          productId,
          templateId: sheet.schema.template.id,
          version: 0,
          entries: [],
          updatedAt: null,
        };
  }

  async save(
    rawProductId: string,
    input: { templateId: string; expectedVersion: number; entries: readonly ProductDraftEntry[] },
    actor: AuthenticatedActor,
  ) {
    const { productId, sheet } = await this.sheet(rawProductId, actor);
    if (sheet.schema.template.id !== input.templateId)
      throw new ConflictError(
        'La plantilla cambió. Recarga la ficha antes de guardar el borrador.',
      );
    const editable = new Set(
      sheet.schema.attributes
        .filter((attribute) => attribute.permissions.edit && attribute.sourceAuthority === 'pim')
        .map((attribute) => attribute.key),
    );
    if (input.entries.some((entry) => !editable.has(entry.attributeKey)))
      throw new ForbiddenError('El borrador contiene atributos no editables.');
    const now = this.clock.now();
    return this.drafts.save(
      {
        productId,
        actorId: actor.id,
        templateId: assertUuid(input.templateId, 'templateId'),
        version: input.expectedVersion,
        entries: input.entries,
        updatedAt: now,
      },
      createAuditEntry({
        resourceType: 'product_draft',
        resourceId: `${productId}:${actor.id}`,
        action: 'updated',
        actorId: actor.id,
        source: 'api',
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt: now,
        changes: { entries: { after: input.entries } },
      }),
    );
  }
}
