import type { AxSyncRequest } from '@cdr/contracts';
import { ConflictError, newUuid } from '@cdr/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleAxInboxRepository } from '../../src/modules/ax-integration/infrastructure/persistence/drizzle-ax-inbox.repository';
import { type TestDatabase, createTestDatabase } from './database.helper';

const request: AxSyncRequest = {
  idLote: 'AX-DB-0001',
  fechaEnvio: '2026-10-21T12:00:00-05:00',
  sistemaOrigen: 'SISMETIC_AX',
  productos: [
    {
      codigoArticulo: '000123',
      codigoProveedor: 'PRV-01',
      codigoLinea: 'RODAMIENTOS',
      fechaModificacion: '2026-10-21T11:30:00-05:00',
    },
  ],
};

describe('DrizzleAxInboxRepository', () => {
  let database: TestDatabase;
  let repository: DrizzleAxInboxRepository;

  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new DrizzleAxInboxRepository(database.db);
  });
  beforeEach(() => database.truncateAll());
  afterAll(() => database.close());

  it('stores the batch and every raw product atomically', async () => {
    const input = inboxBatch(request, 'sha256:' + 'a'.repeat(64));
    await expect(repository.receive(input)).resolves.toMatchObject({
      idLote: request.idLote,
      recordCount: 1,
      requestHash: input.requestHash,
    });
    const loaded = await repository.findByExternalId(request.idLote);
    expect(loaded).toMatchObject({ idLote: request.idLote, sistemaOrigen: 'SISMETIC_AX' });
    const [record] = await database.sql<{ payload: AxSyncRequest['productos'][number] }[]>`
      SELECT payload FROM ax_inbound_records WHERE batch_id = ${input.id}
    `;
    expect(record?.payload).toEqual(request.productos[0]);
  });

  it('returns the original receipt for the same idLote and payload hash', async () => {
    const input = inboxBatch(request, 'sha256:' + 'b'.repeat(64));
    const first = await repository.receive(input);
    const second = await repository.receive({ ...input, id: newUuid(), recordIds: [newUuid()] });
    expect(second).toEqual(first);
    const [countRow] = await database.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM ax_inbound_batches
    `;
    expect(countRow?.count).toBe(1);
  });

  it('rejects reuse of idLote with different content', async () => {
    await repository.receive(inboxBatch(request, 'sha256:' + 'c'.repeat(64)));
    await expect(
      repository.receive(inboxBatch(request, 'sha256:' + 'd'.repeat(64))),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

function inboxBatch(batch: AxSyncRequest, requestHash: string) {
  return {
    id: newUuid(),
    recordIds: batch.productos.map(() => newUuid()),
    idLote: batch.idLote,
    fechaEnvio: new Date(batch.fechaEnvio),
    sistemaOrigen: batch.sistemaOrigen ?? null,
    productos: batch.productos,
    requestHash,
    receivedAt: new Date('2026-10-21T17:01:00.000Z'),
    correlationId: 'integration-test-correlation',
  };
}
