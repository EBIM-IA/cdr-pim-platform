import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CatalogCategorySummaryDto,
  type CatalogGridQuery,
  type CatalogGridResultDto,
  type CatalogGridSchemaDto,
  type CatalogSchemaQuery,
  type ProductAttributeSheetDto,
  type UpdateProductAttributeInput,
  type UpdatedProductAttributeDto,
  catalogCategoryListSchema,
  catalogGridQuerySchema,
  catalogGridResultSchema,
  catalogGridSchemaSchema,
  catalogSchemaQuerySchema,
  productAttributeSheetSchema,
  updateProductAttributeSchema,
  updatedProductAttributeSchema,
} from '@cdr/contracts';

import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { openApiSchema } from '../../../shared/http/openapi';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { GetCatalogGridSchemaUseCase } from '../application/get-catalog-grid-schema.use-case';
import { GetProductAttributeSheetUseCase } from '../application/get-product-attribute-sheet.use-case';
import { ListActiveCategoriesUseCase } from '../application/list-active-categories.use-case';
import { ListCatalogGridUseCase } from '../application/list-catalog-grid.use-case';
import { UpdateProductAttributeUseCase } from '../application/update-product-attribute.use-case';
import {
  toGridProductDto,
  toGridSchemaDto,
  toProductAttributeSheetDto,
  toUpdatedProductAttributeDto,
} from './dynamic-catalog.presenter';

@ApiTags('dynamic catalog')
@Controller('catalog')
@RequireCapabilities(Capability.AttributesRead)
export class DynamicCatalogController {
  constructor(
    private readonly listCategories: ListActiveCategoriesUseCase,
    private readonly getSchema: GetCatalogGridSchemaUseCase,
    private readonly listGrid: ListCatalogGridUseCase,
    private readonly getProductSheet: GetProductAttributeSheetUseCase,
    private readonly updateAttribute: UpdateProductAttributeUseCase,
  ) {}

  @Get('categories')
  @ApiOperation({ summary: 'List active categories with a visible active template' })
  @ApiOkResponse({ schema: openApiSchema(catalogCategoryListSchema) })
  async categories(
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<CatalogCategorySummaryDto[]> {
    return [...(await this.listCategories.execute(actor))];
  }

  @Get('schema')
  @ApiOperation({ summary: 'Get the role-filtered dynamic grid schema for a category' })
  @ApiOkResponse({ schema: openApiSchema(catalogGridSchemaSchema) })
  async schema(
    @Query(new ZodValidationPipe(catalogSchemaQuerySchema)) query: CatalogSchemaQuery,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<CatalogGridSchemaDto> {
    return toGridSchemaDto(await this.getSchema.execute(query.categoryId, actor));
  }

  @Get('grid')
  @ApiOperation({ summary: 'List category products with dynamic attribute filters' })
  @ApiOkResponse({ schema: openApiSchema(catalogGridResultSchema) })
  async grid(
    @Query(new ZodValidationPipe(catalogGridQuerySchema)) query: CatalogGridQuery,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<CatalogGridResultDto> {
    const result = await this.listGrid.execute(query, actor);
    return {
      items: result.items.map(toGridProductDto),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  @Get('products/:productId')
  @ApiOperation({ summary: 'Get a product and its role-filtered technical attribute sheet' })
  @ApiOkResponse({ schema: openApiSchema(productAttributeSheetSchema) })
  async productSheet(
    @Param('productId') productId: string,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductAttributeSheetDto> {
    return toProductAttributeSheetDto(await this.getProductSheet.execute(productId, actor));
  }

  @Patch('products/:productId/attributes/:attributeKey')
  @RequireCapabilities(Capability.AttributesWrite)
  @ApiOperation({ summary: 'Update one typed product attribute with optimistic concurrency' })
  @ApiOkResponse({ schema: openApiSchema(updatedProductAttributeSchema) })
  async patchAttribute(
    @Param('productId') productId: string,
    @Param('attributeKey') attributeKey: string,
    @Body(new ZodValidationPipe(updateProductAttributeSchema)) body: UpdateProductAttributeInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<UpdatedProductAttributeDto> {
    return toUpdatedProductAttributeDto(
      await this.updateAttribute.execute(
        {
          productId,
          attributeKey,
          value: body.value,
          expectedVersion: body.expectedVersion,
        },
        actor,
      ),
    );
  }
}
