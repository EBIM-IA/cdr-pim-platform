import { Inject, Injectable } from '@nestjs/common';
import type { Uuid } from '@cdr/shared';
import { and, asc, eq } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { AuditAction, createAuditEntry } from '../../../audit/domain/entities/audit-entry';
import type {
  AdminAttributeTemplate,
  AdminCatalogCategory,
  AdminTemplateAttribute,
  AttributeRoleAccess,
} from '../../domain/entities/catalog-administration';
import type {
  AdminMutationResult,
  CatalogAdministrationRepositoryPort,
} from '../../domain/ports/catalog-administration.repository.port';
import {
  attributeDefinitions,
  attributeTemplates,
  catalogCategories,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
} from './catalog-schema.tables';
import { recordAuditWithin } from './record-audit-within-transaction';

@Injectable()
export class DrizzleCatalogAdministrationRepository implements CatalogAdministrationRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listCategories(includeInactive: boolean): Promise<readonly AdminCatalogCategory[]> {
    const rows = await this.db
      .select()
      .from(catalogCategories)
      .where(includeInactive ? undefined : eq(catalogCategories.active, true))
      .orderBy(catalogCategories.path);
    return rows.map(toCategory);
  }

  async updateCategory(
    input: Parameters<CatalogAdministrationRepositoryPort['updateCategory']>[0],
  ): Promise<AdminMutationResult<AdminCatalogCategory>> {
    return this.db.transaction(async (transaction) => {
      const [row] = await transaction
        .select()
        .from(catalogCategories)
        .where(eq(catalogCategories.id, input.id))
        .for('update')
        .limit(1);
      if (!row) return { kind: 'not_found' } as const;
      if (row.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        return { kind: 'version_conflict', actualUpdatedAt: row.updatedAt } as const;
      }
      const before = toCategory(row);
      const [updated] = await transaction
        .update(catalogCategories)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
        })
        .where(eq(catalogCategories.id, input.id))
        .returning();
      if (!updated) return { kind: 'not_found' } as const;
      const after = toCategory(updated);
      await recordAuditWithin(
        transaction,
        createAuditEntry({
          resourceType: 'catalog_category',
          resourceId: input.id,
          action: AuditAction.Updated,
          actorId: input.audit.actorId,
          source: 'api',
          correlationId: input.audit.correlationId,
          occurredAt: input.audit.occurredAt,
          changes: changedFields(before, after, ['name', 'active', 'position']),
        }),
      );
      return { kind: 'updated', before, after } as const;
    });
  }

  async listTemplates(categoryId?: Uuid): Promise<readonly AdminAttributeTemplate[]> {
    const rows = await this.db
      .select({
        id: attributeTemplates.id,
        categoryId: attributeTemplates.categoryId,
        categoryName: catalogCategories.name,
        name: attributeTemplates.name,
        version: attributeTemplates.version,
        status: attributeTemplates.status,
        createdAt: attributeTemplates.createdAt,
        updatedAt: attributeTemplates.updatedAt,
      })
      .from(attributeTemplates)
      .innerJoin(catalogCategories, eq(catalogCategories.id, attributeTemplates.categoryId))
      .where(categoryId ? eq(attributeTemplates.categoryId, categoryId) : undefined)
      .orderBy(catalogCategories.path, asc(attributeTemplates.version));
    return rows.map(toTemplate);
  }

  async getTemplate(id: Uuid): Promise<AdminAttributeTemplate | null> {
    const [header] = await this.db
      .select({
        id: attributeTemplates.id,
        categoryId: attributeTemplates.categoryId,
        categoryName: catalogCategories.name,
        name: attributeTemplates.name,
        version: attributeTemplates.version,
        status: attributeTemplates.status,
        createdAt: attributeTemplates.createdAt,
        updatedAt: attributeTemplates.updatedAt,
      })
      .from(attributeTemplates)
      .innerJoin(catalogCategories, eq(catalogCategories.id, attributeTemplates.categoryId))
      .where(eq(attributeTemplates.id, id))
      .limit(1);
    if (!header) return null;
    return { ...toTemplate(header), attributes: await this.loadTemplateAttributes(id) };
  }

  async updateTemplateAttribute(
    input: Parameters<CatalogAdministrationRepositoryPort['updateTemplateAttribute']>[0],
  ): Promise<AdminMutationResult<AdminTemplateAttribute>> {
    return this.db.transaction(async (transaction) => {
      const [assignment] = await transaction
        .select({
          id: attributeDefinitions.id,
          key: attributeDefinitions.key,
          label: attributeDefinitions.label,
          dataType: attributeDefinitions.dataType,
          unit: attributeDefinitions.unit,
          allowedValues: attributeDefinitions.allowedValues,
          sourceAuthority: attributeDefinitions.sourceAuthority,
          required: templateAttributeAssignments.required,
          replicable: templateAttributeAssignments.replicable,
          searchable: templateAttributeAssignments.searchable,
          includeInTechnicalSheet: templateAttributeAssignments.includeInTechnicalSheet,
          active: templateAttributeAssignments.active,
          position: templateAttributeAssignments.position,
          updatedAt: templateAttributeAssignments.updatedAt,
        })
        .from(templateAttributeAssignments)
        .innerJoin(
          attributeDefinitions,
          eq(attributeDefinitions.id, templateAttributeAssignments.attributeDefinitionId),
        )
        .where(
          and(
            eq(templateAttributeAssignments.templateId, input.templateId),
            eq(templateAttributeAssignments.attributeDefinitionId, input.attributeDefinitionId),
          ),
        )
        .for('update')
        .limit(1);
      if (!assignment) return { kind: 'not_found' } as const;
      const beforeAccess = await this.loadRoleAccess(
        input.templateId,
        input.attributeDefinitionId,
        transaction,
      );
      const before = toAdminAttribute(assignment, beforeAccess);
      if (assignment.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        return { kind: 'version_conflict', actualUpdatedAt: assignment.updatedAt } as const;
      }

      await transaction
        .update(templateAttributeAssignments)
        .set({
          // Also advances the optimistic token when the PATCH changes only roleAccess.
          updatedAt: input.audit.occurredAt,
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.required !== undefined ? { required: input.required } : {}),
          ...(input.replicable !== undefined ? { replicable: input.replicable } : {}),
          ...(input.searchable !== undefined ? { searchable: input.searchable } : {}),
          ...(input.includeInTechnicalSheet !== undefined
            ? { includeInTechnicalSheet: input.includeInTechnicalSheet }
            : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
        })
        .where(
          and(
            eq(templateAttributeAssignments.templateId, input.templateId),
            eq(templateAttributeAssignments.attributeDefinitionId, input.attributeDefinitionId),
          ),
        );
      if (input.roleAccess) {
        for (const access of input.roleAccess) {
          await transaction
            .insert(templateAttributeRoleAccess)
            .values({
              templateId: input.templateId,
              attributeDefinitionId: input.attributeDefinitionId,
              ...access,
            })
            .onConflictDoUpdate({
              target: [
                templateAttributeRoleAccess.templateId,
                templateAttributeRoleAccess.attributeDefinitionId,
                templateAttributeRoleAccess.role,
              ],
              set: {
                canView: access.canView,
                canEdit: access.canEdit,
                canImport: access.canImport,
                canExport: access.canExport,
              },
            });
        }
      }
      const [updated] = await transaction
        .select({
          id: attributeDefinitions.id,
          key: attributeDefinitions.key,
          label: attributeDefinitions.label,
          dataType: attributeDefinitions.dataType,
          unit: attributeDefinitions.unit,
          allowedValues: attributeDefinitions.allowedValues,
          sourceAuthority: attributeDefinitions.sourceAuthority,
          required: templateAttributeAssignments.required,
          replicable: templateAttributeAssignments.replicable,
          searchable: templateAttributeAssignments.searchable,
          includeInTechnicalSheet: templateAttributeAssignments.includeInTechnicalSheet,
          active: templateAttributeAssignments.active,
          position: templateAttributeAssignments.position,
          updatedAt: templateAttributeAssignments.updatedAt,
        })
        .from(templateAttributeAssignments)
        .innerJoin(
          attributeDefinitions,
          eq(attributeDefinitions.id, templateAttributeAssignments.attributeDefinitionId),
        )
        .where(
          and(
            eq(templateAttributeAssignments.templateId, input.templateId),
            eq(templateAttributeAssignments.attributeDefinitionId, input.attributeDefinitionId),
          ),
        )
        .limit(1);
      if (!updated) return { kind: 'not_found' } as const;
      const afterAccess = await this.loadRoleAccess(
        input.templateId,
        input.attributeDefinitionId,
        transaction,
      );
      const after = toAdminAttribute(updated, afterAccess);
      await recordAuditWithin(
        transaction,
        createAuditEntry({
          resourceType: 'template_attribute_assignment',
          resourceId: `${input.templateId}:${input.attributeDefinitionId}`,
          action: AuditAction.Updated,
          actorId: input.audit.actorId,
          source: 'api',
          correlationId: input.audit.correlationId,
          occurredAt: input.audit.occurredAt,
          changes: {
            configuration: {
              before: assignmentConfiguration(before),
              after: assignmentConfiguration(after),
            },
            roleAccess: { before: before.roleAccess, after: after.roleAccess },
          },
        }),
      );
      return { kind: 'updated', before, after } as const;
    });
  }

  private async loadTemplateAttributes(templateId: Uuid): Promise<AdminTemplateAttribute[]> {
    const rows = await this.db
      .select({
        id: attributeDefinitions.id,
        key: attributeDefinitions.key,
        label: attributeDefinitions.label,
        dataType: attributeDefinitions.dataType,
        unit: attributeDefinitions.unit,
        allowedValues: attributeDefinitions.allowedValues,
        sourceAuthority: attributeDefinitions.sourceAuthority,
        required: templateAttributeAssignments.required,
        replicable: templateAttributeAssignments.replicable,
        searchable: templateAttributeAssignments.searchable,
        includeInTechnicalSheet: templateAttributeAssignments.includeInTechnicalSheet,
        active: templateAttributeAssignments.active,
        position: templateAttributeAssignments.position,
        updatedAt: templateAttributeAssignments.updatedAt,
      })
      .from(templateAttributeAssignments)
      .innerJoin(
        attributeDefinitions,
        eq(attributeDefinitions.id, templateAttributeAssignments.attributeDefinitionId),
      )
      .where(eq(templateAttributeAssignments.templateId, templateId))
      .orderBy(templateAttributeAssignments.position, attributeDefinitions.key);
    const access = await this.loadRoleAccess(templateId);
    return rows.map((row) =>
      toAdminAttribute(
        row,
        access.filter((item) => item.attributeDefinitionId === row.id).map(stripAttributeId),
      ),
    );
  }

  private async loadRoleAccess(
    templateId: Uuid,
    attributeDefinitionId?: Uuid,
    database: Database | Parameters<Parameters<Database['transaction']>[0]>[0] = this.db,
  ): Promise<(AttributeRoleAccess & { attributeDefinitionId: string })[]> {
    const rows = await database
      .select()
      .from(templateAttributeRoleAccess)
      .where(
        and(
          eq(templateAttributeRoleAccess.templateId, templateId),
          ...(attributeDefinitionId
            ? [eq(templateAttributeRoleAccess.attributeDefinitionId, attributeDefinitionId)]
            : []),
        ),
      )
      .orderBy(templateAttributeRoleAccess.role);
    return rows.map((row) => ({
      attributeDefinitionId: row.attributeDefinitionId,
      role: row.role as AttributeRoleAccess['role'],
      canView: row.canView,
      canEdit: row.canEdit,
      canImport: row.canImport,
      canExport: row.canExport,
    }));
  }
}

