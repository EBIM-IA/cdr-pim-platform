import type {
  ReportFormat,
  WorkspaceColumn,
  WorkspaceDto,
  WorkspaceQuery,
  WorkspaceRow,
} from '@cdr/contracts';
import { ValidationError } from '@cdr/shared';

import type { Sql } from '../../../database/drizzle.client';

type Cell = string | number | boolean | null;
type ProductRow = Record<string, unknown> & {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  status: string;
  category: string | null;
  category_id: string | null;
  template: string | null;
  category_names: string[] | null;
  unified_code: string | null;
  completeness: number | null;
  required_missing: number | null;
  optional_missing: number;
  current_attributes: number;
  attribute_values: Record<string, Cell>;
  applications: number;
  oem: number;
  homologs: number;
  documents: Record<string, string>;
  document_coverage: string;
  last_upload: Date | null;
  updated_at: Date;
  missing_items: string;
  eligible: boolean;
  selected_attributes: number;
  active_attributes: number;
};
type Metadata = Pick<
  WorkspaceDto,
  'reportFormats' | 'reportIndicators' | 'reportCategories' | 'reportFields'
>;
const iso = (value: unknown): string | null =>
  value == null ? null : new Date(value as string | Date).toISOString();
const numberColumn = (key: string, label: string): WorkspaceColumn => ({
  key,
  label,
  type: 'number',
});
const textColumn = (key: string, label: string): WorkspaceColumn => ({ key, label, type: 'text' });
const dateColumn = (key: string, label: string): WorkspaceColumn => ({
  key,
  label,
  type: 'datetime',
});
const presentValue = `(NULLIF(BTRIM(value.value_text), '') IS NOT NULL OR value.value_number IS NOT NULL OR value.value_boolean IS NOT NULL OR value.value_date IS NOT NULL OR (value.value_json IS NOT NULL AND value.value_json <> 'null'::jsonb))`;
const dateFilter = (column: string): string =>
  `($3::date IS NULL OR ${column} >= ($3::date::timestamp AT TIME ZONE 'UTC')) AND ($4::date IS NULL OR ${column} < (($4::date + 1)::timestamp AT TIME ZONE 'UTC'))`;
