import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CreateExternalHomologInput,
  type EligibleHomologSearchQuery,
  type ExternalHomologDto,
  type HomologListQuery,
  type HomologSearchResultDto,
  type UpdateExternalHomologInput,
  createExternalHomologSchema,
  eligibleHomologSearchQuerySchema,
  homologListQuerySchema,
  updateExternalHomologSchema,
} from '@cdr/contracts';

import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  CreateExternalHomologUseCase,
  ListExternalHomologsUseCase,
  SearchEligibleHomologsUseCase,
  UpdateExternalHomologUseCase,
} from '../application/manage-external-homologs.use-cases';
import type { ExternalHomolog } from '../domain/entities/external-homolog';

@ApiTags('equivalences')
@Controller('equivalences')
@RequireCapabilities(Capability.EquivalencesRead)
export class ExternalHomologsController {
  constructor(
    private readonly listHomologs: ListExternalHomologsUseCase,
    private readonly createHomolog: CreateExternalHomologUseCase,
    private readonly updateHomolog: UpdateExternalHomologUseCase,
    private readonly searchHomologs: SearchEligibleHomologsUseCase,
  ) {}

  @Get('homologs')
  async list(
    @Query(new ZodValidationPipe(homologListQuerySchema)) query: HomologListQuery,
  ): Promise<ExternalHomologDto[]> {
    return (await this.listHomologs.execute(query)).map(toDto);
  }

  @Post('homologs')
  @RequireCapabilities(Capability.EquivalencesWrite)
  async create(
    @Body(new ZodValidationPipe(createExternalHomologSchema)) body: CreateExternalHomologInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ExternalHomologDto> {
    return toDto(await this.createHomolog.execute(body, actor));
  }

  @Patch('homologs/:id')
  @RequireCapabilities(Capability.EquivalencesWrite)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateExternalHomologSchema)) body: UpdateExternalHomologInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ExternalHomologDto> {
    return toDto(await this.updateHomolog.execute(id, body, actor));
  }

  @Get('homolog-search')
  @ApiOperation({
    summary: 'Expand an exact external code to group products using approved, active homologs only',
  })
  async eligibleSearch(
    @Query(new ZodValidationPipe(eligibleHomologSearchQuerySchema))
    query: EligibleHomologSearchQuery,
  ): Promise<HomologSearchResultDto[]> {
    return (await this.searchHomologs.execute(query.q)).map((match) => ({
      homolog: toDto(match.homolog),
      products: [...match.products],
    }));
  }
}

function toDto(homolog: ExternalHomolog): ExternalHomologDto {
  const value = homolog.toSnapshot();
  return {
    ...value,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
