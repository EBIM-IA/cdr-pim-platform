import { Inject, Injectable } from '@nestjs/common';
import { resolveAiCapabilityProviders, type ApiEnv } from '@cdr/config';
import type {
  WorkspaceAction,
  WorkspaceColumn,
  WorkspaceDto,
  WorkspaceMetric,
  WorkspaceNotice,
  WorkspaceOperationalStatus,
  WorkspaceRow,
  WorkspaceSlug,
} from '@cdr/contracts';

import type { Sql } from '../../../database/drizzle.client';
import { API_ENV, DATABASE_SQL } from '../../../shared/tokens';
import { type AuthenticatedActor, capabilitiesForActor } from '../../identity/domain/entities/role';
import type { WorkspaceReadModelPort } from '../domain/ports/workspace-read-model.port';

interface WorkspaceParts {
  readonly operationalStatus: WorkspaceOperationalStatus;
  readonly metrics: WorkspaceMetric[];
  readonly columns: WorkspaceColumn[];
  readonly rows: WorkspaceRow[];
  readonly totalRows?: number;
  readonly notices: WorkspaceNotice[];
  readonly actions: WorkspaceAction[];
}

interface ProductSummaryRow {
  readonly total: number;
  readonly brands: number;
  readonly draft: number;
  readonly inReview: number;
  readonly published: number;
  readonly archived: number;
  readonly updatedAt: Date | string | null;
}

interface GroupSummaryRow {
  readonly groups: number;
  readonly memberships: number;
}

const textMetric = (key: string, label: string, value: string): WorkspaceMetric => ({
  key,
  label,
  value,
  format: 'text',
});

const integerMetric = (key: string, label: string, value: number): WorkspaceMetric => ({
  key,
  label,
  value,
  format: 'integer',
});

const refreshAction = (slug: WorkspaceSlug): WorkspaceAction => ({
  id: 'refresh',
  label: 'Actualizar datos',
  availability: 'supported',
  method: 'GET',
  endpoint: `/api/v1/workspaces/${slug}`,
});

const blockedAction = (id: string, label: string, reason: string): WorkspaceAction => ({
  id,
  label,
  availability: 'blocked',
  reason,
});

const warning = (id: string, title: string, message: string): WorkspaceNotice => ({
  id,
  severity: 'warning',
  title,
  message,
});

const info = (id: string, title: string, message: string): WorkspaceNotice => ({
  id,
  severity: 'info',
  title,
  message,
});

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

/**
 * PostgreSQL-backed query model for the eleven non-product screens.
 *
 * It intentionally reads the physical reporting surface instead of importing another
 * context's repository. This is the query side of CQRS: no write is possible here, and
 * every unavailable capability is returned as blocked rather than simulated.
 */
