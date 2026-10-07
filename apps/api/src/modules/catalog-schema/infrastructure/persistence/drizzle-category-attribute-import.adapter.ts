import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, type Uuid } from '@cdr/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { AuditAction, createAuditEntry } from '../../../audit/domain/entities/audit-entry';
import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';
import { equivalenceGroupMembers } from '../../../equivalences/infrastructure/persistence/equivalences.tables';
import {
  type AttributeSourceAuthority,
  CatalogAttributeDataType,
  type CatalogAttributeDataType as CatalogAttributeDataTypeType,
  type CatalogAttributeValue,
  validateAttributeValue,
} from '../../domain/entities/catalog-schema';
import type {
  ApplyCategoryImportRowResult,
  CategoryAttributeImportPort,
  CategoryImportCellPlan,
  CategoryImportRecord,
  CategoryImportRecordValue,
  CategoryImportRowPlan,
  PreparedCategoryImportRow,
} from '../../domain/ports/category-attribute-import.port';
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
import { recordAuditWithin } from './record-audit-within-transaction';

const SKU_KEY = 'sku';

interface ImportableDefinition {
  readonly id: Uuid;
  readonly key: string;
  readonly label: string;
  readonly dataType: CatalogAttributeDataTypeType;
  readonly unit: string | null;
  readonly allowedValues: readonly string[];
  readonly required: boolean;
  readonly replicable: boolean;
  readonly sourceAuthority: AttributeSourceAuthority;
}

interface ImportColumnPolicy extends ImportableDefinition {
  readonly assignmentActive: boolean;
  readonly definitionActive: boolean;
  readonly canImport: boolean;
}

interface Mutation {
  readonly productId: Uuid;
  readonly definition: ImportableDefinition;
  readonly value: CatalogAttributeValue | null;
}

