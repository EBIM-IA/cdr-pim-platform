import { Inject, Injectable } from '@nestjs/common';
import { productNameConfigSchema } from '@cdr/contracts';
import { ConflictError, DependencyUnavailableError, isDomainError } from '@cdr/shared';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import type {
  ProductNameSettings,
  ProductNameSettingsPort,
} from '../../domain/ports/product-name-settings.port';
import { DEFAULT_PRODUCT_NAME_CONFIG } from '../../domain/services/product-naming';
import { productNameSettings } from './product-name-settings.tables';
import { recordAuditWithin } from './record-audit-within-transaction';

@Injectable()
export class DrizzleProductNameSettings implements ProductNameSettingsPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(): Promise<ProductNameSettings> {
    try {
      const [row] = await this.db
        .select()
        .from(productNameSettings)
        .where(eq(productNameSettings.id, 'product-name'));
      return row
        ? { config: productNameConfigSchema.parse(row.config), version: row.version }
        : { config: structuredClone(DEFAULT_PRODUCT_NAME_CONFIG), version: 0 };
    } catch (error) {
      throw new DependencyUnavailableError('product-name settings', error);
    }
  }

  async save(input: ProductNameSettings, audit: AuditEntry): Promise<ProductNameSettings> {
    try {
      return await this.db.transaction(async (tx) => {
        const values = {
          config: input.config,
          version: input.version + 1,
          updatedAt: audit.occurredAt,
        };
        const rows =
          input.version === 0
            ? await tx
                .insert(productNameSettings)
                .values({ id: 'product-name', ...values })
                .onConflictDoNothing()
                .returning()
            : await tx
                .update(productNameSettings)
                .set(values)
                .where(
                  and(
                    eq(productNameSettings.id, 'product-name'),
                    eq(productNameSettings.version, input.version),
                  ),
                )
                .returning();
        if (!rows.length)
          throw new ConflictError(
            'Otra persona cambió las fórmulas. Recarga la configuración antes de guardar.',
          );
        await recordAuditWithin(tx, audit);
        return { config: input.config, version: values.version };
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('product-name settings', error);
    }
  }
}
