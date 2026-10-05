import { Inject, Injectable } from '@nestjs/common';
import {
  type Clock,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  assertUuid,
  getCorrelationId,
  newUuid,
} from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import {
  Capability,
  type AuthenticatedActor,
  actorHasCapability,
} from '../../identity/domain/entities/role';
import type {
  AdminAttributeTemplate,
  AdminCatalogCategory,
  AdminTemplateAttribute,
  AttributeRoleAccess,
} from '../domain/entities/catalog-administration';
import {
  CATALOG_ADMINISTRATION_REPOSITORY,
  type CatalogAdministrationRepositoryPort,
} from '../domain/ports/catalog-administration.repository.port';

@Injectable()
export class ListAdminCategoriesUseCase {
  constructor(
    @Inject(CATALOG_ADMINISTRATION_REPOSITORY)
    private readonly catalog: CatalogAdministrationRepositoryPort,
  ) {}

  execute(includeInactive: boolean): Promise<readonly AdminCatalogCategory[]> {
    return this.catalog.listCategories(includeInactive);
  }
}

@Injectable()
export class UpdateCatalogCategoryUseCase {
  constructor(
    @Inject(CATALOG_ADMINISTRATION_REPOSITORY)
    private readonly catalog: CatalogAdministrationRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    categoryId: string,
    input: {
      name?: string;
      active?: boolean;
      position?: number;
      expectedUpdatedAt: string;
    },
    actor: AuthenticatedActor,
  ): Promise<AdminCatalogCategory> {
    const result = await this.catalog.updateCategory({
      id: assertUuid(categoryId, 'categoryId'),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      audit: auditMetadata(actor, this.clock.now()),
    });
    if (result.kind === 'not_found') throw new NotFoundError('Catalog category', categoryId);
    if (result.kind === 'version_conflict') {
      throw new ConflictError('The category was modified by another request', {
        categoryId,
        actualUpdatedAt: result.actualUpdatedAt.toISOString(),
      });
    }
    return result.after;
  }
}

@Injectable()
export class ListAdminTemplatesUseCase {
  constructor(
    @Inject(CATALOG_ADMINISTRATION_REPOSITORY)
    private readonly catalog: CatalogAdministrationRepositoryPort,
  ) {}

  execute(categoryId?: string): Promise<readonly AdminAttributeTemplate[]> {
    return this.catalog.listTemplates(
      categoryId ? assertUuid(categoryId, 'categoryId') : undefined,
    );
  }
}

@Injectable()
export class GetAdminTemplateUseCase {
  constructor(
    @Inject(CATALOG_ADMINISTRATION_REPOSITORY)
    private readonly catalog: CatalogAdministrationRepositoryPort,
  ) {}

  async execute(templateId: string): Promise<AdminAttributeTemplate> {
    const template = await this.catalog.getTemplate(assertUuid(templateId, 'templateId'));
    if (!template) throw new NotFoundError('Attribute template', templateId);
    return template;
  }
}

@Injectable()
export class UpdateTemplateAttributeUseCase {
  constructor(
    @Inject(CATALOG_ADMINISTRATION_REPOSITORY)
    private readonly catalog: CatalogAdministrationRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    templateId: string,
    attributeDefinitionId: string,
    input: {
      active?: boolean;
      required?: boolean;
      replicable?: boolean;
      searchable?: boolean;
      includeInTechnicalSheet?: boolean;
      position?: number;
      roleAccess?: readonly AttributeRoleAccess[];
      expectedUpdatedAt: string;
    },
    actor: AuthenticatedActor,
  ): Promise<AdminTemplateAttribute> {
    // Template flags are part of day-to-day catalogue operations, but the role-access
    // matrix is an authorization policy and therefore requires an administrative grant.
    // Keep this check in the application boundary so it also protects non-HTTP callers.
    if (
      input.roleAccess !== undefined &&
      !actorHasCapability(actor, Capability.AdministrationManage)
    ) {
      throw new ForbiddenError('Insufficient capability to modify attribute role access', {
        required: [Capability.AdministrationManage],
      });
    }

    const result = await this.catalog.updateTemplateAttribute({
      templateId: assertUuid(templateId, 'templateId'),
      attributeDefinitionId: assertUuid(attributeDefinitionId, 'attributeDefinitionId'),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.required !== undefined ? { required: input.required } : {}),
      ...(input.replicable !== undefined ? { replicable: input.replicable } : {}),
      ...(input.searchable !== undefined ? { searchable: input.searchable } : {}),
      ...(input.includeInTechnicalSheet !== undefined
        ? { includeInTechnicalSheet: input.includeInTechnicalSheet }
        : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.roleAccess !== undefined ? { roleAccess: input.roleAccess } : {}),
      expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      audit: auditMetadata(actor, this.clock.now()),
    });
    if (result.kind === 'not_found') {
      throw new NotFoundError('Template attribute assignment', attributeDefinitionId);
    }
    if (result.kind === 'version_conflict') {
      throw new ConflictError('The template attribute was modified by another request', {
        templateId,
        attributeDefinitionId,
        actualUpdatedAt: result.actualUpdatedAt.toISOString(),
      });
    }
    return result.after;
  }
}

function auditMetadata(actor: AuthenticatedActor, occurredAt: Date) {
  return {
    actorId: actor.id,
    correlationId: getCorrelationId() ?? newUuid(),
    occurredAt,
  };
}
