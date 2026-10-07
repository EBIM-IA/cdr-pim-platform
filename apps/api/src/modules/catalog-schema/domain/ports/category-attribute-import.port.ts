import type { Uuid } from '@cdr/shared';

import type { CatalogAttributeValue } from '../entities/catalog-schema';

export type CategoryImportRecordValue = string | number | boolean | null | readonly string[];
export type CategoryImportRecord = Readonly<Record<string, CategoryImportRecordValue>>;

export interface CategoryImportSourceRow {
  readonly rowNumber: number;
  readonly data: CategoryImportRecord;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface CategoryImportCellPlan {
  readonly attributeKey: string;
  readonly value: CatalogAttributeValue | null;
  readonly expectedVersion: number;
}

/**
 * Opaque, server-only confirmation plan persisted beside an import row. The HTTP presenter
 * deliberately omits it so product ids and optimistic-lock versions cannot be tampered with.
 */
export interface CategoryImportRowPlan {
  readonly productId: Uuid;
  readonly sku: string;
  readonly cells: readonly CategoryImportCellPlan[];
}

export interface PreparedCategoryImportRow {
  readonly rowNumber: number;
  readonly valid: boolean;
  readonly data: CategoryImportRecord;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly plan: CategoryImportRowPlan | null;
}

export interface ApplyCategoryImportRowResult {
  readonly applied: boolean;
  readonly errors: readonly string[];
}

/** Public anti-corruption port consumed by the imports bounded context. */
export interface CategoryAttributeImportPort {
  prepare(input: {
    readonly categorySlug: string;
    readonly rows: readonly CategoryImportSourceRow[];
    readonly roles: readonly string[];
  }): Promise<readonly PreparedCategoryImportRow[]>;

  applyRow(input: {
    readonly categorySlug: string;
    readonly plan: CategoryImportRowPlan;
    readonly roles: readonly string[];
    readonly actorId: string;
    readonly batchId: Uuid;
    readonly correlationId: string;
    readonly now: Date;
  }): Promise<ApplyCategoryImportRowResult>;
}

export const CATEGORY_ATTRIBUTE_IMPORT = Symbol('CategoryAttributeImportPort');
