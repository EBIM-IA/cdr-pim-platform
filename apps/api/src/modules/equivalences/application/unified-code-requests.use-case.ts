import { Inject, Injectable } from '@nestjs/common';
import {
  assertUuid,
  newUuid,
  getCorrelationId,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type Clock,
} from '@cdr/shared';
import { CLOCK } from '../../../shared/tokens';
import {
  actorHasCapability,
  Capability,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import { createAuditEntry, AuditAction } from '../../audit/domain/entities/audit-entry';
import {
  PRODUCT_REPOSITORY,
  type ProductRepositoryPort,
} from '../../catalog/domain/ports/product-repository.port';
import {
  UNIFIED_CODE_REQUESTS,
  type UnifiedCodeRequestsPort,
  type UnifiedCodeRequest,
} from '../domain/ports/unified-code-requests.port';
@Injectable()
export class UnifiedCodeRequestsUseCase {
  constructor(
    @Inject(UNIFIED_CODE_REQUESTS) private readonly requests: UnifiedCodeRequestsPort,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  private authorize(actor: AuthenticatedActor) {
    if (!actorHasCapability(actor, Capability.AdministrationManage))
      throw new ForbiddenError('Solo ADMINISTRADOR registra solicitudes de código unificador');
  }
  list(sku: string | undefined, actor: AuthenticatedActor) {
    this.authorize(actor);
    return this.requests.list(sku);
  }
  async create(
    input: {
      sku: string;
      currentCode: string | null;
      action: UnifiedCodeRequest['action'];
      proposedCode: string | null;
      reason: string;
    },
    actor: AuthenticatedActor,
  ) {
    this.authorize(actor);
    validate(input);
    const product = await this.products.findBySku(input.sku);
    if (!product) throw new NotFoundError('SKU', input.sku);
    const now = this.clock.now();
    const request: UnifiedCodeRequest = {
      ...input,
      id: newUuid(),
      productId: product.id,
      requestedBy: actor.id,
      status: 'pending_dispatch',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    return this.requests.create(request, this.audit(request.id, actor, now, AuditAction.Created));
  }
  update(
    id: string,
    input: {
      action: UnifiedCodeRequest['action'];
      proposedCode: string | null;
      reason: string;
      expectedVersion: number;
    },
    actor: AuthenticatedActor,
  ) {
    this.authorize(actor);
    validate(input);
    const now = this.clock.now();
    const requestId = assertUuid(id);
    return this.requests.update(
      requestId,
      { ...input, updatedAt: now },
      this.audit(requestId, actor, now, AuditAction.Updated),
    );
  }
  private audit(id: string, actor: AuthenticatedActor, now: Date, action: AuditAction) {
    return createAuditEntry({
      resourceType: 'unified_code_request',
      resourceId: id,
      action,
      actorId: actor.id,
      source: 'api',
      correlationId: getCorrelationId() ?? newUuid(),
      occurredAt: now,
      changes: {},
    });
  }
}
function validate(input: { action: string; proposedCode: string | null; reason: string }) {
  if (!input.reason.trim() || (input.action !== 'remove' && !input.proposedCode?.trim()))
    throw new ValidationError('Completa el código propuesto y el motivo de la solicitud');
}
