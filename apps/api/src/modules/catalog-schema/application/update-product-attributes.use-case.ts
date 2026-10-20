import { Inject, Injectable } from '@nestjs/common';
import {
  type Clock,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  assertUuid,
  getCorrelationId,
  newUuid,
} from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  type CatalogAttributeValue,
  AttributeValueSource,
  validateAttributeValue,
} from '../domain/entities/catalog-schema';
import {
  DYNAMIC_CATALOG_REPOSITORY,
  type DynamicCatalogRepositoryPort,
} from '../domain/ports/dynamic-catalog.repository.port';
import { catalogBusinessRoles } from './catalog-business-roles';
import type { UpdatedProductAttribute } from './update-product-attribute.use-case';

export interface ProductAttributeBatchItem {
  readonly attributeKey: string;
  readonly value: CatalogAttributeValue | null;
  readonly expectedVersion: number;
}

export interface UpdateProductAttributesCommand {
  readonly productId: string;
  readonly updates: readonly ProductAttributeBatchItem[];
}

export interface UpdatedProductAttributes {
  readonly productId: string;
  readonly attributes: readonly UpdatedProductAttribute[];
}

@Injectable()
export class UpdateProductAttributesUseCase {
  constructor(
    @Inject(DYNAMIC_CATALOG_REPOSITORY)
    private readonly catalog: DynamicCatalogRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    command: UpdateProductAttributesCommand,
    actor: AuthenticatedActor,
  ): Promise<UpdatedProductAttributes> {
    const productId = assertUuid(command.productId, 'productId');
    if (command.updates.length === 0) {
      throw new ValidationError('At least one attribute update is required');
    }
    const keys = command.updates.map((update) => update.attributeKey);
    if (new Set(keys).size !== keys.length) {
      throw new ValidationError('Each attribute may be updated only once per batch', {
        attributeKeys: keys,
      });
    }

    const roles = catalogBusinessRoles(actor);
    const assignments = await Promise.all(
      command.updates.map((update) =>
        this.catalog.findProductAttributeAssignment(productId, update.attributeKey, roles),
      ),
    );

    // Validate the complete command before opening the persistence transaction. The adapter
    // repeats these checks while holding database locks so policy changes cannot race the write.
    command.updates.forEach((update, index) => {
      const assignment = assignments[index];
      if (!assignment) {
        throw new NotFoundError('Assigned product attribute', update.attributeKey);
      }
      if (assignment.definition.sourceAuthority !== 'pim') {
        throw new ForbiddenError('This attribute is governed by an external source', {
          attributeKey: update.attributeKey,
          sourceAuthority: assignment.definition.sourceAuthority,
        });
      }
      validateAttributeValue(assignment.definition, update.value, false);
    });

    const now = this.clock.now();
    const result = await this.catalog.updateAttributes({
      productId,
      updates: command.updates,
      source: AttributeValueSource.Manual,
      roles,
      now,
      audit: {
        actorId: actor.id,
        correlationId: getCorrelationId() ?? newUuid(),
      },
    });
    if (result.kind === 'not_found') {
      throw new NotFoundError('Assigned product attribute', result.attributeKey);
    }
    if (result.kind === 'version_conflict') {
      const expectedVersion =
        command.updates.find((update) => update.attributeKey === result.attributeKey)
          ?.expectedVersion ?? 0;
      throw new ConflictError('An attribute was modified by another request', {
        productId,
        attributeKey: result.attributeKey,
        expectedVersion,
        actualVersion: result.actualVersion,
      });
    }

    return {
      productId,
      attributes: result.updates.map((update) => {
        const primary = update.changes.find((change) => change.productId === productId);
        if (!primary) throw new Error('Attribute repository did not return the requested product');
        return {
          productId,
          attributeKey: update.attributeKey,
          value: primary.after?.value ?? null,
          version: primary.after?.version ?? 0,
          source: primary.after?.source ?? AttributeValueSource.Manual,
          updatedAt: primary.after?.updatedAt ?? now,
          replicatedProductIds: update.changes
            .filter((change) => change.productId !== productId)
            .map((change) => change.productId),
        };
      }),
    };
  }
}