@Injectable()
export class DrizzleCategoryAttributeImportAdapter implements CategoryAttributeImportPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async prepare(input: {
    readonly categorySlug: string;
    readonly rows: readonly {
      rowNumber: number;
      data: CategoryImportRecord;
      errors: readonly string[];
      warnings?: readonly string[];
    }[];
    readonly roles: readonly string[];
  }): Promise<readonly PreparedCategoryImportRow[]> {
    const context = await this.loadTemplateContext(input.categorySlug, input.roles);
    const definitions = new Map(
      [...context.columns.values()]
        .filter(
          (definition) =>
            definition.assignmentActive &&
            definition.definitionActive &&
            definition.canImport &&
            definition.sourceAuthority === 'pim',
        )
        .map((definition) => [definition.key, definition]),
    );
    const skus = [
      ...new Set(
        input.rows
          .map((row) => normalizeText(row.data[SKU_KEY]).toLocaleLowerCase('es'))
          .filter(Boolean),
      ),
    ];
    const productRows = await this.loadProductsBySku(context.templateId, skus);
    const productsBySku = new Map<string, { id: Uuid; sku: string }[]>();
    for (const product of productRows) {
      const key = product.sku.toLocaleLowerCase('es');
      const values = productsBySku.get(key) ?? [];
      values.push(product);
      productsBySku.set(key, values);
    }

    const productIds = productRows.map((product) => product.id);
    const definitionIds = [...definitions.values()].map((definition) => definition.id);
    const versions = new Map<string, number>();
    if (productIds.length > 0 && definitionIds.length > 0) {
      for (const productChunk of chunks(productIds, 500)) {
        const values = await this.db
          .select({
            productId: productAttributeValues.productId,
            definitionId: productAttributeValues.attributeDefinitionId,
            version: productAttributeValues.version,
          })
          .from(productAttributeValues)
          .where(
            and(
              inArray(productAttributeValues.productId, productChunk),
              inArray(productAttributeValues.attributeDefinitionId, definitionIds),
            ),
          );
        for (const value of values) {
          versions.set(cellKey(value.productId, value.definitionId), value.version);
        }
      }
    }

    const seenSkus = new Set<string>();
    return input.rows.map((row) => {
      const errors = [...row.errors];
      const warnings = [...(row.warnings ?? [])];
      const rawSku = normalizeText(row.data[SKU_KEY]);
      const normalizedSku = rawSku.toLocaleLowerCase('es');
      if (rawSku.length > 200) errors.push('sku debe contener como máximo 200 caracteres');
      if (normalizedSku && seenSkus.has(normalizedSku)) {
        errors.push('SKU duplicado dentro del archivo');
      } else if (normalizedSku) {
        seenSkus.add(normalizedSku);
      }

      const matches = productsBySku.get(normalizedSku) ?? [];
      if (rawSku && matches.length === 0) {
        errors.push(`El SKU ${rawSku} no existe o no está asignado a la plantilla activa`);
      }
      if (matches.length > 1)
        errors.push(`El SKU ${rawSku} es ambiguo por diferencias de mayúsculas`);

      const normalizedData: Record<string, CategoryImportRecordValue> = { sku: rawSku };
      const cells: CategoryImportCellPlan[] = [];
      for (const [attributeKey, rawValue] of Object.entries(row.data)) {
        if (attributeKey === SKU_KEY) continue;
        const definition = definitions.get(attributeKey);
        if (!definition) {
          const policy = context.columns.get(attributeKey);
          if (!policy) {
            warnings.push(`Se ignoró la columna ${attributeKey}: no pertenece a la plantilla`);
          } else if (!policy.assignmentActive || !policy.definitionActive) {
            warnings.push(`Se ignoró la columna ${attributeKey}: atributo inactivo`);
          } else if (policy.sourceAuthority === 'erp') {
            warnings.push(`Se ignoró la columna ${attributeKey}: dato base ERP`);
          } else if (policy.sourceAuthority !== 'pim') {
            warnings.push(
              `Se ignoró la columna ${attributeKey}: atributo gobernado por ${policy.sourceAuthority}`,
            );
          } else {
            warnings.push(
              `Se ignoró la columna ${attributeKey}: archivo, campo del sistema o no importable para tu rol`,
            );
          }
          normalizedData[attributeKey] = rawValue;
          continue;
        }
        if (isBlank(rawValue)) continue;
        try {
          const value = convertImportValue(definition, rawValue);
          validateAttributeValue(definition, value, false);
          if (value === null && definition.required) {
            warnings.push(`Se vacía el atributo obligatorio ${definition.label}`);
          }
          normalizedData[attributeKey] = value;
          const product = matches[0];
          if (product) {
            cells.push({
              attributeKey,
              value,
              expectedVersion: versions.get(cellKey(product.id, definition.id)) ?? 0,
            });
          }
        } catch (error) {
          errors.push(importValueError(attributeKey, error));
          normalizedData[attributeKey] = rawValue;
        }
      }
      const product = matches.length === 1 ? matches[0] : undefined;
      const plan: CategoryImportRowPlan | null =
        product && errors.length === 0 ? { productId: product.id, sku: product.sku, cells } : null;
      return {
        rowNumber: row.rowNumber,
        valid: plan !== null,
        data: normalizedData,
        errors,
        warnings,
        plan,
      };
    });
  }

  async applyRow(input: {
    readonly categorySlug: string;
    readonly plan: CategoryImportRowPlan;
    readonly roles: readonly string[];
    readonly actorId: string;
    readonly batchId: Uuid;
    readonly correlationId: string;
    readonly now: Date;
  }): Promise<ApplyCategoryImportRowResult> {
    if (input.roles.length === 0) return denied('Tu rol no permite importar atributos');
    return this.db.transaction(async (tx) => {
      const headers = await tx
        .select({
          sku: products.sku,
          templateId: attributeTemplates.id,
        })
        .from(products)
        .innerJoin(
          productTemplateAssignments,
          eq(productTemplateAssignments.productId, products.id),
        )
        .innerJoin(
          attributeTemplates,
          eq(attributeTemplates.id, productTemplateAssignments.templateId),
        )
        .innerJoin(catalogCategories, eq(catalogCategories.id, attributeTemplates.categoryId))
        .where(
          and(
            eq(products.id, input.plan.productId),
            eq(products.sku, input.plan.sku),
            eq(catalogCategories.slug, input.categorySlug),
            eq(catalogCategories.active, true),
            eq(attributeTemplates.status, 'active'),
          ),
        )
        .for('update')
        .limit(1);
      const header = headers[0];
      if (!header) {
        return denied('El SKU ya no está asignado a la plantilla activa de la categoría');
      }

      const requestedKeys = [...new Set(input.plan.cells.map((cell) => cell.attributeKey))];
      if (requestedKeys.length === 0) return { applied: true, errors: [] };
      const accessRows = await tx
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
          role: templateAttributeRoleAccess.role,
          canImport: templateAttributeRoleAccess.canImport,
        })
        .from(templateAttributeAssignments)
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
            eq(templateAttributeAssignments.templateId, header.templateId),
            eq(templateAttributeAssignments.active, true),
            eq(attributeDefinitions.active, true),
            inArray(attributeDefinitions.key, requestedKeys),
            inArray(templateAttributeRoleAccess.role, [...input.roles]),
          ),
        )
        .for('update');
      const definitions = mergeImportableDefinitions(accessRows);
      const errors: string[] = [];
      for (const cell of input.plan.cells) {
        const definition = definitions.get(cell.attributeKey);
        if (!definition) errors.push(`El atributo ${cell.attributeKey} ya no es importable`);
        else if (definition.sourceAuthority !== 'pim') {
          errors.push(`El atributo ${cell.attributeKey} ahora es gobernado por una fuente externa`);
        } else {
          try {
            validateAttributeValue(definition, cell.value, false);
          } catch (error) {
            errors.push(importValueError(cell.attributeKey, error));
          }
        }
      }
      if (errors.length > 0) return denied(...errors);

      const definitionIds = [...definitions.values()].map((definition) => definition.id);
      const primaryRows = await tx
        .select()
        .from(productAttributeValues)
        .where(
          and(
            eq(productAttributeValues.productId, input.plan.productId),
            inArray(productAttributeValues.attributeDefinitionId, definitionIds),
          ),
        )
        .for('update');
      const primaryByDefinition = new Map(
        primaryRows.map((row) => [row.attributeDefinitionId, row]),
      );
      for (const cell of input.plan.cells) {
        const definition = definitions.get(cell.attributeKey) as ImportableDefinition;
        const current = primaryByDefinition.get(definition.id);
        const actualVersion = current?.version ?? 0;
        if (
          actualVersion !== cell.expectedVersion &&
          !sameValue(decodeValue(current, definition.dataType), cell.value)
        ) {
          errors.push(
            `${cell.attributeKey} cambió después de la vista previa (versión ${cell.expectedVersion} → ${actualVersion})`,
          );
        }
      }
      if (errors.length > 0) return denied(...errors);

      const mutations = await this.resolveMutations(tx, input.plan, definitions, input.roles);
      const allProductIds = [...new Set(mutations.map((mutation) => mutation.productId))];
      const allDefinitionIds = [...new Set(mutations.map((mutation) => mutation.definition.id))];
      const existingRows =
        allProductIds.length === 0 || allDefinitionIds.length === 0
          ? []
          : await tx
              .select()
              .from(productAttributeValues)
              .where(
                and(
                  inArray(productAttributeValues.productId, allProductIds),
                  inArray(productAttributeValues.attributeDefinitionId, allDefinitionIds),
                ),
              )
              .for('update');
      const existing = new Map(
        existingRows.map((row) => [cellKey(row.productId, row.attributeDefinitionId), row]),
      );
      const changesByProduct = new Map<Uuid, Record<string, { before: unknown; after: unknown }>>();

      for (const mutation of mutations) {
        const key = cellKey(mutation.productId, mutation.definition.id);
        const beforeRow = existing.get(key);
        const before = decodeValue(beforeRow, mutation.definition.dataType);
        if (sameValue(before, mutation.value)) continue;
        const version = (beforeRow?.version ?? 0) + 1;
        const encoded =
          mutation.value === null
            ? emptyEncodedValue()
            : encodeValue(mutation.definition.dataType, mutation.value);
        await tx
          .insert(productAttributeValues)
          .values({
            productId: mutation.productId,
            attributeDefinitionId: mutation.definition.id,
            ...encoded,
            source: 'import',
            confidence: 1,
            version,
            validFrom: input.now,
            updatedAt: input.now,
            deletedAt: mutation.value === null ? input.now : null,
          })
          .onConflictDoUpdate({
            target: [
              productAttributeValues.productId,
              productAttributeValues.attributeDefinitionId,
            ],
            set: {
              ...encoded,
              source: 'import',
              confidence: 1,
              version,
              validFrom: input.now,
              updatedAt: input.now,
              deletedAt: mutation.value === null ? input.now : null,
            },
          });
        const productChanges = changesByProduct.get(mutation.productId) ?? {};
        productChanges[mutation.definition.key] = { before, after: mutation.value };
        changesByProduct.set(mutation.productId, productChanges);
      }

      const changedProductIds = [...changesByProduct.keys()];
      const statusRows =
        changedProductIds.length === 0
          ? []
          : await tx
              .select({ id: products.id, status: products.status })
              .from(products)
              .where(inArray(products.id, changedProductIds))
              .for('update');
      const previousStatus = new Map(statusRows.map((row) => [row.id as Uuid, row.status]));
      const publishedIds = statusRows
        .filter((row) => row.status === 'published')
        .map((row) => row.id as Uuid);
      if (publishedIds.length > 0) {
        await tx
          .update(products)
          .set({ status: 'in_review', updatedAt: input.now })
          .where(inArray(products.id, publishedIds));
      }

      for (const [productId, changes] of changesByProduct) {
        await recordAuditWithin(
          tx,
          createAuditEntry({
            resourceType: 'product',
            resourceId: productId,
            action: AuditAction.Updated,
            actorId: input.actorId,
            source: 'import',
            correlationId: input.correlationId,
            occurredAt: input.now,
            changes: {
              ...changes,
              ...(previousStatus.get(productId) === 'published'
                ? { status: { before: 'published', after: 'in_review' } }
                : {}),
              importBatchId: { before: null, after: input.batchId },
            },
          }),
        );
      }
      return { applied: true, errors: [] };
    });
  }

  private async loadTemplateContext(categorySlug: string, roles: readonly string[]) {
    if (roles.length === 0) throw new NotFoundError('Active category template', categorySlug);
    const headers = await this.db
      .select({ templateId: attributeTemplates.id })
      .from(catalogCategories)
      .innerJoin(attributeTemplates, eq(attributeTemplates.categoryId, catalogCategories.id))
      .where(
        and(
          eq(catalogCategories.slug, categorySlug),
          eq(catalogCategories.active, true),
          eq(attributeTemplates.status, 'active'),
        ),
      )
      .limit(1);
    const header = headers[0];
    if (!header) throw new NotFoundError('Active category template', categorySlug);
    const accessRows = await this.db
      .select({
        id: attributeDefinitions.id,
        key: attributeDefinitions.key,
        label: attributeDefinitions.label,
        dataType: attributeDefinitions.dataType,
        unit: attributeDefinitions.unit,
        allowedValues: attributeDefinitions.allowedValues,
        definitionActive: attributeDefinitions.active,
        sourceAuthority: attributeDefinitions.sourceAuthority,
        required: templateAttributeAssignments.required,
        replicable: templateAttributeAssignments.replicable,
        assignmentActive: templateAttributeAssignments.active,
        role: templateAttributeRoleAccess.role,
        canImport: templateAttributeRoleAccess.canImport,
      })
      .from(templateAttributeAssignments)
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
          eq(templateAttributeAssignments.templateId, header.templateId),
          inArray(templateAttributeRoleAccess.role, [...roles]),
        ),
      )
      .orderBy(asc(templateAttributeAssignments.position));
    return {
      templateId: header.templateId as Uuid,
      columns: mergeColumnPolicies(accessRows),
    };
  }

  private async loadProductsBySku(templateId: Uuid, normalizedSkus: readonly string[]) {
    const result: { id: Uuid; sku: string }[] = [];
    for (const skuChunk of chunks(normalizedSkus, 500)) {
      if (skuChunk.length === 0) continue;
      const rows = await this.db
        .select({ id: products.id, sku: products.sku })
        .from(products)
        .innerJoin(
          productTemplateAssignments,
          eq(productTemplateAssignments.productId, products.id),
        )
        .where(
          and(
            eq(productTemplateAssignments.templateId, templateId),
            inArray(sql<string>`lower(${products.sku})`, [...skuChunk]),
          ),
        );
      result.push(...rows.map((row) => ({ id: row.id as Uuid, sku: row.sku })));
    }
    return result;
  }

  private async resolveMutations(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    plan: CategoryImportRowPlan,
    definitions: ReadonlyMap<string, ImportableDefinition>,
    roles: readonly string[],
  ): Promise<Mutation[]> {
    const mutations = new Map<string, Mutation>();
    for (const cell of plan.cells) {
      const definition = definitions.get(cell.attributeKey) as ImportableDefinition;
      mutations.set(cellKey(plan.productId, definition.id), {
        productId: plan.productId,
        definition,
        value: cell.value,
      });
    }
    const replicable = plan.cells
      .map((cell) => ({
        cell,
        definition: definitions.get(cell.attributeKey) as ImportableDefinition,
      }))
      .filter(({ definition }) => definition.replicable);
    if (replicable.length === 0) return [...mutations.values()];

    const memberships = await tx
      .select({ groupId: equivalenceGroupMembers.groupId })
      .from(equivalenceGroupMembers)
      .where(eq(equivalenceGroupMembers.productId, plan.productId));
    if (memberships.length === 0) return [...mutations.values()];
    const members = await tx
      .select({ productId: equivalenceGroupMembers.productId })
      .from(equivalenceGroupMembers)
      .where(
        inArray(
          equivalenceGroupMembers.groupId,
          memberships.map((membership) => membership.groupId),
        ),
      );
    const candidateIds = [
      ...new Set(
        members
          .map((member) => member.productId as Uuid)
          .filter((productId) => productId !== plan.productId),
      ),
    ];
    if (candidateIds.length === 0) return [...mutations.values()];

    for (const { cell, definition } of replicable) {
      const eligible = await tx
        .select({
          productId: productTemplateAssignments.productId,
          required: templateAttributeAssignments.required,
          canImport: templateAttributeRoleAccess.canImport,
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
            inArray(productTemplateAssignments.productId, candidateIds),
            eq(attributeTemplates.status, 'active'),
            eq(templateAttributeAssignments.attributeDefinitionId, definition.id),
            eq(templateAttributeAssignments.active, true),
            eq(templateAttributeAssignments.replicable, true),
            inArray(templateAttributeRoleAccess.role, [...roles]),
            eq(templateAttributeRoleAccess.canImport, true),
          ),
        )
        .for('update');
      for (const row of eligible) {
        mutations.set(cellKey(row.productId, definition.id), {
          productId: row.productId as Uuid,
          definition,
          value: cell.value,
        });
      }
    }
    return [...mutations.values()];
  }
}

