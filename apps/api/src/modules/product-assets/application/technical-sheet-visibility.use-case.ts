import { Inject, Injectable } from '@nestjs/common';
import {
  assertUuid,
  ForbiddenError,
  getCorrelationId,
  newUuid,
  NotFoundError,
  type Clock,
} from '@cdr/shared';
import type { UpdateTechnicalSheetVisibilityInput } from '@cdr/contracts';
import { CLOCK } from '../../../shared/tokens';
import { AuditAction, createAuditEntry } from '../../audit/domain/entities/audit-entry';
import {
  PRODUCT_REPOSITORY,
  type ProductRepositoryPort,
} from '../../catalog/domain/ports/product-repository.port';
import {
  actorHasCapability,
  Capability,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import {
  TECHNICAL_SHEET_VISIBILITY,
  type TechnicalSheetVisibilityPort,
} from '../domain/ports/technical-sheet-visibility.port';

@Injectable()
export class TechnicalSheetVisibilityUseCase {
  constructor(
    @Inject(TECHNICAL_SHEET_VISIBILITY) private readonly visibility: TechnicalSheetVisibilityPort,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(rawId: string) {
    const id = assertUuid(rawId, 'productId');
    if (!(await this.products.findById(id))) throw new NotFoundError('Product', rawId);
    return this.visibility.get(id);
  }

  async list(rawIds: readonly string[]) {
    return this.visibility.getMany(rawIds.map((id) => assertUuid(id, 'productId')));
  }

  async update(
    rawId: string,
    input: UpdateTechnicalSheetVisibilityInput,
    actor: AuthenticatedActor,
  ) {
    if (!actorHasCapability(actor, Capability.AdministrationManage)) throw new ForbiddenError();
    const current = await this.get(rawId);
    return this.visibility.save(
      { ...current, visible: input.visible, version: input.expectedVersion },
      createAuditEntry({
        resourceType: 'product',
        resourceId: current.productId,
        action: AuditAction.Updated,
        actorId: actor.id,
        source: 'api:technical-sheet-visibility',
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt: this.clock.now(),
        changes: { technicalSheetVisible: { before: current.visible, after: input.visible } },
      }),
    );
  }
}
