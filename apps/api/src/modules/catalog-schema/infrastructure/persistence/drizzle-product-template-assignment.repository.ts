import { Inject, Injectable } from '@nestjs/common';
import type { Uuid } from '@cdr/shared';
import { and, eq, inArray } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { AuditAction, createAuditEntry } from '../../../audit/domain/entities/audit-entry';
import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';
import type {
  ProductTemplateAssignmentRepositoryPort,
  ReassignProductTemplateResult,
} from '../../domain/ports/product-template-assignment.repository.port';
import {
  attributeTemplates,
  catalogCategories,
  productTemplateAssignments,
  templateAttributeRoleAccess,
} from './catalog-schema.tables';
import { recordAuditWithin } from './record-audit-within-transaction';

@Injectable()
export class DrizzleProductTemplateAssignmentRepository implements ProductTemplateAssignmentRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async reassign(
    input: Parameters<ProductTemplateAssignmentRepositoryPort['reassign']>[0],
  ): Promise<ReassignProductTemplateResult> {
    // Fail closed before querying by UUID. A template is selectable only when the same
    // role-filtered catalogue policy that feeds the UI exposes at least one of its attributes.
    if (input.roles.length === 0) return { kind: 'template_not_found' };
    return this.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select({
          templateId: productTemplateAssignments.templateId,
          assignedAt: productTemplateAssignments.assignedAt,
          categoryId: attributeTemplates.categoryId,
        })
        .from(productTemplateAssignments)
        .innerJoin(products, eq(products.id, productTemplateAssignments.productId))
        .innerJoin(
          attributeTemplates,
          eq(attributeTemplates.id, productTemplateAssignments.templateId),
        )
        .where(eq(productTemplateAssignments.productId, input.productId))
        .for('update')
        .limit(1);
      if (!current) return { kind: 'product_not_found' } as const;
      if (current.templateId !== input.expectedTemplateId) {
        return {
          kind: 'version_conflict',
          currentTemplateId: current.templateId as Uuid,
        } as const;
      }

      const [target] = await transaction
        .select({
          id: attributeTemplates.id,
          categoryId: attributeTemplates.categoryId,
          categorySlug: catalogCategories.slug,
          categoryName: catalogCategories.name,
          variantKey: attributeTemplates.variantKey,
          name: attributeTemplates.name,
          version: attributeTemplates.version,
        })
        .from(attributeTemplates)
        .innerJoin(catalogCategories, eq(catalogCategories.id, attributeTemplates.categoryId))
        .innerJoin(
          templateAttributeRoleAccess,
          eq(templateAttributeRoleAccess.templateId, attributeTemplates.id),
        )
        .where(
          and(
            eq(attributeTemplates.id, input.templateId),
            eq(attributeTemplates.status, 'active'),
            eq(catalogCategories.active, true),
            inArray(templateAttributeRoleAccess.role, [...input.roles]),
            eq(templateAttributeRoleAccess.canView, true),
          ),
        )
        .limit(1);
      if (!target) return { kind: 'template_not_found' } as const;
      if (target.categoryId !== current.categoryId) return { kind: 'different_category' } as const;

      if (current.templateId !== target.id) {
        await transaction
          .update(productTemplateAssignments)
          .set({ templateId: target.id, assignedAt: input.now })
          .where(eq(productTemplateAssignments.productId, input.productId));
        await recordAuditWithin(
          transaction,
          createAuditEntry({
            resourceType: 'product',
            resourceId: input.productId,
            action: AuditAction.Updated,
            actorId: input.audit.actorId,
            source: 'api',
            correlationId: input.audit.correlationId,
            occurredAt: input.now,
            changes: {
              templateId: { before: current.templateId, after: target.id },
            },
          }),
        );
      }

      return {
        kind: 'updated',
        previousTemplateId: current.templateId as Uuid,
        assignment: {
          productId: input.productId,
          category: {
            id: target.categoryId as Uuid,
            slug: target.categorySlug,
            name: target.categoryName,
          },
          template: {
            id: target.id as Uuid,
            variantKey: target.variantKey,
            name: target.name,
            version: target.version,
          },
          assignedAt: current.templateId === target.id ? current.assignedAt : input.now,
        },
      } as const;
    });
  }
}
