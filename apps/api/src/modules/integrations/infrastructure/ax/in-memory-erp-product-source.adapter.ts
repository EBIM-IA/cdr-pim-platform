import type {
  ErpProductPage,
  ErpProductRecord,
  ErpProductSourcePort,
} from '../../domain/ports/erp-product-source.port';

/**
 * Offline ERP source used for local development and tests.
 *
 * Its existence is what lets the AX_SYNC pipeline be built and tested *before* the real AX
 * connection exists — the whole point of putting a port at this boundary.
 */
export class InMemoryErpProductSource implements ErpProductSourcePort {
  constructor(private readonly records: ErpProductRecord[] = []) {}

  async fetchChangedSince(since: Date, cursor?: string): Promise<ErpProductPage> {
    const pageSize = 100;
    const offset = cursor ? Number(cursor) : 0;
    const changed = this.records
      .filter((record) => record.modifiedAt >= since)
      .sort((a, b) => a.modifiedAt.getTime() - b.modifiedAt.getTime());

    const page = changed.slice(offset, offset + pageSize);
    return {
      records: page,
      nextCursor: offset + pageSize < changed.length ? String(offset + pageSize) : null,
    };
  }

  async fetchByErpItemId(erpItemId: string): Promise<ErpProductRecord | null> {
    return this.records.find((record) => record.erpItemId === erpItemId) ?? null;
  }
}
