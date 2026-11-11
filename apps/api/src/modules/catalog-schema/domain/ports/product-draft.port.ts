import type { Uuid } from '@cdr/shared';

import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';

export interface ProductDraftEntry {
  readonly attributeKey: string;
  readonly draft: string;
  readonly expectedVersion: number;
}

export interface ProductDraft {
  readonly productId: Uuid;
  readonly templateId: Uuid;
  readonly version: number;
  readonly entries: readonly ProductDraftEntry[];
  readonly updatedAt: Date | null;
}

export interface ProductDraftPort {
  get(productId: Uuid, actorId: string): Promise<ProductDraft | null>;
  save(
    input: ProductDraft & { readonly actorId: string },
    audit: AuditEntry,
  ): Promise<ProductDraft>;
}

export const PRODUCT_DRAFT = Symbol('ProductDraft');
