import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  DependencyUnavailableError,
  isDomainError,
  type Uuid,
} from '@cdr/shared';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '../../../../shared/tokens';
import type { Database } from '../../../../database/drizzle.client';
import { createAuditEntry, AuditAction } from '../../../audit/domain/entities/audit-entry';
import type {
  CatalogParameter,
  CatalogParametersPort,
  CatalogParameterKind,
} from '../../domain/ports/catalog-parameters.port';
import { catalogParameters } from './catalog-parameters.tables';
import { recordAuditWithin } from './record-audit-within-transaction';
@Injectable()
export class DrizzleCatalogParameters implements CatalogParametersPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async list(kind: CatalogParameterKind) {
    try {
      return (
        await this.db
          .select()
          .from(catalogParameters)
          .where(eq(catalogParameters.kind, kind))
          .orderBy(catalogParameters.value)
      ).map(toParameter);
    } catch (error) {
      throw new DependencyUnavailableError('catalog parameters', error);
    }
  }
  async save(input: Parameters<CatalogParametersPort['save']>[0]) {
    try {
      return await this.db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(catalogParameters)
          .where(eq(catalogParameters.id, input.id))
          .for('update');
        if (input.expectedVersion > 0 && (!before || before.kind !== input.kind))
          throw new NotFoundError('Catalog parameter', input.id);
        if (before && before.version !== input.expectedVersion)
          throw new ConflictError(
            'Otra persona modificó el parámetro. Actualiza la lista antes de guardar.',
          );
        const values = {
          kind: input.kind,
          value: input.value,
          description: input.description,
          target: input.target,
          logoDataUrl: input.logoDataUrl,
          active: input.active,
          version: input.expectedVersion + 1,
          updatedAt: input.audit.occurredAt,
        };
        const [saved] = before
          ? await tx
              .update(catalogParameters)
              .set(values)
              .where(
                and(
                  eq(catalogParameters.id, input.id),
                  eq(catalogParameters.version, input.expectedVersion),
                ),
              )
              .returning()
          : await tx
              .insert(catalogParameters)
              .values({ id: input.id, ...values })
              .returning();
        if (!saved) throw new ConflictError('El parámetro cambió en otra solicitud');
        await recordAuditWithin(
          tx,
          createAuditEntry({
            resourceType: 'catalog_parameter',
            resourceId: input.id,
            action: before ? AuditAction.Updated : AuditAction.Created,
            actorId: input.audit.actorId,
            source: 'api',
            correlationId: input.audit.correlationId,
            occurredAt: input.audit.occurredAt,
            changes: {
              configuration: {
                before: before ? auditValue(before) : null,
                after: auditValue(saved),
              },
            },
          }),
        );
        return toParameter(saved);
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : error;
      if (cause && typeof cause === 'object' && 'code' in cause && cause.code === '23505')
        throw new ConflictError('Ya existe ese valor en el catálogo');
      throw new DependencyUnavailableError('catalog parameters', error);
    }
  }
}
function toParameter(row: typeof catalogParameters.$inferSelect): CatalogParameter {
  return { ...row, id: row.id as Uuid, kind: row.kind as CatalogParameterKind };
}
function auditValue(row: typeof catalogParameters.$inferSelect) {
  const { logoDataUrl, ...rest } = row;
  return {
    ...rest,
    hasLogo: Boolean(logoDataUrl),
    logoFingerprint: logoDataUrl ? createHash('sha256').update(logoDataUrl).digest('hex') : null,
  };
}
