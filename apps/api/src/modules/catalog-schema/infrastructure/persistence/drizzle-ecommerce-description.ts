import { Inject, Injectable } from '@nestjs/common';
import { ecommerceDescriptionSchema } from '@cdr/contracts';
import { ConflictError, DependencyUnavailableError, isDomainError } from '@cdr/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { recordAuditWithinTransaction } from '../../../../shared/persistence/record-audit-within-transaction';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import type {
  EcommerceDescription,
  EcommerceDescriptionPort,
} from '../../domain/ports/ecommerce-description.port';
import { ecommerceDescriptions } from './ecommerce-descriptions.tables';
const storedDescriptionSchema = ecommerceDescriptionSchema
  .omit({ stale: true })
  .extend({ fingerprint: z.string().min(1).max(128), sourceKeys: z.array(z.string()).optional() });

@Injectable()
export class DrizzleEcommerceDescription implements EcommerceDescriptionPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async getMany(productIds: readonly string[]): Promise<EcommerceDescription[]> {
    if (!productIds.length) return [];
    try {
      const rows = await this.db
        .select()
        .from(ecommerceDescriptions)
        .where(inArray(ecommerceDescriptions.productId, [...new Set(productIds)]));
      return rows.map((row) => storedDescriptionSchema.parse(row.data));
    } catch (error) {
      throw new DependencyUnavailableError('ecommerce-descriptions', error);
    }
  }
  async get(productId: string, variantKey: string): Promise<EcommerceDescription | null> {
    try {
      const [row] = await this.db
        .select()
        .from(ecommerceDescriptions)
        .where(
          and(
            eq(ecommerceDescriptions.productId, productId),
            eq(ecommerceDescriptions.variantKey, variantKey),
          ),
        );
      if (!row) return null;
      return storedDescriptionSchema.parse(row.data);
    } catch (error) {
      throw new DependencyUnavailableError('ecommerce-descriptions', error);
    }
  }
  async save(
    value: EcommerceDescription,
    expectedVersion: number,
    audit: AuditEntry,
  ): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const values = {
          productId: value.productId,
          variantKey: value.variantKey,
          version: value.version,
          data: value,
        };
        const rows =
          expectedVersion === 0
            ? await tx
                .insert(ecommerceDescriptions)
                .values(values)
                .onConflictDoNothing()
                .returning()
            : await tx
                .update(ecommerceDescriptions)
                .set(values)
                .where(
                  and(
                    eq(ecommerceDescriptions.productId, value.productId),
                    eq(ecommerceDescriptions.variantKey, value.variantKey),
                    eq(ecommerceDescriptions.version, expectedVersion),
                  ),
                )
                .returning();
        if (!rows.length)
          throw new ConflictError('Otra persona actualizó este texto. Recarga antes de guardar.');
        await recordAuditWithinTransaction(tx, audit);
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('ecommerce-descriptions', error);
    }
  }
}
