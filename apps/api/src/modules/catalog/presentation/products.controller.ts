import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CreateProductInput,
  type PaginationQuery,
  type ProductDto,
  type ProductListDto,
  createProductSchema,
  paginationQuerySchema,
  productListSchema,
  productSchema,
} from '@cdr/contracts';

import { openApiSchema } from '../../../shared/http/openapi';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { type CreateProductUseCase } from '../application/create-product.use-case';
import { type GetProductByIdUseCase } from '../application/get-product-by-id.use-case';
import { type ListProductsUseCase } from '../application/list-products.use-case';
import { toProductDto } from './product.presenter';

/**
 * HTTP adapter for the catalog module.
 *
 * Contains no business logic on purpose — it validates input against the shared contract,
 * delegates to a use case, and maps the result to a DTO. Anything more belongs one layer in.
 */
@ApiTags('catalog')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly getProductById: GetProductByIdUseCase,
    private readonly createProduct: CreateProductUseCase,
    private readonly listProducts: ListProductsUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List products (offset pagination)' })
  @ApiOkResponse({ schema: openApiSchema(productListSchema) })
  async list(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<ProductListDto> {
    const { items, total } = await this.listProducts.execute(query);
    return {
      items: items.map(toProductDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one product by its identifier' })
  @ApiOkResponse({ schema: openApiSchema(productSchema) })
  async findOne(@Param('id') id: string): Promise<ProductDto> {
    return toProductDto(await this.getProductById.execute(id));
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a draft product' })
  @ApiCreatedResponse({ schema: openApiSchema(productSchema) })
  async create(
    @Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput,
  ): Promise<ProductDto> {
    return toProductDto(await this.createProduct.execute(body));
  }
}