const dateNotice = {
  id: 'report-filters',
  severity: 'info' as const,
  title: 'Filtros del reporte',
  message:
    'La categoría incluye sus descendientes activos. Desde y Hasta incluyen el día completo en UTC. Las exportaciones usan las mismas filas y filtros que la consulta paginada.',
};
const noBaseline = {
  id: 'general-report-no-baseline',
  severity: 'warning' as const,
  title: 'Baseline histórico no disponible',
  message:
    'Los valores anteriores permanecen vacíos: no existe un corte histórico comparable persistido. Los conteos actuales usan relaciones activas y valores vigentes.',
};
const fields = [
  textColumn('sku', 'Código artículo'),
  textColumn('providerCode', 'Código proveedor'),
  textColumn('brand', 'Marca'),
  textColumn('name', 'Descripción'),
  textColumn('categoryN1', 'Categoría nivel 1'),
  textColumn('categoryN2', 'Categoría nivel 2'),
  textColumn('categoryN3', 'Categoría nivel 3'),
  textColumn('category', 'Categoría final'),
  textColumn('unifiedCode', 'Código unificador'),
  textColumn('applicationType', 'Tipo de aplicación'),
  { key: 'status', label: 'Estado', type: 'status' as const },
  numberColumn('completeness', 'Completitud %'),
  numberColumn('requiredMissing', 'Obligatorios faltantes'),
  dateColumn('updatedAt', 'Última actualización'),
  textColumn('template', 'Plantilla'),
  textColumn('documents', 'Documentos'),
  textColumn('publication', 'Publicación PrestaShop'),
] satisfies WorkspaceColumn[];
const productDefault = fields.filter(
  (field) => !['category', 'template', 'documents', 'publication'].includes(field.key),
);
const attributesColumns = [
  textColumn('sku', 'Código artículo'),
  textColumn('unifiedCode', 'Código Unificador'),
  textColumn('category', 'Categoría'),
  numberColumn('completeness', 'Completitud %'),
  numberColumn('requiredMissing', 'Obligatorios faltantes'),
  numberColumn('optionalMissing', 'Opcionales faltantes'),
  textColumn('field', 'Campo'),
  textColumn('before', 'Valor anterior'),
  textColumn('after', 'Valor nuevo'),
  dateColumn('previousAt', 'Fecha anterior'),
  dateColumn('changedAt', 'Fecha nueva'),
  textColumn('source', 'Origen'),
  textColumn('actor', 'Actor'),
  textColumn('reason', 'Motivo'),
];
const editedColumns = [
  dateColumn('changedAt', 'Fecha'),
  textColumn('sku', 'Código artículo'),
  textColumn('category', 'Categoría'),
  textColumn('field', 'Campo'),
  textColumn('before', 'Valor anterior'),
  textColumn('after', 'Valor nuevo'),
  dateColumn('previousAt', 'Fec. modificación anterior'),
  textColumn('source', 'Origen'),
  textColumn('actor', 'Actor'),
  textColumn('reason', 'Motivo'),
];
const generalColumns = [
  ...attributesColumns.slice(0, 6),
  numberColumn('previousApplications', 'Aplicaciones anteriores'),
  numberColumn('currentApplications', 'Aplicaciones actuales'),
  numberColumn('previousOem', 'OEM anteriores'),
  numberColumn('currentOem', 'OEM actuales'),
  numberColumn('previousHomologs', 'Homólogos anteriores'),
  numberColumn('currentHomologs', 'Homólogos actuales'),
  numberColumn('previousAttributes', 'Atributos actualizados anteriores'),
  numberColumn('currentAttributes', 'Atributos actualizados actuales'),
];
const clientPeriodYears = [2024, 2025, 2026] as const;
const periodColumns = [
  textColumn('month', 'MES'),
  ...clientPeriodYears.map((year) => numberColumn(`year_${year}`, `ITEMS ACT ${year}`)),
];
const periodMonthNames = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
] as const;
const documentsColumns = [
  textColumn('sku', 'Código artículo'),
  textColumn('name', 'Descripción'),
  textColumn('brand', 'Marca'),
  textColumn('category', 'Categoría'),
  textColumn('FOTO', 'Fotografía'),
  textColumn('PLANO', 'Plano'),
  textColumn('FT', 'Ficha técnica'),
  textColumn('MSDS', 'Ficha de seguridad'),
  textColumn('CERT', 'Certificado'),
  textColumn('documents', 'Documentos'),
  dateColumn('lastUpload', 'Última carga'),
];
const publicationColumns = [
  textColumn('sku', 'Código artículo'),
  textColumn('brand', 'Marca'),
  textColumn('category', 'Categoría'),
  { key: 'status', label: 'Estado PIM', type: 'status' as const },
  textColumn('publication', 'Publicación'),
  textColumn('reason', 'Motivo'),
  textColumn('publishedAttributes', 'Atributos seleccionados'),
  textColumn('commercialDescription', 'Descripción comercial'),
  dateColumn('updatedAt', 'Última actualización'),
];
const titles: Record<Exclude<ReportFormat, 'summary'>, string> = {
  attribute_changes: 'Reporte de atributos',
  general_results: 'Reporte general (resultados)',
  period_results: 'Resultados de periodo',
  products_by_category: 'Productos por categoría',
  edited_information: 'Información editada',
  documents_by_sku: 'Imágenes y documentos por SKU',
  publication_by_sku: 'Publicación PrestaShop por SKU',
};

/** Read-only SQL projection for the seven client report layouts. No prototype telemetry is imported. */
export class PostgresReportsReadModel {
  constructor(private readonly sql: Sql) {}

  private parameters(query: WorkspaceQuery): (string | number | null)[] {
    return [query.categoryId ?? null, query.q?.trim() ?? '', query.from ?? null, query.to ?? null];
  }

