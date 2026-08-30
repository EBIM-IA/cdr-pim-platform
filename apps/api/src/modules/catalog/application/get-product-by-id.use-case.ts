import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, assertUuid } from '@cdr/shared';

import type { Product } from '../domain/entities/product';
import {
  PRODUCT_REPOSITORY,
  type ProductRepositoryPort,
} from '../domain/ports/product-repository.port';

/**
 * Walking-skeleton use case.
 *
 * It depends on the PORT, never on the Drizzle adapter — which is exactly why its unit
 * test runs in milliseconds with an in-memory fake and no database.
 */
@Injectable()
export class GetProductByIdUseCase {
  constructor(@Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort) {}

  async execute(rawId: string): Promise<Product> {
    const id = assertUuid(rawId, 'productId');
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundError('Product', rawId);
    }
    return product;
  }
}
