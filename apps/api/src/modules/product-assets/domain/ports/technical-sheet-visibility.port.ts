import type { Uuid } from '@cdr/shared';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';

export interface TechnicalSheetVisibility {
  readonly productId: Uuid;
  readonly visible: boolean;
  readonly version: number;
}

export interface TechnicalSheetVisibilityPort {
  get(productId: Uuid): Promise<TechnicalSheetVisibility>;
  getMany(productIds: readonly Uuid[]): Promise<TechnicalSheetVisibility[]>;
  save(input: TechnicalSheetVisibility, audit: AuditEntry): Promise<TechnicalSheetVisibility>;
}

export const TECHNICAL_SHEET_VISIBILITY = Symbol('TechnicalSheetVisibilityPort');