  private base(): string {
    return `WITH RECURSIVE selected_categories AS (
      SELECT id FROM catalog_categories WHERE id = $1::uuid AND active = true
      UNION
      SELECT child.id FROM catalog_categories child JOIN selected_categories parent ON child.parent_id = parent.id WHERE child.active = true
    ), mapped_changes AS (
      SELECT entry.id AS audit_id, entry.occurred_at, product.id AS product_id
      FROM audit_entries entry JOIN products product ON entry.resource_type = 'product' AND product.id::text = entry.resource_id
      UNION
      SELECT entry.id, entry.occurred_at, asset.product_id FROM audit_entries entry
      JOIN product_assets asset ON entry.resource_type = 'product_asset' AND asset.id::text = entry.resource_id
      UNION
      SELECT entry.id, entry.occurred_at, member.product_id FROM audit_entries entry
      JOIN group_applications application ON entry.resource_type = 'group_application' AND application.id::text = entry.resource_id
      JOIN equivalence_group_members member ON member.group_id = application.equivalence_group_id
      UNION
      SELECT entry.id, entry.occurred_at, member.product_id FROM audit_entries entry
      JOIN group_oem_codes oem ON entry.resource_type = 'group_oem_code' AND oem.id::text = entry.resource_id
      JOIN equivalence_group_members member ON member.group_id = oem.equivalence_group_id
      UNION
      SELECT entry.id, entry.occurred_at, member.product_id FROM audit_entries entry
      JOIN external_homologs homolog ON entry.resource_type = 'external_homolog' AND homolog.id::text = entry.resource_id
      JOIN equivalence_group_members member ON member.group_id = homolog.equivalence_group_id
    ), report_products AS (
      SELECT product.id, product.sku, product.name, product.brand, product.status,
        template.id AS template_id, template.name AS template, category.id AS category_id, category.name AS category,
        ancestry.names AS category_names, codes.code AS unified_code,
        CASE WHEN readiness.template_id IS NULL OR category.active IS NOT TRUE THEN NULL
          WHEN readiness.required = 0 THEN 100 ELSE ROUND(readiness.completed::numeric * 100 / readiness.required)::int END AS completeness,
        CASE WHEN readiness.template_id IS NULL OR category.active IS NOT TRUE THEN NULL
          ELSE GREATEST(readiness.required - readiness.completed, 0)::int END AS required_missing,
        COALESCE(optional_attributes.missing, 0)::int + COALESCE(optional_assets.missing, 0)::int AS optional_missing,
        readiness.missing_items,
        (product.status <> 'archived' AND readiness.template_id IS NOT NULL AND category.active = true AND readiness.required = readiness.completed) AS eligible,
        COALESCE(values_current.attributes, '{}'::jsonb) AS attribute_values,
        COALESCE(values_current.total, 0)::int AS current_attributes,
        publication_fields.selected AS selected_attributes, publication_fields.total AS active_attributes,
        COALESCE(relations.applications,0)::int AS applications, COALESCE(relations.oem,0)::int AS oem, COALESCE(relations.homologs,0)::int AS homologs,
        docs.states AS documents, concat(docs.present, '/', docs.applicable) AS document_coverage, docs.last_upload,
        GREATEST(product.updated_at, values_current.updated_at, docs.last_upload,
          (SELECT MAX(occurred_at) FROM mapped_changes change WHERE change.product_id = product.id)) AS updated_at
      FROM products product
      LEFT JOIN product_template_assignments product_template ON product_template.product_id = product.id
      LEFT JOIN attribute_templates template ON template.id = product_template.template_id AND template.status = 'active'
      LEFT JOIN catalog_categories category ON category.id = template.category_id
      LEFT JOIN catalog_product_readiness readiness ON readiness.product_id = product.id
      LEFT JOIN LATERAL (
        WITH RECURSIVE ancestors AS (
          SELECT id, parent_id, name, 0 AS depth FROM catalog_categories WHERE id = category.id
          UNION ALL SELECT parent.id, parent.parent_id, parent.name, child.depth + 1 FROM catalog_categories parent JOIN ancestors child ON parent.id = child.parent_id
        ) SELECT ARRAY_AGG(name ORDER BY depth DESC) AS names FROM ancestors
      ) ancestry ON true
      LEFT JOIN LATERAL (
        SELECT STRING_AGG(DISTINCT group_row.code, ', ' ORDER BY group_row.code) AS code
        FROM equivalence_group_members member JOIN equivalence_groups group_row ON group_row.id = member.group_id WHERE member.product_id = product.id
      ) codes ON true
      LEFT JOIN LATERAL (
        SELECT JSONB_OBJECT_AGG(definition.key, COALESCE(to_jsonb(value.value_text), to_jsonb(value.value_number), to_jsonb(value.value_boolean), to_jsonb(value.value_date), value.value_json)) FILTER (WHERE ${presentValue}) AS attributes,
          COUNT(*) FILTER (WHERE ${presentValue})::int AS total, MAX(value.updated_at) AS updated_at
        FROM product_attribute_values value
        JOIN template_attribute_assignments assignment ON assignment.attribute_definition_id = value.attribute_definition_id AND assignment.template_id = template.id AND assignment.active = true
        JOIN attribute_definitions definition ON definition.id = assignment.attribute_definition_id AND definition.active = true
        WHERE value.product_id = product.id AND value.deleted_at IS NULL
      ) values_current ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE assignment.publishable = true OR definition.key = 'codigo_articulo')::int AS selected, COUNT(*)::int AS total
        FROM template_attribute_assignments assignment
        JOIN attribute_definitions definition ON definition.id = assignment.attribute_definition_id AND definition.active = true
        WHERE assignment.template_id = template.id AND assignment.active = true
      ) publication_fields ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM product_attribute_values value WHERE value.product_id = product.id AND value.attribute_definition_id = assignment.attribute_definition_id AND value.deleted_at IS NULL AND ${presentValue}))::int AS missing
        FROM template_attribute_assignments assignment JOIN attribute_definitions definition ON definition.id = assignment.attribute_definition_id AND definition.active = true
        WHERE assignment.template_id = template.id AND assignment.active = true AND assignment.required = false
      ) optional_attributes ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM product_assets asset WHERE asset.product_id = product.id AND asset.type_code = requirement.type_code AND asset.deleted_at IS NULL))::int AS missing
        FROM template_asset_requirements requirement WHERE requirement.template_id = template.id AND requirement.active = true AND requirement.required = false
      ) optional_assets ON true
      LEFT JOIN LATERAL (
        SELECT (SELECT COUNT(DISTINCT application.id) FROM equivalence_group_members member JOIN group_applications application ON application.equivalence_group_id = member.group_id AND application.active = true WHERE member.product_id = product.id)::int AS applications,
          (SELECT COUNT(DISTINCT oem.id) FROM equivalence_group_members member JOIN group_oem_codes oem ON oem.equivalence_group_id = member.group_id AND oem.active = true WHERE member.product_id = product.id)::int AS oem,
          (SELECT COUNT(DISTINCT homolog.id) FROM equivalence_group_members member JOIN external_homologs homolog ON homolog.equivalence_group_id = member.group_id AND homolog.active = true WHERE member.product_id = product.id)::int AS homologs
      ) relations ON true
      LEFT JOIN LATERAL (
        SELECT JSONB_OBJECT_AGG(kind.type_code, CASE WHEN actual.total > 0 THEN 'Cargado (' || actual.total || ')' WHEN requirement.active = true THEN 'Faltante' ELSE 'No aplica' END) AS states,
          COUNT(*) FILTER (WHERE requirement.active = true)::int AS applicable,
          COUNT(*) FILTER (WHERE requirement.active = true AND actual.total > 0)::int AS present,
          MAX(actual.uploaded_at) AS last_upload
        FROM (VALUES ('FOTO'), ('PLANO'), ('FT'), ('MSDS'), ('CERT')) kind(type_code)
        LEFT JOIN template_asset_requirements requirement ON requirement.template_id = template.id AND requirement.type_code = kind.type_code
        LEFT JOIN LATERAL (SELECT COUNT(*)::int AS total, MAX(uploaded_at) AS uploaded_at FROM product_assets asset WHERE asset.product_id = product.id AND asset.type_code = kind.type_code AND asset.deleted_at IS NULL) actual ON true
      ) docs ON true
      WHERE ($1::uuid IS NULL OR category.id IN (SELECT id FROM selected_categories))
        AND ($2 = '' OR POSITION(LOWER($2) IN LOWER(CONCAT_WS(' ', product.sku, product.name, product.brand, category.name, codes.code, values_current.attributes::text))) > 0)
    ), scoped_changes AS (
      SELECT change.* FROM mapped_changes change JOIN report_products product ON product.id = change.product_id
      WHERE ${dateFilter('change.occurred_at')}
    ), attribute_changes AS (
      SELECT change.id, mapped.product_id, change.field_name, definition.label AS field,
        CASE WHEN change.before_value IS NULL OR change.before_value = 'null'::jsonb THEN NULL WHEN jsonb_typeof(change.before_value) IN ('string','number','boolean') THEN change.before_value #>> '{}' ELSE change.before_value::text END AS before,
        CASE WHEN change.after_value IS NULL OR change.after_value = 'null'::jsonb THEN NULL WHEN jsonb_typeof(change.after_value) IN ('string','number','boolean') THEN change.after_value #>> '{}' ELSE change.after_value::text END AS after,
        change.previous_value_valid_from AS previous_at, entry.occurred_at AS changed_at, entry.source, entry.actor_id AS actor
      FROM audit_change_items change JOIN audit_entries entry ON entry.id = change.audit_entry_id
      JOIN scoped_changes mapped ON mapped.audit_id = entry.id
      LEFT JOIN attribute_definitions definition ON definition.key = change.field_name
    )`;
  }

