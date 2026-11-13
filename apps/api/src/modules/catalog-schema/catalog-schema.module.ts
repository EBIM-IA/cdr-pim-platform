import { CatalogHomeUseCases } from './application/catalog-home.use-cases';
import { CatalogHomeController } from './presentation/catalog-home.controller';
import { CATALOG_HOME_SETTINGS } from './domain/ports/catalog-home-settings.port';
import { DrizzleCatalogHomeSettings } from './infrastructure/persistence/drizzle-catalog-home-settings';
import { CatalogParametersController } from './presentation/catalog-parameters.controller';
import { CatalogParametersUseCase } from './application/catalog-parameters.use-case';
import { CATALOG_PARAMETERS } from './domain/ports/catalog-parameters.port';
import { DrizzleCatalogParameters } from './infrastructure/persistence/drizzle-catalog-parameters';
import { DUPLICATE_CANDIDATES } from '../catalog/domain/ports/duplicate-candidates.port';
import { DrizzleDuplicateCandidates } from './infrastructure/persistence/drizzle-duplicate-candidates';
import { SEARCH_TELEMETRY } from './domain/ports/search-telemetry.port';
import { PostgresSearchTelemetryAdapter } from './infrastructure/persistence/postgres-search-telemetry.adapter';
import { ProductDraftUseCases } from './application/product-draft.use-cases';
import { ProductDraftController } from './presentation/product-draft.controller';
import { PRODUCT_DRAFT } from './domain/ports/product-draft.port';
import { DrizzleProductDraft } from './infrastructure/persistence/drizzle-product-draft';
import { CatalogDesignUseCases } from './application/catalog-design.use-cases';
import { CatalogDesignController } from './presentation/catalog-design.controller';
import { CATALOG_DESIGN_REPOSITORY } from './domain/ports/catalog-design.repository.port';
import { DrizzleCatalogDesignRepository } from './infrastructure/persistence/drizzle-catalog-design.repository';
import { QUALITY_GOVERNANCE } from '../quality/domain/ports/quality-governance.port';
import { DrizzleQualityGovernanceRepository } from './infrastructure/persistence/drizzle-quality-governance.repository';
import { ECOMMERCE_DESCRIPTION } from './domain/ports/ecommerce-description.port';
import { DrizzleEcommerceDescription } from './infrastructure/persistence/drizzle-ecommerce-description';
import { Module } from '@nestjs/common';
import { PRODUCT_EXPERIENCE } from './domain/ports/product-experience.port';
import { ApplicationsModule } from '../applications/applications.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ProductNamingUseCases } from './application/product-naming.use-cases';
import { PRODUCT_NAME_SETTINGS } from './domain/ports/product-name-settings.port';
import { DrizzleProductNameSettings } from './infrastructure/persistence/drizzle-product-name-settings';
import { ProductNamingController } from './presentation/product-naming.controller';

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
import { ReassignProductTemplateUseCase } from './application/reassign-product-template.use-case';
import { DYNAMIC_CATALOG_REPOSITORY } from './domain/ports/dynamic-catalog.repository.port';
import { CATEGORY_ATTRIBUTE_IMPORT } from './domain/ports/category-attribute-import.port';
import { CATALOG_ADMINISTRATION_REPOSITORY } from './domain/ports/catalog-administration.repository.port';
import { PRODUCT_TEMPLATE_ASSIGNMENT_REPOSITORY } from './domain/ports/product-template-assignment.repository.port';
import { DrizzleCategoryAttributeImportAdapter } from './infrastructure/persistence/drizzle-category-attribute-import.adapter';
import { DrizzleCatalogAdministrationRepository } from './infrastructure/persistence/drizzle-catalog-administration.repository';
import { DrizzleDynamicCatalogRepository } from './infrastructure/persistence/drizzle-dynamic-catalog.repository';
import { DrizzleProductTemplateAssignmentRepository } from './infrastructure/persistence/drizzle-product-template-assignment.repository';
import { DynamicCatalogController } from './presentation/dynamic-catalog.controller';
import { CatalogAdministrationController } from './presentation/catalog-administration.controller';

@Module({
  imports: [ApplicationsModule, CatalogModule],
  controllers: [
    CatalogHomeController,
    CatalogParametersController,
    ProductDraftController,
    CatalogDesignController,
    DynamicCatalogController,
    CatalogAdministrationController,
    ProductNamingController,
  ],
  providers: [
    CatalogHomeUseCases,
    { provide: CATALOG_HOME_SETTINGS, useClass: DrizzleCatalogHomeSettings },
    CatalogParametersUseCase,
    { provide: CATALOG_PARAMETERS, useClass: DrizzleCatalogParameters },
    { provide: DUPLICATE_CANDIDATES, useClass: DrizzleDuplicateCandidates },
    { provide: SEARCH_TELEMETRY, useClass: PostgresSearchTelemetryAdapter },
    ProductDraftUseCases,
    { provide: PRODUCT_DRAFT, useClass: DrizzleProductDraft },
    CatalogDesignUseCases,
    { provide: CATALOG_DESIGN_REPOSITORY, useClass: DrizzleCatalogDesignRepository },
    { provide: QUALITY_GOVERNANCE, useClass: DrizzleQualityGovernanceRepository },
    { provide: ECOMMERCE_DESCRIPTION, useClass: DrizzleEcommerceDescription },
    ProductNamingUseCases,
    { provide: PRODUCT_EXPERIENCE, useExisting: ProductNamingUseCases },
    { provide: PRODUCT_NAME_SETTINGS, useClass: DrizzleProductNameSettings },
    { provide: DYNAMIC_CATALOG_REPOSITORY, useClass: DrizzleDynamicCatalogRepository },
    {
      provide: PRODUCT_TEMPLATE_ASSIGNMENT_REPOSITORY,
      useClass: DrizzleProductTemplateAssignmentRepository,
    },
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
    ReassignProductTemplateUseCase,
    UpdateProductAttributeUseCase,
    UpdateProductAttributesUseCase,
    UpdateCatalogCategoryUseCase,
    UpdateTemplateAttributeUseCase,
  ],
  exports: [
    CATALOG_ADMINISTRATION_REPOSITORY,
    DUPLICATE_CANDIDATES,
    SEARCH_TELEMETRY,
    QUALITY_GOVERNANCE,
    DYNAMIC_CATALOG_REPOSITORY,
    CATEGORY_ATTRIBUTE_IMPORT,
    PRODUCT_EXPERIENCE,
    ECOMMERCE_DESCRIPTION,
  ],
})
export class CatalogSchemaModule {}