function mergeImportableDefinitions(
  rows: readonly {
    id: string;
    key: string;
    label: string;
    dataType: string;
    unit: string | null;
    allowedValues: string[];
    sourceAuthority: string;
    required: boolean;
    replicable: boolean;
    role: string;
    canImport: boolean;
  }[],
): Map<string, ImportableDefinition> {
  const result = new Map<string, ImportableDefinition>();
  for (const row of rows) {
    if (!row.canImport) continue;
    result.set(row.key, {
      id: row.id as Uuid,
      key: row.key,
      label: row.label,
      dataType: row.dataType as CatalogAttributeDataTypeType,
      unit: row.unit,
      allowedValues: row.allowedValues,
      required: row.required,
      replicable: row.replicable,
      sourceAuthority: row.sourceAuthority as AttributeSourceAuthority,
    });
  }
  return result;
}

function mergeColumnPolicies(
  rows: readonly {
    id: string;
    key: string;
    label: string;
    dataType: string;
    unit: string | null;
    allowedValues: string[];
    definitionActive: boolean;
    sourceAuthority: string;
    required: boolean;
    replicable: boolean;
    assignmentActive: boolean;
    role: string;
    canImport: boolean;
  }[],
): Map<string, ImportColumnPolicy> {
  const result = new Map<string, ImportColumnPolicy>();
  for (const row of rows) {
    const current = result.get(row.key);
    result.set(row.key, {
      id: row.id as Uuid,
      key: row.key,
      label: row.label,
      dataType: row.dataType as CatalogAttributeDataTypeType,
      unit: row.unit,
      allowedValues: row.allowedValues,
      required: row.required,
      replicable: row.replicable,
      sourceAuthority: row.sourceAuthority as AttributeSourceAuthority,
      assignmentActive: row.assignmentActive,
      definitionActive: row.definitionActive,
      canImport: Boolean(current?.canImport || row.canImport),
    });
  }
  return result;
}