@Injectable()
export class PostgresWorkspaceReadModel implements WorkspaceReadModelPort {
  constructor(
    @Inject(DATABASE_SQL) private readonly sql: Sql,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  read(slug: WorkspaceSlug, actor: AuthenticatedActor): Promise<WorkspaceDto> {
    switch (slug) {
      case 'categories':
        return this.readCategories();
      case 'templates':
        return this.readTemplates();
      case 'applications':
        return this.readApplications();
      case 'equivalences':
        return this.readEquivalences();
      case 'documents':
        return this.readDocuments();
      case 'imports':
        return this.readImports();
      case 'quality':
        return this.readQuality();
      case 'publication':
        return this.readPublication();
      case 'integrations':
        return this.readIntegrations();
      case 'reports':
        return this.readReports();
      case 'administration':
        return Promise.resolve(this.readAdministration(actor));
    }
  }

  private response(slug: WorkspaceSlug, parts: WorkspaceParts): WorkspaceDto {
    return {
      slug,
      operationalStatus: parts.operationalStatus,
      generatedAt: new Date().toISOString(),
      metrics: parts.metrics,
      columns: parts.columns,
      rows: parts.rows,
      totalRows: parts.totalRows ?? parts.rows.length,
      notices: parts.notices,
      actions: parts.actions,
    };
  }

  private async productSummary(): Promise<ProductSummaryRow> {
    const [row] = await this.sql<ProductSummaryRow[]>`
      SELECT
        COUNT(*)::int AS "total",
        COUNT(DISTINCT NULLIF(BTRIM(brand), ''))::int AS "brands",
        COUNT(*) FILTER (WHERE status = 'draft')::int AS "draft",
        COUNT(*) FILTER (WHERE status = 'in_review')::int AS "inReview",
        COUNT(*) FILTER (WHERE status = 'published')::int AS "published",
        COUNT(*) FILTER (WHERE status = 'archived')::int AS "archived",
        MAX(updated_at) AS "updatedAt"
      FROM products
    `;

    return (
      row ?? {
        total: 0,
        brands: 0,
        draft: 0,
        inReview: 0,
        published: 0,
        archived: 0,
        updatedAt: null,
      }
    );
  }

  private async groupSummary(): Promise<GroupSummaryRow> {
    const [row] = await this.sql<GroupSummaryRow[]>`
      SELECT
        (SELECT COUNT(*)::int FROM equivalence_groups) AS "groups",
        (SELECT COUNT(*)::int FROM equivalence_group_members) AS "memberships"
    `;
    return row ?? { groups: 0, memberships: 0 };
  }

  private async relationExists(tableName: string): Promise<boolean> {
    const qualifiedName = `public.${tableName}`;
    const [row] = await this.sql<{ exists: boolean }[]>`
      SELECT to_regclass(${qualifiedName}) IS NOT NULL AS "exists"
    `;
    return row?.exists === true;
  }

  private async readCategories(): Promise<WorkspaceDto> {
    const [summary, brands, statuses, categories] = await Promise.all([
      this.productSummary(),
      this.sql<{ brand: string | null; products: number }[]>`
        SELECT NULLIF(BTRIM(brand), '') AS "brand", COUNT(*)::int AS "products"
        FROM products
        GROUP BY NULLIF(BTRIM(brand), '')
        ORDER BY COUNT(*) DESC, NULLIF(BTRIM(brand), '') NULLS LAST
        LIMIT 50
      `,
      this.sql<{ status: string; products: number }[]>`
        SELECT status, COUNT(*)::int AS "products"
        FROM products
        GROUP BY status
        ORDER BY status
      `,
      this.sql<{ category: string; products: number }[]>`
        SELECT category.name AS "category", COUNT(DISTINCT product.id)::int AS "products"
        FROM catalog_categories category
        INNER JOIN attribute_templates template
          ON template.category_id = category.id
         AND template.status = 'active'
        INNER JOIN product_template_assignments assignment
          ON assignment.template_id = template.id
        INNER JOIN products product ON product.id = assignment.product_id
        WHERE category.active = true
        GROUP BY category.id, category.name
        ORDER BY COUNT(DISTINCT product.id) DESC, category.name
        LIMIT 100
      `,
    ]);

    const rows: WorkspaceRow[] = [
      ...statuses.map((row) => ({
        id: `status:${row.status}`,
        values: { dimension: 'Estado', value: row.status, products: row.products },
      })),
      ...brands.map((row, index) => ({
        id: `brand:${row.brand ?? 'missing'}:${index}`,
        values: {
          dimension: 'Marca',
          value: row.brand ?? 'Sin marca',
          products: row.products,
        },
      })),
      ...categories.map((row, index) => ({
        id: `category:${index}:${row.category}`,
        values: {
          dimension: 'Categoría',
          value: row.category,
          products: row.products,
        },
      })),
    ];

    return this.response('categories', {
      operationalStatus: 'operational',
      metrics: [
        integerMetric('products', 'Productos persistidos', summary.total),
        integerMetric('brands', 'Marcas informadas', summary.brands),
        integerMetric('dimensions', 'Dimensiones disponibles', 3),
      ],
      columns: [
        { key: 'dimension', label: 'Dimensión', type: 'text' },
        { key: 'value', label: 'Valor persistido', type: 'text' },
        { key: 'products', label: 'Productos', type: 'number' },
      ],
      rows,
      notices: [
        info(
          'taxonomy-live',
          'Taxonomía y agregados persistidos',
          'Las categorías cuentan todos los SKU asignados a una plantilla activa; las marcas y estados se agregan sobre el catálogo completo.',
        ),
      ],
      actions: [
        refreshAction('categories'),
        {
          id: 'browse-products',
          label: 'Consultar productos',
          availability: 'supported',
          method: 'GET',
          endpoint: '/api/v1/products',
        },
        blockedAction(
          'manage-taxonomy',
          'Gestionar taxonomía',
          'La taxonomía está persistida, pero aún falta el flujo aprobado para crear, mover y versionar categorías.',
        ),
      ],
    });
  }

  private async readTemplates(): Promise<WorkspaceDto> {
    const [templates, summary] = await Promise.all([
      this.sql<
        {
          id: string;
          category: string;
          template: string;
          version: number;
          status: string;
          attributes: number;
          replicable: number;
        }[]
      >`
        SELECT
          t.id,
          c.name AS category,
          t.name AS template,
          t.version,
          t.status,
          COUNT(taa.attribute_definition_id)::int AS attributes,
          COUNT(taa.attribute_definition_id) FILTER (
            WHERE taa.active = true AND taa.replicable = true
          )::int AS replicable
        FROM attribute_templates t
        JOIN catalog_categories c ON c.id = t.category_id
        LEFT JOIN template_attribute_assignments taa ON taa.template_id = t.id
        GROUP BY t.id, c.name, t.name, t.version, t.status
        ORDER BY c.name, t.version DESC
        LIMIT 100
      `,
      this.sql<
        {
          templates: number;
          active: number;
          attributes: number;
          required: number;
          replicable: number;
        }[]
      >`
        SELECT
          (SELECT COUNT(*)::int FROM attribute_templates) AS templates,
          (SELECT COUNT(*)::int FROM attribute_templates WHERE status = 'active') AS active,
          (SELECT COUNT(*)::int FROM template_attribute_assignments WHERE active = true) AS attributes,
          (SELECT COUNT(*)::int FROM template_attribute_assignments
            WHERE active = true AND required = true) AS required,
          (SELECT COUNT(*)::int FROM template_attribute_assignments
            WHERE active = true AND replicable = true) AS replicable
      `,
    ]);
    const counts = summary[0] ?? {
      templates: 0,
      active: 0,
      attributes: 0,
      required: 0,
      replicable: 0,
    };
    return this.response('templates', {
      operationalStatus: 'operational',
      metrics: [
        integerMetric('templates', 'Versiones persistidas', counts.templates),
        integerMetric('active', 'Plantillas activas', counts.active),
        integerMetric('attributes', 'Atributos activos', counts.attributes),
        integerMetric('required', 'Atributos obligatorios', counts.required),
        integerMetric('replicable', 'Atributos replicables', counts.replicable),
      ],
      columns: [
        { key: 'category', label: 'Categoría', type: 'text' },
        { key: 'template', label: 'Plantilla', type: 'text' },
        { key: 'version', label: 'Versión', type: 'number' },
        { key: 'status', label: 'Estado', type: 'status' },
        { key: 'attributes', label: 'Atributos', type: 'number' },
        { key: 'replicable', label: 'Replicables', type: 'number' },
      ],
      rows: templates.map((row) => ({
        id: row.id,
        values: {
          category: row.category,
          template: row.template,
          version: row.version,
          status: row.status,
          attributes: row.attributes,
          replicable: row.replicable,
        },
      })),
      totalRows: counts.templates,
      notices: [
        info(
          'templates-live',
          'Plantillas y atributos persistidos',
          'La proyección cuenta versiones, asignaciones activas y atributos replicables directamente en PostgreSQL.',
        ),
      ],
      actions: [
        refreshAction('templates'),
        {
          id: 'browse-templates',
          label: 'Consultar plantillas',
          availability: 'supported',
          method: 'GET',
          endpoint: '/api/v1/catalog/admin/templates',
        },
        blockedAction(
          'create-template',
          'Crear plantilla',
          'Faltan versionado, compatibilidad y reglas de aprobación.',
        ),
      ],
    });
  }

  private async readApplications(): Promise<WorkspaceDto> {
    const [groups, applications, counts] = await Promise.all([
      this.groupSummary(),
      this.sql<
        {
          id: string;
          unifiedCode: string;
          vehicleType: string | null;
          make: string | null;
          model: string | null;
          years: string;
          active: boolean;
          source: string;
        }[]
      >`
        SELECT
          ga.id,
          eg.code AS "unifiedCode",
          ga.vehicle_type AS "vehicleType",
          ga.make,
          ga.model,
          CASE
            WHEN ga.year_from IS NULL AND ga.year_to IS NULL THEN '—'
            WHEN ga.year_from = ga.year_to OR ga.year_to IS NULL THEN ga.year_from::text
            ELSE concat(ga.year_from, '–', ga.year_to)
          END AS years,
          ga.active,
          ga.source
        FROM group_applications ga
        JOIN equivalence_groups eg ON eg.id = ga.equivalence_group_id
        ORDER BY ga.updated_at DESC, eg.code
        LIMIT 100
      `,
      this.sql<{ total: number; active: number }[]>`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE active = true)::int AS active
        FROM group_applications
      `,
    ]);
    const summary = counts[0] ?? { total: 0, active: 0 };

    return this.response('applications', {
      operationalStatus: 'operational',
      metrics: [
        integerMetric('unifier-groups', 'Grupos unificadores disponibles', groups.groups),
        integerMetric('applications', 'Aplicaciones registradas', summary.total),
        integerMetric('active', 'Aplicaciones activas', summary.active),
        integerMetric('shown', 'Filas mostradas', applications.length),
      ],
      columns: [
        { key: 'unifiedCode', label: 'Código unificador', type: 'text' },
        { key: 'vehicleType', label: 'Tipo', type: 'text' },
        { key: 'make', label: 'Marca / industria', type: 'text' },
        { key: 'model', label: 'Modelo / equipo', type: 'text' },
        { key: 'years', label: 'Años / uso', type: 'text' },
        { key: 'status', label: 'Estado', type: 'status' },
        { key: 'source', label: 'Fuente', type: 'text' },
      ],
      rows: applications.map((row) => ({
        id: row.id,
        values: {
          unifiedCode: row.unifiedCode,
          vehicleType: row.vehicleType ?? 'Sin tipo',
          make: row.make ?? 'Sin marca',
          model: row.model ?? 'Sin modelo',
          years: row.years,
          status: row.active ? 'Activo' : 'Inactivo',
          source: row.source,
        },
      })),
      totalRows: summary.total,
      notices: [
        info(
          'applications-by-unifier',
          'Aplicaciones compartidas por código unificador',
          'Cada relación se resuelve desde el grupo y es heredada por sus SKU miembros, de acuerdo con la regla confirmada.',
        ),
      ],
      actions: [
        refreshAction('applications'),
        {
          id: 'manage-applications',
          label: 'Consultar aplicaciones',
          availability: 'supported',
          method: 'GET',
          endpoint: '/api/v1/applications',
        },
      ],
    });
  }

  private async readEquivalences(): Promise<WorkspaceDto> {
    const [summary, groups, homologs] = await Promise.all([
      this.groupSummary(),
      this.sql<
        {
          id: string;
          code: string;
          name: string;
          kind: string;
          members: number;
          skus: string;
        }[]
      >`
        SELECT
          eg.id,
          eg.code,
          eg.name,
          eg.kind,
          COUNT(egm.product_id)::int AS "members",
          COALESCE(STRING_AGG(p.sku, ', ' ORDER BY p.sku), '') AS "skus"
        FROM equivalence_groups eg
        LEFT JOIN equivalence_group_members egm ON egm.group_id = eg.id
        LEFT JOIN products p ON p.id = egm.product_id
        GROUP BY eg.id, eg.code, eg.name, eg.kind
        ORDER BY eg.code
        LIMIT 100
      `,
      this.sql<{ total: number; eligible: number; pending: number }[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE active = true AND approval_status = 'approved')::int AS eligible,
          COUNT(*) FILTER (WHERE approval_status = 'pending')::int AS pending
        FROM external_homologs
      `,
    ]);
    const homologSummary = homologs[0] ?? { total: 0, eligible: 0, pending: 0 };

    return this.response('equivalences', {
      operationalStatus: 'partial',
      metrics: [
        integerMetric('groups', 'Grupos persistidos', summary.groups),
        integerMetric('memberships', 'Membresías persistidas', summary.memberships),
        integerMetric('homologs', 'Homólogos externos', homologSummary.total),
        integerMetric('eligible-homologs', 'Activos y aprobados', homologSummary.eligible),
      ],
      columns: [
        { key: 'code', label: 'Código unificador', type: 'text' },
        { key: 'name', label: 'Nombre', type: 'text' },
        { key: 'kind', label: 'Tipo', type: 'status' },
        { key: 'members', label: 'Miembros', type: 'number' },
        { key: 'skus', label: 'SKU', type: 'text' },
      ],
      rows: groups.map((row) => ({
        id: row.id,
        values: {
          code: row.code,
          name: row.name,
          kind: row.kind,
          members: row.members,
          skus: row.skus,
        },
      })),
      totalRows: summary.groups,
      notices: [
        info(
          'read-only-groups',
          'Lectura real de grupos y miembros',
          'La proyección consulta PostgreSQL y limita la tabla a los primeros 100 grupos ordenados por código.',
        ),
        info(
          'homologs-live',
          'Homólogos externos persistidos',
          `${homologSummary.eligible} relaciones activas y aprobadas participan en la búsqueda; ${homologSummary.pending} esperan aprobación.`,
        ),
      ],
      actions: [
        refreshAction('equivalences'),
        {
          id: 'manage-homologs',
          label: 'Consultar homólogos',
          availability: 'supported',
          method: 'GET',
          endpoint: '/api/v1/equivalences',
        },
      ],
    });
  }

  private async readDocuments(): Promise<WorkspaceDto> {
    const persisted = await this.relationExists('product_assets');
    const storage =
      this.env.STORAGE_DRIVER === 's3' ? 'S3 configurado' : 'Memoria local no durable';

    if (!persisted) {
      return this.response('documents', {
        operationalStatus: 'blocked',
        metrics: [
          textMetric('persistence', 'Persistencia de metadatos', 'No disponible'),
          textMetric('storage', 'Almacenamiento', storage),
          integerMetric('assets', 'Activos registrados', 0),
        ],
        columns: [
          { key: 'sku', label: 'SKU', type: 'text' },
          { key: 'asset', label: 'Activo', type: 'text' },
          { key: 'type', label: 'Tipo', type: 'text' },
          { key: 'size', label: 'Bytes', type: 'number' },
          { key: 'uploadedAt', label: 'Cargado', type: 'datetime' },
        ],
        rows: [],
        notices: [
          warning(
            'assets-not-persisted',
            'No hay metadatos de activos disponibles',
            'La migración product_assets aún no fue aplicada en esta base de datos.',
          ),
        ],
        actions: [refreshAction('documents')],
      });
    }

    const [summary, assets] = await Promise.all([
      this.sql<{ total: number; bytes: number }[]>`
        SELECT
          COUNT(*)::int AS "total",
          COALESCE(SUM(size_bytes), 0)::float8 AS "bytes"
        FROM product_assets
        WHERE deleted_at IS NULL
      `,
      this.sql<
        {
          id: string;
          sku: string;
          asset: string;
          type: string;
          size: number;
          uploadedAt: Date | string;
        }[]
      >`
        SELECT
          asset.id::text AS "id",
          product.sku AS "sku",
          asset.original_filename AS "asset",
          asset.type_code AS "type",
          asset.size_bytes::float8 AS "size",
          asset.uploaded_at AS "uploadedAt"
        FROM product_assets asset
        INNER JOIN products product ON product.id = asset.product_id
        WHERE asset.deleted_at IS NULL
        ORDER BY asset.uploaded_at DESC, asset.id DESC
        LIMIT 50
      `,
    ]);
    const totals = summary[0] ?? { total: 0, bytes: 0 };

    return this.response('documents', {
      operationalStatus: 'partial',
      metrics: [
        textMetric('persistence', 'Persistencia de metadatos', 'Operativa'),
        textMetric('storage', 'Almacenamiento', storage),
        integerMetric('assets', 'Activos registrados', totals.total),
        integerMetric('bytes', 'Bytes almacenados', Math.round(totals.bytes)),
      ],
      columns: [
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'asset', label: 'Activo', type: 'text' },
        { key: 'type', label: 'Tipo', type: 'text' },
        { key: 'size', label: 'Bytes', type: 'number' },
        { key: 'uploadedAt', label: 'Cargado', type: 'datetime' },
      ],
      rows: assets.map((asset) => ({
        id: asset.id,
        values: {
          sku: asset.sku,
          asset: asset.asset,
          type: asset.type,
          size: asset.size,
          uploadedAt: toIsoString(asset.uploadedAt),
        },
      })),
      totalRows: totals.total,
      notices: [
        ...(this.env.STORAGE_DRIVER === 'memory'
          ? [
              warning(
                'storage-ephemeral',
                'Almacenamiento solo local',
                'El adaptador en memoria no conserva archivos después de reiniciar el proceso.',
              ),
            ]
          : []),
        warning(
          'antimalware-external',
          'Escaneo antimalware pendiente de plataforma',
          'La API valida firma, MIME, extensión, tamaño, nombre y ZIP seguro; aún no existe un servicio antimalware configurado.',
        ),
      ],
      actions: [
        refreshAction('documents'),
        {
          id: 'upload-asset',
          label: 'Cargar activo',
          availability: 'supported',
          method: 'POST',
          endpoint: '/api/v1/assets',
        },
      ],
    });
  }

  private async readImports(): Promise<WorkspaceDto> {
    const storageState =
      this.env.STORAGE_DRIVER === 's3' ? 'S3 configurado' : 'Memoria local no durable';
    const [batches, counts] = await Promise.all([
      this.sql<
        {
          id: string;
          target: string;
          format: string;
          status: string;
          totalRows: number;
          validRows: number;
          invalidRows: number;
          createdBy: string;
          createdAt: Date | string;
        }[]
      >`
        SELECT
          id, target, format, status,
          total_rows AS "totalRows",
          valid_rows AS "validRows",
          invalid_rows AS "invalidRows",
          created_by AS "createdBy",
          created_at AS "createdAt"
        FROM import_batches
        ORDER BY created_at DESC
        LIMIT 100
      `,
      this.sql<{ batches: number; confirmed: number; invalidRows: number }[]>`
        SELECT
          COUNT(*)::int AS batches,
          COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
          COALESCE(SUM(invalid_rows), 0)::int AS "invalidRows"
        FROM import_batches
      `,
    ]);
    const summary = counts[0] ?? { batches: 0, confirmed: 0, invalidRows: 0 };

    return this.response('imports', {
      operationalStatus: 'operational',
      metrics: [
        integerMetric('batches', 'Lotes persistidos', summary.batches),
        integerMetric('confirmed', 'Lotes confirmados', summary.confirmed),
        integerMetric('invalid-rows', 'Filas con error', summary.invalidRows),
        textMetric('execution', 'Ejecución', 'Confirmación transaccional por fila'),
      ],
      columns: [
        { key: 'target', label: 'Destino', type: 'text' },
        { key: 'format', label: 'Formato', type: 'text' },
        { key: 'totalRows', label: 'Registros', type: 'number' },
        { key: 'validRows', label: 'Válidos', type: 'number' },
        { key: 'invalidRows', label: 'Con error', type: 'number' },
        { key: 'status', label: 'Estado', type: 'status' },
        { key: 'createdBy', label: 'Actor', type: 'text' },
        { key: 'createdAt', label: 'Creado', type: 'datetime' },
      ],
      rows: batches.map((row) => ({
        id: row.id,
        values: {
          target: row.target,
          format: row.format,
          totalRows: row.totalRows,
          validRows: row.validRows,
          invalidRows: row.invalidRows,
          status: row.status,
          createdBy: row.createdBy,
          createdAt: toIsoString(row.createdAt),
        },
      })),
      totalRows: summary.batches,
      notices: [
        info(
          'import-preview-live',
          'Vista previa y confirmación persistidas',
          `Los lotes y sus resultados por fila se almacenan en PostgreSQL. Almacenamiento temporal: ${storageState}.`,
        ),
        info(
          'batch-application-live',
          'Aplicación controlada disponible',
          'La confirmación reclama el lote una sola vez y aplica cada fila válida junto con su auditoría dentro de la misma transacción.',
        ),
      ],
      actions: [
        refreshAction('imports'),
        {
          id: 'preview-batch',
          label: 'Validar importación',
          availability: 'supported',
          method: 'POST',
          endpoint: '/api/v1/imports/preview',
        },
        {
          id: 'apply-batch',
          label: 'Aplicar lote validado',
          availability: 'supported',
          method: 'POST',
          endpoint: '/api/v1/imports/:id/confirm',
        },
      ],
    });
  }

  private async readQuality(): Promise<WorkspaceDto> {
    const [summary, findings] = await Promise.all([
      this.sql<{ affected: number; findings: number; completion: number }[]>`
        WITH readiness AS (
          SELECT
            product_id AS id,
            template_id,
            required,
            completed
          FROM catalog_product_readiness
        )
        SELECT
          COUNT(*) FILTER (
            WHERE template_id IS NULL OR completed < required
          )::int AS affected,
          COALESCE(SUM(
            CASE WHEN template_id IS NULL THEN 1 ELSE GREATEST(required - completed, 0) END
          ), 0)::int AS findings,
          COALESCE(ROUND(AVG(
            CASE
              WHEN template_id IS NULL THEN 0
              WHEN required = 0 THEN 100
              ELSE completed::numeric * 100 / required
            END
          )), 0)::int AS completion
        FROM readiness
      `,
      this.sql<
        {
          id: string;
          sku: string;
          name: string;
          required: number;
          completed: number;
          missingItems: string;
          hasTemplate: boolean;
          updatedAt: Date | string;
        }[]
      >`
        WITH readiness AS (
          SELECT
            product.id,
            product.sku,
            product.name,
            product.updated_at AS "updatedAt",
            readiness.template_id IS NOT NULL AS "hasTemplate",
            readiness.required,
            readiness.completed,
            readiness.missing_items AS "missingItems"
          FROM products product
          INNER JOIN catalog_product_readiness readiness
            ON readiness.product_id = product.id
        )
        SELECT * FROM readiness
        WHERE "hasTemplate" = false OR completed < required
        ORDER BY "updatedAt" DESC, sku
        LIMIT 100
      `,
    ]);
    const counts = summary[0] ?? { affected: 0, findings: 0, completion: 0 };

    const rows: WorkspaceRow[] = findings.map((row) => ({
      id: row.id,
      values: {
        sku: row.sku,
        name: row.name,
        completion:
          row.hasTemplate && row.required > 0
            ? `${Math.round((row.completed * 100) / row.required)}%`
            : row.hasTemplate
              ? '100%'
              : 'Sin plantilla',
        findings: row.hasTemplate ? row.missingItems : 'Plantilla activa no asignada',
        updatedAt: toIsoString(row.updatedAt),
      },
    }));

    return this.response('quality', {
      operationalStatus: 'operational',
      metrics: [
        integerMetric('affected-products', 'Productos con hallazgos', counts.affected),
        integerMetric('findings', 'Obligatorios faltantes', counts.findings),
        integerMetric('completion', 'Completitud media (%)', counts.completion),
        integerMetric('shown', 'Filas mostradas', rows.length),
      ],
      columns: [
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'name', label: 'Producto', type: 'text' },
        { key: 'completion', label: 'Completitud', type: 'text' },
        { key: 'findings', label: 'Hallazgos', type: 'status' },
        { key: 'updatedAt', label: 'Actualizado', type: 'datetime' },
      ],
      rows,
      totalRows: counts.affected,
      notices: [
        info(
          'deterministic-checks',
          'Completitud calculada desde la plantilla activa',
          'Cuentan los atributos y activos obligatorios de la plantilla. Un valor vacío, un archivo no subido o un activo eliminado permanecen como faltantes; no interviene un proveedor de IA.',
        ),
        info(
          'ai-candidates-human-review',
          'Generación asistida disponible sin escritura automática',
          'La API puede generar propuestas comerciales y extraer candidatos desde un activo existente. Ambos resultados son temporales, no modifican el catálogo y requieren revisión humana.',
        ),
      ],
      actions: [
        refreshAction('quality'),
        {
          id: 'generate-commercial-proposal',
          label: 'Generar propuesta comercial',
          availability: 'supported',
          method: 'POST',
          endpoint: '/api/v1/ai/products/:productId/commercial-proposal',
        },
        {
          id: 'extract-asset-candidates',
          label: 'Extraer candidatos del activo',
          availability: 'supported',
          method: 'POST',
          endpoint: '/api/v1/ai/assets/:assetId/extraction-candidates',
        },
        blockedAction(
          'persist-ai-candidate',
          'Aprobar y persistir candidato',
          'La persistencia y aprobación auditada de candidatos todavía no está implementada; generar o extraer nunca sobrescribe el catálogo.',
        ),
      ],
    });
  }

  private async readPublication(): Promise<WorkspaceDto> {
    const [summary, eligibility, candidates] = await Promise.all([
      this.productSummary(),
      this.sql<{ publishable: number; total: number }[]>`
        WITH readiness AS (
          SELECT
            product.id,
            product.status,
            readiness.template_id,
            readiness.required,
            readiness.completed
          FROM products product
          INNER JOIN catalog_product_readiness readiness
            ON readiness.product_id = product.id
        )
        SELECT
          COUNT(*) FILTER (
            WHERE status <> 'archived' AND template_id IS NOT NULL AND completed = required
          )::int AS publishable,
          COUNT(*) FILTER (WHERE status <> 'archived')::int AS total
        FROM readiness
      `,
      this.sql<
        {
          id: string;
          sku: string;
          name: string;
          brand: string | null;
          status: string;
          required: number;
          completed: number;
          missingItems: string;
          hasTemplate: boolean;
          updatedAt: Date | string;
        }[]
      >`
        WITH readiness AS (
          SELECT
            product.id,
            product.sku,
            product.name,
            product.brand,
            product.status,
            product.updated_at AS "updatedAt",
            readiness.template_id IS NOT NULL AS "hasTemplate",
            readiness.required,
            readiness.completed,
            readiness.missing_items AS "missingItems"
          FROM products product
          INNER JOIN catalog_product_readiness readiness
            ON readiness.product_id = product.id
        )
        SELECT * FROM readiness
        WHERE status <> 'archived'
        ORDER BY ("hasTemplate" AND completed = required) DESC, "updatedAt" DESC, sku
        LIMIT 100
      `,
    ]);

    const eligibilityCounts = eligibility[0] ?? { publishable: 0, total: 0 };

    return this.response('publication', {
      operationalStatus: 'operational',
      metrics: [
        integerMetric('publishable', 'Elegibilidad base', eligibilityCounts.publishable),
        integerMetric('in-review', 'En revisión', summary.inReview),
        integerMetric('published', 'Publicados', summary.published),
        integerMetric('draft', 'Borradores', summary.draft),
      ],
      columns: [
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'name', label: 'Producto', type: 'text' },
        { key: 'brand', label: 'Marca', type: 'text' },
        { key: 'eligibility', label: 'Elegibilidad base', type: 'status' },
        { key: 'missing', label: 'Obligatorios faltantes', type: 'text' },
        { key: 'status', label: 'Estado PIM', type: 'status' },
        { key: 'updatedAt', label: 'Actualizado', type: 'datetime' },
      ],
      rows: candidates.map((row) => ({
        id: row.id,
        values: {
          sku: row.sku,
          name: row.name,
          brand: row.brand,
          eligibility:
            row.hasTemplate && row.completed === row.required ? 'Publicable' : 'No publicable',
          missing: row.hasTemplate ? row.missingItems || '—' : 'Plantilla activa no asignada',
          status: row.status,
          updatedAt: toIsoString(row.updatedAt),
        },
      })),
      totalRows: eligibilityCounts.total,
      notices: [
        info(
          'base-eligibility',
          'Elegibilidad base calculada automáticamente',
          'Un SKU con plantilla activa es elegible cuando todos sus atributos obligatorios tienen valor y todos sus activos requeridos están subidos. La política de excepción y las condiciones específicas del canal siguen pendientes.',
        ),
      ],
      actions: [
        refreshAction('publication'),
        blockedAction(
          'publish',
          'Publicar en canal',
          'No existe una regla de elegibilidad aprobada ni un adaptador de canal operativo.',
        ),
      ],
    });
  }

  private async readIntegrations(): Promise<WorkspaceDto> {
    // The query proves the configured PostgreSQL connection is live for this projection.
    await this.sql`SELECT 1`;
    const aiProviders = resolveAiCapabilityProviders(this.env);
    const rows: WorkspaceRow[] = [
      {
        id: 'postgresql',
        values: { system: 'PostgreSQL', configured: true, state: 'Conectado para lectura' },
      },
      {
        id: 'queue',
        values: {
          system: 'Cola de trabajos',
          configured: true,
          state: this.env.QUEUE_DRIVER === 'sqs' ? 'SQS configurado' : 'Memoria local no durable',
        },
      },
      {
        id: 'storage',
        values: {
          system: 'Almacenamiento de objetos',
          configured: true,
          state: this.env.STORAGE_DRIVER === 's3' ? 'S3 configurado' : 'Memoria local no durable',
        },
      },
      {
        id: 'ai',
        values: {
          system: 'Proveedor de IA',
          configured: true,
          state: `Embeddings: ${aiProviders.embeddings}; generación: ${aiProviders.generation}; documentos: ${aiProviders.documentExtraction}`,
        },
      },
      {
        id: 'ax',
        values: {
          system: 'Dynamics AX',
          configured: false,
          state: 'Adaptador real no implementado',
        },
      },
      {
        id: 'prestashop',
        values: { system: 'PrestaShop', configured: false, state: 'Adaptador no implementado' },
      },
      {
        id: 'orders',
        values: {
          system: 'Canal de pedidos',
          configured: false,
          state: 'Sistema destino no definido',
        },
      },
    ];
    const configured = rows.filter((row) => row.values.configured === true).length;

    return this.response('integrations', {
      operationalStatus: 'partial',
      metrics: [
        integerMetric('configured-components', 'Componentes configurados', configured),
        integerMetric('blocked-external-systems', 'Sistemas externos bloqueados', 3),
        textMetric('environment', 'Entorno', this.env.APP_ENV),
      ],
      columns: [
        { key: 'system', label: 'Sistema', type: 'text' },
        { key: 'configured', label: 'Configurado', type: 'status' },
        { key: 'state', label: 'Estado real', type: 'status' },
      ],
      rows,
      notices: [
        info(
          'no-connectivity-test',
          'No se invocaron adaptadores externos',
          'La vista revela solo capacidades y configuración validada, nunca secretos. Los stubs de AX, PrestaShop y pedidos no se ejecutan.',
        ),
      ],
      actions: [
        refreshAction('integrations'),
        blockedAction(
          'sync-ax',
          'Sincronizar AX',
          'Faltan superficie de integración, mapeo, autenticación y conectividad VPN.',
        ),
        blockedAction(
          'publish-prestashop',
          'Probar PrestaShop',
          'Faltan versión, API habilitada, credenciales y mapeo.',
        ),
      ],
    });
  }

  private async readReports(): Promise<WorkspaceDto> {
    const [products, groups, brands, categories, dashboard] = await Promise.all([
      this.productSummary(),
      this.groupSummary(),
      this.sql<{ brand: string | null; products: number }[]>`
        SELECT NULLIF(BTRIM(brand), '') AS "brand", COUNT(*)::int AS "products"
        FROM products
        GROUP BY NULLIF(BTRIM(brand), '')
        ORDER BY COUNT(*) DESC, NULLIF(BTRIM(brand), '') NULLS LAST
        LIMIT 20
      `,
      this.sql<{ category: string; products: number }[]>`
        SELECT category.name AS "category", COUNT(DISTINCT product.id)::int AS "products"
        FROM catalog_categories category
        INNER JOIN attribute_templates template
          ON template.category_id = category.id
         AND template.status = 'active'
        INNER JOIN product_template_assignments assignment
          ON assignment.template_id = template.id
        INNER JOIN products product ON product.id = assignment.product_id
        WHERE category.active = true
        GROUP BY category.id, category.name
        ORDER BY COUNT(DISTINCT product.id) DESC, category.name
        LIMIT 100
      `,
      this.sql<
        {
          affected: number;
          completion: number;
          publishable: number;
          activeTemplates: number;
        }[]
      >`
        WITH readiness AS (
          SELECT
            product.id,
            product.status,
            readiness.template_id,
            readiness.required,
            readiness.completed
          FROM products product
          INNER JOIN catalog_product_readiness readiness
            ON readiness.product_id = product.id
        )
        SELECT
          COUNT(*) FILTER (
            WHERE template_id IS NULL OR completed < required
          )::int AS "affected",
          COALESCE(ROUND(AVG(
            CASE
              WHEN template_id IS NULL THEN 0
              WHEN required = 0 THEN 100
              ELSE completed::numeric * 100 / required
            END
          )), 0)::int AS "completion",
          COUNT(*) FILTER (
            WHERE status <> 'archived' AND template_id IS NOT NULL AND completed = required
          )::int AS "publishable",
          (SELECT COUNT(*)::int FROM attribute_templates WHERE status = 'active')
            AS "activeTemplates"
        FROM readiness
      `,
    ]);
    const dashboardCounts = dashboard[0] ?? {
      affected: 0,
      completion: 0,
      publishable: 0,
      activeTemplates: 0,
    };
    const rows: WorkspaceRow[] = [
      {
        id: 'status:draft',
        values: { section: 'Estado', indicator: 'draft', value: products.draft },
      },
      {
        id: 'status:in_review',
        values: { section: 'Estado', indicator: 'in_review', value: products.inReview },
      },
      {
        id: 'status:published',
        values: { section: 'Estado', indicator: 'published', value: products.published },
      },
      {
        id: 'status:archived',
        values: { section: 'Estado', indicator: 'archived', value: products.archived },
      },
      ...brands.map((row, index) => ({
        id: `brand:${row.brand ?? 'missing'}:${index}`,
        values: { section: 'Marca', indicator: row.brand ?? 'Sin marca', value: row.products },
      })),
      ...categories.map((row, index) => ({
        id: `category:${index}:${row.category}`,
        values: { section: 'Categoría', indicator: row.category, value: row.products },
      })),
    ];

    return this.response('reports', {
      operationalStatus: 'operational',
      metrics: [
        integerMetric('products', 'Productos', products.total),
        integerMetric('brands', 'Marcas', products.brands),
        integerMetric('groups', 'Grupos unificadores', groups.groups),
        integerMetric('memberships', 'Membresías', groups.memberships),
        integerMetric('in-review', 'En revisión', products.inReview),
        integerMetric('affected-products', 'Productos con hallazgos', dashboardCounts.affected),
        integerMetric('completion', 'Completitud media (%)', dashboardCounts.completion),
        integerMetric('publishable', 'Elegibilidad base', dashboardCounts.publishable),
        integerMetric('active-templates', 'Plantillas activas', dashboardCounts.activeTemplates),
        integerMetric('blocked-external-systems', 'Sistemas externos bloqueados', 3),
        ...(products.updatedAt
          ? [
              {
                key: 'last-product-update',
                label: 'Última actualización',
                value: toIsoString(products.updatedAt),
                format: 'datetime' as const,
              },
            ]
          : []),
      ],
      columns: [
        { key: 'section', label: 'Sección', type: 'text' },
        { key: 'indicator', label: 'Indicador', type: 'text' },
        { key: 'value', label: 'Cantidad', type: 'number' },
      ],
      rows,
      notices: [
        info(
          'live-aggregates',
          'Agregados calculados en PostgreSQL',
          'Los conteos, la completitud y la elegibilidad base se calculan sobre todo el catálogo persistido y sus plantillas activas; no se proyectan desde la página visible.',
        ),
      ],
      actions: [refreshAction('reports')],
    });
  }

  private readAdministration(actor: AuthenticatedActor): WorkspaceDto {
    const roles = [...new Set(actor.roles)];
    const capabilities = capabilitiesForActor(actor);
    return this.response('administration', {
      operationalStatus: 'partial',
      metrics: [
        textMetric('actor', 'Usuario autenticado', actor.email),
        integerMetric('roles', 'Roles efectivos', roles.length),
        integerMetric('capabilities', 'Capacidades efectivas', capabilities.length),
        textMetric('auth-mode', 'Modo de autenticación', this.env.AUTH_MODE),
      ],
      columns: [
        { key: 'kind', label: 'Tipo', type: 'status' },
        { key: 'grant', label: 'Asignación efectiva', type: 'text' },
        { key: 'actor', label: 'Actor', type: 'text' },
      ],
      rows: [
        ...roles.map((role) => ({
          id: `role:${role}`,
          values: { kind: 'Rol', grant: role, actor: actor.email },
        })),
        ...capabilities.map((capability) => ({
          id: `capability:${capability}`,
          values: { kind: 'Capacidad', grant: capability, actor: actor.email },
        })),
      ],
      notices: [
        warning(
          'local-auth',
          'Identidad local temporal',
          'La sesión y los roles son reales para este entorno, pero la gestión de usuarios está bloqueada hasta decidir el proveedor empresarial.',
        ),
      ],
      actions: [
        {
          id: 'current-session',
          label: 'Consultar sesión actual',
          availability: 'supported',
          method: 'GET',
          endpoint: '/api/v1/auth/me',
        },
        refreshAction('administration'),
        blockedAction(
          'manage-users',
          'Gestionar usuarios',
          'Falta decidir Microsoft Entra/AD u otra fuente de identidad y su ciclo de altas y bajas.',
        ),
      ],
    });
  }
}
