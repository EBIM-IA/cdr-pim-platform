import { Module } from '@nestjs/common';

import { CreateProductUseCase } from './application/create-product.use-case';
import { GetProductByIdUseCase } from './application/get-product-by-id.use-case';
import { ListProductsUseCase } from './application/list-products.use-case';
import { PRODUCT_REPOSITORY } from './domain/ports/product-repository.port';
import { DrizzleProductRepository } from './infrastructure/persistence/drizzle-product.repository';
import { ProductsController } from './presentation/products.controller';

/**
 * Composition root of the **catalog** bounded context.
 *
 * The single line that binds the port to its adapter is where the whole hexagon is wired.
 * Replacing PostgreSQL means changing exactly this line.
 *
 * `PRODUCT_REPOSITORY` is exported because other modules (e.g. `search`) legitimately need
 * read access to products — and they get it through the published port, never by querying
 * the `products` table themselves.
 */
@Module({
  controllers: [ProductsController],
  providers: [
    { provide: PRODUCT_REPOSITORY, useClass: DrizzleProductRepository },
    GetProductByIdUseCase,
    CreateProductUseCase,
    ListProductsUseCase,
  ],
  exports: [PRODUCT_REPOSITORY],
})
export class CatalogModule {}