function toCategory(row: typeof catalogCategories.$inferSelect): AdminCatalogCategory {
  return { ...row, id: row.id as Uuid, parentId: row.parentId as Uuid | null };
}

function toTemplate(row: {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  version: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): AdminAttributeTemplate {
  return {
    ...row,
    id: row.id as Uuid,
    categoryId: row.categoryId as Uuid,
    status: row.status as AdminAttributeTemplate['status'],
  };
}

function toAdminAttribute(
  row: Omit<AdminTemplateAttribute, 'id' | 'dataType' | 'sourceAuthority' | 'roleAccess'> & {
    id: string;
    dataType: string;
    sourceAuthority: string;
  },
  roleAccess: readonly AttributeRoleAccess[],
): AdminTemplateAttribute {
  return {
    ...row,
    id: row.id as Uuid,
    dataType: row.dataType as AdminTemplateAttribute['dataType'],
    sourceAuthority: row.sourceAuthority as AdminTemplateAttribute['sourceAuthority'],
    roleAccess,
  };
}

function stripAttributeId(
  access: AttributeRoleAccess & { attributeDefinitionId: string },
): AttributeRoleAccess {
  const { attributeDefinitionId: _attributeDefinitionId, ...result } = access;
  return result;
}

function assignmentConfiguration(attribute: AdminTemplateAttribute) {
  return {
    active: attribute.active,
    required: attribute.required,
    replicable: attribute.replicable,
    searchable: attribute.searchable,
    includeInTechnicalSheet: attribute.includeInTechnicalSheet,
    position: attribute.position,
  };
}

function changedFields<T extends object>(
  before: T,
  after: T,
  keys: readonly (keyof T)[],
): Record<string, { before: unknown; after: unknown }> {
  return Object.fromEntries(
    keys
      .filter((key) => before[key] !== after[key])
      .map((key) => [String(key), { before: before[key], after: after[key] }]),
  );
}
