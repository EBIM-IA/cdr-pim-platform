import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AdminCatalogCategoryDto,
  type AdminCategoryListQuery,
  type AdminTemplateAttributeDto,
  type AdminTemplateDto,
  type AdminTemplateListQuery,
  type UpdateCatalogCategoryInput,
  type UpdateTemplateAttributeInput,
  adminCatalogCategorySchema,
  adminCategoryListQuerySchema,
  adminTemplateAttributeSchema,
  adminTemplateListQuerySchema,
  adminTemplateSchema,
  updateCatalogCategorySchema,
  updateTemplateAttributeSchema,
} from '@cdr/contracts';

import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { openApiSchema } from '../../../shared/http/openapi';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  GetAdminTemplateUseCase,
  ListAdminCategoriesUseCase,
  ListAdminTemplatesUseCase,
  UpdateCatalogCategoryUseCase,
  UpdateTemplateAttributeUseCase,
} from '../application/catalog-administration.use-cases';
import {
  toAdminCategoryDto,
  toAdminTemplateAttributeDto,
  toAdminTemplateDto,
} from './catalog-administration.presenter';

@ApiTags('catalog administration')
@Controller('catalog/admin')
@RequireCapabilities(Capability.AttributesWrite)
export class CatalogAdministrationController {
  constructor(
    private readonly listCategories: ListAdminCategoriesUseCase,
    private readonly updateCategory: UpdateCatalogCategoryUseCase,
    private readonly listTemplates: ListAdminTemplatesUseCase,
    private readonly getTemplate: GetAdminTemplateUseCase,
    private readonly updateTemplateAttribute: UpdateTemplateAttributeUseCase,
  ) {}

  @Get('categories')
  @ApiOperation({ summary: 'List catalogue categories for administration' })
  @ApiOkResponse({ schema: openApiSchema(adminCatalogCategorySchema.array()) })
  async categories(
    @Query(new ZodValidationPipe(adminCategoryListQuerySchema)) query: AdminCategoryListQuery,
  ): Promise<AdminCatalogCategoryDto[]> {
    return (await this.listCategories.execute(query.includeInactive)).map(toAdminCategoryDto);
  }

  @Patch('categories/:categoryId')
  @ApiOperation({ summary: 'Update or deactivate a category without deleting it' })
  @ApiOkResponse({ schema: openApiSchema(adminCatalogCategorySchema) })
  async patchCategory(
    @Param('categoryId') categoryId: string,
    @Body(new ZodValidationPipe(updateCatalogCategorySchema)) body: UpdateCatalogCategoryInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<AdminCatalogCategoryDto> {
    return toAdminCategoryDto(await this.updateCategory.execute(categoryId, body, actor));
  }

  @Get('templates')
  @ApiOperation({ summary: 'List all template versions, optionally by category' })
  @ApiOkResponse({ schema: openApiSchema(adminTemplateSchema.array()) })
  async templates(
    @Query(new ZodValidationPipe(adminTemplateListQuerySchema)) query: AdminTemplateListQuery,
  ): Promise<AdminTemplateDto[]> {
    return (await this.listTemplates.execute(query.categoryId)).map(toAdminTemplateDto);
  }

  @Get('templates/:templateId')
  @ApiOperation({ summary: 'Get a template with active and inactive attribute assignments' })
  @ApiOkResponse({ schema: openApiSchema(adminTemplateSchema) })
  async template(@Param('templateId') templateId: string): Promise<AdminTemplateDto> {
    return toAdminTemplateDto(await this.getTemplate.execute(templateId));
  }

  @Patch('templates/:templateId/attributes/:attributeDefinitionId')
  @ApiOperation({
    summary: 'Configure a template attribute without deletion',
    description:
      'AttributesWrite can change ordinary flags. A payload containing roleAccess additionally requires AdministrationManage.',
  })
  @ApiOkResponse({ schema: openApiSchema(adminTemplateAttributeSchema) })
  async patchTemplateAttribute(
    @Param('templateId') templateId: string,
    @Param('attributeDefinitionId') attributeDefinitionId: string,
    @Body(new ZodValidationPipe(updateTemplateAttributeSchema)) body: UpdateTemplateAttributeInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<AdminTemplateAttributeDto> {
    return toAdminTemplateAttributeDto(
      await this.updateTemplateAttribute.execute(templateId, attributeDefinitionId, body, actor),
    );
  }
}
