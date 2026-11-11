import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  catalogParameterQuerySchema,
  saveCatalogParameterSchema,
  type SaveCatalogParameterInput,
} from '@cdr/contracts';
import type { z } from 'zod';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { CatalogParametersUseCase } from '../application/catalog-parameters.use-case';
@Controller('catalog/admin/parameters')
@RequireCapabilities(Capability.AttributesRead)
export class CatalogParametersController {
  constructor(private readonly parameters: CatalogParametersUseCase) {}
  @Get()
  async list(
    @Query(new ZodValidationPipe(catalogParameterQuerySchema))
    query: z.infer<typeof catalogParameterQuerySchema>,
  ) {
    return (await this.parameters.list(query.kind)).map((row) => ({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
  @Post()
  @RequireCapabilities(Capability.AdministrationManage)
  async save(
    @Body(new ZodValidationPipe(saveCatalogParameterSchema)) body: SaveCatalogParameterInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    const row = await this.parameters.save(body, actor);
    return { ...row, updatedAt: row.updatedAt.toISOString() };
  }
}
