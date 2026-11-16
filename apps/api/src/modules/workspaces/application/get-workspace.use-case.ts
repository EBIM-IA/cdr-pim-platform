import { Inject, Injectable } from '@nestjs/common';
import type { WorkspaceDto, WorkspaceQuery, WorkspaceSlug } from '@cdr/contracts';
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

  execute(
    slug: WorkspaceSlug,
    actor: AuthenticatedActor,
    query: WorkspaceQuery = {},
  ): Promise<WorkspaceDto> {
    const required = WORKSPACE_CAPABILITIES[slug];
    if (!required.every((capability) => actorHasCapability(actor, capability))) {
      throw new ForbiddenError('Insufficient capability to access workspace', {
        workspace: slug,
        required: [...required],
      });
    }
    return this.readModel.read(slug, actor, query);
  }
}

/** Menu visibility never replaces the data/operation authorization of a module. */
const WORKSPACE_CAPABILITIES: Readonly<Record<WorkspaceSlug, readonly Capability[]>> = {
  categories: [Capability.CatalogRead, Capability.MenuCategoriesView, Capability.AttributesRead],
  templates: [Capability.CatalogRead, Capability.MenuTemplatesView, Capability.AttributesRead],
  applications: [
    Capability.CatalogRead,
    Capability.MenuApplicationsView,
    Capability.ApplicationsRead,
  ],
  equivalences: [
    Capability.CatalogRead,
    Capability.MenuEquivalencesView,
    Capability.EquivalencesRead,
  ],
  documents: [Capability.CatalogRead, Capability.MenuDocumentsView],
  catalogs: [Capability.CatalogRead, Capability.MenuCatalogsView, Capability.ProductCatalogsRead],
  imports: [Capability.CatalogRead, Capability.MenuImportsView, Capability.ImportsExecute],
  quality: [Capability.CatalogRead, Capability.MenuAiQualityView, Capability.AiQualityExecute],
  publication: [
    Capability.CatalogRead,
    Capability.MenuPublicationView,
    Capability.PublicationExecute,
  ],
  integrations: [
    Capability.CatalogRead,
    Capability.MenuIntegrationsView,
    Capability.IntegrationsManage,
  ],
  reports: [Capability.CatalogRead, Capability.MenuReportsView, Capability.ReportsRead],
  administration: [
    Capability.CatalogRead,
    Capability.MenuAdministrationView,
    Capability.AdministrationManage,
  ],
};
