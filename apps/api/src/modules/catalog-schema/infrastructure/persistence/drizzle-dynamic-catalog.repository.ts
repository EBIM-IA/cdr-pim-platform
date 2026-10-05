import { Inject, Injectable } from '@nestjs/common';
import { type Uuid, ValidationError, newUuid } from '@cdr/shared';
import { and, asc, count, eq, ilike, inArray, max, or, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';
import { AuditAction, createAuditEntry } from '../../../audit/domain/entities/audit-entry';
import {
  auditChangeItems,
  auditEntries,
} from '../../../audit/infrastructure/persistence/audit.tables';
import { equivalenceGroupMembers } from '../../../equivalences/infrastructure/persistence/equivalences.tables';
import {
  type AttributeValueSource,
  type CatalogAttributeDataType,
  type CatalogAttributeValue,
  type CatalogGridProduct,
  type DynamicCatalogSchema,
  type ProductAttributeCell,
  type TemplateAttribute,
} from '../../domain/entities/catalog-schema';
import type {
  AttributeChange,
  CatalogAttributeFilter,
  CatalogGridOptions,
  DynamicCatalogRepositoryPort,
  ProductAttributeAssignment,
  UpdateAttributePersistenceResult,
} from '../../domain/ports/dynamic-catalog.repository.port';
import {
  attributeDefinitions,
  attributeTemplates,
  catalogCategories,
  productAttributeValues,
  productTemplateAssignments,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
  type ProductAttributeValueRow,
} from './catalog-schema.tables';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

@Injectable()
export class DrizzleDynamicCatalogRepository implements DynamicCatalogRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listActiveCategories(roles: readonly string[]) {
    if (roles.length === 0) return [];
    const rows = await this.db
      .selectDistinct({
        id: catalogCategories.id,
        slug: catalogCategories.slug,
        name: catalogCategories.name,
        path: catalogCategories.path,
        templateId: attributeTemplates.id,
        templateName: attributeTemplates.name,
        templateVersion: attributeTemplates.version,
      })
      .from(catalogCategories)
      .innerJoin(attributeTemplates, eq(attributeTemplates.categoryId, catalogCategories.id))
      .innerJoin(
        templateAttributeRoleAccess,
        eq(templateAttributeRoleAccess.templateId, attributeTemplates.id),
      )
      .where(
        and(
          eq(catalogCategories.active, true),
          eq(attributeTemplates.status, 'active'),
          inArray(templateAttributeRoleAccess.role, [...roles]),
          eq(templateAttributeRoleAccess.canView, true),
        ),
      )
      .orderBy(catalogCategories.path);
    return rows.map((row) => ({ ...row, id: row.id as Uuid, templateId: row.templateId as Uuid }));
  }

  async getActiveSchema(
    categoryId: Uuid,
    roles: readonly string[],
  ): Promise<DynamicCatalogSchema | null> {
    if (roles.length === 0) return null;
    const headers = await this.db
      .select({
        categoryId: catalogCategories.id,
        categorySlug: catalogCategories.slug,
        categoryName: catalogCategories.name,
        templateId: attributeTemplates.id,
        templateName: attributeTemplates.name,
        templateVersion: attributeTemplates.version,
      })
      .from(catalogCategories)
      .innerJoin(attributeTemplates, eq(attributeTemplates.categoryId, catalogCategories.id))
      .where(
        and(
          eq(catalogCategories.id, categoryId),
          eq(catalogCategories.active, true),
          eq(attributeTemplates.status, 'active'),
        ),
      )
      .limit(1);
    const header = headers[0];
    if (!header) return null;

    const attributes = await this.db
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
        position: templateAttributeAssignments.position,
      })
      .from(templateAttributeAssignments)
      .innerJoin(
        attributeDefinitions,
        eq(attributeDefinitions.id, templateAttributeAssignments.attributeDefinitionId),
      )
      .where(
        and(
          eq(templateAttributeAssignments.templateId, header.templateId),
          eq(templateAttributeAssignments.active, true),
          eq(attributeDefinitions.active, true),
        ),
      )
      .orderBy(templateAttributeAssignments.position, attributeDefinitions.key);

    const accessRows = await this.db
      .select({
        attributeDefinitionId: templateAttributeRoleAccess.attributeDefinitionId,
        canEdit: templateAttributeRoleAccess.canEdit,
        canImport: templateAttributeRoleAccess.canImport,
        canExport: templateAttributeRoleAccess.canExport,
      })
      .from(templateAttributeRoleAccess)
      .where(
        and(
          eq(templateAttributeRoleAccess.templateId, header.templateId),
          inArray(templateAttributeRoleAccess.role, [...roles]),
          eq(templateAttributeRoleAccess.canView, true),
        ),
      );
    const access = new Map<string, { edit: boolean; import: boolean; export: boolean }>();
    for (const row of accessRows) {
      const current = access.get(row.attributeDefinitionId) ?? {
        edit: false,
        import: false,
        export: false,
      };
      access.set(row.attributeDefinitionId, {
        edit: current.edit || row.canEdit,
        import: current.import || row.canImport,
        export: current.export || row.canExport,
      });
    }

    return {
      category: {
        id: header.categoryId as Uuid,
        slug: header.categorySlug,
        name: header.categoryName,
      },
      template: {
        id: header.templateId as Uuid,
        name: header.templateName,
        version: header.templateVersion,
      },
      attributes: attributes
        .filter((attribute) => access.has(attribute.id))
        .map((attribute) => toTemplateAttribute(attribute, access.get(attribute.id))),
    };
  }

  async getProductSheet(
    productId: Uuid,
    roles: readonly string[],
  ): Promise<{ schema: DynamicCatalogSchema; product: CatalogGridProduct } | null> {
    const rows = await this.db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        brand: products.brand,
        status: products.status,
        categoryId: attributeTemplates.categoryId,
      })
      .from(products)
      .innerJoin(productTemplateAssignments, eq(productTemplateAssignments.productId, products.id))
      .innerJoin(
        attributeTemplates,
        eq(attributeTemplates.id, productTemplateAssignments.templateId),
      )
      .where(and(eq(products.id, productId), eq(attributeTemplates.status, 'active')))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const schema = await this.getActiveSchema(row.categoryId as Uuid, roles);
    if (!schema) return null;
    const cells = await this.loadCells([productId], schema.attributes);
    return {
      schema,
      product: {
        id: row.id as Uuid,
        sku: row.sku,
        name: row.name,
        brand: row.brand,
        status: row.status,
        attributes: cells.get(productId) ?? {},
      },
    };
  }

  async listGrid(
    options: CatalogGridOptions,
  ): Promise<{ items: CatalogGridProduct[]; total: number }> {
    const schema = await this.getActiveSchema(options.categoryId, options.roles);
    if (!schema) return { items: [], total: 0 };

    const filters: SQL[] = [
      eq(attributeTemplates.categoryId, options.categoryId),
      eq(attributeTemplates.status, 'active'),
    ];
    if (options.q) {
      const pattern = `%${escapeLike(options.q)}%`;
      const searchableIds = schema.attributes
        .filter((attribute) => attribute.searchable)
        .map((attribute) => attribute.id);
      const attributeSearch =
        searchableIds.length > 0
          ? sql<boolean>`EXISTS (
              SELECT 1 FROM product_attribute_values qv
              WHERE qv.product_id = ${products.id}
                AND qv.attribute_definition_id IN (
                  ${sql.join(
                    searchableIds.map((id) => sql`${id}`),
                    sql`, `,
                  )}
                )
                AND qv.value_text ILIKE ${pattern}
            )`
          : undefined;
      const search = or(
        ilike(products.sku, pattern),
        ilike(products.name, pattern),
        ilike(products.brand, pattern),
        attributeSearch,
      );
      if (search) filters.push(search);
    }
    for (const filter of options.filters) {
      filters.push(this.attributeFilterSql(filter, schema.attributes));
    }
    const where = and(...filters);
    const offset = (options.page - 1) * options.pageSize;
    const rows = await this.db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        brand: products.brand,
        status: products.status,
      })
      .from(products)
      .innerJoin(productTemplateAssignments, eq(productTemplateAssignments.productId, products.id))
      .innerJoin(
        attributeTemplates,
        eq(attributeTemplates.id, productTemplateAssignments.templateId),
      )
      .where(where)
      .orderBy(products.sku)
      .limit(options.pageSize)
      .offset(offset);
    const totals = await this.db
      .select({ value: count() })
      .from(products)
      .innerJoin(productTemplateAssignments, eq(productTemplateAssignments.productId, products.id))
      .innerJoin(
        attributeTemplates,
        eq(attributeTemplates.id, productTemplateAssignments.templateId),
      )
      .where(where);
    const ids = rows.map((row) => row.id as Uuid);
    const cells = await this.loadCells(ids, schema.attributes);
    return {
      total: totals[0]?.value ?? 0,
      items: rows.map((row) => ({
        ...row,
        id: row.id as Uuid,
        attributes: cells.get(row.id as Uuid) ?? {},
      })),
    };
  }

  async findProductAttributeAssignment(
    productId: Uuid,
    attributeKey: string,
    roles: readonly string[],
  ): Promise<ProductAttributeAssignment | null> {
    if (roles.length === 0) return null;
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
        position: templateAttributeAssignments.position,
      })
      .from(productTemplateAssignments)
      .innerJoin(
        attributeTemplates,
        eq(attributeTemplates.id, productTemplateAssignments.templateId),
      )
      .innerJoin(
        templateAttributeAssignments,
        eq(templateAttributeAssignments.templateId, attributeTemplates.id),
      )
      .innerJoin(
        attributeDefinitions,
        eq(attributeDefinitions.id, templateAttributeAssignments.attributeDefinitionId),
      )
      .innerJoin(
        templateAttributeRoleAccess,
        and(
          eq(templateAttributeRoleAccess.templateId, templateAttributeAssignments.templateId),
          eq(
            templateAttributeRoleAccess.attributeDefinitionId,
            templateAttributeAssignments.attributeDefinitionId,
          ),
        ),
      )
      .where(
        and(
          eq(productTemplateAssignments.productId, productId),
          eq(attributeTemplates.status, 'active'),
          eq(templateAttributeAssignments.active, true),
          eq(attributeDefinitions.active, true),
          eq(attributeDefinitions.key, attributeKey),
          inArray(templateAttributeRoleAccess.role, [...roles]),
          eq(templateAttributeRoleAccess.canEdit, true),
        ),
      )
      .limit(1);
    return rows[0]
      ? {
          productId,
          definition: toTemplateAttribute(rows[0], { edit: true, import: false, export: false }),
        }
      : null;
  }

  async updateAttribute(input: {
    productId: Uuid;
    attributeKey: string;
    value: CatalogAttributeValue;
    source: AttributeValueSource;
    expectedVersion: number;
    roles: readonly string[];
    now: Date;
    audit: { readonly actorId: string; readonly correlationId: string };
  }): Promise<UpdateAttributePersistenceResult> {
    if (input.roles.length === 0) return { kind: 'not_found' };
    return this.db.transaction(async (tx) => {
      const assignments = await tx
        .select({
          definitionId: attributeDefinitions.id,
          dataType: attributeDefinitions.dataType,
          replicable: templateAttributeAssignments.replicable,
        })
        .from(productTemplateAssignments)
        .innerJoin(
          attributeTemplates,
          eq(attributeTemplates.id, productTemplateAssignments.templateId),
        )
        .innerJoin(
          templateAttributeAssignments,
          eq(templateAttributeAssignments.templateId, attributeTemplates.id),
        )
        .innerJoin(
          attributeDefinitions,
          eq(attributeDefinitions.id, templateAttributeAssignments.attributeDefinitionId),
        )
        .innerJoin(
          templateAttributeRoleAccess,
          and(
            eq(templateAttributeRoleAccess.templateId, templateAttributeAssignments.templateId),
            eq(
              templateAttributeRoleAccess.attributeDefinitionId,
              templateAttributeAssignments.attributeDefinitionId,
            ),
          ),
        )
        .where(
          and(
            eq(productTemplateAssignments.productId, input.productId),
            eq(attributeTemplates.status, 'active'),
            eq(templateAttributeAssignments.active, true),
            eq(attributeDefinitions.active, true),
            eq(attributeDefinitions.key, input.attributeKey),
            inArray(templateAttributeRoleAccess.role, [...input.roles]),
            eq(templateAttributeRoleAccess.canEdit, true),
          ),
        )
        .for('update')
        .limit(1);
      const assignment = assignments[0];
      if (!assignment) return { kind: 'not_found' } as const;

      const currentRows = await tx
        .select()
        .from(productAttributeValues)
        .where(
          and(
            eq(productAttributeValues.productId, input.productId),
            eq(productAttributeValues.attributeDefinitionId, assignment.definitionId),
          ),
        )
        .for('update')
        .limit(1);
      const current = currentRows[0];
      const actualVersion = current?.version ?? 0;
      if (actualVersion !== input.expectedVersion) {
        return { kind: 'version_conflict', actualVersion } as const;
      }

      let targetIds: Uuid[] = [input.productId];
      if (assignment.replicable) {
        const groups = await tx
          .select({ groupId: equivalenceGroupMembers.groupId })
          .from(equivalenceGroupMembers)
          .where(eq(equivalenceGroupMembers.productId, input.productId));
        if (groups.length > 0) {
          const members = await tx
            .select({ productId: equivalenceGroupMembers.productId })
            .from(equivalenceGroupMembers)
            .where(
              inArray(
                equivalenceGroupMembers.groupId,
                groups.map((group) => group.groupId),
              ),
            );
          targetIds = [
            ...new Set([input.productId, ...members.map((member) => member.productId as Uuid)]),
          ];
        }
      }

      const eligible = await tx
        .select({ productId: productTemplateAssignments.productId })
        .from(productTemplateAssignments)
        .innerJoin(
          attributeTemplates,
          eq(attributeTemplates.id, productTemplateAssignments.templateId),
        )
        .innerJoin(
          templateAttributeAssignments,
          eq(templateAttributeAssignments.templateId, attributeTemplates.id),
        )
        .where(
          and(
            inArray(productTemplateAssignments.productId, targetIds),
            eq(attributeTemplates.status, 'active'),
            eq(templateAttributeAssignments.attributeDefinitionId, assignment.definitionId),
            eq(templateAttributeAssignments.active, true),
          ),
        )
        .orderBy(asc(productTemplateAssignments.productId))
        .for('update');
      targetIds = eligible.map((row) => row.productId as Uuid);

      const previousRows = await tx
        .select()
        .from(productAttributeValues)
        .where(
          and(
            inArray(productAttributeValues.productId, targetIds),
            eq(productAttributeValues.attributeDefinitionId, assignment.definitionId),
          ),
        )
        .for('update');
      const previous = new Map(previousRows.map((row) => [row.productId, row]));
      const typed = encodeValue(assignment.dataType as CatalogAttributeDataType, input.value);
      const changes: AttributeChange[] = [];
      for (const productId of targetIds) {
        const beforeRow = previous.get(productId);
        const version = (beforeRow?.version ?? 0) + 1;
        await tx
          .insert(productAttributeValues)
          .values({
            productId,
            attributeDefinitionId: assignment.definitionId,
            ...typed,
            source: input.source,
            confidence: 1,
            version,
            validFrom: input.now,
            updatedAt: input.now,
          })
          .onConflictDoUpdate({
            target: [
              productAttributeValues.productId,
              productAttributeValues.attributeDefinitionId,
            ],
            set: {
              ...typed,
              source: input.source,
              confidence: 1,
              version,
              validFrom: input.now,
              updatedAt: input.now,
            },
          });
        changes.push({
          productId,
          before: beforeRow
            ? toCell(beforeRow, assignment.dataType as CatalogAttributeDataType)
            : null,
          after: { value: input.value, version, source: input.source, updatedAt: input.now },
        });
      }

      // Attribute values and their immutable history are one PostgreSQL unit of work.
      // A failure in either audit table aborts every replicated product update above.
      for (const change of changes) {
        const entry = createAuditEntry({
          resourceType: 'product',
          resourceId: change.productId,
          action: AuditAction.Updated,
          actorId: input.audit.actorId,
          source: input.source,
          correlationId: input.audit.correlationId,
          occurredAt: input.now,
          changes: {
            [input.attributeKey]: {
              before: change.before?.value,
              after: change.after.value,
            },
          },
        });
        const fieldNames = Object.keys(entry.changes);
        const previousRows = await tx
          .select({
            fieldName: auditChangeItems.fieldName,
            validFrom: max(auditEntries.occurredAt),
          })
          .from(auditChangeItems)
          .innerJoin(auditEntries, eq(auditEntries.id, auditChangeItems.auditEntryId))
          .where(
            and(
              eq(auditEntries.resourceType, entry.resourceType),
              eq(auditEntries.resourceId, entry.resourceId),
              inArray(auditChangeItems.fieldName, fieldNames),
            ),
          )
          .groupBy(auditChangeItems.fieldName);
        const previousByField = new Map(
          previousRows.map((row) => [row.fieldName, row.validFrom ?? null]),
        );
        await tx.insert(auditEntries).values({
          id: entry.id,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          action: entry.action,
          actorId: entry.actorId,
          source: entry.source,
          correlationId: entry.correlationId,
          occurredAt: entry.occurredAt,
          changes: entry.changes,
        });
        await tx.insert(auditChangeItems).values(
          fieldNames.map((fieldName) => {
            const fieldChange = entry.changes[fieldName] ?? {};
            return {
              id: newUuid(),
              auditEntryId: entry.id,
              fieldName,
              beforeValue: Object.hasOwn(fieldChange, 'before') ? fieldChange.before : null,
              afterValue: Object.hasOwn(fieldChange, 'after') ? fieldChange.after : null,
              previousValueValidFrom: previousByField.get(fieldName) ?? null,
            };
          }),
        );
      }
      return { kind: 'updated', changes } as const;
    });
  }

  private async loadCells(productIds: readonly Uuid[], attributes: readonly TemplateAttribute[]) {
    const cells = new Map<Uuid, Record<string, ProductAttributeCell>>();
    if (productIds.length === 0 || attributes.length === 0) return cells;
    const byId = new Map(attributes.map((attribute) => [attribute.id, attribute]));
    const rows = await this.db
      .select()
      .from(productAttributeValues)
      .where(
        and(
          inArray(productAttributeValues.productId, [...productIds]),
          inArray(productAttributeValues.attributeDefinitionId, [...byId.keys()]),
        ),
      );
    for (const row of rows) {
      const definition = byId.get(row.attributeDefinitionId as Uuid);
      if (!definition) continue;
      const productId = row.productId as Uuid;
      const productCells = cells.get(productId) ?? {};
      productCells[definition.key] = toCell(row, definition.dataType);
      cells.set(productId, productCells);
    }
    return cells;
  }

  private attributeFilterSql(
    filter: CatalogAttributeFilter,
    attributes: readonly TemplateAttribute[],
  ): SQL {
    const definition = attributes.find((attribute) => attribute.key === filter.key);
    if (!definition || !definition.searchable) {
      throw new ValidationError('Attribute is not searchable in this template', {
        attributeKey: filter.key,
      });
    }
    const valueCondition = filterValueSql(filter, definition);
    return sql<boolean>`EXISTS (
      SELECT 1 FROM product_attribute_values fv
      WHERE fv.product_id = ${products.id}
        AND fv.attribute_definition_id = ${definition.id}
        AND ${valueCondition}
    )`;
  }
}

