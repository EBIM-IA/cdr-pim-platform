import type { ProductDto } from '@cdr/contracts';

import type { Product } from '../domain/entities/product';

/**
 * Domain aggregate -> wire DTO.
 *
 * Living in `presentation/` is the point: the domain does not know what JSON looks like,
 * and the API contract can change shape without touching business rules.
 */
export function toProductDto(product: Product): ProductDto {
  const snapshot = product.toSnapshot();
  return {
    id: snapshot.id,
    sku: snapshot.sku,
    name: snapshot.name,
    description: snapshot.description,
    brand: snapshot.brand,
    status: snapshot.status,
    identifiers: snapshot.identifiers.map((identifier) => ({
      type: identifier.type,
      value: identifier.value,
    })),
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}
