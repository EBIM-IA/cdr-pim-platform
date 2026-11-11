import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, DependencyUnavailableError, isDomainError, type Uuid } from '@cdr/shared';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import type { ProductDraft, ProductDraftPort } from '../../domain/ports/product-draft.port';
import { productAttributeDrafts } from './product-drafts.tables';
import { recordAuditWithin } from './record-audit-within-transaction';

@Injectable()
export class DrizzleProductDraft implements ProductDraftPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(productId: Uuid, actorId: string): Promise<ProductDraft | null> {
    try {
      const [row] = await this.db
        .select()
        .from(productAttributeDrafts)
        .where(
          and(
            eq(productAttributeDrafts.productId, productId),
            eq(productAttributeDrafts.actorId, actorId),
          ),
        );
      return row
        ? { ...row, productId: row.productId as Uuid, templateId: row.templateId as Uuid }
        : null;
    } catch (error) {
      throw new DependencyUnavailableError('product drafts', error);
    }
  }

  async save(
    input: ProductDraft & { readonly actorId: string },
    audit: AuditEntry,
  ): Promise<ProductDraft> {
    try {
      return await this.db.transaction(async (tx) => {
        const values = {
          templateId: input.templateId,
          entries: input.entries,
          version: input.version + 1,
          updatedAt: audit.occurredAt,
        };
        const rows =
          input.version === 0
            ? await tx
                .insert(productAttributeDrafts)
                .values({ productId: input.productId, actorId: input.actorId, ...values })
                .onConflictDoNothing()
                .returning()
            : await tx
                .update(productAttributeDrafts)
                .set(values)
                .where(
                  and(
                    eq(productAttributeDrafts.productId, input.productId),
                    eq(productAttributeDrafts.actorId, input.actorId),
                    eq(productAttributeDrafts.version, input.version),
                  ),
                )
                .returning();
        const row = rows[0];
        if (!row)
          throw new ConflictError(
            'El borrador cambió en otra sesión. Recarga la ficha antes de continuar.',
          );
        await recordAuditWithin(tx, audit);
        return { ...row, productId: row.productId as Uuid, templateId: row.templateId as Uuid };
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('product drafts', error);
    }
  }
}
