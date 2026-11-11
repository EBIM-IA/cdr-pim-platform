import { Inject, Injectable } from '@nestjs/common';
import { assertUuid, newUuid, getCorrelationId, ForbiddenError, type Clock } from '@cdr/shared';
import { CLOCK } from '../../../shared/tokens';
import {
  Capability,
  actorHasCapability,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import {
  CATALOG_DESIGN_REPOSITORY,
  type CatalogDesignRepositoryPort,
} from '../domain/ports/catalog-design.repository.port';

@Injectable()
export class CatalogDesignUseCases {
  constructor(
    @Inject(CATALOG_DESIGN_REPOSITORY) private readonly repository: CatalogDesignRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  exportCategoryAssignments() {
    return this.repository.exportCategoryAssignments();
  }
  previewCategoryAssignments(
    rows: Parameters<CatalogDesignRepositoryPort['previewCategoryAssignments']>[0],
  ) {
    return this.repository.previewCategoryAssignments(rows);
  }
  confirmCategoryAssignments(
    rows: readonly {
      sku: string;
      categorySlug: string;
      variantKey?: string;
      expectedTemplateId: string | null;
      targetTemplateId: string;
    }[],
    actor: AuthenticatedActor,
  ) {
    return this.repository.confirmCategoryAssignments(
      rows.map((row) => ({
        ...row,
        targetTemplateId: assertUuid(row.targetTemplateId),
        expectedTemplateId: row.expectedTemplateId ? assertUuid(row.expectedTemplateId) : null,
      })),
      this.audit(actor),
    );
  }
  private audit(actor: AuthenticatedActor) {
    if (!actorHasCapability(actor, Capability.AdministrationManage))
      throw new ForbiddenError('Solo ADMINISTRADOR puede modificar categorías y plantillas');
    return {
      actorId: actor.id,
      correlationId: getCorrelationId() ?? newUuid(),
      occurredAt: this.clock.now(),
    };
  }
  createCategory(
    input: Omit<
      Parameters<CatalogDesignRepositoryPort['createCategory']>[0],
      'id' | 'audit' | 'parentId'
    > & { parentId: string | null },
    actor: AuthenticatedActor,
  ) {
    return this.repository.createCategory({
      ...input,
      id: newUuid(),
      parentId: input.parentId ? assertUuid(input.parentId) : null,
      audit: this.audit(actor),
    });
  }
  moveCategory(
    id: string,
    input: { parentId: string | null; expectedUpdatedAt: string },
    actor: AuthenticatedActor,
  ) {
    return this.repository.moveCategory({
      id: assertUuid(id),
      parentId: input.parentId ? assertUuid(input.parentId) : null,
      expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      audit: this.audit(actor),
    });
  }
  configureTemplate(
    categoryId: string,
    input: {
      mode: 'assign' | 'copy' | 'empty';
      sourceTemplateId?: string;
      name: string;
      expectedUpdatedAt: string;
    },
    actor: AuthenticatedActor,
  ) {
    const { sourceTemplateId, ...configuration } = input;
    return this.repository.configureTemplate({
      ...configuration,
      id: newUuid(),
      categoryId: assertUuid(categoryId),
      ...(sourceTemplateId ? { sourceTemplateId: assertUuid(sourceTemplateId) } : {}),
      expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      audit: this.audit(actor),
    });
  }
  addAttribute(
    templateId: string,
    input: Omit<
      Parameters<CatalogDesignRepositoryPort['addAttribute']>[0],
      'id' | 'audit' | 'templateId' | 'expectedUpdatedAt'
    > & { expectedUpdatedAt: string },
    actor: AuthenticatedActor,
  ) {
    return this.repository.addAttribute({
      ...input,
      id: newUuid(),
      templateId: assertUuid(templateId),
      expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      audit: this.audit(actor),
    });
  }
  preview(templateId: string, unifiedCode: string) {
    return this.repository.previewInheritance(assertUuid(templateId), unifiedCode.trim());
  }
}
