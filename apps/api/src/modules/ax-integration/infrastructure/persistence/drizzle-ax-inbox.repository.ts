import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, DependencyUnavailableError, isDomainError } from '@cdr/shared';
import { eq } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import type {
  AxInboxBatch,
  AxInboxReceipt,
  AxInboxRepositoryPort,
} from '../../domain/ports/ax-inbox.repository.port';
import {
  axInboundBatches,
  axInboundRecords,
  type AxInboundBatchRow,
} from './ax-integration.tables';

@Injectable()
export class DrizzleAxInboxRepository implements AxInboxRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async receive(batch: AxInboxBatch): Promise<AxInboxReceipt> {
    try {
      return await this.db.transaction(async (transaction) => {
        const [inserted] = await transaction
          .insert(axInboundBatches)
          .values({
            id: batch.id,
            externalBatchId: batch.idLote,
            sentAt: batch.fechaEnvio,
            sourceSystem: batch.sistemaOrigen,
            requestHash: batch.requestHash,
            status: 'received',
            recordCount: batch.productos.length,
            correlationId: batch.correlationId,
            receivedAt: batch.receivedAt,
          })
          .onConflictDoNothing()
          .returning();

        if (inserted) {
          await transaction.insert(axInboundRecords).values(
            batch.productos.map((product, index) => ({
              id: batch.recordIds[index]!,
              batchId: batch.id,
              rowNumber: index + 1,
              itemCode: product.codigoArticulo,
              supplierCode: product.codigoProveedor,
              sourceModifiedAt: product.fechaModificacion
                ? new Date(product.fechaModificacion)
                : null,
              payload: product,
            })),
          );
          return toReceipt(inserted);
        }

        const [winner] = await transaction
          .select()
          .from(axInboundBatches)
          .where(eq(axInboundBatches.externalBatchId, batch.idLote))
          .limit(1);
        if (!winner) throw new Error('Idempotent AX inbox insert lost without a winning row');
        if (winner.requestHash !== batch.requestHash) {
          throw new ConflictError('The AX batch id was already used with different content', {
            idLote: batch.idLote,
          });
        }
        return toReceipt(winner);
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('ax-inbox-database', error);
    }
  }

  async findByExternalId(idLote: string): Promise<AxInboxReceipt | null> {
    try {
      const [row] = await this.db
        .select()
        .from(axInboundBatches)
        .where(eq(axInboundBatches.externalBatchId, idLote))
        .limit(1);
      return row ? toReceipt(row) : null;
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('ax-inbox-database', error);
    }
  }
}

function toReceipt(row: AxInboundBatchRow): AxInboxReceipt {
  return {
    idLote: row.externalBatchId,
    fechaEnvio: row.sentAt,
    sistemaOrigen: row.sourceSystem,
    requestHash: row.requestHash,
    receivedAt: row.receivedAt,
    correlationId: row.correlationId,
    recordCount: row.recordCount,
  };
}