  async metadata(query: WorkspaceQuery = {}): Promise<Metadata> {
    const [countRows, categories, definitions, period] = await Promise.all([
      this.sql.unsafe<Record<string, number>[]>(
        `${this.base()} SELECT
        (SELECT COUNT(*)::int FROM report_products WHERE ${dateFilter('updated_at')}) AS products,
        (SELECT COUNT(*)::int FROM report_products WHERE ${dateFilter('last_upload')}) AS documents,
        (SELECT COUNT(*)::int FROM attribute_changes WHERE field IS NOT NULL) AS attributes,
        (SELECT COUNT(*)::int FROM attribute_changes) AS edited,
        (SELECT COUNT(DISTINCT product_id)::int FROM scoped_changes) AS updated,
        (SELECT COALESCE(ROUND(AVG(completeness)),0)::int FROM report_products) AS quality,
        (SELECT COUNT(*)::int FROM report_products WHERE eligible) AS publishable,
        (SELECT COUNT(DISTINCT member.group_id)::int FROM equivalence_group_members member JOIN report_products product ON product.id=member.product_id) AS unifiers,
        (SELECT COUNT(*)::int FROM audit_entries WHERE ${dateFilter('occurred_at')}) AS audit`,
        this.parameters(query),
      ),
      this.sql<
        { id: string; name: string; parentId: string | null; path: string }[]
      >`SELECT id::text, name, parent_id::text AS "parentId", path FROM catalog_categories WHERE active = true ORDER BY path, name, id`,
      this.definitions(),
      this.periodLayout(query),
    ]);
    const count = countRows[0]!;
    return {
      reportFormats: Object.entries(titles).map(([format, title]) => ({
        format: format as Exclude<ReportFormat, 'summary'>,
        title,
        totalRows:
          format === 'period_results'
            ? period.rows.length
            : (count[
                (
                  {
                    attribute_changes: 'attributes',
                    general_results: 'updated',
                    period_results: 'periods',
                    products_by_category: 'products',
                    edited_information: 'edited',
                    documents_by_sku: 'documents',
                    publication_by_sku: 'products',
                  } as const
                )[format as keyof typeof titles]
              ] ?? 0),
        columnCount:
          format === 'period_results'
            ? period.columns.length
            : this.columns(format as Exclude<ReportFormat, 'summary'>).length,
      })),
      reportCategories: categories,
      reportFields: [
        ...fields.map((field) => ({ id: field.key, label: field.label, type: field.type })),
        ...definitions.map((definition) => ({
          id: `attribute:${definition.key}`,
          label: definition.label,
          type: this.attributeType(definition.data_type),
        })),
      ],
      reportIndicators: [
        {
          key: 'quality',
          value: count.quality!,
          status: 'available',
          detail:
            'Completitud de requisitos obligatorios: atributos y activos de la plantilla vigente.',
        },
        {
          key: 'duplicates',
          value: null,
          status: 'unavailable',
          detail: 'No hay alertas de duplicados persistidas ni decisiones humanas registradas.',
        },
        {
          key: 'unifiers',
          value: count.unifiers!,
          status: 'available',
          detail: 'Códigos unificadores con miembros del catálogo.',
        },
        {
          key: 'publication',
          value: count.publishable!,
          status: 'available',
          detail:
            'Elegibilidad base por requisitos; no acredita publicación o sincronización en PrestaShop.',
        },
        {
          key: 'integrations',
          value: null,
          status: 'unavailable',
          detail:
            'No existe telemetría persistida de errores o reintentos de conectores productivos.',
        },
        {
          key: 'traceability',
          value: count.audit!,
          status: 'available',
          detail: 'Eventos de auditoría persistidos; no se incluyen eventos ilustrativos.',
        },
        {
          key: 'searches',
          value: null,
          status: 'unavailable',
          detail: 'No existe historial persistido de consultas o búsquedas sin resultado.',
        },
        {
          key: 'catalog',
          value: count.products!,
          status: 'available',
          detail: 'Productos reales del catálogo, incluidos los pendientes de clasificación.',
        },
      ],
    };
  }

