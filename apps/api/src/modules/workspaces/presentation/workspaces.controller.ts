import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  type WorkspaceDto,
  type WorkspaceSlug,
  workspaceSchema,
  workspaceSlugSchema,
} from '@cdr/contracts';

import { openApiSchema } from '../../../shared/http/openapi';
import { RequireRole } from '../../../shared/http/role.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { GetWorkspaceUseCase } from '../application/get-workspace.use-case';
import { type AuthenticatedActor, Role } from '../../identity/domain/entities/role';

interface AuthenticatedRequest {
  readonly actor: AuthenticatedActor;
}

@ApiTags('workspaces')
@Controller('workspaces')
@RequireRole(Role.Viewer)
export class WorkspacesController {
  constructor(private readonly getWorkspace: GetWorkspaceUseCase) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Get one live operational workspace projection' })
  @ApiParam({ name: 'slug', enum: workspaceSlugSchema.options })
  @ApiOkResponse({ schema: openApiSchema(workspaceSchema) })
  async findOne(
    @Param('slug', new ZodValidationPipe(workspaceSlugSchema)) slug: WorkspaceSlug,
    @Req() request: AuthenticatedRequest,
  ): Promise<WorkspaceDto> {
    // The global guards establish the actor and enforce VIEWER-or-higher before this runs.
    // Output validation is intentional. These projections combine SQL and configuration;
    // parsing here prevents a malformed cell from leaking into the generic web renderer.
    return workspaceSchema.parse(await this.getWorkspace.execute(slug, request.actor));
  }
}
