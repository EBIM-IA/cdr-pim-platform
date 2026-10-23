import { PRODUCT_CATALOG_OBJECT_REFERENCES } from './domain/ports/product-catalog-object-references.port';
import { DrizzleProductCatalogObjectReferences } from './infrastructure/persistence/drizzle-product-catalog-object-references';
import { Module } from '@nestjs/common';
import {
  ChangeProductCatalogDeletionUseCase,
  CreateProductCatalogShareUseCase,
  CreateProductCatalogUseCase,
  DownloadProductCatalogUseCase,
  GetProductCatalogUseCase,
  ListProductCatalogsUseCase,
  ResolveSharedProductCatalogUseCase,
  RevokeProductCatalogShareUseCase,
  UpdateProductCatalogUseCase,
} from './application/manage-product-catalogs.use-cases';
import { PRODUCT_CATALOG_QUERY } from './domain/ports/product-catalog-query.port';
import {
  CATALOG_BINARY_STORAGE,
  CATALOG_SHARE_TOKEN,
  PRODUCT_CATALOG_REPOSITORY,
} from './domain/ports/product-catalog.port';
import { CryptoCatalogTokenAdapter } from './infrastructure/crypto-catalog-token.adapter';
import { DrizzleProductCatalogRepository } from './infrastructure/persistence/drizzle-product-catalog.repository';
import { PlatformCatalogStorageAdapter } from './infrastructure/platform-catalog-storage.adapter';
import { CatalogShareAuthGuard } from './presentation/guards/catalog-share-auth.guard';
import { ProductCatalogsController } from './presentation/product-catalogs.controller';
@Module({
  controllers: [ProductCatalogsController],
  providers: [
    { provide: PRODUCT_CATALOG_OBJECT_REFERENCES, useClass: DrizzleProductCatalogObjectReferences },
    { provide: PRODUCT_CATALOG_REPOSITORY, useClass: DrizzleProductCatalogRepository },
    { provide: CATALOG_BINARY_STORAGE, useClass: PlatformCatalogStorageAdapter },
    { provide: CATALOG_SHARE_TOKEN, useClass: CryptoCatalogTokenAdapter },
    ListProductCatalogsUseCase,
    GetProductCatalogUseCase,
    CreateProductCatalogUseCase,
    UpdateProductCatalogUseCase,
    ChangeProductCatalogDeletionUseCase,
    CreateProductCatalogShareUseCase,
    RevokeProductCatalogShareUseCase,
    DownloadProductCatalogUseCase,
    ResolveSharedProductCatalogUseCase,
    CatalogShareAuthGuard,
    { provide: PRODUCT_CATALOG_QUERY, useExisting: ListProductCatalogsUseCase },
  ],
  exports: [PRODUCT_CATALOG_QUERY, PRODUCT_CATALOG_OBJECT_REFERENCES],
})
export class ProductCatalogsModule {}