  private async periodLayout(query: WorkspaceQuery): Promise<{
    columns: WorkspaceColumn[];
    rows: WorkspaceRow[];
    recordedMonths: number;
    occurrences: number;
  }> {
    const recorded = await this.sql.unsafe<{ year: number; month: number; products: number }[]>(
      `${this.base()}
      SELECT EXTRACT(YEAR FROM occurred_at AT TIME ZONE 'UTC')::int AS year,
        EXTRACT(MONTH FROM occurred_at AT TIME ZONE 'UTC')::int AS month,
        COUNT(DISTINCT product_id)::int AS products
      FROM scoped_changes GROUP BY 1,2 ORDER BY 1,2`,
      this.parameters(query),
    );
    const years = new Set<number>([...clientPeriodYears, ...recorded.map((row) => row.year)]);
    const fromYear = query.from ? Number(query.from.slice(0, 4)) : null;
    const toYear = query.to ? Number(query.to.slice(0, 4)) : null;
    if (fromYear !== null) years.add(fromYear);
    if (toYear !== null) years.add(toYear);
    if (fromYear !== null && toYear !== null)
      for (let year = fromYear; year <= toYear; year += 1) years.add(year);
    const orderedYears = [...years].sort((a, b) => a - b);
    const columns = [
      textColumn('month', 'MES'),
      ...orderedYears.map((year) => numberColumn(`year_${year}`, `ITEMS ACT ${year}`)),
    ];
    const values = new Map(recorded.map((row) => [`${row.year}:${row.month}`, row.products]));
    const rows: WorkspaceRow[] = periodMonthNames.map((month, index) => ({
      id: `period:month:${index + 1}`,
      values: {
        month,
        ...Object.fromEntries(
          orderedYears.map((year) => [`year_${year}`, values.get(`${year}:${index + 1}`) ?? null]),
        ),
      },
    }));
    for (const kind of ['PROMEDIO', 'TOTAL'] as const)
      rows.push({
        id: `period:${kind.toLowerCase()}`,
        values: {
          month: kind,
          ...Object.fromEntries(
            orderedYears.map((year) => {
              const observed = recorded
                .filter((row) => row.year === year)
                .map((row) => row.products);
              const total = observed.reduce((sum, value) => sum + value, 0);
              return [
                `year_${year}`,
                observed.length
                  ? kind === 'TOTAL'
                    ? total
                    : Math.round(total / observed.length)
                  : null,
              ];
            }),
          ),
        },
      });
    return {
      columns,
      rows,
      recordedMonths: recorded.length,
      occurrences: recorded.reduce((sum, row) => sum + row.products, 0),
    };
  }