function toTemplateAttribute(
  row: {
    id: string;
    key: string;
    label: string;
    dataType: string;
    unit: string | null;
    allowedValues: string[];
    sourceAuthority: string;
    required: boolean;
    replicable: boolean;
    searchable: boolean;
    includeInTechnicalSheet: boolean;
    position: number;
  },
  permissions = { edit: false, import: false, export: false },
): TemplateAttribute {
  return {
    ...row,
    id: row.id as Uuid,
    dataType: row.dataType as CatalogAttributeDataType,
    sourceAuthority: row.sourceAuthority as TemplateAttribute['sourceAuthority'],
    permissions: {
      ...permissions,
      // Externally governed values are visible according to the role matrix, but only
      // PIM-owned attributes can be changed by a human in the dynamic sheet.
      edit: row.sourceAuthority === 'pim' && permissions.edit,
    },
  };
}

function encodeValue(dataType: CatalogAttributeDataType, value: CatalogAttributeValue) {
  const empty = {
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueDate: null,
    valueJson: null,
  };
  if (dataType === 'number' || dataType === 'measurement')
    return { ...empty, valueNumber: value as number };
  if (dataType === 'boolean') return { ...empty, valueBoolean: value as boolean };
  if (dataType === 'date') return { ...empty, valueDate: value as string };
  return { ...empty, valueText: value as string };
}