function convertImportValue(
  definition: ImportableDefinition,
  raw: CategoryImportRecordValue,
): CatalogAttributeValue | null {
  const value = normalizeText(raw);
  if (value === '-') return null;
  switch (definition.dataType) {
    case CatalogAttributeDataType.Number:
    case CatalogAttributeDataType.Measurement: {
      const numberValue = typeof raw === 'number' ? raw : Number(value);
      if (!Number.isFinite(numberValue)) throw new Error('debe ser un número finito');
      return numberValue;
    }
    case CatalogAttributeDataType.Boolean: {
      if (typeof raw === 'boolean') return raw;
      const candidate = normalized(value);
      if (['true', '1', 'si', 'sí'].includes(candidate)) return true;
      if (['false', '0', 'no'].includes(candidate)) return false;
      throw new Error('debe ser verdadero/falso, sí/no o 1/0');
    }
    case CatalogAttributeDataType.Date: {
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !isRealIsoDate(value)) {
        throw new Error('debe usar una fecha real con formato AAAA-MM-DD');
      }
      return value;
    }
    case CatalogAttributeDataType.Enum: {
      const matches = definition.allowedValues.filter(
        (allowed) => normalized(allowed) === normalized(value),
      );
      if (matches.length !== 1) {
        throw new Error(`debe ser uno de: ${definition.allowedValues.join(', ')}`);
      }
      return matches[0] as string;
    }
    case CatalogAttributeDataType.Text:
      if (Array.isArray(raw)) throw new Error('debe ser texto, no una lista');
      return value;
  }
}

function isRealIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeText(value: CategoryImportRecordValue | undefined): string {
  if (value === null || value === undefined || Array.isArray(value)) return '';
  return String(value).trim();
}

function isBlank(value: CategoryImportRecordValue): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '');
}

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('es');
}

function importValueError(attributeKey: string, error: unknown): string {
  return `${attributeKey}: ${error instanceof Error ? error.message : 'valor inválido'}`;
}

function denied(...errors: string[]): ApplyCategoryImportRowResult {
  return { applied: false, errors };
}

function chunks<Value>(values: readonly Value[], size: number): Value[][] {
  const result: Value[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function cellKey(productId: string, definitionId: string): string {
  return `${productId}:${definitionId}`;
}

function encodeValue(dataType: CatalogAttributeDataTypeType, value: CatalogAttributeValue) {
  const empty = emptyEncodedValue();
  if (dataType === 'number' || dataType === 'measurement') {
    return { ...empty, valueNumber: value as number };
  }
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

function decodeValue(
  row: ProductAttributeValueRow | undefined,
  dataType: CatalogAttributeDataTypeType,
): CatalogAttributeValue | null {
  if (!row || row.deletedAt !== null) return null;
  if (dataType === 'number' || dataType === 'measurement') return row.valueNumber as number;
  if (dataType === 'boolean') return row.valueBoolean as boolean;
  if (dataType === 'date') return row.valueDate as string;
  return row.valueText as string;
}

function sameValue(left: CatalogAttributeValue | null, right: CatalogAttributeValue | null) {
  return left === right;
}