  private async readPeriod(query: WorkspaceQuery): Promise<WorkspaceDto> {
    const layout = await this.periodLayout(query);
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 250;
    return {
      slug: 'reports',
      operationalStatus: 'partial',
      generatedAt: new Date().toISOString(),
      metrics: [
        { key: 'rows', label: 'Filas', value: layout.rows.length, format: 'integer' },
        {
          key: 'months-with-activity',
          label: 'Meses con auditoría',
          value: layout.recordedMonths,
          format: 'integer',
        },
        {
          key: 'monthly-product-occurrences',
          label: 'Participaciones producto/mes',
          value: layout.occurrences,
          format: 'integer',
        },
      ],
      columns: layout.columns,
      rows: layout.rows.slice((page - 1) * pageSize, page * pageSize),
      totalRows: layout.rows.length,
      notices: [
        dateNotice,
        {
          id: 'period-report-definition',
          severity: 'info',
          title: 'Resultado mensual real',
          message:
            'Formato del cliente: meses por año, promedio y total. Solo se contabilizan productos únicos con auditoría real por mes UTC. Las celdas sin historial permanecen vacías, también en los resúmenes; no equivalen a cero. Promedio y total usan únicamente meses con registro. Los cambios de unificador se asignan a sus miembros actuales.',
        },
      ],
      actions: [
        {
          id: 'refresh',
          label: 'Actualizar datos',
          availability: 'supported',
          method: 'GET',
          endpoint: '/api/v1/workspaces/reports?report=period_results',
        },
      ],
    };
  }

