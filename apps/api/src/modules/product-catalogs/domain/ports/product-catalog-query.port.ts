import type { ProductCatalogListDto, ProductCatalogListQuery } from '@cdr/contracts';
import type { AuthenticatedActor } from '../../../identity/domain/entities/role';
export interface ProductCatalogQueryPort {
  list(query: ProductCatalogListQuery, actor: AuthenticatedActor): Promise<ProductCatalogListDto>;
}
export const PRODUCT_CATALOG_QUERY = Symbol('ProductCatalogQueryPort');
