import { Inject, Injectable } from '@nestjs/common';
import type { WorkspaceDto, WorkspaceSlug } from '@cdr/contracts';

import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  WORKSPACE_READ_MODEL,
  type WorkspaceReadModelPort,
} from '../domain/ports/workspace-read-model.port';

@Injectable()
export class GetWorkspaceUseCase {
  constructor(@Inject(WORKSPACE_READ_MODEL) private readonly readModel: WorkspaceReadModelPort) {}

  execute(slug: WorkspaceSlug, actor: AuthenticatedActor): Promise<WorkspaceDto> {
    return this.readModel.read(slug, actor);
  }
}
