import type postgres from 'postgres';
import { Inject, Injectable } from '@nestjs/common';
import {
  ConflictError,
  DependencyUnavailableError,
  NotFoundError,
  ValidationError,
  isDomainError,
  newUuid,
} from '@cdr/shared';
import {
  categoryGovernanceSchema,
  type CategoryTreeImportRow,
  type SaveCategoryDynamicAttribute,
} from '@cdr/contracts';
import type { Sql } from '../../../../database/drizzle.client';
import { DATABASE_SQL } from '../../../../shared/tokens';
import {
  planCategoryTreeImport,
  type ImportCategoryNode,
} from '../../domain/entities/category-tree-import';
import type { CategoryGovernancePort } from '../../domain/ports/category-governance.port';
import type { AuditMetadata } from '../../domain/ports/catalog-administration.repository.port';

type Transaction = postgres.TransactionSql;
@Injectable()
export class PostgresCategoryGovernanceAdapter implements CategoryGovernancePort {
  constructor(@Inject(DATABASE_SQL) private readonly sql: Sql) {}
  private async protect<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isDomainError(error)) throw error;
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
      if (code === '23505' || code === '40001' || code === '40P01')
        throw new ConflictError('La configuración cambió; vuelve a validar');
      throw new DependencyUnavailableError('category-governance-database', error);
    }
  }
  private async audit(
    tx: Transaction,
    metadata: AuditMetadata,
    resourceId: string,
    before: unknown,
    after: unknown,
  ) {
    const id = newUuid();
    const resourceType = 'category_governance';
    const [previous] = await tx<
      { occurredAt: Date | string }[]
    >`SELECT occurred_at AS "occurredAt" FROM audit_entries WHERE resource_type=${resourceType} AND resource_id=${resourceId} ORDER BY occurred_at DESC LIMIT 1`;
    await tx`INSERT INTO audit_entries(id,resource_type,resource_id,action,actor_id,source,correlation_id,changes,occurred_at) VALUES (${id}::uuid,${resourceType},${resourceId},'updated',${metadata.actorId},'api',${metadata.correlationId},${JSON.stringify({ configuration: { before, after } })}::jsonb,${metadata.occurredAt.toISOString()}::timestamptz)`;
    await tx`INSERT INTO audit_change_items(id,audit_entry_id,field_name,before_value,after_value,previous_value_valid_from) VALUES (${newUuid()}::uuid,${id}::uuid,'configuration',${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb,${previous ? new Date(previous.occurredAt).toISOString() : null}::timestamptz)`;
  }
  async importTree(
    rows: readonly CategoryTreeImportRow[],
    confirm: boolean,
    audit: AuditMetadata,
    expectedRevision?: string,
  ) {
    return this.protect(() =>
      this.sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('cdr:catalog-design'))`;
        const [revisionRow] = await tx<
          { revision: string }[]
        >`SELECT md5(COALESCE((SELECT string_agg(id::text || updated_at::text,',' ORDER BY id) FROM catalog_categories),'') || COALESCE((SELECT string_agg(category_id::text || code || updated_at::text,',' ORDER BY category_id) FROM catalog_category_erp_codes),'') || COALESCE((SELECT string_agg(id::text || status || updated_at::text,',' ORDER BY id) FROM attribute_templates),'')) AS revision`;
        const revision = revisionRow!.revision;
        if (confirm && expectedRevision !== revision)
          throw new ConflictError(
            'El árbol o las plantillas cambiaron desde la vista previa; vuelve a validar el archivo',
          );
        const [categories, codes, templates] = await Promise.all([
          tx<
            ImportCategoryNode[]
          >`SELECT id::text,parent_id::text AS "parentId",name,path,slug,active,position FROM catalog_categories ORDER BY path FOR UPDATE`,
          tx<
            { categoryId: string; code: string }[]
          >`SELECT category_id::text AS "categoryId",code FROM catalog_category_erp_codes`,
          tx<
            { categoryId: string }[]
          >`SELECT DISTINCT category_id::text AS "categoryId" FROM attribute_templates`,
        ]);
        const plan = planCategoryTreeImport(
          rows,
          categories,
          codes,
          new Set(templates.map((row) => row.categoryId)),
          newUuid,
        );
        if (confirm) {
          for (const node of plan.added)
            await tx`INSERT INTO catalog_categories(id,parent_id,name,slug,path,position) VALUES (${node.id}::uuid,${node.parentId}::uuid,${node.name},${node.slug},${node.path},${node.position ?? 0})`;
          for (const code of plan.codes)
            await tx`INSERT INTO catalog_category_erp_codes(category_id,code) VALUES (${code.categoryId}::uuid,${code.code}) ON CONFLICT(category_id) DO UPDATE SET code=EXCLUDED.code,updated_at=now()`;
          await this.audit(
            tx,
            audit,
            'local-excel-tree',
            { codes },
            {
              added: plan.added,
              codes: plan.codes,
              accepted: plan.rows.filter((row) => !row.error).length,
              rejected: plan.rows.filter((row) => row.error).length,
            },
          );
        }
        return { revision, rows: plan.rows };
      }),
    );
  }
  async saveDynamicAttribute(
    input: SaveCategoryDynamicAttribute,
    audit: AuditMetadata,
  ): Promise<void> {
    await this.protect(() =>
      this.sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('cdr:catalog-design'))`;
        const [category] =
          await tx`SELECT id FROM catalog_categories WHERE id=${input.categoryId}::uuid AND active FOR UPDATE`;
        if (!category) throw new NotFoundError('Active catalog category', input.categoryId);
        const id = input.id ?? newUuid();
        const [before] = await tx<
          { categoryId: string; updatedAt: Date | string; dataType: string }[]
        >`SELECT dynamic.category_id::text AS "categoryId",dynamic.updated_at AS "updatedAt",definition.data_type AS "dataType",definition.key,definition.label,definition.unit,dynamic.required,dynamic.include_in_technical_sheet AS "includeInTechnicalSheet",dynamic.active FROM category_dynamic_attributes dynamic JOIN attribute_definitions definition ON definition.id=dynamic.attribute_definition_id WHERE dynamic.attribute_definition_id=${id}::uuid FOR UPDATE`;
        if (input.id && !before) throw new NotFoundError('Category dynamic attribute', input.id);
        if (
          before &&
          (before.categoryId !== input.categoryId ||
            !input.expectedUpdatedAt ||
            new Date(before.updatedAt).toISOString() !== input.expectedUpdatedAt)
        )
          throw new ConflictError('El atributo cambió; vuelve a cargarlo');
        if (before && before.dataType !== input.dataType) {
          const [filled] =
            await tx`SELECT 1 FROM product_attribute_values WHERE attribute_definition_id=${id}::uuid LIMIT 1`;
          if (filled)
            throw new ValidationError(
              'No se puede cambiar el tipo de un atributo que ya tiene valores',
            );
        }
        const [duplicate] =
          await tx`WITH RECURSIVE relatives AS (SELECT id,parent_id FROM catalog_categories WHERE id=${input.categoryId}::uuid UNION ALL SELECT category.id,category.parent_id FROM catalog_categories category JOIN relatives parent ON category.parent_id=parent.id), ancestors AS (SELECT id,parent_id FROM catalog_categories WHERE id=${input.categoryId}::uuid UNION ALL SELECT category.id,category.parent_id FROM catalog_categories category JOIN ancestors child ON child.parent_id=category.id) SELECT 1 FROM category_dynamic_attributes dynamic JOIN attribute_definitions definition ON definition.id=dynamic.attribute_definition_id WHERE dynamic.active AND definition.id<>${id}::uuid AND lower(btrim(definition.label))=lower(btrim(${input.label})) AND dynamic.category_id IN (SELECT id FROM relatives UNION SELECT id FROM ancestors) LIMIT 1`;
        if (duplicate)
          throw new ValidationError('Ya existe un atributo con ese nombre en esta rama');
        if (before)
          await tx`UPDATE attribute_definitions SET label=${input.label},data_type=${input.dataType},unit=${input.unit},active=${input.active},updated_at=${audit.occurredAt.toISOString()}::timestamptz WHERE id=${id}::uuid`;
        else
          await tx`INSERT INTO attribute_definitions(id,key,label,data_type,unit,source_authority) VALUES (${id}::uuid,${'dyn_' + id.replaceAll('-', '')},${input.label},${input.dataType},${input.unit},'pim')`;
        await tx`INSERT INTO category_dynamic_attributes(attribute_definition_id,category_id,required,include_in_technical_sheet,active,updated_at,updated_by) VALUES (${id}::uuid,${input.categoryId}::uuid,${input.required},${input.includeInTechnicalSheet},${input.active},${audit.occurredAt.toISOString()}::timestamptz,${audit.actorId}) ON CONFLICT(attribute_definition_id) DO UPDATE SET required=EXCLUDED.required,include_in_technical_sheet=EXCLUDED.include_in_technical_sheet,active=EXCLUDED.active,updated_at=GREATEST(clock_timestamp(),category_dynamic_attributes.updated_at + interval '1 millisecond'),updated_by=EXCLUDED.updated_by`;
        await tx`SELECT sync_category_dynamic_attributes()`;
        await tx`WITH RECURSIVE descendants AS (SELECT id FROM catalog_categories WHERE id=${input.categoryId}::uuid UNION ALL SELECT child.id FROM catalog_categories child JOIN descendants parent ON child.parent_id=parent.id) UPDATE attribute_templates SET updated_at=${audit.occurredAt.toISOString()}::timestamptz WHERE category_id IN (SELECT id FROM descendants)`;
        await this.audit(tx, audit, id, before ?? null, { ...input, id });
      }),
    );
  }
  async read() {
    return this.protect(async () => {
      const [erpCodes, dynamicAttributes, diagnostics] = await Promise.all([
        this
          .sql`SELECT category_id::text AS "categoryId",code FROM catalog_category_erp_codes ORDER BY code`,
        this
          .sql`WITH RECURSIVE descendants AS (SELECT attribute_definition_id,category_id AS id FROM category_dynamic_attributes UNION ALL SELECT ancestor.attribute_definition_id,child.id FROM descendants ancestor JOIN catalog_categories child ON child.parent_id=ancestor.id)
        SELECT definition.id::text,dynamic.category_id::text AS "categoryId",category.name AS "categoryName",definition.key,definition.label,definition.data_type AS "dataType",definition.unit,dynamic.required,dynamic.include_in_technical_sheet AS "includeInTechnicalSheet",dynamic.active,dynamic.updated_at AS "updatedAt",dynamic.updated_by AS "updatedBy",(SELECT COUNT(DISTINCT template.id)::int FROM descendants scope JOIN attribute_templates template ON template.category_id=scope.id AND template.status='active' WHERE scope.attribute_definition_id=definition.id) AS "templateCount",(SELECT COUNT(DISTINCT product.product_id)::int FROM descendants scope JOIN attribute_templates template ON template.category_id=scope.id AND template.status='active' JOIN product_template_assignments product ON product.template_id=template.id WHERE scope.attribute_definition_id=definition.id) AS "skuCount",(SELECT COUNT(DISTINCT value.product_id)::int FROM descendants scope JOIN attribute_templates template ON template.category_id=scope.id AND template.status='active' JOIN product_template_assignments product ON product.template_id=template.id JOIN product_attribute_values value ON value.product_id=product.product_id AND value.attribute_definition_id=definition.id AND value.deleted_at IS NULL WHERE scope.attribute_definition_id=definition.id AND (NULLIF(btrim(value.value_text),'') IS NOT NULL OR value.value_number IS NOT NULL)) AS "filledCount" FROM category_dynamic_attributes dynamic JOIN attribute_definitions definition ON definition.id=dynamic.attribute_definition_id JOIN catalog_categories category ON category.id=dynamic.category_id ORDER BY category.path,definition.label`,
        this
          .sql`WITH raw_levels AS (SELECT product.id,product.sku,assignment.template_id,template.category_id,max(value.value_text) FILTER(WHERE definition.key IN ('categoria_n1','categoriaN1')) AS n1,max(value.value_text) FILTER(WHERE definition.key IN ('categoria_n2','categoriaN2')) AS n2,max(value.value_text) FILTER(WHERE definition.key IN ('categoria_n3','categoriaN3')) AS n3 FROM products product LEFT JOIN product_template_assignments assignment ON assignment.product_id=product.id LEFT JOIN attribute_templates template ON template.id=assignment.template_id LEFT JOIN product_attribute_values value ON value.product_id=product.id AND value.deleted_at IS NULL LEFT JOIN attribute_definitions definition ON definition.id=value.attribute_definition_id GROUP BY product.id,product.sku,assignment.template_id,template.category_id), classified AS (SELECT raw.sku,coalesce(assigned.id,by_path.id) AS category_id,coalesce(assigned.path,by_path.path,nullif(concat_ws(' > ',nullif(raw.n1,''),nullif(raw.n2,''),nullif(raw.n3,'')),''),'Sin categoría') AS category,CASE WHEN raw.template_id IS NULL AND ((nullif(raw.n1,'') IS NOT NULL AND nullif(raw.n2,'') IS NULL) OR (nullif(raw.n1,'') IS NULL AND (nullif(raw.n2,'') IS NOT NULL OR nullif(raw.n3,'') IS NOT NULL))) THEN 'incomplete_levels' WHEN coalesce(assigned.id,by_path.id) IS NULL OR NOT coalesce(assigned.active,by_path.active,false) THEN 'unknown_category' WHEN EXISTS(SELECT 1 FROM catalog_categories child WHERE child.parent_id=coalesce(assigned.id,by_path.id)) THEN 'non_final_category' WHEN NOT EXISTS(SELECT 1 FROM attribute_templates active WHERE active.category_id=coalesce(assigned.id,by_path.id) AND active.status='active') THEN 'missing_template' WHEN raw.template_id IS NULL AND (SELECT COUNT(*) FROM attribute_templates active WHERE active.category_id=by_path.id AND active.status='active')>1 THEN 'ambiguous_variant' ELSE NULL END AS kind FROM raw_levels raw LEFT JOIN catalog_categories assigned ON assigned.id=raw.category_id LEFT JOIN catalog_categories by_path ON by_path.path=concat_ws(' > ',nullif(raw.n1,''),nullif(raw.n2,''),CASE WHEN raw.n3 IS DISTINCT FROM raw.n2 THEN nullif(raw.n3,'') ELSE NULL END)) SELECT kind,sku,category_id::text AS "categoryId",category,CASE kind WHEN 'incomplete_levels' THEN 'El SKU tiene niveles ERP incompletos' WHEN 'unknown_category' THEN 'La categoría no está resuelta en el árbol PIM' WHEN 'non_final_category' THEN 'El SKU está vinculado a una categoría que agrupa subcategorías' WHEN 'missing_template' THEN 'No existe una plantilla activa para la categoría' ELSE 'Selecciona una variante de plantilla para el SKU' END AS detail FROM classified WHERE kind IS NOT NULL UNION ALL SELECT 'missing_template',NULL,category.id::text,category.path,'Categoría final activa sin plantilla definida' FROM catalog_categories category WHERE category.active AND NOT EXISTS(SELECT 1 FROM catalog_categories child WHERE child.parent_id=category.id) AND NOT EXISTS(SELECT 1 FROM attribute_templates template WHERE template.category_id=category.id AND template.status='active') ORDER BY category,sku`,
      ]);
      return categoryGovernanceSchema.parse({
        erpCodes,
        diagnostics,
        dynamicAttributes: dynamicAttributes.map((row) => ({
          ...row,
          updatedAt: new Date(row.updatedAt as string).toISOString(),
        })),
      });
    });
  }
}
