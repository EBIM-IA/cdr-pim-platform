/**
 * Inbound-data port for the ERP.
 *
 * This interface is the entire contract between the PIM and Dynamics AX 2012 R2. If Casa
 * del Rulimán replaces AX in a few years, a new adapter implements this and nothing else
 * changes — which is the central promise of ADR-001.
 *
 * Note the shape: plain, ERP-agnostic records. No AX table names, no AX field names, no
 * AX-specific concepts leak past this boundary.
 */
export interface ErpProductRecord {
  /** The ERP's own item number. Stored as a `erp_item_id` product identifier. */
  readonly erpItemId: string;
  readonly sku: string;
  readonly name: string;
  readonly description?: string;
  readonly brand?: string;
  readonly manufacturerPartNumber?: string;
  /** Last modification timestamp **in UTC**, used to drive delta synchronisation. */
  readonly modifiedAt: Date;
}

export interface ErpProductPage {
  readonly records: ErpProductRecord[];
  /** Opaque continuation token; `null` means the page was the last one. */
  readonly nextCursor: string | null;
}

export interface ErpProductSourcePort {
  /** Products changed at or after `since`. The AX_SYNC job walks this cursor. */
  fetchChangedSince(since: Date, cursor?: string): Promise<ErpProductPage>;
  fetchByErpItemId(erpItemId: string): Promise<ErpProductRecord | null>;
}

export const ERP_PRODUCT_SOURCE = Symbol('ErpProductSourcePort');
