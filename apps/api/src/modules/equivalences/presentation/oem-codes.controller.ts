import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CreateGroupOemCodeInput,
  type DeactivateGroupOemCodeQuery,
  type EligibleOemSearchQuery,
  type GroupOemCodeDto,
  type OemCodeListQuery,
  type OemSearchResultDto,
  type UpdateGroupOemCodeInput,
  createGroupOemCodeSchema,
  deactivateGroupOemCodeQuerySchema,
  eligibleOemSearchQuerySchema,
  oemCodeListQuerySchema,
  updateGroupOemCodeSchema,
} from '@cdr/contracts';

import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  CreateGroupOemCodeUseCase,
  DeactivateGroupOemCodeUseCase,
  ListGroupOemCodesUseCase,
  SearchEligibleOemCodesUseCase,
  UpdateGroupOemCodeUseCase,
} from '../application/manage-group-oem-codes.use-cases';
import type { GroupOemCode } from '../domain/entities/group-oem-code';

@ApiTags('equivalences')
@Controller('equivalences')
@RequireCapabilities(Capability.EquivalencesRead)
export class OemCodesController {
  constructor(
    private readonly listOem: ListGroupOemCodesUseCase,
    private readonly createOem: CreateGroupOemCodeUseCase,
    private readonly updateOem: UpdateGroupOemCodeUseCase,
    private readonly deactivateOem: DeactivateGroupOemCodeUseCase,
    private readonly searchOem: SearchEligibleOemCodesUseCase,
  ) {}

  @Get('oem')
  async list(
    @Query(new ZodValidationPipe(oemCodeListQuerySchema)) query: OemCodeListQuery,
  ): Promise<GroupOemCodeDto[]> {
    return (await this.listOem.execute(query)).map(toDto);
  }

  @Post('oem')
  @RequireCapabilities(Capability.EquivalencesWrite)
  async create(
    @Body(new ZodValidationPipe(createGroupOemCodeSchema)) body: CreateGroupOemCodeInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<GroupOemCodeDto> {
    return toDto(await this.createOem.execute(body, actor));
  }

  @Patch('oem/:id')
  @RequireCapabilities(Capability.EquivalencesWrite)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateGroupOemCodeSchema)) body: UpdateGroupOemCodeInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<GroupOemCodeDto> {
    return toDto(await this.updateOem.execute(id, body, actor));
  }

  @Delete('oem/:id')
  @RequireCapabilities(Capability.EquivalencesWrite)
  async deactivate(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(deactivateGroupOemCodeQuerySchema))
    query: DeactivateGroupOemCodeQuery,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<GroupOemCodeDto> {
    return toDto(await this.deactivateOem.execute(id, query.expectedUpdatedAt, actor));
  }

  @Get('oem-search')
  @ApiOperation({
    summary: 'Search active, approved automotive OEM codes or brands and expand the group',
  })
  async eligibleSearch(
    @Query(new ZodValidationPipe(eligibleOemSearchQuerySchema)) query: EligibleOemSearchQuery,
  ): Promise<OemSearchResultDto[]> {
    return (await this.searchOem.execute(query.q)).map((match) => ({
      oem: toDto(match.oem),
      products: [...match.products],
    }));
  }
}

function toDto(oem: GroupOemCode): GroupOemCodeDto {
  const value = oem.toSnapshot();
  return {
    ...value,
    brands: [...value.brands],
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
