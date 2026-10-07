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
import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  type AttributeValueSource,
  AttributeValueSource as AttributeValueSourceValue,
  type CatalogAttributeValue,
  validateAttributeValue,
} from '../domain/entities/catalog-schema';
import {
  DYNAMIC_CATALOG_REPOSITORY,
  type DynamicCatalogRepositoryPort,
} from '../domain/ports/dynamic-catalog.repository.port';
import { catalogBusinessRoles } from './catalog-business-roles';

export interface UpdateProductAttributeCommand {
  readonly productId: string;
  readonly attributeKey: string;
  readonly value: CatalogAttributeValue | null;
  readonly expectedVersion: number;
}

export interface UpdatedProductAttribute {
  readonly productId: string;
  readonly attributeKey: string;
  readonly value: CatalogAttributeValue | null;
  readonly version: number;
  readonly source: AttributeValueSource;
  readonly updatedAt: Date;
  readonly replicatedProductIds: readonly string[];
}

@Injectable()
export class UpdateProductAttributeUseCase {
  constructor(
    @Inject(DYNAMIC_CATALOG_REPOSITORY)
    private readonly catalog: DynamicCatalogRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    command: UpdateProductAttributeCommand,
    actor: AuthenticatedActor,
  ): Promise<UpdatedProductAttribute> {
    const productId = assertUuid(command.productId, 'productId');
    const assignment = await this.catalog.findProductAttributeAssignment(
      productId,
      command.attributeKey,
      catalogBusinessRoles(actor),
    );
    if (!assignment) {
      throw new NotFoundError('Assigned product attribute', command.attributeKey);
    }
    if (assignment.definition.sourceAuthority !== 'pim') {
      throw new ForbiddenError('This attribute is governed by an external source', {
        attributeKey: command.attributeKey,
        sourceAuthority: assignment.definition.sourceAuthority,
      });
    }
    // A null is an explicit, versioned tombstone. It is allowed for required fields so the
    // product can be moved back to review and reported as incomplete instead of hiding the gap.
    validateAttributeValue(assignment.definition, command.value, false);

    const now = this.clock.now();
    const result = await this.catalog.updateAttribute({
      productId,
      attributeKey: command.attributeKey,
      value: command.value,
      source: AttributeValueSourceValue.Manual,
      expectedVersion: command.expectedVersion,
      roles: catalogBusinessRoles(actor),
      now,
      audit: {
        actorId: actor.id,
        correlationId: getCorrelationId() ?? newUuid(),
      },
    });
    if (result.kind === 'not_found') {
      throw new NotFoundError('Assigned product attribute', command.attributeKey);
    }
    if (result.kind === 'version_conflict') {
      throw new ConflictError('The attribute was modified by another request', {
        productId,
        attributeKey: command.attributeKey,
        expectedVersion: command.expectedVersion,
        actualVersion: result.actualVersion,
      });
    }

    const primary = result.changes.find((change) => change.productId === productId);
    if (!primary) throw new Error('Attribute repository did not return the requested product');
    return {
      productId,
      attributeKey: command.attributeKey,
      value: primary.after?.value ?? null,
      version: primary.after?.version ?? 0,
      source: primary.after?.source ?? AttributeValueSourceValue.Manual,
      updatedAt: primary.after?.updatedAt ?? now,
      replicatedProductIds: result.changes
        .filter((change) => change.productId !== productId)
        .map((change) => change.productId),
    };
  }
}
