import { Inject, Injectable } from '@nestjs/common';
import { type Clock, ConflictError, getCorrelationId, newUuid } from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import { AuditAction, createAuditEntry } from '../../audit/domain/entities/audit-entry';
import { AUDIT_PORT, type AuditPort } from '../../audit/domain/ports/audit.port';
import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import { Product } from '../domain/entities/product';
import {
  PRODUCT_REPOSITORY,
  type ProductRepositoryPort,
} from '../domain/ports/product-repository.port';

export interface CreateProductCommand {
  readonly sku: string;
  readonly name: string;
  readonly description?: string;
  readonly brand?: string;
}

@Injectable()
export class CreateProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async execute(command: CreateProductCommand, actor: AuthenticatedActor): Promise<Product> {
    const now = this.clock.now();
    const product = Product.create({
      sku: command.sku,
      name: command.name,
      description: command.description ?? null,
      brand: command.brand ?? null,
      now,
    });

    // Checked here for a clear error message; the unique index on `products.sku` remains
    // the authority, because this check is not race-free on its own.
    if (await this.products.findBySku(product.sku)) {
      throw new ConflictError('A product with this SKU already exists', { sku: product.sku });
    }

    await this.products.save(product);
    await this.audit.record(
      createAuditEntry({
        resourceType: 'product',
        resourceId: product.id,
        action: AuditAction.Created,
        actorId: actor.id,
        source: 'api',
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt: now,
        changes: {
          sku: { after: product.sku },
          name: { after: product.name },
          description: { after: product.description },
          brand: { after: product.brand },
          status: { after: product.status },
        },
      }),
    );
    return product;
  }
}
