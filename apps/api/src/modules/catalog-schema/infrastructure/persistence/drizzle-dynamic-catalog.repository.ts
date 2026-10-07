import { Inject, Injectable } from '@nestjs/common';
import { type Uuid, ValidationError, newUuid } from '@cdr/shared';
import { and, asc, count, eq, ilike, inArray, isNull, max, or, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import {
  productIdentifiers,
  products,
} from '../../../catalog/infrastructure/persistence/catalog.tables';
import { AuditAction, createAuditEntry } from '../../../audit/domain/entities/audit-entry';
import {
  auditChangeItems,
  auditEntries,
} from '../../../audit/infrastructure/persistence/audit.tables';
import { equivalenceGroupMembers } from '../../../equivalences/infrastructure/persistence/equivalences.tables';
import { groupApplications } from '../../../applications/infrastructure/persistence/applications.tables';
import {
  type AttributeValueSource,
  type CatalogAttributeDataType,
  type CatalogAttributeValue,
  type CatalogGridProduct,
  type CatalogWorkbookColumn,
  type CatalogWorkbookProduct,
  type DynamicCatalogSchema,
  type ProductAttributeCell,
  type TemplateAttribute,
  validateAttributeValue,
} from '../../domain/entities/catalog-schema';
import type {
  AttributeChange,
  AttributeUpdateRequest,
  CatalogAttributeFilter,
  CatalogGridOptions,
  CatalogWorkbookOptions,
  CatalogWorkbookResult,
  DynamicCatalogRepositoryPort,
  ProductAttributeAssignment,
  UpdateAttributePersistenceResult,
  UpdateAttributesPersistenceResult,
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
                AND qv.deleted_at IS NULL
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

  async listWorkbook(options: CatalogWorkbookOptions): Promise<CatalogWorkbookResult> {
    const emptyFacets = { brands: [], applicationTypes: [], statuses: [] };
    if (options.roles.length === 0)
      return { columns: [], facets: emptyFacets, items: [], total: 0 };
    const workbookSchema = await this.loadWorkbookSchema(options.categoryId, options.roles);
    if (workbookSchema.columns.length === 0)
      return { columns: [], facets: emptyFacets, items: [], total: 0 };

    const filters: SQL[] = [
      eq(attributeTemplates.status, 'active'),
      eq(catalogCategories.active, true),
    ];
    if (options.categoryId) filters.push(eq(catalogCategories.id, options.categoryId));
    if (options.brand) filters.push(ilike(products.brand, escapeLike(options.brand)));
    if (options.status) filters.push(eq(products.status, options.status));
    if (options.applicationType) {
      filters.push(sql<boolean>`(
        EXISTS (
          SELECT 1
          FROM equivalence_group_members wafm
          INNER JOIN group_applications wafa
            ON wafa.equivalence_group_id = wafm.group_id
          WHERE wafm.product_id = ${products.id}
            AND wafa.active = TRUE
            AND wafa.vehicle_type = ${options.applicationType}
        ) OR EXISTS (
          SELECT 1
          FROM product_attribute_values wapv
          INNER JOIN attribute_definitions wapd
            ON wapd.id = wapv.attribute_definition_id
           AND wapd.key = 'tipo_aplicacion'
           AND wapd.active = TRUE
          WHERE wapv.product_id = ${products.id}
            AND wapv.deleted_at IS NULL
            AND (
              (${options.applicationType} = 'AUTOMOTRIZ' AND UPPER(COALESCE(wapv.value_text, '')) LIKE '%AUTOMOTR%')
              OR (${options.applicationType} = 'INDUSTRIAL' AND UPPER(COALESCE(wapv.value_text, '')) LIKE '%INDUSTRIAL%')
            )
        )
      )`);
    }
    if (options.completeness) {
      const score = workbookCompletenessSql();
      if (options.completeness === 'complete') filters.push(sql`${score} >= 90`);
      if (options.completeness === 'attention') filters.push(sql`${score} >= 70 AND ${score} < 90`);
      if (options.completeness === 'critical') filters.push(sql`${score} < 70`);
    }

    if (options.q) {
      const pattern = `%${escapeLike(options.q)}%`;
      const visibleIds = workbookSchema.columns.map((column) => column.id);
      const attributeSearch = sql<boolean>`EXISTS (
        SELECT 1
        FROM product_attribute_values qv
        INNER JOIN template_attribute_assignments qta
          ON qta.attribute_definition_id = qv.attribute_definition_id
          AND qta.template_id = ${attributeTemplates.id}
          AND qta.active = TRUE
        INNER JOIN template_attribute_role_access qra
          ON qra.template_id = qta.template_id
          AND qra.attribute_definition_id = qta.attribute_definition_id
        WHERE qv.product_id = ${products.id}
          AND qv.attribute_definition_id IN (
            ${sql.join(
              visibleIds.map((id) => sql`${id}`),
              sql`, `,
            )}
          )
          AND qra.role IN (
            ${sql.join(
              options.roles.map((role) => sql`${role}`),
              sql`, `,
            )}
          )
          AND qra.can_view = TRUE
          AND qv.deleted_at IS NULL
          AND COALESCE(
            qv.value_text,
            qv.value_number::text,
            qv.value_boolean::text,
            qv.value_date::text,
            qv.value_json::text
          ) ILIKE ${pattern}
      )`;
      const identifierSearch = sql<boolean>`EXISTS (
        SELECT 1 FROM product_identifiers qi
        WHERE qi.product_id = ${products.id}
          AND qi.value ILIKE ${pattern}
      )`;
      const search = or(
        ilike(products.sku, pattern),
        ilike(products.name, pattern),
        ilike(products.description, pattern),
        ilike(products.brand, pattern),
        identifierSearch,
        attributeSearch,
      );
      if (search) filters.push(search);
    }
    for (const filter of options.filters) {
      filters.push(this.attributeFilterSql(filter, workbookSchema.columns));
    }
    for (const columnFilter of options.columnFilters ?? []) {
      filters.push(this.workbookColumnFilterSql(columnFilter, workbookSchema.columns));
    }

    const where = and(...filters);
    const workbookOrder = options.sort
      ? this.workbookSortSql(options.sort, workbookSchema.columns)
      : asc(products.sku);
    const rows = await this.db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        description: products.description,
        brand: products.brand,
        status: products.status,
        updatedAt: products.updatedAt,
        categoryId: catalogCategories.id,
        categoryName: catalogCategories.name,
        templateId: attributeTemplates.id,
        templateName: attributeTemplates.name,
        templateVersion: attributeTemplates.version,
        completeness: workbookCompletenessSql(),
      })
      .from(products)
      .innerJoin(productTemplateAssignments, eq(productTemplateAssignments.productId, products.id))
      .innerJoin(
        attributeTemplates,
        eq(attributeTemplates.id, productTemplateAssignments.templateId),
      )
      .innerJoin(catalogCategories, eq(catalogCategories.id, attributeTemplates.categoryId))
      .where(where)
      .orderBy(workbookOrder, asc(products.sku))
      .limit(options.pageSize)
      .offset((options.page - 1) * options.pageSize);
    const totals = await this.db
      .select({ value: count() })
      .from(products)
      .innerJoin(productTemplateAssignments, eq(productTemplateAssignments.productId, products.id))
      .innerJoin(
        attributeTemplates,
        eq(attributeTemplates.id, productTemplateAssignments.templateId),
      )
      .innerJoin(catalogCategories, eq(catalogCategories.id, attributeTemplates.categoryId))
      .where(where);

    const productIds = rows.map((row) => row.id as Uuid);
    const definitionIds = workbookSchema.columns.map((column) => column.id);
    const valueRows =
      productIds.length === 0
        ? []
        : await this.db
            .select()
            .from(productAttributeValues)
            .where(
              and(
                inArray(productAttributeValues.productId, productIds),
                inArray(productAttributeValues.attributeDefinitionId, definitionIds),
              ),
            );
    const identifierRows =
      productIds.length === 0
        ? []
        : await this.db
            .select({
              productId: productIdentifiers.productId,
              type: productIdentifiers.type,
              value: productIdentifiers.value,
            })
            .from(productIdentifiers)
            .where(inArray(productIdentifiers.productId, productIds));
    const applicationRows =
      productIds.length === 0
        ? []
        : await this.db
            .select({
              productId: equivalenceGroupMembers.productId,
              vehicleType: groupApplications.vehicleType,
            })
            .from(equivalenceGroupMembers)
            .innerJoin(
              groupApplications,
              eq(groupApplications.groupId, equivalenceGroupMembers.groupId),
            )
            .where(
              and(
                inArray(equivalenceGroupMembers.productId, productIds),
                eq(groupApplications.active, true),
                inArray(groupApplications.vehicleType, ['AUTOMOTRIZ', 'INDUSTRIAL']),
              ),
            );
    const applicationAttributeRows =
      productIds.length === 0
        ? []
        : await this.db
            .select({
              productId: productAttributeValues.productId,
              value: productAttributeValues.valueText,
            })
            .from(productAttributeValues)
            .innerJoin(
              attributeDefinitions,
              and(
                eq(attributeDefinitions.id, productAttributeValues.attributeDefinitionId),
                eq(attributeDefinitions.active, true),
                eq(attributeDefinitions.key, 'tipo_aplicacion'),
              ),
            )
            .where(
              and(
                inArray(productAttributeValues.productId, productIds),
                isNull(productAttributeValues.deletedAt),
              ),
            )
            .orderBy(productAttributeValues.productId);
    const valuesByProduct = new Map<string, Map<string, ProductAttributeValueRow>>();
    for (const valueRow of valueRows) {
      const productValues = valuesByProduct.get(valueRow.productId) ?? new Map();
      productValues.set(valueRow.attributeDefinitionId, valueRow);
      valuesByProduct.set(valueRow.productId, productValues);
    }
    const identifiersByProduct = new Map<string, Map<string, string>>();
    for (const identifier of identifierRows) {
      const productCodes = identifiersByProduct.get(identifier.productId) ?? new Map();
      productCodes.set(identifier.type, identifier.value);
      identifiersByProduct.set(identifier.productId, productCodes);
    }
    const applicationsByProduct = new Map<string, Set<string>>();
    for (const application of applicationRows) {
      if (!application.vehicleType) continue;
      const types = applicationsByProduct.get(application.productId) ?? new Set<string>();
      types.add(application.vehicleType);
      applicationsByProduct.set(application.productId, types);
    }
    for (const application of applicationAttributeRows) {
      const types = applicationsByProduct.get(application.productId) ?? new Set<string>();
      for (const type of normalizeWorkbookApplicationTypes(application.value)) types.add(type);
      applicationsByProduct.set(application.productId, types);
    }

    const items: CatalogWorkbookProduct[] = rows.map((row) => {
      const templateAttributes = workbookSchema.byTemplate.get(row.templateId) ?? new Map();
      const productValues = valuesByProduct.get(row.id) ?? new Map();
      const attributes: Record<string, CatalogWorkbookProduct['attributes'][string]> = {};
      for (const column of workbookSchema.columns) {
        const assignment = templateAttributes.get(column.key);
        if (!assignment) {
          attributes[column.key] = { applicable: false };
          continue;
        }
        const persisted = productValues.get(column.id);
        const cell = persisted ? toCell(persisted, column.dataType) : undefined;
        attributes[column.key] = {
          applicable: true,
          value: cell?.value ?? null,
          version: cell?.version ?? 0,
          source: cell?.source ?? 'manual',
          updatedAt: cell?.updatedAt ?? row.updatedAt,
          required: assignment.required,
          permissions: {
            edit: assignment.permissions.edit,
            export: assignment.permissions.export,
          },
        };
      }
      const providerAttribute = workbookSchema.columns.find(
        (column) => column.key === 'codigo_proveedor',
      );
      const unifiedAttribute = workbookSchema.columns.find(
        (column) => column.key === 'codigo_unificador',
      );
      const attributeText = (column: CatalogWorkbookColumn | undefined) => {
        if (!column) return null;
        const persisted = productValues.get(column.id);
        const value = persisted ? toCell(persisted, column.dataType).value : null;
        return typeof value === 'string' ? value : null;
      };
      return {
        id: row.id as Uuid,
        sku: row.sku,
        name: row.name,
        description: row.description,
        brand: row.brand,
        status: row.status,
        updatedAt: row.updatedAt,
        category: { id: row.categoryId as Uuid, name: row.categoryName },
        template: {
          id: row.templateId as Uuid,
          name: row.templateName,
          version: row.templateVersion,
        },
        providerCode:
          attributeText(providerAttribute) ??
          identifiersByProduct.get(row.id)?.get('manufacturer_part_number') ??
          null,
        unifiedCode: attributeText(unifiedAttribute),
        applicationTypes: [...(applicationsByProduct.get(row.id) ?? [])].sort(),
        completeness: row.completeness,
        attributes,
      };
    });
    const facetScope = and(
      eq(attributeTemplates.status, 'active'),
      eq(catalogCategories.active, true),
      options.categoryId ? eq(catalogCategories.id, options.categoryId) : undefined,
    );
    const facetRows = await this.db
      .selectDistinct({ brand: products.brand, status: products.status })
      .from(products)
      .innerJoin(productTemplateAssignments, eq(productTemplateAssignments.productId, products.id))
      .innerJoin(
        attributeTemplates,
        eq(attributeTemplates.id, productTemplateAssignments.templateId),
      )
      .innerJoin(catalogCategories, eq(catalogCategories.id, attributeTemplates.categoryId))
      .where(facetScope);
    const applicationFacetRows = await this.db
      .selectDistinct({ vehicleType: groupApplications.vehicleType })
      .from(groupApplications)
      .innerJoin(
        equivalenceGroupMembers,
        eq(equivalenceGroupMembers.groupId, groupApplications.groupId),
      )
      .innerJoin(
        productTemplateAssignments,
        eq(productTemplateAssignments.productId, equivalenceGroupMembers.productId),
      )
      .innerJoin(
        attributeTemplates,
        eq(attributeTemplates.id, productTemplateAssignments.templateId),
      )
      .innerJoin(catalogCategories, eq(catalogCategories.id, attributeTemplates.categoryId))
      .where(
        and(
          facetScope,
          eq(groupApplications.active, true),
          inArray(groupApplications.vehicleType, ['AUTOMOTRIZ', 'INDUSTRIAL']),
        ),
      );
    const applicationAttributeFacetRows = await this.db
      .selectDistinct({ value: productAttributeValues.valueText })
      .from(productAttributeValues)
      .innerJoin(
        attributeDefinitions,
        and(
          eq(attributeDefinitions.id, productAttributeValues.attributeDefinitionId),
          eq(attributeDefinitions.active, true),
          eq(attributeDefinitions.key, 'tipo_aplicacion'),
        ),
      )
      .innerJoin(
        productTemplateAssignments,
        eq(productTemplateAssignments.productId, productAttributeValues.productId),
      )
      .innerJoin(
        attributeTemplates,
        eq(attributeTemplates.id, productTemplateAssignments.templateId),
      )
      .innerJoin(catalogCategories, eq(catalogCategories.id, attributeTemplates.categoryId))
      .where(and(facetScope, isNull(productAttributeValues.deletedAt)));

    return {
      columns: workbookSchema.columns,
      facets: {
        brands: [
          ...new Set(
            facetRows.map((row) => row.brand).filter((brand): brand is string => Boolean(brand)),
          ),
        ].sort((left, right) => left.localeCompare(right, 'es')),
        applicationTypes: [
          ...new Set([
            ...applicationFacetRows
              .map((row) => row.vehicleType)
              .filter((type): type is string => Boolean(type)),
            ...applicationAttributeFacetRows.flatMap((row) =>
              normalizeWorkbookApplicationTypes(row.value),
            ),
          ]),
        ].sort(),
        statuses: [
          ...new Set(
            facetRows
              .map((row) => row.status)
              .filter((status): status is 'draft' | 'in_review' | 'published' | 'archived' =>
                ['draft', 'in_review', 'published', 'archived'].includes(status),
              ),
          ),
        ].sort(),
      },
      items,
      total: totals[0]?.value ?? 0,
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
    value: CatalogAttributeValue | null;
    source: AttributeValueSource;
    expectedVersion: number;
    roles: readonly string[];
    now: Date;
    audit: { readonly actorId: string; readonly correlationId: string };
  }): Promise<UpdateAttributePersistenceResult> {
    const result = await this.updateAttributes({
      productId: input.productId,
      updates: [
        {
          attributeKey: input.attributeKey,
          value: input.value,
          expectedVersion: input.expectedVersion,
        },
      ],
      source: input.source,
      roles: input.roles,
      now: input.now,
      audit: input.audit,
    });
    if (result.kind === 'not_found') return { kind: 'not_found' };
    if (result.kind === 'version_conflict') {
      return { kind: 'version_conflict', actualVersion: result.actualVersion };
    }
    return { kind: 'updated', changes: result.updates[0]?.changes ?? [] };
  }

  async updateAttributes(input: {
    productId: Uuid;
    updates: readonly AttributeUpdateRequest[];
    source: AttributeValueSource;
    roles: readonly string[];
    now: Date;
    audit: { readonly actorId: string; readonly correlationId: string };
  }): Promise<UpdateAttributesPersistenceResult> {
    if (input.roles.length === 0) {
      return { kind: 'not_found', attributeKey: input.updates[0]?.attributeKey ?? '' };
    }
    if (input.updates.length === 0) {
      throw new ValidationError('At least one attribute update is required');
    }
    const attributeKeys = input.updates.map((update) => update.attributeKey);
    if (new Set(attributeKeys).size !== attributeKeys.length) {
      throw new ValidationError('Each attribute may be updated only once per batch', {
        attributeKeys,
      });
    }

    return this.db.transaction(async (tx) => {
      const assignmentRows = await tx
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
            eq(productTemplateAssignments.productId, input.productId),
            eq(attributeTemplates.status, 'active'),
            eq(templateAttributeAssignments.active, true),
            eq(attributeDefinitions.active, true),
            eq(attributeDefinitions.sourceAuthority, 'pim'),
            inArray(attributeDefinitions.key, attributeKeys),
            inArray(templateAttributeRoleAccess.role, [...input.roles]),
            eq(templateAttributeRoleAccess.canEdit, true),
          ),
        )
        .for('update');
      const assignments = new Map(
        assignmentRows.map((row) => [
          row.key,
          toTemplateAttribute(row, { edit: true, import: false, export: false }),
        ]),
      );

      // Phase 1: assignment, policy and type validation for every requested field.
      for (const update of input.updates) {
        const assignment = assignments.get(update.attributeKey);
        if (!assignment) return { kind: 'not_found', attributeKey: update.attributeKey } as const;
        validateAttributeValue(assignment, update.value, false);
      }

      const definitionIds = [...assignments.values()].map((assignment) => assignment.id);
      const currentRows = await tx
        .select()
        .from(productAttributeValues)
        .where(
          and(
            eq(productAttributeValues.productId, input.productId),
            inArray(productAttributeValues.attributeDefinitionId, definitionIds),
          ),
        )
        .for('update');
      const currentByDefinition = new Map(
        currentRows.map((row) => [row.attributeDefinitionId, row]),
      );

      // Phase 2: optimistic versions for the complete batch. No mutation has happened yet.
      for (const update of input.updates) {
        const assignment = assignments.get(update.attributeKey)!;
        const actualVersion = currentByDefinition.get(assignment.id)?.version ?? 0;
        if (actualVersion !== update.expectedVersion) {
          return {
            kind: 'version_conflict',
            attributeKey: update.attributeKey,
            actualVersion,
          } as const;
        }
      }

      const needsReplication = [...assignments.values()].some(
        (assignment) => assignment.replicable,
      );
      let replicaCandidates: Uuid[] = [];
      if (needsReplication) {
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
          replicaCandidates = [
            ...new Set(
              members
                .map((member) => member.productId as Uuid)
                .filter((productId) => productId !== input.productId),
            ),
          ];
        }
      }

      const plans: Array<{
        update: AttributeUpdateRequest;
        assignment: TemplateAttribute;
        targetIds: Uuid[];
        requiredClearTargetIds: Uuid[];
        previous: Map<string, ProductAttributeValueRow>;
      }> = [];
      for (const update of input.updates) {
        const assignment = assignments.get(update.attributeKey)!;
        let targetIds: Uuid[] = [input.productId];
        let requiredClearTargetIds: Uuid[] =
          update.value === null && assignment.required ? [input.productId] : [];
        if (assignment.replicable && replicaCandidates.length > 0) {
          // Every destination has its own template policy and role matrix. Resolve and lock all
          // eligible replicas before the first value is written.
          const eligible = await tx
            .select({
              productId: productTemplateAssignments.productId,
              required: templateAttributeAssignments.required,
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
                inArray(productTemplateAssignments.productId, replicaCandidates),
                eq(attributeTemplates.status, 'active'),
                eq(templateAttributeAssignments.attributeDefinitionId, assignment.id),
                eq(templateAttributeAssignments.active, true),
                eq(templateAttributeAssignments.replicable, true),
                eq(attributeDefinitions.active, true),
                eq(attributeDefinitions.sourceAuthority, 'pim'),
                inArray(templateAttributeRoleAccess.role, [...input.roles]),
                eq(templateAttributeRoleAccess.canEdit, true),
              ),
            )
            .orderBy(asc(productTemplateAssignments.productId))
            .for('update');
          targetIds = [input.productId, ...new Set(eligible.map((row) => row.productId as Uuid))];
          if (update.value === null) {
            requiredClearTargetIds = [
              ...new Set([
                ...requiredClearTargetIds,
                ...eligible.filter((row) => row.required).map((row) => row.productId as Uuid),
              ]),
            ];
          }
        }
        const previousRows = await tx
          .select()
          .from(productAttributeValues)
          .where(
            and(
              inArray(productAttributeValues.productId, targetIds),
              eq(productAttributeValues.attributeDefinitionId, assignment.id),
            ),
          )
          .for('update');
        plans.push({
          update,
          assignment,
          targetIds,
          requiredClearTargetIds,
          previous: new Map(previousRows.map((row) => [row.productId, row])),
        });
      }

      const affectedProductIds = [...new Set(plans.flatMap((plan) => plan.targetIds))] as Uuid[];
      const statusRows = await tx
        .select({ id: products.id, status: products.status })
        .from(products)
        .where(inArray(products.id, affectedProductIds))
        .for('update');
      const previousStatus = new Map(statusRows.map((row) => [row.id, row.status]));

      // Phase 3: all checks succeeded. Values, propagation, status and audit now form one unit.
      const persistedUpdates: Array<{
        attributeKey: string;
        changes: AttributeChange[];
      }> = [];
      const auditChanges = new Map<Uuid, Record<string, { before?: unknown; after?: unknown }>>();
      for (const plan of plans) {
        const typed =
          plan.update.value === null
            ? emptyEncodedValue()
            : encodeValue(plan.assignment.dataType, plan.update.value);
        const changes: AttributeChange[] = [];
        for (const productId of plan.targetIds) {
          const beforeRow = plan.previous.get(productId);
          const version = (beforeRow?.version ?? 0) + 1;
          await tx
            .insert(productAttributeValues)
            .values({
              productId,
              attributeDefinitionId: plan.assignment.id,
              ...typed,
              source: input.source,
              confidence: 1,
              version,
              validFrom: input.now,
              updatedAt: input.now,
              deletedAt: plan.update.value === null ? input.now : null,
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
                deletedAt: plan.update.value === null ? input.now : null,
              },
            });
          const change: AttributeChange = {
            productId,
            before: beforeRow ? toCell(beforeRow, plan.assignment.dataType) : null,
            after: {
              value: plan.update.value,
              version,
              source: input.source,
              updatedAt: input.now,
            },
          };
          changes.push(change);
          const productAudit = auditChanges.get(productId) ?? {};
          productAudit[plan.update.attributeKey] = {
            before: change.before?.value,
            after: change.after?.value ?? null,
          };
          auditChanges.set(productId, productAudit);
        }
        persistedUpdates.push({ attributeKey: plan.update.attributeKey, changes });
      }

      const publishedIds = statusRows
        .filter((row) => row.status === 'published')
        .map((row) => row.id);
      const reviewIds: Uuid[] = [
        ...new Set([
          ...publishedIds.map((id) => id as Uuid),
          ...plans.flatMap((plan) => plan.requiredClearTargetIds),
        ]),
      ];
      if (reviewIds.length > 0) {
        await tx
          .update(products)
          .set({ status: 'in_review', updatedAt: input.now })
          .where(inArray(products.id, reviewIds));
        for (const productId of reviewIds) {
          const before = previousStatus.get(productId);
          if (before === 'in_review') continue;
          const productAudit = auditChanges.get(productId) ?? {};
          productAudit.status = { before, after: 'in_review' };
          auditChanges.set(productId as Uuid, productAudit);
        }
      }

      // Audit insertion stays inside this transaction. Any history failure rolls back every
      // primary and replicated value as well as all status changes.
      for (const [productId, changes] of auditChanges) {
        const entry = createAuditEntry({
          resourceType: 'product',
          resourceId: productId,
          action: AuditAction.Updated,
          actorId: input.audit.actorId,
          source: input.source,
          correlationId: input.audit.correlationId,
          occurredAt: input.now,
          changes,
        });
        const fieldNames = Object.keys(entry.changes);
        const previousAuditRows = await tx
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
          previousAuditRows.map((row) => [row.fieldName, row.validFrom ?? null]),
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
      return { kind: 'updated', updates: persistedUpdates } as const;
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

  private async loadWorkbookSchema(categoryId: Uuid | undefined, roles: readonly string[]) {
    const rows = await this.db
      .select({
        templateId: attributeTemplates.id,
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
        canEdit: templateAttributeRoleAccess.canEdit,
        canImport: templateAttributeRoleAccess.canImport,
        canExport: templateAttributeRoleAccess.canExport,
      })
      .from(attributeTemplates)
      .innerJoin(catalogCategories, eq(catalogCategories.id, attributeTemplates.categoryId))
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
          eq(attributeTemplates.status, 'active'),
          eq(catalogCategories.active, true),
          categoryId ? eq(catalogCategories.id, categoryId) : undefined,
          eq(templateAttributeAssignments.active, true),
          eq(attributeDefinitions.active, true),
          inArray(templateAttributeRoleAccess.role, [...roles]),
          eq(templateAttributeRoleAccess.canView, true),
        ),
      )
      .orderBy(templateAttributeAssignments.position, attributeDefinitions.key);

    const byTemplate = new Map<string, Map<string, TemplateAttribute>>();
    for (const row of rows) {
      const template = byTemplate.get(row.templateId) ?? new Map<string, TemplateAttribute>();
      const previous = template.get(row.key);
      const rolePermissions = {
        edit: row.canEdit,
        import: row.canImport,
        export: row.canExport,
      };
      const definition = toTemplateAttribute(row, {
        edit: (previous?.permissions.edit ?? false) || rolePermissions.edit,
        import: (previous?.permissions.import ?? false) || rolePermissions.import,
        export: (previous?.permissions.export ?? false) || rolePermissions.export,
      });
      template.set(row.key, definition);
      byTemplate.set(row.templateId, template);
    }

    const columnByKey = new Map<string, CatalogWorkbookColumn>();
    for (const [templateId, attributes] of byTemplate) {
      for (const attribute of attributes.values()) {
        const current = columnByKey.get(attribute.key);
        columnByKey.set(attribute.key, {
          ...attribute,
          required: (current?.required ?? false) || attribute.required,
          replicable: (current?.replicable ?? false) || attribute.replicable,
          searchable: (current?.searchable ?? false) || attribute.searchable,
          includeInTechnicalSheet:
            (current?.includeInTechnicalSheet ?? false) || attribute.includeInTechnicalSheet,
          position: Math.min(current?.position ?? attribute.position, attribute.position),
          permissions: {
            edit: (current?.permissions.edit ?? false) || attribute.permissions.edit,
            import: (current?.permissions.import ?? false) || attribute.permissions.import,
            export: (current?.permissions.export ?? false) || attribute.permissions.export,
          },
          applicableTemplateIds: [
            ...new Set([...(current?.applicableTemplateIds ?? []), templateId as Uuid]),
          ],
        });
      }
    }
    const columns = [...columnByKey.values()].sort(
      (left, right) =>
        left.position - right.position || left.label.localeCompare(right.label, 'es'),
    );
    return { columns, byTemplate };
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
        AND EXISTS (
          SELECT 1 FROM template_attribute_assignments fta
          WHERE fta.template_id = ${attributeTemplates.id}
            AND fta.attribute_definition_id = ${definition.id}
            AND fta.active = TRUE
            AND fta.searchable = TRUE
        )
        AND fv.deleted_at IS NULL
        AND ${valueCondition}
    )`;
  }

  private workbookColumnFilterSql(
    filter: NonNullable<CatalogWorkbookOptions['columnFilters']>[number],
    columns: readonly CatalogWorkbookColumn[],
  ): SQL {
    const attribute = filter.key.startsWith('attribute:')
      ? columns.find((candidate) => candidate.key === filter.key.slice('attribute:'.length))
      : undefined;
    if (filter.key.startsWith('attribute:') && !attribute) {
      throw new ValidationError('Workbook column is not visible', { column: filter.key });
    }
    const expression = attribute
      ? workbookAttributeDisplaySql(attribute)
      : workbookBaseColumnSql(filter.key, columns);
    const applicable = attribute
      ? sql<boolean>`${attributeTemplates.id} IN (${sql.join(
          attribute.applicableTemplateIds.map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql<boolean>`TRUE`;
    const selections = filter.values.map((selection) => {
      if (selection === '__cdr_excel_not_applicable__') {
        return attribute ? sql<boolean>`NOT (${applicable})` : sql<boolean>`FALSE`;
      }
      if (selection === '__cdr_excel_empty__') {
        return sql<boolean>`(${applicable}) AND (${expression} IS NULL OR BTRIM((${expression})::text) = '')`;
      }
      if (!selection.startsWith('value:')) {
        throw new ValidationError('Invalid workbook column filter value', {
          column: filter.key,
          value: selection,
        });
      }
      return sql<boolean>`(${applicable}) AND (${expression})::text = ${selection.slice('value:'.length)}`;
    });
    return sql<boolean>`(${sql.join(selections, sql` OR `)})`;
  }

  private workbookSortSql(
    sort: NonNullable<CatalogWorkbookOptions['sort']>,
    columns: readonly CatalogWorkbookColumn[],
  ): SQL {
    const attribute = sort.key.startsWith('attribute:')
      ? columns.find((candidate) => candidate.key === sort.key.slice('attribute:'.length))
      : undefined;
    if (sort.key.startsWith('attribute:') && !attribute) {
      throw new ValidationError('Workbook sort column is not visible', { column: sort.key });
    }
    const expression = attribute
      ? workbookAttributeSortSql(attribute)
      : workbookBaseColumnSql(sort.key, columns);
    return sort.direction === 'asc'
      ? sql`${expression} ASC NULLS LAST`
      : sql`${expression} DESC NULLS LAST`;
  }
}

function workbookAttributeDisplaySql(attribute: CatalogWorkbookColumn): SQL<string> {
  return sql<string>`(
    SELECT COALESCE(
      wav.value_text,
      wav.value_number::text,
      CASE
        WHEN wav.value_boolean IS TRUE THEN 'Sí'
        WHEN wav.value_boolean IS FALSE THEN 'No'
      END,
      wav.value_date::text,
      wav.value_json #>> '{}'
    )
    FROM product_attribute_values wav
    WHERE wav.product_id = ${products.id}
      AND wav.attribute_definition_id = ${attribute.id}
      AND wav.deleted_at IS NULL
    LIMIT 1
  )`;
}

function workbookAttributeSortSql(attribute: CatalogWorkbookColumn): SQL {
  if (attribute.dataType === 'number' || attribute.dataType === 'measurement') {
    return sql`(
      SELECT wav.value_number FROM product_attribute_values wav
      WHERE wav.product_id = ${products.id}
        AND wav.attribute_definition_id = ${attribute.id}
        AND wav.deleted_at IS NULL
      LIMIT 1
    )`;
  }
  if (attribute.dataType === 'boolean') {
    return sql`(
      SELECT wav.value_boolean FROM product_attribute_values wav
      WHERE wav.product_id = ${products.id}
        AND wav.attribute_definition_id = ${attribute.id}
        AND wav.deleted_at IS NULL
      LIMIT 1
    )`;
  }
  return workbookAttributeDisplaySql(attribute);
}

function workbookApplicationSql(): SQL<string> {
  return sql<string>`(
    SELECT string_agg(DISTINCT application_type, ', ' ORDER BY application_type)
    FROM (
      SELECT waa.vehicle_type AS application_type
      FROM equivalence_group_members wam
      INNER JOIN group_applications waa ON waa.equivalence_group_id = wam.group_id
      WHERE wam.product_id = ${products.id}
        AND waa.active = TRUE
        AND waa.vehicle_type IN ('AUTOMOTRIZ', 'INDUSTRIAL')

      UNION ALL

      SELECT 'AUTOMOTRIZ' AS application_type
      FROM product_attribute_values wav
      INNER JOIN attribute_definitions wad
        ON wad.id = wav.attribute_definition_id
       AND wad.key = 'tipo_aplicacion'
       AND wad.active = TRUE
      WHERE wav.product_id = ${products.id}
        AND wav.deleted_at IS NULL
        AND UPPER(COALESCE(wav.value_text, '')) LIKE '%AUTOMOTR%'

      UNION ALL

      SELECT 'INDUSTRIAL' AS application_type
      FROM product_attribute_values wav
      INNER JOIN attribute_definitions wad
        ON wad.id = wav.attribute_definition_id
       AND wad.key = 'tipo_aplicacion'
       AND wad.active = TRUE
      WHERE wav.product_id = ${products.id}
        AND wav.deleted_at IS NULL
        AND UPPER(COALESCE(wav.value_text, '')) LIKE '%INDUSTRIAL%'
    ) workbook_applications
  )`;
}

function workbookIdentifierSql(type: string): SQL<string> {
  return sql<string>`(
    SELECT wi.value FROM product_identifiers wi
    WHERE wi.product_id = ${products.id} AND wi.type = ${type}
    ORDER BY wi.created_at ASC
    LIMIT 1
  )`;
}

function workbookBaseColumnSql(key: string, columns: readonly CatalogWorkbookColumn[]): SQL {
  if (key === 'base:sku') return sql`${products.sku}`;
  if (key === 'base:name') return sql`${products.name}`;
  if (key === 'base:template') return sql`${attributeTemplates.name}`;
  if (key === 'base:category') return sql`${catalogCategories.name}`;
  if (key === 'base:brand') return sql`${products.brand}`;
  if (key === 'base:application') return workbookApplicationSql();
  if (key === 'base:status') {
    const label = sql`CASE ${products.status}
      WHEN 'draft' THEN 'Borrador'
      WHEN 'in_review' THEN 'En revisión'
      WHEN 'published' THEN 'Publicado'
      WHEN 'archived' THEN 'Archivado'
      ELSE ${products.status}
    END`;
    return sql`CONCAT(${label}, ' · ', ${workbookCompletenessSql()}, '%')`;
  }
  if (key === 'base:provider') {
    const attribute = columns.find((column) => column.key === 'codigo_proveedor');
    return attribute
      ? sql`COALESCE(${workbookAttributeDisplaySql(attribute)}, ${workbookIdentifierSql('manufacturer_part_number')})`
      : workbookIdentifierSql('manufacturer_part_number');
  }
  if (key === 'base:unifier') {
    const attribute = columns.find((column) => column.key === 'codigo_unificador');
    return attribute ? workbookAttributeDisplaySql(attribute) : sql`NULL`;
  }
  throw new ValidationError('Unknown workbook base column', { column: key });
}

function workbookCompletenessSql(): SQL<number> {
  return sql<number>`COALESCE((
    SELECT CASE
      WHEN readiness.required = 0 THEN 100
      ELSE ROUND(100.0 * readiness.completed / readiness.required)::int
    END
    FROM (
      SELECT
        (
          SELECT COUNT(*)::int
          FROM template_attribute_assignments wca
          INNER JOIN attribute_definitions wcd
            ON wcd.id = wca.attribute_definition_id
           AND wcd.active = TRUE
          WHERE wca.template_id = ${attributeTemplates.id}
            AND wca.active = TRUE
            AND wca.required = TRUE
        ) + (
          SELECT COUNT(*)::int
          FROM template_asset_requirements wcar
          WHERE wcar.template_id = ${attributeTemplates.id}
            AND wcar.active = TRUE
            AND wcar.required = TRUE
        ) AS required,
        (
          SELECT COUNT(*)::int
          FROM template_attribute_assignments wca
          INNER JOIN attribute_definitions wcd
            ON wcd.id = wca.attribute_definition_id
           AND wcd.active = TRUE
          WHERE wca.template_id = ${attributeTemplates.id}
            AND wca.active = TRUE
            AND wca.required = TRUE
            AND EXISTS (
              SELECT 1
              FROM product_attribute_values wcv
              WHERE wcv.product_id = ${products.id}
                AND wcv.attribute_definition_id = wca.attribute_definition_id
                AND wcv.deleted_at IS NULL
                AND (
                  NULLIF(BTRIM(wcv.value_text), '') IS NOT NULL OR
                  wcv.value_number IS NOT NULL OR
                  wcv.value_boolean IS NOT NULL OR
                  wcv.value_date IS NOT NULL OR
                  (wcv.value_json IS NOT NULL AND wcv.value_json <> 'null'::jsonb)
                )
            )
        ) + (
          SELECT COUNT(*)::int
          FROM template_asset_requirements wcar
          WHERE wcar.template_id = ${attributeTemplates.id}
            AND wcar.active = TRUE
            AND wcar.required = TRUE
            AND EXISTS (
              SELECT 1
              FROM product_assets wpa
              WHERE wpa.product_id = ${products.id}
                AND wpa.type_code = wcar.type_code
                AND wpa.deleted_at IS NULL
            )
        ) AS completed
    ) readiness
  ), 100)::int`;
}

/** Normalize the workbook's known spelling variants without inventing new application scopes. */
export function normalizeWorkbookApplicationTypes(value: string | null): string[] {
  const normalized = value?.trim().toLocaleUpperCase('es') ?? '';
  const result: string[] = [];
  if (normalized.includes('AUTOMOTR')) result.push('AUTOMOTRIZ');
  if (normalized.includes('INDUSTRIAL')) result.push('INDUSTRIAL');
  return result;
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
  const empty = emptyEncodedValue();
  if (dataType === 'number' || dataType === 'measurement')
    return { ...empty, valueNumber: value as number };
  if (dataType === 'boolean') return { ...empty, valueBoolean: value as boolean };
  if (dataType === 'date') return { ...empty, valueDate: value as string };
  return { ...empty, valueText: value as string };
}

function emptyEncodedValue() {
  return {
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueDate: null,
    valueJson: null,
  };
}

function toCell(
  row: ProductAttributeValueRow,
  dataType: CatalogAttributeDataType,
): ProductAttributeCell {
  let value: CatalogAttributeValue | null = null;
  if (row.deletedAt === null) {
    if (dataType === 'number' || dataType === 'measurement') value = row.valueNumber as number;
    else if (dataType === 'boolean') value = row.valueBoolean as boolean;
    else if (dataType === 'date') value = row.valueDate as string;
    else value = row.valueText as string;
  }
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