function toCell(
  row: ProductAttributeValueRow,
  dataType: CatalogAttributeDataType,
): ProductAttributeCell {
  let value: CatalogAttributeValue;
  if (dataType === 'number' || dataType === 'measurement') value = row.valueNumber as number;
  else if (dataType === 'boolean') value = row.valueBoolean as boolean;
  else if (dataType === 'date') value = row.valueDate as string;
  else value = row.valueText as string;
  return {
    value,
    version: row.version,
    source: row.source as AttributeValueSource,
    updatedAt: row.updatedAt,
  };
}

function filterValueSql(filter: CatalogAttributeFilter, definition: TemplateAttribute): SQL {
  if (filter.operator === 'contains') {
    if (definition.dataType !== 'text' && definition.dataType !== 'enum') {
      throw new ValidationError('contains is only valid for text and enum attributes', {
        attributeKey: filter.key,
      });
    }
    return sql`fv.value_text ILIKE ${`%${escapeLike(filter.value)}%`}`;
  }
  if (definition.dataType === 'boolean') {
    if (filter.operator !== 'eq' || !['true', 'false'].includes(filter.value.toLowerCase())) {
      throw new ValidationError('Boolean attributes support only eq:true or eq:false', {
        attributeKey: filter.key,
      });
    }
    return sql`fv.value_boolean = ${filter.value.toLowerCase() === 'true'}`;
  }
  if (definition.dataType === 'number' || definition.dataType === 'measurement') {
    const value = Number(filter.value);
    if (!Number.isFinite(value)) {
      throw new ValidationError('Numeric attribute filter requires a number', {
        attributeKey: filter.key,
      });
    }
    return comparisonSql(sql`fv.value_number`, filter.operator, value);
  }
  if (definition.dataType === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filter.value)) {
      throw new ValidationError('Date attribute filter requires YYYY-MM-DD', {
        attributeKey: filter.key,
      });
    }
    return comparisonSql(sql`fv.value_date`, filter.operator, filter.value);
  }
  if (filter.operator !== 'eq') {
    throw new ValidationError('Text attributes support only eq and contains', {
      attributeKey: filter.key,
    });
  }
  return sql`fv.value_text = ${filter.value}`;
}

function comparisonSql(
  column: SQL,
  operator: CatalogAttributeFilter['operator'],
  value: number | string,
) {
  if (operator === 'eq') return sql`${column} = ${value}`;
  if (operator === 'gt') return sql`${column} > ${value}`;
  if (operator === 'gte') return sql`${column} >= ${value}`;
  if (operator === 'lt') return sql`${column} < ${value}`;
  if (operator === 'lte') return sql`${column} <= ${value}`;
  throw new ValidationError('Unsupported comparison operator', { operator });
}