  private definitions() {
    return this.sql<
      { key: string; label: string; data_type: string }[]
    >`SELECT key,label,data_type FROM attribute_definitions WHERE active=true ORDER BY label,key`;
  }
  private attributeType(type: string): WorkspaceColumn['type'] {
    return ['number', 'measurement'].includes(type) ? 'number' : 'text';
  }
  private columns(format: Exclude<ReportFormat, 'summary'>): WorkspaceColumn[] {
    switch (format) {
      case 'attribute_changes':
        return attributesColumns;
      case 'general_results':
        return generalColumns;
      case 'period_results':
        return periodColumns;
      case 'products_by_category':
        return productDefault;
      case 'edited_information':
        return editedColumns;
      case 'documents_by_sku':
        return documentsColumns;
      case 'publication_by_sku':
        return publicationColumns;
    }
  }

  private productValues(row: ProductRow): Record<string, Cell> {
    return {
      sku: row.sku,
      providerCode: row.attribute_values.codigo_proveedor ?? null,
      brand: row.brand,
      name: row.name,
      categoryN1: row.category_names?.[0] ?? null,
      categoryN2: row.category_names?.[1] ?? null,
      categoryN3: row.category_names?.[2] ?? null,
      category: row.category,
      unifiedCode: row.unified_code,
      applicationType: row.attribute_values.tipo_aplicacion ?? null,
      status: row.status,
      completeness: row.completeness,
      requiredMissing: row.required_missing,
      updatedAt: iso(row.updated_at),
      template: row.template,
      documents: row.document_coverage,
      publication: null,
    };
  }

