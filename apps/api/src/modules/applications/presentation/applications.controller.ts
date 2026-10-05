import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type ApplicationListQuery,
  type CreateGroupApplicationInput,
  type GroupApplicationDto,
  type UpdateGroupApplicationInput,
  applicationListQuerySchema,
  createGroupApplicationSchema,
  groupApplicationSchema,
  updateGroupApplicationSchema,
} from '@cdr/contracts';

import { openApiSchema } from '../../../shared/http/openapi';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  CreateGroupApplicationUseCase,
  DeactivateGroupApplicationUseCase,
  ListGroupApplicationsUseCase,
  UpdateGroupApplicationUseCase,
} from '../application/manage-applications.use-cases';
import type { GroupApplication } from '../domain/entities/group-application';

@ApiTags('applications')
@Controller('applications')
@RequireCapabilities(Capability.ApplicationsRead)
export class ApplicationsController {
  constructor(
    private readonly listApplications: ListGroupApplicationsUseCase,
    private readonly createApplication: CreateGroupApplicationUseCase,
    private readonly updateApplication: UpdateGroupApplicationUseCase,
    private readonly deactivateApplication: DeactivateGroupApplicationUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List applications owned by a unified-code group' })
  async list(
    @Query(new ZodValidationPipe(applicationListQuerySchema)) query: ApplicationListQuery,
  ): Promise<GroupApplicationDto[]> {
    return (await this.listApplications.execute(query)).map(toDto);
  }

  @Post()
  @RequireCapabilities(Capability.ApplicationsWrite)
  @ApiOkResponse({ schema: openApiSchema(groupApplicationSchema) })
  async create(
    @Body(new ZodValidationPipe(createGroupApplicationSchema)) body: CreateGroupApplicationInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<GroupApplicationDto> {
    return toDto(await this.createApplication.execute(body, actor));
  }

  @Patch(':id')
  @RequireCapabilities(Capability.ApplicationsWrite)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateGroupApplicationSchema)) body: UpdateGroupApplicationInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<GroupApplicationDto> {
    return toDto(await this.updateApplication.execute(id, body, actor));
  }

  @Delete(':id')
  @RequireCapabilities(Capability.ApplicationsWrite)
  @ApiOperation({ summary: 'Soft-delete an application while retaining its provenance' })
  async deactivate(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<GroupApplicationDto> {
    return toDto(await this.deactivateApplication.execute(id, actor));
  }
}

function toDto(application: GroupApplication): GroupApplicationDto {
  const value = application.toSnapshot();
  return {
    ...value,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
