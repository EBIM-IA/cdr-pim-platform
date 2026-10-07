import { Inject, Injectable } from '@nestjs/common';
import type { WorkspaceDto, WorkspaceSlug } from '@cdr/contracts';
import { ForbiddenError } from '@cdr/shared';

import {
  type AuthenticatedActor,
  Capability,
  actorHasCapability,
} from '../../identity/domain/entities/role';
import {
  WORKSPACE_READ_MODEL,
  type WorkspaceReadModelPort,
} from '../domain/ports/workspace-read-model.port';

@Injectable()
export class GetWorkspaceUseCase {
  constructor(@Inject(WORKSPACE_READ_MODEL) private readonly readModel: WorkspaceReadModelPort) {}

  execute(slug: WorkspaceSlug, actor: AuthenticatedActor): Promise<WorkspaceDto> {
    const required = WORKSPACE_CAPABILITIES[slug];
    if (!actorHasCapability(actor, required)) {
      throw new ForbiddenError('Insufficient capability to access workspace', {
        workspace: slug,
        required: [required],
      });
    }
    return this.readModel.read(slug, actor);
  }
}

const WORKSPACE_CAPABILITIES: Readonly<Record<WorkspaceSlug, Capability>> = {
  categories: Capability.MenuCategoriesView,
  templates: Capability.MenuTemplatesView,
  applications: Capability.MenuApplicationsView,
  equivalences: Capability.MenuEquivalencesView,
  documents: Capability.MenuDocumentsView,
  imports: Capability.MenuImportsView,
  quality: Capability.MenuAiQualityView,
  publication: Capability.MenuPublicationView,
  integrations: Capability.MenuIntegrationsView,
  reports: Capability.MenuReportsView,
  administration: Capability.MenuAdministrationView,
};
