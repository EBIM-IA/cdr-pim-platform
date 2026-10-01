import type { ProductStatus } from '@cdr/contracts';

export interface ProductAttribute {
  key: string;
  label: string;
  value: string;
  rawValue: string | number | boolean;
  unit?: string;
  required?: boolean;
  source?: string;
}

/**
 * Presentation model for the operational UI.
 *
 * Fields that are not part of the current shared API contract remain optional/null. The
 * UI must label those gaps explicitly instead of manufacturing catalog information.
 */
export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  brand: string;
  brandFilter?: string;
  category: string;
  application: string;
  status: ProductStatus;
  completeness: number | null;
  unifiedCode?: string;
  providerCode?: string;
  dimensions?: string;
  source?: string;
  sourceReference?: string;
  templateKey?: string;
  updatedAt?: string;
  attributes: ProductAttribute[];
}

export interface ProductListResult {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ProductQuery {
  q?: string;
  line?: string;
  brand?: string;
  status?: ProductStatus;
  page?: number;
  pageSize?: number;
}
