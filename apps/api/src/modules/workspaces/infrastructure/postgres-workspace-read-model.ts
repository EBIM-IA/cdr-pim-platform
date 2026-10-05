import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@cdr/config';
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
    const [summary, brands, statuses] = await Promise.all([
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
    ];

    return this.response('categories', {
      operationalStatus: 'partial',
      metrics: [
        integerMetric('products', 'Productos persistidos', summary.total),
        integerMetric('brands', 'Marcas informadas', summary.brands),
        integerMetric('dimensions', 'Dimensiones disponibles', 2),
      ],
      columns: [
        { key: 'dimension', label: 'Dimensión', type: 'text' },
        { key: 'value', label: 'Valor persistido', type: 'text' },
        { key: 'products', label: 'Productos', type: 'number' },
      ],
      rows,
      notices: [
        warning(
          'taxonomy-not-persisted',
          'La taxonomía aún no está persistida',
          'Estos son agregados reales por marca y estado del catálogo; no representan categorías ni una jerarquía comercial.',
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
          'Faltan la taxonomía aprobada, su cardinalidad y persistencia.',
        ),
      ],
    });
  }

  private async readTemplates(): Promise<WorkspaceDto> {
    const persisted = await this.relationExists('templates');
    return this.response('templates', {
      operationalStatus: 'blocked',
      metrics: [
        textMetric(
          'persistence',
          'Persistencia de plantillas',
          persisted ? 'Detectada' : 'No disponible',
        ),
        integerMetric('rows', 'Plantillas expuestas', 0),
      ],
      columns: [
        { key: 'template', label: 'Plantilla', type: 'text' },
        { key: 'version', label: 'Versión', type: 'text' },
        { key: 'status', label: 'Estado', type: 'status' },
      ],
      rows: [],
      notices: [
        warning(
          'templates-not-persisted',
          'No hay registros de plantillas disponibles',
          persisted
            ? 'Se detectó una relación de plantillas, pero todavía no existe un contrato aprobado para leerla desde este módulo.'
            : 'PostgreSQL no contiene todavía tablas de plantillas, versiones ni valores de atributos.',
        ),
      ],
      actions: [
        refreshAction('templates'),
        blockedAction(
          'create-template',
          'Crear plantilla',
          'Faltan versionado, compatibilidad y reglas de aprobación.',
        ),
        blockedAction(
          'propagate-attributes',
          'Propagar atributos',
          'La replicabilidad está confirmada, pero faltan fuente, conflictos y exclusiones.',
        ),
      ],
    });
  }

  private async readApplications(): Promise<WorkspaceDto> {
    const [persisted, groups] = await Promise.all([
      this.relationExists('group_applications'),
      this.groupSummary(),
    ]);

    return this.response('applications', {
      operationalStatus: 'blocked',
      metrics: [
        integerMetric('unifier-groups', 'Grupos unificadores disponibles', groups.groups),
        textMetric(
          'persistence',
          'Persistencia de aplicaciones',
          persisted ? 'Detectada' : 'No disponible',
        ),
        integerMetric('rows', 'Aplicaciones expuestas', 0),
      ],
      columns: [
        { key: 'group', label: 'Código unificador', type: 'text' },
        { key: 'application', label: 'Aplicación', type: 'text' },
        { key: 'status', label: 'Estado', type: 'status' },
      ],
      rows: [],
      notices: [
        warning(
          'applications-not-persisted',
          'Las aplicaciones todavía no tienen almacenamiento aprobado',
          'Los grupos unificadores sí provienen de PostgreSQL, pero no se inventan aplicaciones ni campos de compatibilidad.',
        ),
      ],
      actions: [
        refreshAction('applications'),
        blockedAction(
          'manage-applications',
          'Registrar aplicaciones',
          'Falta ratificar los campos, vocabularios, estados y manejo de conflictos.',
        ),
      ],
    });
  }

  private async readEquivalences(): Promise<WorkspaceDto> {
    const [summary, groups] = await Promise.all([
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
    ]);

    return this.response('equivalences', {
      operationalStatus: 'partial',
      metrics: [
        integerMetric('groups', 'Grupos persistidos', summary.groups),
        integerMetric('memberships', 'Membresías persistidas', summary.memberships),
        textMetric('homologs', 'Homólogos externos', 'Sin persistencia'),
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
        warning(
          'homologs-not-persisted',
          'La gestión de homólogos continúa bloqueada',
          'No existe una tabla de homólogos. Cuando se implemente, la búsqueda solo considerará registros activos y aprobados.',
        ),
      ],
      actions: [
        refreshAction('equivalences'),
        blockedAction(
          'manage-homologs',
          'Gestionar homólogos',
          'Faltan persistencia, normalización y matriz de aprobación.',
        ),
      ],
    });
  }

  private async readDocuments(): Promise<WorkspaceDto> {
    const persisted = await this.relationExists('product_assets');
    const storage =
      this.env.STORAGE_DRIVER === 's3' ? 'S3 configurado' : 'Memoria local no durable';

    return this.response('documents', {
      operationalStatus: 'blocked',
      metrics: [
        textMetric(
          'persistence',
          'Persistencia de metadatos',
          persisted ? 'Detectada' : 'No disponible',
        ),
        textMetric('storage', 'Almacenamiento', storage),
        integerMetric('assets', 'Activos expuestos', 0),
      ],
      columns: [
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'asset', label: 'Activo', type: 'text' },
        { key: 'status', label: 'Estado técnico', type: 'status' },
      ],
      rows: [],
      notices: [
        warning(
          'assets-not-persisted',
          'No hay metadatos de activos disponibles',
          persisted
            ? 'Se detectó persistencia, pero el contrato de activos aún no está aprobado para su lectura.'
            : 'No existe la tabla product_assets; por eso no se simulan imágenes ni documentos.',
        ),
        ...(this.env.STORAGE_DRIVER === 'memory'
          ? [
              warning(
                'storage-ephemeral',
                'Almacenamiento solo local',
                'El adaptador en memoria no conserva archivos después de reiniciar el proceso.',
              ),
            ]
          : []),
      ],
      actions: [
        refreshAction('documents'),
        blockedAction(
          'upload-asset',
          'Cargar activo',
          'Faltan MIME permitidos, límites, antivirus, versionado y la entidad persistente.',
        ),
      ],
    });
  }

  private async readImports(): Promise<WorkspaceDto> {
    const persisted = await this.relationExists('import_batches');
    const queueState =
      this.env.QUEUE_DRIVER === 'sqs' ? 'SQS configurado' : 'Memoria local no durable';
    const storageState =
      this.env.STORAGE_DRIVER === 's3' ? 'S3 configurado' : 'Memoria local no durable';
    const rows: WorkspaceRow[] = [
      {
        id: 'queue',
        values: { component: 'Cola de trabajos', driver: this.env.QUEUE_DRIVER, state: queueState },
      },
      {
        id: 'storage',
        values: {
          component: 'Almacenamiento temporal',
          driver: this.env.STORAGE_DRIVER,
          state: storageState,
        },
      },
      {
        id: 'history',
        values: {
          component: 'Historial de lotes',
          driver: 'PostgreSQL',
          state: persisted ? 'Relación detectada sin contrato aprobado' : 'No disponible',
        },
      },
    ];

    return this.response('imports', {
      operationalStatus: 'blocked',
      metrics: [
        textMetric('queue', 'Cola', queueState),
        textMetric('storage', 'Almacenamiento', storageState),
        textMetric('history', 'Persistencia de lotes', persisted ? 'Detectada' : 'No disponible'),
      ],
      columns: [
        { key: 'component', label: 'Componente', type: 'text' },
        { key: 'driver', label: 'Adaptador', type: 'text' },
        { key: 'state', label: 'Estado real', type: 'status' },
      ],
      rows,
      notices: [
        warning(
          'batch-import-not-implemented',
          'El motor de lotes todavía no existe',
          'La cola técnica puede recibir jobs internos, pero no hay carga, validación, historial ni ejecución idempotente de archivos.',
        ),
      ],
      actions: [
        refreshAction('imports'),
        blockedAction(
          'create-batch',
          'Crear importación',
          'Faltan tablas de lotes/filas, formatos aprobados, idempotencia y auditoría.',
        ),
      ],
    });
  }

  private async readQuality(): Promise<WorkspaceDto> {
    const [summary, findings] = await Promise.all([
      this.sql<{ affected: number; findings: number }[]>`
        SELECT
          COUNT(*) FILTER (
            WHERE NULLIF(BTRIM(sku), '') IS NULL
               OR NULLIF(BTRIM(name), '') IS NULL
               OR NULLIF(BTRIM(brand), '') IS NULL
               OR NULLIF(BTRIM(description), '') IS NULL
          )::int AS "affected",
          COALESCE(SUM(
            (CASE WHEN NULLIF(BTRIM(sku), '') IS NULL THEN 1 ELSE 0 END) +
            (CASE WHEN NULLIF(BTRIM(name), '') IS NULL THEN 1 ELSE 0 END) +
            (CASE WHEN NULLIF(BTRIM(brand), '') IS NULL THEN 1 ELSE 0 END) +
            (CASE WHEN NULLIF(BTRIM(description), '') IS NULL THEN 1 ELSE 0 END)
          ), 0)::int AS "findings"
        FROM products
      `,
      this.sql<
        {
          id: string;
          sku: string;
          name: string;
          missingSku: boolean;
          missingName: boolean;
          missingBrand: boolean;
          missingDescription: boolean;
          updatedAt: Date | string;
        }[]
      >`
        SELECT
          id,
          sku,
          name,
          NULLIF(BTRIM(sku), '') IS NULL AS "missingSku",
          NULLIF(BTRIM(name), '') IS NULL AS "missingName",
          NULLIF(BTRIM(brand), '') IS NULL AS "missingBrand",
          NULLIF(BTRIM(description), '') IS NULL AS "missingDescription",
          updated_at AS "updatedAt"
        FROM products
        WHERE NULLIF(BTRIM(sku), '') IS NULL
           OR NULLIF(BTRIM(name), '') IS NULL
           OR NULLIF(BTRIM(brand), '') IS NULL
           OR NULLIF(BTRIM(description), '') IS NULL
        ORDER BY updated_at DESC, sku
        LIMIT 100
      `,
    ]);
    const counts = summary[0] ?? { affected: 0, findings: 0 };

    const rows: WorkspaceRow[] = findings.map((row) => {
      const issues = [
        row.missingSku ? 'SKU vacío' : null,
        row.missingName ? 'nombre vacío' : null,
        row.missingBrand ? 'marca faltante' : null,
        row.missingDescription ? 'descripción faltante' : null,
      ].filter((issue): issue is string => issue !== null);
      return {
        id: row.id,
        values: {
          sku: row.sku || 'Sin SKU',
          name: row.name || 'Sin nombre',
          findings: issues.join(', '),
          updatedAt: toIsoString(row.updatedAt),
        },
      };
    });

    return this.response('quality', {
      operationalStatus: 'partial',
      metrics: [
        integerMetric('affected-products', 'Productos con hallazgos', counts.affected),
        integerMetric('findings', 'Hallazgos deterministas', counts.findings),
        integerMetric('shown', 'Filas mostradas', rows.length),
      ],
      columns: [
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'name', label: 'Producto', type: 'text' },
        { key: 'findings', label: 'Hallazgos', type: 'status' },
        { key: 'updatedAt', label: 'Actualizado', type: 'datetime' },
      ],
      rows,
      totalRows: counts.affected,
      notices: [
        info(
          'deterministic-checks',
          'Controles deterministas, no puntuación de calidad',
          'Los hallazgos se calculan en vivo sobre SKU, nombre, marca y descripción. No se declara completitud de plantilla ni se consulta IA.',
        ),
      ],
      actions: [
        refreshAction('quality'),
        blockedAction(
          'review-ai-suggestion',
          'Revisar sugerencia de IA',
          'Faltan contratos de candidatos, evidencia, confianza y aprobación humana.',
        ),
      ],
    });
  }

  private async readPublication(): Promise<WorkspaceDto> {
    const [summary, candidates] = await Promise.all([
      this.productSummary(),
      this.sql<
        {
          id: string;
          sku: string;
          name: string;
          brand: string | null;
          status: string;
          updatedAt: Date | string;
        }[]
      >`
        SELECT id, sku, name, brand, status, updated_at AS "updatedAt"
        FROM products
        WHERE status = 'in_review'
        ORDER BY updated_at DESC, sku
        LIMIT 100
      `,
    ]);

    return this.response('publication', {
      operationalStatus: 'partial',
      metrics: [
        integerMetric('draft', 'Borradores', summary.draft),
        integerMetric('in-review', 'En revisión', summary.inReview),
        integerMetric('published', 'Publicados', summary.published),
        integerMetric('archived', 'Archivados', summary.archived),
      ],
      columns: [
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'name', label: 'Producto', type: 'text' },
        { key: 'brand', label: 'Marca', type: 'text' },
        { key: 'status', label: 'Estado PIM', type: 'status' },
        { key: 'updatedAt', label: 'Actualizado', type: 'datetime' },
      ],
      rows: candidates.map((row) => ({
        id: row.id,
        values: {
          sku: row.sku,
          name: row.name,
          brand: row.brand,
          status: row.status,
          updatedAt: toIsoString(row.updatedAt),
        },
      })),
      totalRows: summary.inReview,
      notices: [
        warning(
          'not-eligibility',
          '“En revisión” no significa elegible para publicar',
          'La tabla solo lista candidatos por su estado persistido. Faltan las reglas finales de calidad, activos, aplicaciones, aprobación y canal.',
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
          state:
            this.env.AI_PROVIDER === 'openai' ? 'OpenAI configurado' : 'Adaptador simulado local',
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
    const [products, groups, brands] = await Promise.all([
      this.productSummary(),
      this.groupSummary(),
      this.sql<{ brand: string | null; products: number }[]>`
        SELECT NULLIF(BTRIM(brand), '') AS "brand", COUNT(*)::int AS "products"
        FROM products
        GROUP BY NULLIF(BTRIM(brand), '')
        ORDER BY COUNT(*) DESC, NULLIF(BTRIM(brand), '') NULLS LAST
        LIMIT 20
      `,
    ]);
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
    ];

    return this.response('reports', {
      operationalStatus: 'operational',
      metrics: [
        integerMetric('products', 'Productos', products.total),
        integerMetric('brands', 'Marcas', products.brands),
        integerMetric('groups', 'Grupos unificadores', groups.groups),
        integerMetric('memberships', 'Membresías', groups.memberships),
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
          'Los conteos se calculan sobre los registros persistidos al momento indicado; no representan métricas de calidad inferidas.',
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
