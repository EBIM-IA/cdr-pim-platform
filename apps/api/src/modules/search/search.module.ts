import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { ApplicationsModule } from '../applications/applications.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogSchemaModule } from '../catalog-schema/catalog-schema.module';
import { EquivalencesModule } from '../equivalences/equivalences.module';
import { IndexProductUseCase } from './application/index-product.use-case';
import { SemanticSearchUseCase } from './application/semantic-search.use-case';
import { PRODUCT_SEARCH_READ_MODEL } from './domain/ports/product-search-read-model.port';
import { PRODUCT_VECTOR_INDEX } from './domain/ports/product-vector-index.port';
import { DrizzleProductVectorIndex } from './infrastructure/persistence/drizzle-product-vector-index.adapter';
import { CompositeProductSearchReadModel } from './infrastructure/read-model/composite-product-search-read-model';
import { SearchController } from './presentation/search.controller';

/**
 * Imports `CatalogModule` for its exported `PRODUCT_REPOSITORY` port and `AiModule` for
 * `EMBEDDING_PROVIDER`. Those two symbols are the entire coupling surface between the
 * three modules — no shared services, no shared tables.
 */
@Module({
  imports: [CatalogModule, CatalogSchemaModule, ApplicationsModule, EquivalencesModule, AiModule],
  controllers: [SearchController],
  providers: [
    { provide: PRODUCT_VECTOR_INDEX, useClass: DrizzleProductVectorIndex },
    { provide: PRODUCT_SEARCH_READ_MODEL, useClass: CompositeProductSearchReadModel },
    SemanticSearchUseCase,
    IndexProductUseCase,
  ],
  exports: [PRODUCT_VECTOR_INDEX, IndexProductUseCase],
})
export class SearchModule {}
