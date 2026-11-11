import { Inject, Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  DomainError,
  DependencyUnavailableError,
  type Uuid,
} from '@cdr/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { createAuditEntry, AuditAction } from '../../../audit/domain/entities/audit-entry';
import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';
import { categoryHierarchyPaths } from '../../domain/entities/category-hierarchy';
import type { AdminCatalogCategory } from '../../domain/entities/catalog-administration';
import type {
  CatalogDesignRepositoryPort,
  CategorySkuAssignmentRow,
  CategorySkuAssignmentPreviewRow,
} from '../../domain/ports/catalog-design.repository.port';
import type { AuditMetadata } from '../../domain/ports/catalog-administration.repository.port';
import {
  attributeDefinitions,
  attributeTemplates,
  catalogCategories,
  productAttributeValues,
  productTemplateAssignments,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
  templateAssetRequirements,
} from './catalog-schema.tables';
import { DrizzleCatalogAdministrationRepository } from './drizzle-catalog-administration.repository';
import { recordAuditWithin } from './record-audit-within-transaction';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
@Injectable()
export class DrizzleCatalogDesignRepository implements CatalogDesignRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  private async transaction<T>(operation: (tx: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(operation);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : error;
      const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined;
      if (code === '23505')
        throw new ConflictError('La configuración ya existe; actualiza los datos');
      if (code === '40P01' || code === '40001')
        throw new ConflictError('La configuración cambió en otra solicitud; vuelve a intentarlo');
      throw new DependencyUnavailableError('catalog database', error);
    }
  }
  private async lockTree(tx: Transaction) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cdr:catalog-design'))`);
  }
  private async audit(
    tx: Transaction,
    metadata: AuditMetadata,
    type: string,
    id: string,
    before: unknown,
    after: unknown,
  ) {
    await recordAuditWithin(
      tx,
      createAuditEntry({
        resourceType: type,
        resourceId: id,
        action: before === null ? AuditAction.Created : AuditAction.Updated,
        actorId: metadata.actorId,
        source: 'api',
        correlationId: metadata.correlationId,
        occurredAt: metadata.occurredAt,
        changes: { configuration: { before, after } },
      }),
    );
  }
  async exportCategoryAssignments() {
    return this.db
      .select({
        sku: products.sku,
        categorySlug: catalogCategories.slug,
        categoryPath: catalogCategories.path,
        variantKey: attributeTemplates.variantKey,
      })
      .from(products)
      .leftJoin(productTemplateAssignments, eq(productTemplateAssignments.productId, products.id))
      .leftJoin(
        attributeTemplates,
        eq(attributeTemplates.id, productTemplateAssignments.templateId),
      )
      .leftJoin(catalogCategories, eq(catalogCategories.id, attributeTemplates.categoryId))
      .orderBy(products.sku);
  }
  private async resolveAssignments(rows: readonly CategorySkuAssignmentRow[], tx: Transaction) {
    const productRows = await tx
      .select()
      .from(products)
      .where(
        inArray(
          products.sku,
          rows.map((row) => row.sku),
        ),
      )
      .orderBy(products.id)
      .for('update');
    const assignments = productRows.length
      ? await tx
          .select()
          .from(productTemplateAssignments)
          .where(
            inArray(
              productTemplateAssignments.productId,
              productRows.map((row) => row.id),
            ),
          )
          .for('update')
      : [];
    const categories = await tx.select().from(catalogCategories);
    const templates = await tx
      .select()
      .from(attributeTemplates)
      .where(eq(attributeTemplates.status, 'active'));
    const duplicates = new Set(
      rows
        .filter((row, index) => rows.findIndex((other) => other.sku === row.sku) !== index)
        .map((row) => row.sku),
    );
    return rows.map((row) => {
      const product = productRows.find((item) => item.sku === row.sku);
      const category = categories.find((item) => item.slug === row.categorySlug);
      const candidates = templates.filter(
        (item) =>
          item.categoryId === category?.id &&
          (!row.variantKey || item.variantKey === row.variantKey),
      );
      const error = duplicates.has(row.sku)
        ? 'SKU repetido en el archivo'
        : !product
          ? 'SKU inexistente: el PIM no crea SKU'
          : !category?.active
            ? 'La categoría PIM no existe o está inactiva'
            : categories.some((item) => item.parentId === category.id)
              ? 'Selecciona una categoría final'
              : candidates.length === 0
                ? 'Sin plantilla activa para esa categoría y variante'
                : candidates.length > 1
                  ? 'La categoría tiene varias variantes: indica plantilla_variante'
                  : null;
      const preview: CategorySkuAssignmentPreviewRow = {
        ...row,
        expectedTemplateId: (assignments.find((item) => item.productId === product?.id)
          ?.templateId ?? null) as Uuid | null,
        targetTemplateId: error ? null : (candidates[0]!.id as Uuid),
        error,
      };
      return { productId: product?.id, preview };
    });
  }
  async previewCategoryAssignments(rows: readonly CategorySkuAssignmentRow[]) {
    return this.transaction(async (tx) => {
      await this.lockTree(tx);
      return { rows: (await this.resolveAssignments(rows, tx)).map((row) => row.preview) };
    });
  }
  async confirmCategoryAssignments(
    rows: Parameters<CatalogDesignRepositoryPort['confirmCategoryAssignments']>[0],
    audit: AuditMetadata,
  ) {
    return this.transaction(async (tx) => {
      await this.lockTree(tx);
      const resolved = await this.resolveAssignments(rows, tx);
      const errors = resolved.filter((row) => row.preview.error);
      if (errors.length)
        throw new ValidationError('Corrige las filas rechazadas antes de confirmar', {
          rows: errors.map((row) => ({ sku: row.preview.sku, error: row.preview.error })),
        });
      if (
        resolved.some(
          (row, index) =>
            row.preview.expectedTemplateId !== rows[index]!.expectedTemplateId ||
            row.preview.targetTemplateId !== rows[index]!.targetTemplateId,
        )
      )
        throw new ConflictError(
          'La categoría de un SKU cambió desde la vista previa; vuelve a validar el archivo',
        );
      let changed = 0;
      for (const { productId, preview } of resolved) {
        if (
          !productId ||
          !preview.targetTemplateId ||
          preview.targetTemplateId === preview.expectedTemplateId
        )
          continue;
        await tx
          .insert(productTemplateAssignments)
          .values({ productId, templateId: preview.targetTemplateId, assignedAt: audit.occurredAt })
          .onConflictDoUpdate({
            target: productTemplateAssignments.productId,
            set: { templateId: preview.targetTemplateId, assignedAt: audit.occurredAt },
          });
        await this.audit(
          tx,
          audit,
          'product',
          productId,
          { templateId: preview.expectedTemplateId },
          { templateId: preview.targetTemplateId, categoryCode: preview.categorySlug },
        );
        changed += 1;
      }
      return { changed };
    });
  }
  async createCategory(input: Parameters<CatalogDesignRepositoryPort['createCategory']>[0]) {
    return this.transaction(async (tx) => {
      await this.lockTree(tx);
      const rows = await tx
        .select()
        .from(catalogCategories)
        .orderBy(catalogCategories.id)
        .for('update');
      if (rows.some((row) => row.slug === input.slug))
        throw new ConflictError('El código de categoría ya existe');
      if (input.parentId) {
        const parent = rows.find((row) => row.id === input.parentId);
        if (!parent || !parent.active)
          throw new ValidationError('Selecciona una categoría padre activa');
        const templates = await tx
          .select({ id: attributeTemplates.id })
          .from(attributeTemplates)
          .where(eq(attributeTemplates.categoryId, input.parentId))
          .limit(1);
        if (templates.length)
          throw new ValidationError(
            'Una categoría con plantillas debe permanecer como categoría final',
          );
      }
      const paths = categoryHierarchyPaths([...rows, input]);
      const [created] = await tx
        .insert(catalogCategories)
        .values({
          id: input.id,
          name: input.name,
          slug: input.slug,
          parentId: input.parentId,
          position: input.position,
          path: paths.get(input.id)!,
          createdAt: input.audit.occurredAt,
          updatedAt: input.audit.occurredAt,
        })
        .returning();
      if (!created) throw new ConflictError('No se pudo crear la categoría');
      await this.audit(tx, input.audit, 'catalog_category', input.id, null, created);
      return { ...created, id: input.id, parentId: input.parentId };
    });
  }
  async moveCategory(input: Parameters<CatalogDesignRepositoryPort['moveCategory']>[0]) {
    return this.transaction(async (tx) => {
      await this.lockTree(tx);
      const rows = await tx
        .select()
        .from(catalogCategories)
        .orderBy(catalogCategories.id)
        .for('update');
      const current = rows.find((row) => row.id === input.id);
      if (!current) throw new NotFoundError('Catalog category', input.id);
      assertVersion(current.updatedAt, input.expectedUpdatedAt);
      if (input.parentId && input.parentId !== current.parentId) {
        const parent = rows.find((row) => row.id === input.parentId);
        if (!parent?.active) throw new ValidationError('Selecciona una categoría padre activa');
        const assigned = await tx
          .select({ id: attributeTemplates.id })
          .from(attributeTemplates)
          .where(eq(attributeTemplates.categoryId, input.parentId))
          .limit(1);
        if (assigned.length)
          throw new ValidationError(
            'Una categoría con plantillas debe permanecer como categoría final',
          );
      }
      const paths = categoryHierarchyPaths(
        rows.map((row) => (row.id === input.id ? { ...row, parentId: input.parentId } : row)),
      );
      for (const row of rows) {
        if (row.path !== paths.get(row.id) || row.id === input.id)
          await tx
            .update(catalogCategories)
            .set({
              path: paths.get(row.id)!,
              ...(row.id === input.id ? { parentId: input.parentId } : {}),
              updatedAt: input.audit.occurredAt,
            })
            .where(eq(catalogCategories.id, row.id));
      }
      const [persisted] = await tx
        .select()
        .from(catalogCategories)
        .where(eq(catalogCategories.id, input.id));
      const after: AdminCatalogCategory = { ...persisted!, id: input.id, parentId: input.parentId };
      await this.audit(tx, input.audit, 'catalog_category', input.id, current, after);
      return after;
    });
  }
  async configureTemplate(input: Parameters<CatalogDesignRepositoryPort['configureTemplate']>[0]) {
    const templateId = await this.transaction(async (tx) => {
      await this.lockTree(tx);
      const [category] = await tx
        .select()
        .from(catalogCategories)
        .where(eq(catalogCategories.id, input.categoryId))
        .for('update');
      if (!category) throw new NotFoundError('Catalog category', input.categoryId);
      assertVersion(category.updatedAt, input.expectedUpdatedAt);
      if (!category.active) throw new ValidationError('La categoría debe estar activa');
      const children = await tx
        .select({ id: catalogCategories.id })
        .from(catalogCategories)
        .where(eq(catalogCategories.parentId, input.categoryId))
        .limit(1);
      if (children.length)
        throw new ValidationError('Solo las categorías finales pueden tener una plantilla');
      const source = input.sourceTemplateId
        ? (
            await tx
              .select()
              .from(attributeTemplates)
              .where(eq(attributeTemplates.id, input.sourceTemplateId))
              .for('update')
          )[0]
        : undefined;
      if (input.mode !== 'empty' && (!source || source.status !== 'active'))
        throw new ValidationError('Selecciona una plantilla activa');
      const current = await tx
        .select()
        .from(attributeTemplates)
        .where(eq(attributeTemplates.categoryId, input.categoryId))
        .for('update');
      let targetId = input.id;
      if (input.mode === 'assign' && source?.categoryId === input.categoryId)
        targetId = source.id as Uuid;
      else {
        await tx.insert(attributeTemplates).values({
          id: targetId,
          categoryId: input.categoryId,
          name: input.name,
          variantKey: `pim-${targetId}`,
          version: 1,
          status: 'active',
          createdAt: input.audit.occurredAt,
          updatedAt: input.audit.occurredAt,
        });
        // Copies retain definition IDs so existing values survive template reassignment.
        if (source && input.mode !== 'empty') {
          const assignments = await tx
            .select()
            .from(templateAttributeAssignments)
            .where(eq(templateAttributeAssignments.templateId, source.id));
          if (assignments.length)
            await tx.insert(templateAttributeAssignments).values(
              assignments.map((row) => ({
                ...row,
                templateId: targetId,
                createdAt: input.audit.occurredAt,
                updatedAt: input.audit.occurredAt,
              })),
            );
          const access = await tx
            .select()
            .from(templateAttributeRoleAccess)
            .where(eq(templateAttributeRoleAccess.templateId, source.id));
          if (access.length)
            await tx
              .insert(templateAttributeRoleAccess)
              .values(access.map((row) => ({ ...row, templateId: targetId })));
          const assets = await tx
            .select()
            .from(templateAssetRequirements)
            .where(eq(templateAssetRequirements.templateId, source.id));
          if (assets.length)
            await tx.insert(templateAssetRequirements).values(
              assets.map((row) => ({
                ...row,
                templateId: targetId,
                createdAt: input.audit.occurredAt,
                updatedAt: input.audit.occurredAt,
              })),
            );
        } else {
          // An empty template retains the approved ERP base fields and their role policy.
          const base = await tx
            .select()
            .from(attributeDefinitions)
            .where(
              and(
                eq(attributeDefinitions.sourceAuthority, 'erp'),
                eq(attributeDefinitions.active, true),
              ),
            );
          if (base.length) {
            await tx.insert(templateAttributeAssignments).values(
              base.map((row, position) => ({
                templateId: targetId,
                attributeDefinitionId: row.id,
                position,
                publishable: true,
              })),
            );
            await tx.insert(templateAttributeRoleAccess).values(
              base.flatMap((row) =>
                ['ADMINISTRADOR', 'COMPRAS', 'VENTAS'].map((role) => ({
                  templateId: targetId,
                  attributeDefinitionId: row.id,
                  role,
                  canView: true,
                  canEdit: false,
                  canImport: false,
                  canExport: true,
                })),
              ),
            );
          }
        }
      }
      const oldIds = current.map((row) => row.id).filter((id) => id !== targetId);
      if (oldIds.length) {
        const affected = await tx
          .select()
          .from(productTemplateAssignments)
          .where(inArray(productTemplateAssignments.templateId, oldIds))
          .for('update');
        await tx
          .update(productTemplateAssignments)
          .set({ templateId: targetId, assignedAt: input.audit.occurredAt })
          .where(inArray(productTemplateAssignments.templateId, oldIds));
        for (const row of affected)
          await this.audit(
            tx,
            input.audit,
            'product',
            row.productId,
            { templateId: row.templateId },
            { templateId: targetId },
          );
      }
      await tx
        .update(catalogCategories)
        .set({ updatedAt: input.audit.occurredAt })
        .where(eq(catalogCategories.id, input.categoryId));
      await this.audit(
        tx,
        input.audit,
        'catalog_category_template',
        input.categoryId,
        current.map((row) => row.id),
        { templateId: targetId, mode: input.mode },
      );
      return targetId;
    });
    const template = await new DrizzleCatalogAdministrationRepository(this.db).getTemplate(
      templateId,
    );
    if (!template) throw new NotFoundError('Attribute template', templateId);
    return template;
  }
  async addAttribute(input: Parameters<CatalogDesignRepositoryPort['addAttribute']>[0]) {
    await this.transaction(async (tx) => {
      await this.lockTree(tx);
      const [template] = await tx
        .select()
        .from(attributeTemplates)
        .where(eq(attributeTemplates.id, input.templateId))
        .for('update');
      if (!template) throw new NotFoundError('Attribute template', input.templateId);
      assertVersion(template.updatedAt, input.expectedUpdatedAt);
      if (template.status === 'retired')
        throw new ValidationError('La plantilla retirada es de solo lectura');
      const existing = await tx
        .select()
        .from(attributeDefinitions)
        .where(eq(attributeDefinitions.key, input.key))
        .limit(1);
      if (existing.length)
        throw new ConflictError(
          'La clave ya existe; usa una clave técnica única para el atributo nuevo',
        );
      await tx.insert(attributeDefinitions).values({
        id: input.id,
        key: input.key,
        label: input.label,
        dataType: input.dataType,
        unit: input.unit,
        allowedValues: input.allowedValues,
        sourceAuthority: 'pim',
        createdAt: input.audit.occurredAt,
        updatedAt: input.audit.occurredAt,
      });
      const assignments = await tx
        .select({ position: templateAttributeAssignments.position })
        .from(templateAttributeAssignments)
        .where(eq(templateAttributeAssignments.templateId, input.templateId));
      await tx.insert(templateAttributeAssignments).values({
        templateId: input.templateId,
        attributeDefinitionId: input.id,
        position: Math.max(-1, ...assignments.map((row) => row.position)) + 1,
      });
      // New fields start private; administrators explicitly grant the approved business roles.
      await tx.insert(templateAttributeRoleAccess).values({
        templateId: input.templateId,
        attributeDefinitionId: input.id,
        role: 'ADMINISTRADOR',
        canView: true,
        canEdit: true,
        canImport: true,
        canExport: true,
      });
      await tx
        .update(attributeTemplates)
        .set({ updatedAt: input.audit.occurredAt })
        .where(eq(attributeTemplates.id, input.templateId));
      await this.audit(
        tx,
        input.audit,
        'template_attribute_assignment',
        `${input.templateId}:${input.id}`,
        null,
        { key: input.key, label: input.label, dataType: input.dataType, unit: input.unit },
      );
    });
    const template = await new DrizzleCatalogAdministrationRepository(this.db).getTemplate(
      input.templateId,
    );
    if (!template) throw new NotFoundError('Attribute template', input.templateId);
    return template;
  }
  async previewInheritance(templateId: Uuid, unifiedCode: string) {
    const template = await new DrizzleCatalogAdministrationRepository(this.db).getTemplate(
      templateId,
    );
    if (!template) throw new NotFoundError('Attribute template', templateId);
    const members = await this.db
      .select({ id: products.id, sku: products.sku })
      .from(productTemplateAssignments)
      .innerJoin(products, eq(products.id, productTemplateAssignments.productId))
      .innerJoin(productAttributeValues, eq(productAttributeValues.productId, products.id))
      .innerJoin(
        attributeDefinitions,
        eq(attributeDefinitions.id, productAttributeValues.attributeDefinitionId),
      )
      .where(
        and(
          eq(productTemplateAssignments.templateId, templateId),
          eq(attributeDefinitions.key, 'codigo_unificador'),
          eq(productAttributeValues.valueText, unifiedCode),
          sql`${productAttributeValues.deletedAt} is null`,
        ),
      )
      .orderBy(products.sku);
    const values = members.length
      ? await this.db
          .select()
          .from(productAttributeValues)
          .where(
            and(
              inArray(
                productAttributeValues.productId,
                members.map((row) => row.id),
              ),
              sql`${productAttributeValues.deletedAt} is null`,
            ),
          )
      : [];
    return {
      unifiedCode,
      sourceSkus: members.map((row) => row.sku),
      attributes: (template.attributes ?? [])
        .filter((row) => row.active && row.sourceAuthority === 'pim')
        .map((attribute) => {
          const candidates = attribute.replicable
            ? values
                .filter((row) => row.attributeDefinitionId === attribute.id)
                .map((row) => row.valueText ?? row.valueNumber ?? row.valueBoolean ?? row.valueDate)
                .filter((value) => value !== null)
            : [];
          const unique = [
            ...new Map(candidates.map((value) => [JSON.stringify(value), value])).values(),
          ];
          return {
            key: attribute.key,
            label: attribute.label,
            required: attribute.required,
            replicable: attribute.replicable,
            value: unique.length === 1 ? unique[0]! : null,
            conflict: unique.length > 1,
          };
        }),
    };
  }
}
function assertVersion(actual: Date, expected: Date) {
  if (actual.getTime() !== expected.getTime())
    throw new ConflictError(
      'Otra persona modificó la configuración; actualiza los datos e intenta de nuevo',
      { actualUpdatedAt: actual.toISOString() },
    );
}
