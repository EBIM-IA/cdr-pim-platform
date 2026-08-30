import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { CatalogModule } from '../catalog/catalog.module';
import { IndexProductUseCase } from './application/index-product.use-case';
import { SemanticSearchUseCase } from './application/semantic-search.use-case';
import { PRODUCT_VECTOR_INDEX } from './domain/ports/product-vector-index.port';
import { DrizzleProductVectorIndex } from './infrastructure/persistence/drizzle-product-vector-index.adapter';
import { SearchController } from './presentation/search.controller';

/**
 * Imports `CatalogModule` for its exported `PRODUCT_REPOSITORY` port and `AiModule` for
 * `EMBEDDING_PROVIDER`. Those two symbols are the entire coupling surface between the
 * three modules — no shared services, no shared tables.
 */
@Module({
  imports: [CatalogModule, AiModule],
  controllers: [SearchController],
  providers: [
    { provide: PRODUCT_VECTOR_INDEX, useClass: DrizzleProductVectorIndex },
    SemanticSearchUseCase,
    IndexProductUseCase,
  ],
  exports: [PRODUCT_VECTOR_INDEX, IndexProductUseCase],
})
export class SearchModule {}