  async read(
    format: Exclude<ReportFormat, 'summary'>,
    query: WorkspaceQuery,
  ): Promise<WorkspaceDto> {
    if (format === 'period_results') return this.readPeriod(query);
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 250;
    let columns = this.columns(format);
    if (format === 'products_by_category') {
      const definitions = await this.definitions();
      const requested = query.field?.length ? [...new Set(query.field)] : null;
      if (requested) {
        const available = new Map(
          [
            ...fields,
            ...definitions.map((definition) => ({
              key: `attribute:${definition.key}`,
              label: definition.label,
              type: this.attributeType(definition.data_type),
            })),
          ].map((field) => [field.key, field]),
        );
        columns = requested.map((key) => {
          const field = available.get(key);
          if (!field) throw new ValidationError('Unknown report field', { field: key });
          return field;
        });
      } else if (query.categoryId) {
        const attributes = await this.sql<
          { key: string; label: string; data_type: string }[]
        >`SELECT DISTINCT definition.key,definition.label,definition.data_type FROM attribute_definitions definition JOIN template_attribute_assignments assignment ON assignment.attribute_definition_id=definition.id AND assignment.active=true JOIN attribute_templates template ON template.id=assignment.template_id AND template.status='active' WHERE template.category_id=${query.categoryId}::uuid AND definition.active=true AND definition.source_authority <> 'erp' ORDER BY definition.label,definition.key`;
        columns = [
          ...columns,
          ...attributes.map((definition) => ({
            key: `attribute:${definition.key}`,
            label: definition.label,
            type: this.attributeType(definition.data_type),
          })),
        ];
      }
    }
    const fromChanges = format === 'attribute_changes' || format === 'edited_information';
    let selection: string;
    if (fromChanges)
      selection = `SELECT change.*, product.*, change.id::text || ':' || product.id::text AS row_id FROM attribute_changes change JOIN report_products product ON product.id=change.product_id ${format === 'attribute_changes' ? 'WHERE change.field IS NOT NULL' : ''} ORDER BY change.changed_at DESC, change.id, product.id`;
    else
      selection = `SELECT * FROM report_products WHERE ${format === 'general_results' ? 'EXISTS (SELECT 1 FROM scoped_changes change WHERE change.product_id=report_products.id)' : dateFilter(format === 'documents_by_sku' ? 'last_upload' : 'updated_at')} ORDER BY sku,id`;
    const values = [...this.parameters(query), pageSize, (page - 1) * pageSize];
    const [rawRows, totalResult] = await Promise.all([
      this.sql.unsafe<(ProductRow & Record<string, unknown>)[]>(
        `${this.base()} ${selection} LIMIT $5 OFFSET $6`,
        values,
      ),
      this.sql.unsafe<{ total: number }[]>(
        `${this.base()} SELECT COUNT(*)::int AS total FROM (${selection}) filtered_report`,
        this.parameters(query),
      ),
    ]);
    const totalRows = totalResult[0]?.total ?? 0;
    const rows: WorkspaceRow[] = rawRows.map((row) => {
      let id = String(row.id),
        cells: Record<string, Cell>;
      if (fromChanges) {
        id = String(row.row_id);
        cells = {
          sku: row.sku,
          unifiedCode: row.unified_code,
          category: row.category,
          completeness: row.completeness,
          requiredMissing: row.required_missing,
          optionalMissing: row.optional_missing,
          field: String(row.field ?? row.field_name),
          before: row.before as string | null,
          after: row.after as string | null,
          previousAt: iso(row.previous_at),
          changedAt: iso(row.changed_at),
          source: String(row.source),
          actor: (row.actor as string | null) ?? null,
          reason: null,
        };
      } else if (format === 'general_results') {
        cells = {
          sku: row.sku,
          unifiedCode: row.unified_code,
          category: row.category,
          completeness: row.completeness,
          requiredMissing: row.required_missing,
          optionalMissing: row.optional_missing,
          previousApplications: null,
          currentApplications: row.applications,
          previousOem: null,
          currentOem: row.oem,
          previousHomologs: null,
          currentHomologs: row.homologs,
          previousAttributes: null,
          currentAttributes: row.current_attributes,
        };
      } else if (format === 'documents_by_sku') {
        cells = {
          sku: row.sku,
          name: row.name,
          brand: row.brand,
          category: row.category,
          ...row.documents,
          documents: row.document_coverage,
          lastUpload: iso(row.last_upload),
        };
      } else if (format === 'publication_by_sku') {
        cells = {
          sku: row.sku,
          brand: row.brand,
          category: row.category,
          status: row.status,
          publication: null,
          reason: !row.template
            ? 'Plantilla activa no asignada'
            : row.status === 'archived'
              ? 'Producto archivado'
              : row.required_missing
                ? row.missing_items
                : 'Elegibilidad base completa; canal no conectado',
          publishedAttributes: `${row.selected_attributes}/${row.active_attributes}`,
          commercialDescription: null,
          updatedAt: iso(row.updated_at),
        };
      } else {
        const base = this.productValues(row);
        cells = Object.fromEntries(
          columns.map((column) => {
            let value = column.key.startsWith('attribute:')
              ? (row.attribute_values[column.key.slice(10)] ?? null)
              : (base[column.key] ?? null);
            if (typeof value === 'boolean') value = String(value);
            return [column.key, value];
          }),
        );
      }
      return {
        id,
        values: Object.fromEntries(
          columns.map((column) => [column.key, cells[column.key] ?? null]),
        ),
      };
    });
    const notices: WorkspaceDto['notices'] = [dateNotice];
    if (format === 'general_results')
      notices.push(noBaseline, {
        id: 'general-report-definition',
        severity: 'info',
        title: 'Ítems actualizados',
        message:
          'Cada SKU con auditoría real dentro del periodo se cuenta una sola vez. Un cambio de aplicación, OEM u homólogo se aplica a los miembros actuales de su código unificador.',
      });
    if (format === 'attribute_changes' || format === 'edited_information')
      notices.push({
        id: 'audit-reason-unavailable',
        severity: 'warning',
        title: 'Motivo no disponible',
        message:
          'La auditoría no persiste un motivo separado; se conserva vacío. El contexto de categoría y completitud corresponde al estado vigente.',
      });
    if (format === 'publication_by_sku')
      notices.push({
        id: 'publication-channel-unavailable',
        severity: 'warning',
        title: 'PrestaShop sin conexión productiva',
        message:
          'Estado del canal y aprobación comercial permanecen vacíos porque no hay evidencia persistida. La selección cuenta atributos activos configurados en la plantilla, conserva la identidad SKU y no acredita publicación. El motivo muestra solamente los requisitos base del catálogo.',
      });
    return {
      slug: 'reports',
      operationalStatus: 'partial',
      generatedAt: new Date().toISOString(),
      metrics: [
        { key: 'rows', label: 'Filas', value: totalRows, format: 'integer' },
        ...(format === 'general_results'
          ? [
              {
                key: 'updated-products',
                label: 'Ítems actualizados',
                value: totalRows,
                format: 'integer' as const,
              },
            ]
          : []),
      ],
      columns,
      rows,
      totalRows,
      notices,
      actions: [
        {
          id: 'refresh',
          label: 'Actualizar datos',
          availability: 'supported',
          method: 'GET',
          endpoint: `/api/v1/workspaces/reports?report=${format}`,
        },
      ],
    };
  }
}
