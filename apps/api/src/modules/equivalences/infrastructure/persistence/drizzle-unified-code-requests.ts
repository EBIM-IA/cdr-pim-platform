import { Inject, Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  DependencyUnavailableError,
  isDomainError,
  type Uuid,
} from '@cdr/shared';
import { eq, desc } from 'drizzle-orm';
import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { recordAuditWithinTransaction } from '../../../../shared/persistence/record-audit-within-transaction';
import type {
  UnifiedCodeRequest,
  UnifiedCodeRequestsPort,
} from '../../domain/ports/unified-code-requests.port';
import { equivalenceGroups, equivalenceGroupMembers } from './equivalences.tables';
import { unifiedCodeRequests } from './unified-code-requests.tables';
@Injectable()
export class DrizzleUnifiedCodeRequests implements UnifiedCodeRequestsPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async list(sku?: string) {
    try {
      return (
        await this.db
          .select()
          .from(unifiedCodeRequests)
          .where(sku ? eq(unifiedCodeRequests.sku, sku) : undefined)
          .orderBy(desc(unifiedCodeRequests.createdAt))
          .limit(200)
      ).map(toRequest);
    } catch (error) {
      throw new DependencyUnavailableError('unified code requests', error);
    }
  }
  async create(
    request: UnifiedCodeRequest,
    audit: Parameters<UnifiedCodeRequestsPort['create']>[1],
  ) {
    try {
      return await this.db.transaction(async (tx) => {
        const groups = await tx
          .select({ code: equivalenceGroups.code })
          .from(equivalenceGroupMembers)
          .innerJoin(equivalenceGroups, eq(equivalenceGroups.id, equivalenceGroupMembers.groupId))
          .where(eq(equivalenceGroupMembers.productId, request.productId))
          .for('update');
        if (
          (request.currentCode && !groups.some((group) => group.code === request.currentCode)) ||
          (!request.currentCode && groups.length)
        )
          throw new ConflictError(
            'El grupo del SKU cambió; actualiza el catálogo antes de registrar la solicitud',
          );
        const [row] = await tx.insert(unifiedCodeRequests).values(request).returning();
        if (!row) throw new ConflictError('No se pudo registrar la solicitud');
        await recordAuditWithinTransaction(tx, {
          ...audit,
          changes: { request: { before: null, after: row } },
        });
        return toRequest(row);
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('unified code requests', error);
    }
  }
  async update(
    id: Uuid,
    input: Parameters<UnifiedCodeRequestsPort['update']>[1],
    audit: Parameters<UnifiedCodeRequestsPort['update']>[2],
  ) {
    try {
      return await this.db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(unifiedCodeRequests)
          .where(eq(unifiedCodeRequests.id, id))
          .for('update');
        if (!before) throw new NotFoundError('Unified code request', id);
        if (before.version !== input.expectedVersion)
          throw new ConflictError('Otra persona modificó la solicitud; actualiza la cola');
        const [after] = await tx
          .update(unifiedCodeRequests)
          .set({
            action: input.action,
            proposedCode: input.proposedCode,
            reason: input.reason,
            version: before.version + 1,
            updatedAt: input.updatedAt,
          })
          .where(eq(unifiedCodeRequests.id, id))
          .returning();
        if (!after) throw new ConflictError('No se pudo actualizar la solicitud');
        await recordAuditWithinTransaction(tx, {
          ...audit,
          changes: { request: { before, after } },
        });
        return toRequest(after);
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('unified code requests', error);
    }
  }
}
function toRequest(row: typeof unifiedCodeRequests.$inferSelect): UnifiedCodeRequest {
  return {
    ...row,
    id: row.id as Uuid,
    productId: row.productId as Uuid,
    action: row.action as UnifiedCodeRequest['action'],
    status: 'pending_dispatch',
  };
}
