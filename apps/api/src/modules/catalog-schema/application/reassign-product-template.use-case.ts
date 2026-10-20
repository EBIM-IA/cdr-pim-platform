import { Inject, Injectable } from '@nestjs/common';
import {
  type Clock,
  ConflictError,
  NotFoundError,
  ValidationError,
  assertUuid,
  getCorrelationId,
  newUuid,
} from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  PRODUCT_TEMPLATE_ASSIGNMENT_REPOSITORY,
  type ProductTemplateAssignment,
  type ProductTemplateAssignmentRepositoryPort,
} from '../domain/ports/product-template-assignment.repository.port';
import { catalogBusinessRoles } from './catalog-business-roles';

export interface ReassignProductTemplateCommand {
  readonly productId: string;
  readonly templateId: string;
  readonly expectedTemplateId: string;
}

export interface ReassignedProductTemplate extends ProductTemplateAssignment {
  readonly previousTemplateId: string;
}

@Injectable()
export class ReassignProductTemplateUseCase {
  constructor(
    @Inject(PRODUCT_TEMPLATE_ASSIGNMENT_REPOSITORY)
    private readonly assignments: ProductTemplateAssignmentRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    command: ReassignProductTemplateCommand,
    actor: AuthenticatedActor,
  ): Promise<ReassignedProductTemplate> {
    const productId = assertUuid(command.productId, 'productId');
    const templateId = assertUuid(command.templateId, 'templateId');
    const expectedTemplateId = assertUuid(command.expectedTemplateId, 'expectedTemplateId');
    const result = await this.assignments.reassign({
      productId,
      templateId,
      expectedTemplateId,
      roles: catalogBusinessRoles(actor),
      now: this.clock.now(),
      audit: {
        actorId: actor.id,
        correlationId: getCorrelationId() ?? newUuid(),
      },
    });

    switch (result.kind) {
      case 'product_not_found':
        throw new NotFoundError('Product template assignment', productId);
      case 'template_not_found':
        throw new NotFoundError('Active attribute template', templateId);
      case 'different_category':
        throw new ValidationError('The target template must belong to the current category', {
          productId,
          templateId,
        });
      case 'version_conflict':
        throw new ConflictError('The product template was modified by another request', {
          productId,
          expectedTemplateId,
          currentTemplateId: result.currentTemplateId,
        });
      case 'updated':
        return { ...result.assignment, previousTemplateId: result.previousTemplateId };
    }
  }
}
