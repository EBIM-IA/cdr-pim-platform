import { Inject, Injectable } from '@nestjs/common';
import { type Clock, ConflictError } from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import { Product } from '../domain/entities/product';
import {
  PRODUCT_REPOSITORY,
  type ProductRepositoryPort,
} from '../domain/ports/product-repository.port';

export interface CreateProductCommand {
  readonly sku: string;
  readonly name: string;
  readonly description?: string;
  readonly brand?: string;
}

@Injectable()
export class CreateProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateProductCommand): Promise<Product> {
    const now = this.clock.now();
    const product = Product.create({
      sku: command.sku,
      name: command.name,
      description: command.description ?? null,
      brand: command.brand ?? null,
      now,
    });

    // Checked here for a clear error message; the unique index on `products.sku` remains
    // the authority, because this check is not race-free on its own.
    if (await this.products.findBySku(product.sku)) {
      throw new ConflictError('A product with this SKU already exists', { sku: product.sku });
    }

    await this.products.save(product);
    return product;
  }
}
