import { Inject, Injectable } from '@nestjs/common';
import {
  createDefaultPdfDesignConfig,
  pdfDesignSettingsSchema,
  type PdfDesignSettingsDto,
} from '@cdr/contracts';
import { ConflictError, DependencyUnavailableError, isDomainError } from '@cdr/shared';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import type { PdfDesignSettingsPort } from '../../domain/ports/pdf-design-settings.port';
import { pdfDesignSettings } from './pdf-design-settings.tables';
import { recordAuditWithin } from './record-audit-within-transaction';
@Injectable()
export class DrizzlePdfDesignSettings implements PdfDesignSettingsPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async get(): Promise<PdfDesignSettingsDto> {
    try {
      const [row] = await this.db
        .select()
        .from(pdfDesignSettings)
        .where(eq(pdfDesignSettings.id, 'default'));
      return row
        ? pdfDesignSettingsSchema.parse({
            config: row.config,
            updatedAt: row.updatedAt.toISOString(),
          })
        : { config: createDefaultPdfDesignConfig(), updatedAt: null };
    } catch (error) {
      throw new DependencyUnavailableError('pdf-design settings', error);
    }
  }
  async save(input: PdfDesignSettingsDto, audit: AuditEntry): Promise<PdfDesignSettingsDto> {
    try {
      return await this.db.transaction(async (tx) => {
        const updatedAt = new Date(
          Math.max(
            audit.occurredAt.getTime(),
            input.updatedAt ? new Date(input.updatedAt).getTime() + 1 : 0,
          ),
        );
        const values = { config: input.config, updatedAt };
        const rows =
          input.updatedAt === null
            ? await tx
                .insert(pdfDesignSettings)
                .values({ id: 'default', ...values })
                .onConflictDoNothing()
                .returning()
            : await tx
                .update(pdfDesignSettings)
                .set(values)
                .where(
                  and(
                    eq(pdfDesignSettings.id, 'default'),
                    eq(pdfDesignSettings.updatedAt, new Date(input.updatedAt)),
                  ),
                )
                .returning();
        if (!rows.length)
          throw new ConflictError(
            'Otra persona cambió los diseños. Recarga la configuración antes de guardar.',
          );
        await recordAuditWithin(tx, audit);
        return { config: input.config, updatedAt: updatedAt.toISOString() };
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('pdf-design settings', error);
    }
  }
}
