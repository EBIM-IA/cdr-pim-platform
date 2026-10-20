import { Module } from '@nestjs/common';

import {
  GetAdminTemplateUseCase,
  ListAdminCategoriesUseCase,
  ListAdminTemplatesUseCase,
  UpdateCatalogCategoryUseCase,
  UpdateTemplateAttributeUseCase,
} from './application/catalog-administration.use-cases';
import { GetCatalogGridSchemaUseCase } from './application/get-catalog-grid-schema.use-case';
import { GetProductAttributeSheetUseCase } from './application/get-product-attribute-sheet.use-case';
import { ListActiveCategoriesUseCase } from './application/list-active-categories.use-case';
import { ListCatalogGridUseCase } from './application/list-catalog-grid.use-case';
import { ListCatalogWorkbookUseCase } from './application/list-catalog-workbook.use-case';
import { UpdateProductAttributeUseCase } from './application/update-product-attribute.use-case';
import { UpdateProductAttributesUseCase } from './application/update-product-attributes.use-case';
import { DYNAMIC_CATALOG_REPOSITORY } from './domain/ports/dynamic-catalog.repository.port';
import { CATEGORY_ATTRIBUTE_IMPORT } from './domain/ports/category-attribute-import.port';
import { CATALOG_ADMINISTRATION_REPOSITORY } from './domain/ports/catalog-administration.repository.port';
import { DrizzleCategoryAttributeImportAdapter } from './infrastructure/persistence/drizzle-category-attribute-import.adapter';
import { DrizzleCatalogAdministrationRepository } from './infrastructure/persistence/drizzle-catalog-administration.repository';
import { DrizzleDynamicCatalogRepository } from './infrastructure/persistence/drizzle-dynamic-catalog.repository';
import { DynamicCatalogController } from './presentation/dynamic-catalog.controller';
import { CatalogAdministrationController } from './presentation/catalog-administration.controller';

@Module({
  controllers: [DynamicCatalogController, CatalogAdministrationController],
  providers: [
    { provide: DYNAMIC_CATALOG_REPOSITORY, useClass: DrizzleDynamicCatalogRepository },
    { provide: CATEGORY_ATTRIBUTE_IMPORT, useClass: DrizzleCategoryAttributeImportAdapter },
    {
      provide: CATALOG_ADMINISTRATION_REPOSITORY,
      useClass: DrizzleCatalogAdministrationRepository,
    },
    GetAdminTemplateUseCase,
    GetCatalogGridSchemaUseCase,
    GetProductAttributeSheetUseCase,
    ListAdminCategoriesUseCase,
    ListAdminTemplatesUseCase,
    ListActiveCategoriesUseCase,
    ListCatalogGridUseCase,
    ListCatalogWorkbookUseCase,
    UpdateProductAttributeUseCase,
    UpdateProductAttributesUseCase,
    UpdateCatalogCategoryUseCase,
    UpdateTemplateAttributeUseCase,
  ],
  exports: [DYNAMIC_CATALOG_REPOSITORY, CATEGORY_ATTRIBUTE_IMPORT],
})
export class CatalogSchemaModule {}
