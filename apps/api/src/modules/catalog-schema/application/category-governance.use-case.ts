import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, getCorrelationId, newUuid, type Clock } from '@cdr/shared';
import type { CategoryTreeImportRow, SaveCategoryDynamicAttribute } from '@cdr/contracts';
import { CLOCK } from '../../../shared/tokens';
import {
  Capability,
  actorHasCapability,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import {
  CATEGORY_GOVERNANCE,
  type CategoryGovernancePort,
} from '../domain/ports/category-governance.port';
@Injectable()
export class CategoryGovernanceUseCase {
  constructor(
    @Inject(CATEGORY_GOVERNANCE) private readonly repository: CategoryGovernancePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  read() {
    return this.repository.read();
  }
  importTree(
    rows: readonly CategoryTreeImportRow[],
    confirm: boolean,
    actor: AuthenticatedActor,
    expectedRevision?: string,
  ) {
    return this.repository.importTree(rows, confirm, this.audit(actor), expectedRevision);
  }
  async saveDynamicAttribute(input: SaveCategoryDynamicAttribute, actor: AuthenticatedActor) {
    await this.repository.saveDynamicAttribute(input, this.audit(actor));
    return this.read();
  }
  private audit(actor: AuthenticatedActor) {
    if (!actorHasCapability(actor, Capability.AdministrationManage))
      throw new ForbiddenError('Solo ADMINISTRADOR puede configurar categorías');
    return {
      actorId: actor.id,
      correlationId: getCorrelationId() ?? newUuid(),
      occurredAt: this.clock.now(),
    };
  }
}
