import { Inject, Injectable } from '@nestjs/common';
import { catalogHomeConfigSchema } from '@cdr/contracts';
import { ConflictError, DependencyUnavailableError, isDomainError } from '@cdr/shared';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import type {
  CatalogHomeSettings,
  CatalogHomeSettingsPort,
} from '../../domain/ports/catalog-home-settings.port';
import { catalogHomeSettings } from './catalog-home-settings.tables';
import { recordAuditWithin } from './record-audit-within-transaction';

@Injectable()
export class DrizzleCatalogHomeSettings implements CatalogHomeSettingsPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(): Promise<CatalogHomeSettings> {
    try {
      const [row] = await this.db
        .select()
        .from(catalogHomeSettings)
        .where(eq(catalogHomeSettings.id, 'catalog-home'));
      return row
        ? { config: catalogHomeConfigSchema.parse(row.config), version: row.version }
        : { config: { brands: [], categories: [] }, version: 0 };
    } catch (error) {
      throw new DependencyUnavailableError('catalog-home settings', error);
    }
  }

  async save(input: CatalogHomeSettings, audit: AuditEntry): Promise<CatalogHomeSettings> {
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
                .insert(catalogHomeSettings)
                .values({ id: 'catalog-home', ...values })
                .onConflictDoNothing()
                .returning()
            : await tx
                .update(catalogHomeSettings)
                .set(values)
                .where(
                  and(
                    eq(catalogHomeSettings.id, 'catalog-home'),
                    eq(catalogHomeSettings.version, input.version),
                  ),
                )
                .returning();
        if (!rows.length)
          throw new ConflictError(
            'Otra persona cambió el Inicio. Recarga la configuración antes de guardar.',
          );
        await recordAuditWithin(tx, audit);
        return { config: input.config, version: values.version };
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('catalog-home settings', error);
    }
  }
}
