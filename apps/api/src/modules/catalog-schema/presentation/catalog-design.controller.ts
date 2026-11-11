import {
  previewCategorySkuAssignmentsSchema,
  confirmCategorySkuAssignmentsSchema,
  type PreviewCategorySkuAssignmentsInput,
  type ConfirmCategorySkuAssignmentsInput,
} from '@cdr/contracts';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  addTemplateAttributeSchema,
  configureCategoryTemplateSchema,
  createCatalogCategorySchema,
  moveCatalogCategorySchema,
  type AddTemplateAttributeInput,
  type ConfigureCategoryTemplateInput,
  type CreateCatalogCategoryInput,
  type MoveCatalogCategoryInput,
} from '@cdr/contracts';
import { z } from 'zod';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { CatalogDesignUseCases } from '../application/catalog-design.use-cases';
import { toAdminCategoryDto, toAdminTemplateDto } from './catalog-administration.presenter';

@ApiTags('catalog administration')
@Controller('catalog/admin')
@RequireCapabilities(Capability.AdministrationManage)
export class CatalogDesignController {
  constructor(private readonly design: CatalogDesignUseCases) {}
  @Get('category-assignments')
  exportAssignments() {
    return this.design.exportCategoryAssignments();
  }
  @Post('category-assignments/preview')
  previewAssignments(
    @Body(new ZodValidationPipe(previewCategorySkuAssignmentsSchema))
    body: PreviewCategorySkuAssignmentsInput,
  ) {
    return this.design.previewCategoryAssignments(body.rows);
  }
  @Post('category-assignments/confirm')
  confirmAssignments(
    @Body(new ZodValidationPipe(confirmCategorySkuAssignmentsSchema))
    body: ConfirmCategorySkuAssignmentsInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.design.confirmCategoryAssignments(body.rows, actor);
  }
  @Post('categories')
  async create(
    @Body(new ZodValidationPipe(createCatalogCategorySchema)) body: CreateCatalogCategoryInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return toAdminCategoryDto(await this.design.createCategory(body, actor));
  }
  @Patch('categories/:id/parent')
  async move(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moveCatalogCategorySchema)) body: MoveCatalogCategoryInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return toAdminCategoryDto(await this.design.moveCategory(id, body, actor));
  }
  @Post('categories/:id/template')
  async configure(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(configureCategoryTemplateSchema))
    body: ConfigureCategoryTemplateInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return toAdminTemplateDto(await this.design.configureTemplate(id, body, actor));
  }
  @Post('templates/:id/attributes')
  async add(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addTemplateAttributeSchema)) body: AddTemplateAttributeInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return toAdminTemplateDto(await this.design.addAttribute(id, body, actor));
  }
  @Get('templates/:id/inheritance-preview')
  async preview(
    @Param('id') id: string,
    @Query('unifiedCode', new ZodValidationPipe(z.string().trim().min(1).max(200))) code: string,
  ) {
    return this.design.preview(id, code);
  }
}
