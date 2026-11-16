import type {
  CategoryGovernanceDto,
  CategoryTreeImportRow,
  SaveCategoryDynamicAttribute,
} from '@cdr/contracts';
import type { AuditMetadata } from './catalog-administration.repository.port';
export interface CategoryGovernancePort {
  read(): Promise<CategoryGovernanceDto>;
  importTree(
    rows: readonly CategoryTreeImportRow[],
    confirm: boolean,
    audit: AuditMetadata,
    expectedRevision?: string,
  ): Promise<{
    revision: string;
    rows: (CategoryTreeImportRow & {
      row: number;
      path: string;
      newCategories: number;
      error: string | null;
    })[];
  }>;
  saveDynamicAttribute(input: SaveCategoryDynamicAttribute, audit: AuditMetadata): Promise<void>;
}
export const CATEGORY_GOVERNANCE = Symbol('CategoryGovernance');
