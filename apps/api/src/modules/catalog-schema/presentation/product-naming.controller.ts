import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  previewProductNameSchema,
  productExperienceSchema,
  productNameSettingsSchema,
  productVariantSearchQuerySchema,
  productVariantSearchSchema,
  updateProductNameSettingsSchema,
  type PreviewProductNameInput,
  type ProductExperienceDto,
  type ProductNameSettingsDto,
  type ProductVariantSearchDto,
  type ProductVariantSearchQuery,
} from '@cdr/contracts';

import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { openApiSchema } from '../../../shared/http/openapi';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { ProductNamingUseCases } from '../application/product-naming.use-cases';

@ApiTags('product names and sales variants')
@Controller('product-experience')
export class ProductNamingController {
  constructor(private readonly names: ProductNamingUseCases) {}

  @Get('settings')
  @RequireCapabilities(Capability.AdministrationManage)
  @ApiOperation({ summary: 'Get versioned global automotive and industrial name formulas' })
  @ApiOkResponse({ schema: openApiSchema(productNameSettingsSchema) })
  settings(): Promise<ProductNameSettingsDto> {
    return this.names.getSettings();
  }

  @Patch('settings')
  @RequireCapabilities(Capability.AdministrationManage)
  @ApiOperation({ summary: 'Save name formulas and their audit event with optimistic concurrency' })
  @ApiBody({ schema: openApiSchema(updateProductNameSettingsSchema) })
  @ApiOkResponse({ schema: openApiSchema(productNameSettingsSchema) })
  save(
    @Body(new ZodValidationPipe(updateProductNameSettingsSchema)) input: ProductNameSettingsDto,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductNameSettingsDto> {
    return this.names.saveSettings(input, actor);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities(
    Capability.AdministrationManage,
    Capability.CatalogRead,
    Capability.AttributesRead,
    Capability.ApplicationsRead,
  )
  @ApiOperation({
    summary: 'Preview a draft formula using only fields visible to the actor, without saving',
  })
  @ApiBody({ schema: openApiSchema(previewProductNameSchema) })
  @ApiOkResponse({ schema: openApiSchema(productExperienceSchema) })
  preview(
    @Body(new ZodValidationPipe(previewProductNameSchema)) input: PreviewProductNameInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductExperienceDto> {
    return this.names.experience(input.productId, actor, input.config);
  }

  @Get('search')
  @RequireCapabilities(
    Capability.CatalogRead,
    Capability.AttributesRead,
    Capability.ApplicationsRead,
  )
  @ApiOperation({
    summary: 'Search one result per sales variant, with a deep link to the selected application',
  })
  @ApiQuery({ name: 'q', required: true, type: String, minLength: 2, maxLength: 300 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 50 })
  @ApiOkResponse({ schema: openApiSchema(productVariantSearchSchema) })
  search(
    @Query(new ZodValidationPipe(productVariantSearchQuerySchema)) query: ProductVariantSearchQuery,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductVariantSearchDto> {
    return this.names.search(query, actor);
  }

  @Get(':id')
  @RequireCapabilities(
    Capability.CatalogRead,
    Capability.AttributesRead,
    Capability.ApplicationsRead,
  )
  @ApiOperation({
    summary: 'Get a product general name and every sales variant visible to the actor',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ schema: openApiSchema(productExperienceSchema) })
  experience(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductExperienceDto> {
    return this.names.experience(id, actor);
  }
}
