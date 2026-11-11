import type { Uuid } from '@cdr/shared';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
export interface UnifiedCodeRequest {
  id: Uuid;
  productId: Uuid;
  sku: string;
  currentCode: string | null;
  action: 'remove' | 'move' | 'correct';
  proposedCode: string | null;
  reason: string;
  status: 'pending_dispatch';
  requestedBy: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface UnifiedCodeRequestsPort {
  list(sku?: string): Promise<UnifiedCodeRequest[]>;
  create(request: UnifiedCodeRequest, audit: AuditEntry): Promise<UnifiedCodeRequest>;
  update(
    id: Uuid,
    input: Pick<UnifiedCodeRequest, 'action' | 'proposedCode' | 'reason'> & {
      expectedVersion: number;
      updatedAt: Date;
    },
    audit: AuditEntry,
  ): Promise<UnifiedCodeRequest>;
}
export const UNIFIED_CODE_REQUESTS = Symbol('UnifiedCodeRequests');
