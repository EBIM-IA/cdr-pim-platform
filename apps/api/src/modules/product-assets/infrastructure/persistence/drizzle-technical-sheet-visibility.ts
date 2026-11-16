import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, DependencyUnavailableError, isDomainError, type Uuid } from '@cdr/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import type {
  TechnicalSheetVisibility,
  TechnicalSheetVisibilityPort,
} from '../../domain/ports/technical-sheet-visibility.port';
import { recordAssetAuditWithin } from './record-asset-audit-within-transaction';
import { productTechnicalSheetVisibility } from './technical-sheet-visibility.tables';

@Injectable()
export class DrizzleTechnicalSheetVisibility implements TechnicalSheetVisibilityPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(productId: Uuid): Promise<TechnicalSheetVisibility> {
    return (await this.getMany([productId]))[0]!;
  }

  async getMany(productIds: readonly Uuid[]): Promise<TechnicalSheetVisibility[]> {
    if (!productIds.length) return [];
    try {
      const rows = await this.db
        .select()
        .from(productTechnicalSheetVisibility)
        .where(inArray(productTechnicalSheetVisibility.productId, [...productIds]));
      const byId = new Map(rows.map((row) => [row.productId, row]));
      return productIds.map((productId) => {
        const row = byId.get(productId);
        return { productId, visible: row?.visible ?? true, version: row?.version ?? 0 };
      });
    } catch (error) {
      throw new DependencyUnavailableError('technical-sheet visibility', error);
    }
  }

  async save(
    input: TechnicalSheetVisibility,
    audit: AuditEntry,
  ): Promise<TechnicalSheetVisibility> {
    try {
      return await this.db.transaction(async (tx) => {
        const values = {
          visible: input.visible,
          version: input.version + 1,
          updatedAt: audit.occurredAt,
        };
        const rows =
          input.version === 0
            ? await tx
                .insert(productTechnicalSheetVisibility)
                .values({ productId: input.productId, ...values })
                .onConflictDoNothing()
                .returning()
            : await tx
                .update(productTechnicalSheetVisibility)
                .set(values)
                .where(
                  and(
                    eq(productTechnicalSheetVisibility.productId, input.productId),
                    eq(productTechnicalSheetVisibility.version, input.version),
                  ),
                )
                .returning();
        if (!rows.length)
          throw new ConflictError('La visibilidad cambió. Recarga la ficha antes de guardar.');
        await recordAssetAuditWithin(tx, audit);
        return { productId: input.productId, visible: input.visible, version: values.version };
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('technical-sheet visibility', error);
    }
  }
}
