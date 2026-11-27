import { PRODUCT_ASSET_OBJECT_REFERENCES } from './domain/ports/product-asset-object-references.port';
import { DrizzleProductAssetObjectReferences } from './infrastructure/persistence/drizzle-product-asset-object-references';
import { Module } from '@nestjs/common';
import type { ApiEnv } from '@cdr/config';
import { TECHNICAL_SHEET_VISIBILITY } from './domain/ports/technical-sheet-visibility.port';
import { DrizzleTechnicalSheetVisibility } from './infrastructure/persistence/drizzle-technical-sheet-visibility';
import { TechnicalSheetVisibilityUseCase } from './application/technical-sheet-visibility.use-case';
import { TechnicalSheetVisibilityController } from './presentation/technical-sheet-visibility.controller';

import type { Sql } from '../../database/drizzle.client';
import { API_ENV, DATABASE_SQL } from '../../shared/tokens';
import { CatalogModule } from '../catalog/catalog.module';
import { EcommerceImagesUseCase } from './application/ecommerce-images.use-case';
import {
  DeleteProductAssetUseCase,
  DownloadProductAssetUseCase,
  ListProductAssetBatchUseCase,
  ListProductAssetsUseCase,
  ProcessProductAssetArchiveUseCase,
  UploadProductAssetUseCase,
  ReorderProductAssetsUseCase,
} from './application/manage-product-assets.use-cases';
import { ECOMMERCE_IMAGE_SOURCE } from './domain/ports/ecommerce-image-source.port';
import { ECOMMERCE_PHOTO_REPOSITORY } from './domain/ports/ecommerce-photo-repository.port';
import {
  ARCHIVE_READER,
  ASSET_BINARY_STORAGE,
  PRODUCT_ASSET_REPOSITORY,
} from './domain/ports/product-asset-repository.port';
import { SafeZipReaderAdapter } from './infrastructure/archive/safe-zip-reader.adapter';
import { NarvizImageSourceAdapter } from './infrastructure/narviz/narviz-image-source.adapter';
import { PostgresNarvizRequestBudget } from './infrastructure/narviz/postgres-narviz-request-budget';
import { DrizzleProductAssetRepository } from './infrastructure/persistence/drizzle-product-asset.repository';
import { PlatformAssetStorageAdapter } from './infrastructure/platform-asset-storage.adapter';
import { ProductAssetsController } from './presentation/product-assets.controller';
import { EcommerceImagesController } from './presentation/ecommerce-images.controller';

@Module({
  imports: [CatalogModule],
  controllers: [
    TechnicalSheetVisibilityController,
    ProductAssetsController,
    EcommerceImagesController,
  ],
  providers: [
    { provide: TECHNICAL_SHEET_VISIBILITY, useClass: DrizzleTechnicalSheetVisibility },
    TechnicalSheetVisibilityUseCase,
    { provide: PRODUCT_ASSET_OBJECT_REFERENCES, useClass: DrizzleProductAssetObjectReferences },
    { provide: PRODUCT_ASSET_REPOSITORY, useClass: DrizzleProductAssetRepository },
    { provide: ECOMMERCE_PHOTO_REPOSITORY, useExisting: PRODUCT_ASSET_REPOSITORY },
    {
      provide: ECOMMERCE_IMAGE_SOURCE,
      inject: [API_ENV, DATABASE_SQL],
      useFactory: (env: ApiEnv, sql: Sql) =>
        env.ECOMMERCE_IMAGES_BASE_URL && env.ECOMMERCE_IMAGES_TOKEN
          ? new NarvizImageSourceAdapter({
              baseUrl: env.ECOMMERCE_IMAGES_BASE_URL,
              token: env.ECOMMERCE_IMAGES_TOKEN,
              budget: new PostgresNarvizRequestBudget(sql),
            })
          : null,
    },
    { provide: ASSET_BINARY_STORAGE, useClass: PlatformAssetStorageAdapter },
    { provide: ARCHIVE_READER, useClass: SafeZipReaderAdapter },
    ListProductAssetsUseCase,
    ListProductAssetBatchUseCase,
    UploadProductAssetUseCase,
    ReorderProductAssetsUseCase,
    DownloadProductAssetUseCase,
    DeleteProductAssetUseCase,
    ProcessProductAssetArchiveUseCase,
    EcommerceImagesUseCase,
  ],
  exports: [
    PRODUCT_ASSET_REPOSITORY,
    ASSET_BINARY_STORAGE,
    PRODUCT_ASSET_OBJECT_REFERENCES,
    TECHNICAL_SHEET_VISIBILITY,
  ],
})
export class ProductAssetsModule {}
