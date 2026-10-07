import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import {
  DeleteProductAssetUseCase,
  DownloadProductAssetUseCase,
  ListProductAssetsUseCase,
  ProcessProductAssetArchiveUseCase,
  UploadProductAssetUseCase,
} from './application/manage-product-assets.use-cases';
import {
  ARCHIVE_READER,
  ASSET_BINARY_STORAGE,
  PRODUCT_ASSET_REPOSITORY,
} from './domain/ports/product-asset-repository.port';
import { SafeZipReaderAdapter } from './infrastructure/archive/safe-zip-reader.adapter';
import { DrizzleProductAssetRepository } from './infrastructure/persistence/drizzle-product-asset.repository';
import { PlatformAssetStorageAdapter } from './infrastructure/platform-asset-storage.adapter';
import { ProductAssetsController } from './presentation/product-assets.controller';

@Module({
  imports: [CatalogModule],
  controllers: [ProductAssetsController],
  providers: [
    { provide: PRODUCT_ASSET_REPOSITORY, useClass: DrizzleProductAssetRepository },
    { provide: ASSET_BINARY_STORAGE, useClass: PlatformAssetStorageAdapter },
    { provide: ARCHIVE_READER, useClass: SafeZipReaderAdapter },
    ListProductAssetsUseCase,
    UploadProductAssetUseCase,
    DownloadProductAssetUseCase,
    DeleteProductAssetUseCase,
    ProcessProductAssetArchiveUseCase,
  ],
  exports: [PRODUCT_ASSET_REPOSITORY, ASSET_BINARY_STORAGE],
})
export class ProductAssetsModule {}
