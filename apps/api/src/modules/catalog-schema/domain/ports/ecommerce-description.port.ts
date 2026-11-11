import type { EcommerceDescriptionDto } from '@cdr/contracts';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
export type EcommerceDescription = Omit<EcommerceDescriptionDto, 'stale'> & {
  fingerprint: string;
  sourceKeys?: string[];
};
export interface EcommerceDescriptionPort {
  getMany(productIds: readonly string[]): Promise<EcommerceDescription[]>;
  get(productId: string, variantKey: string): Promise<EcommerceDescription | null>;
  save(value: EcommerceDescription, expectedVersion: number, audit: AuditEntry): Promise<void>;
}
export const ECOMMERCE_DESCRIPTION = Symbol('EcommerceDescriptionPort');
