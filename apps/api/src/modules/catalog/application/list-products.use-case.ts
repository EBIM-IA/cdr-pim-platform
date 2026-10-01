import { Inject, Injectable } from '@nestjs/common';

import type { Product } from '../domain/entities/product';
import {
  PRODUCT_REPOSITORY,
  type ProductListOptions,
  type ProductRepositoryPort,
} from '../domain/ports/product-repository.port';

@Injectable()
export class ListProductsUseCase {
  constructor(@Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort) {}

  execute(options: ProductListOptions): Promise<{
    items: Product[];
    total: number;
  }> {
    return this.products.list(options);
  }
}
