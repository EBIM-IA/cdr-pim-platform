import { Inject, Injectable } from '@nestjs/common';

import type { Product } from '../domain/entities/product';
import {
  PRODUCT_REPOSITORY,
  type ProductRepositoryPort,
} from '../domain/ports/product-repository.port';

@Injectable()
export class ListProductsUseCase {
  constructor(@Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort) {}

  execute(options: { page: number; pageSize: number }): Promise<{
    items: Product[];
    total: number;
  }> {
    return this.products.list(options);
  }
}
