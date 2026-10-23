import { createHash } from 'node:crypto';

import { sql, type SQL } from 'drizzle-orm';

import {
  assertClientTemplateManifest,
  CLIENT_TEMPLATE_MANIFEST,
  CLIENT_TEMPLATE_ROLES,
  type ClientAttributeValue,
  type ClientManifestApplicationRelation,
  type ClientManifestHomologRelation,
  type ClientManifestOemRelation,
  type ClientTemplateManifest,
} from './client-template-manifest';
import type { Database } from './drizzle.client';

export interface QasDemoSupplementProduct {
  readonly sku: string;
  readonly name: string;
  readonly description?: string | null;
  readonly brand?: string | null;
  readonly categorySlug: string;
  readonly variantKey: string;
  readonly providerCode?: string | null;
  readonly unifiedCode?: string | null;
  readonly values: Readonly<Record<string, ClientAttributeValue>>;
}

export interface QasDemoSupplement {
  readonly products: readonly QasDemoSupplementProduct[];
  readonly applications?: readonly (ClientManifestApplicationRelation & {
    readonly vehicleType?: 'AUTOMOTRIZ' | 'INDUSTRIAL';
  })[];
  readonly homologs?: readonly (ClientManifestHomologRelation & {
    readonly approvalStatus?: 'pending' | 'approved' | 'rejected';
  })[];
  readonly oem?: readonly (ClientManifestOemRelation & {
    readonly approvalStatus?: 'pending' | 'approved' | 'rejected';
  })[];
}

export interface QasDemoSeedOptions {
  readonly apply?: boolean;
  readonly manifest?: ClientTemplateManifest;
  readonly supplement?: QasDemoSupplement;
  readonly expectedSourceSha256?: string;
}

export interface QasDemoSeedTableResult {
  readonly before: number;
  readonly inserted: number;
  /** In dry-run mode this is the projected count; every insertion is rolled back. */
  readonly after: number;
}

export interface QasDemoSeedResult {
  readonly mode: 'dry-run' | 'apply';
  readonly sourceSha256: string;
  readonly datasetSha256: string;
  readonly productCount: number;
  readonly tables: Readonly<Record<string, QasDemoSeedTableResult>>;
  readonly insertedIds: Readonly<Record<string, readonly string[]>>;
  readonly warnings: readonly { readonly code: string; readonly count: number }[];
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Row = Record<string, unknown>;
type InsertRow = Record<string, string | number | boolean | null | readonly string[] | object>;
const TABLES = [
  'products',
  'product_identifiers',
  'equivalence_groups',
  'equivalence_group_members',
  'catalog_categories',
  'attribute_definitions',
  'attribute_templates',
  'template_asset_requirements',
  'template_attribute_assignments',
  'template_attribute_role_access',
  'product_template_assignments',
  'product_attribute_values',
  'group_applications',
  'external_homologs',
  'group_oem_codes',
] as const;
type Table = (typeof TABLES)[number];
const JSON_COLUMNS = new Set(['source_priority', 'allowed_values', 'value_json']);
const LOCK_ID = 4_871_227;
const NAMESPACE = Buffer.from('ef0747ab256944769ac44f99c9139eb10', 'hex');

export class QasDemoSeedCollisionError extends Error {
  constructor(
    readonly table: string,
    readonly reason: string,
  ) {
    super(`QAS demo seed stopped: incompatible existing data in ${table} (${reason}).`);
    this.name = 'QasDemoSeedCollisionError';
  }
}

class DryRunRollback extends Error {
  constructor(readonly result: QasDemoSeedResult) {
    super('Intentional dry-run rollback');
  }
}

export function assertQasDemoSeedEnvironment(appEnv: string): asserts appEnv is 'qas' {
  if (appEnv !== 'qas') throw new Error('QAS demo seed requires APP_ENV=qas.');
}

/** This importer never updates, deletes, republishes, reactivates, or indexes existing data. */
export async function runQasDemoSeed(
  db: Database,
  options: QasDemoSeedOptions = {},
): Promise<QasDemoSeedResult> {
  const manifest = options.manifest ?? CLIENT_TEMPLATE_MANIFEST;
  assertClientTemplateManifest(manifest);
  if (options.expectedSourceSha256 && manifest.source.sha256 !== options.expectedSourceSha256) {
    throw new Error('QAS demo seed source SHA-256 does not match the requested source.');
  }
  const products = manifest.templates.flatMap((template) =>
    template.products.map(
      (product) =>
        ({
          sku: product.sku,
          name: product.name,
          description: null,
          brand: product.brand || null,
          categorySlug: template.categorySlug,
          variantKey: template.variantKey,
          providerCode: product.providerCode,
          unifiedCode: product.unifiedCode,
          values: product.values,
        }) satisfies QasDemoSupplementProduct,
    ),
  );
  const dataset: readonly QasDemoSupplementProduct[] = [
    ...products,
    ...(options.supplement?.products ?? []),
  ];
  validateSupplement(dataset, manifest);
  const datasetSha256 = createHash('sha256')
    .update(JSON.stringify({ manifest, supplement: options.supplement ?? null }))
    .digest('hex');
  try {
    return await db.transaction(
      async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_ID})`);
        const before = await counts(tx);
        const insertedIds: Record<string, string[]> = Object.fromEntries(
          TABLES.map((table) => [table, []]),
        );
        const warnings: { code: string; count: number }[] = [];
        const add = async (
          table: Table,
          rows: readonly InsertRow[],
          identity: readonly string[] = ['id'],
        ) => {
          for (let offset = 0; offset < rows.length; offset += 250) {
            const chunk = rows.slice(offset, offset + 250);
            if (!chunk.length) continue;
            const columns = Object.keys(chunk[0]!);
            const values = chunk.map(
              (row) =>
                sql`(${sql.join(
                  columns.map((column) => parameter(column, row[column] ?? null)),
                  sql`, `,
                )})`,
            );
            const returned = await tx.execute(sql`INSERT INTO ${sql.identifier(table)}
            (${sql.join(
              columns.map((column) => sql.identifier(column)),
              sql`, `,
            )})
            VALUES ${sql.join(values, sql`, `)} ON CONFLICT DO NOTHING
            RETURNING ${sql.join(
              identity.map((column) => sql.identifier(column)),
              sql`, `,
            )}`);
            for (const row of returned)
              insertedIds[table]!.push(identity.map((key) => String(row[key])).join(':'));
          }
        };

        const activeSlugs = new Set<string>();
        const categorySource = new Map(
          manifest.categories.map((category) => [category.slug, category]),
        );
        for (const category of manifest.categories.filter((item) => item.defined)) {
          let node: typeof category | undefined = category;
          while (node) {
            activeSlugs.add(node.slug);
            node = node.parentSlug ? categorySource.get(node.parentSlug) : undefined;
          }
        }
        const categoryIds = new Map<string, string>();
        for (const level of [1, 2, 3]) {
          const levelCategories = manifest.categories.filter(
            (category) => category.level === level,
          );
          await add(
            'catalog_categories',
            levelCategories.map((category, position) => ({
              id: seedId('category', category.slug),
              slug: category.slug,
              name: category.name,
              parent_id: category.parentSlug
                ? required(categoryIds, category.parentSlug, 'catalog_categories')
                : null,
              path: category.categoryPath.join(' > '),
              application: category.application,
              source_priority: category.sourcePriority,
              position,
              active: activeSlugs.has(category.slug),
            })),
          );
          const stored = await readWhereIn(
            tx,
            'catalog_categories',
            'slug',
            levelCategories.map((category) => category.slug),
          );
          for (const category of levelCategories) {
            const row = stored.find((item) => item.slug === category.slug);
            if (
              !row ||
              row.parent_id !==
                (category.parentSlug ? categoryIds.get(category.parentSlug) : null) ||
              (activeSlugs.has(category.slug) && row.active !== true)
            ) {
              throw new QasDemoSeedCollisionError(
                'catalog_categories',
                'hierarchy_or_inactive_category',
              );
            }
            categoryIds.set(category.slug, String(row.id));
          }
        }

        await add(
          'attribute_definitions',
          manifest.definitions.map((definition) => ({
            id: seedId('definition', definition.key),
            key: definition.key,
            label: definition.label,
            data_type: definition.dataType,
            unit: definition.unit,
            source_authority: definition.sourceAuthority,
            allowed_values: [],
            active: true,
          })),
        );
        const definitions = await readWhereIn(
          tx,
          'attribute_definitions',
          'key',
          manifest.definitions.map((definition) => definition.key),
        );
        const definitionIds = new Map<string, string>();
        for (const definition of manifest.definitions) {
          const row = definitions.find((item) => item.key === definition.key);
          if (
            !row ||
            row.data_type !== definition.dataType ||
            row.unit !== definition.unit ||
            row.source_authority !== definition.sourceAuthority ||
            row.active !== true
          ) {
            throw new QasDemoSeedCollisionError(
              'attribute_definitions',
              'type_unit_authority_or_inactive_definition',
            );
          }
          definitionIds.set(definition.key, String(row.id));
        }

        await add(
          'attribute_templates',
          manifest.templates.map((template) => ({
            id: seedId('template', `${template.categorySlug}:${template.variantKey}`),
            category_id: required(categoryIds, template.categorySlug, 'attribute_templates'),
            variant_key: template.variantKey,
            name: template.name,
            version: 1,
            status: 'active',
          })),
        );
        const templates = await readWhereIn(tx, 'attribute_templates', 'category_id', [
          ...categoryIds.values(),
        ]);
        const templateIds = new Map<string, string>();
        for (const template of manifest.templates) {
          const matches = templates.filter(
            (row) =>
              row.category_id === categoryIds.get(template.categorySlug) &&
              row.variant_key === template.variantKey &&
              row.status === 'active',
          );
          if (matches.length !== 1)
            throw new QasDemoSeedCollisionError(
              'attribute_templates',
              'missing_or_ambiguous_active_variant',
            );
          templateIds.set(
            `${template.categorySlug}:${template.variantKey}`,
            String(matches[0]!.id),
          );
        }
        const attributeAssignments: InsertRow[] = [];
        const roleAccess: InsertRow[] = [];
        const assetRequirements: InsertRow[] = [];
        for (const template of manifest.templates) {
          const templateId = required(
            templateIds,
            `${template.categorySlug}:${template.variantKey}`,
            'attribute_templates',
          );
          template.attributes.forEach((attribute, position) => {
            const definitionId = required(definitionIds, attribute.key, 'attribute_definitions');
            attributeAssignments.push({
              template_id: templateId,
              attribute_definition_id: definitionId,
              position,
              required: attribute.required,
              replicable: attribute.replicable,
              searchable: attribute.searchable,
              include_in_technical_sheet: attribute.includeInTechnicalSheet,
              active: true,
            });
            for (const role of CLIENT_TEMPLATE_ROLES)
              roleAccess.push({
                template_id: templateId,
                attribute_definition_id: definitionId,
                role,
                can_view: attribute.roles[role].canView,
                can_edit: attribute.roles[role].canEdit,
                can_import: attribute.roles[role].canImport,
                can_export: attribute.roles[role].canExport,
              });
          });
          for (const asset of template.assets)
            assetRequirements.push({
              template_id: templateId,
              type_code: asset.type,
              required: asset.required,
              active: true,
            });
        }
        await add('template_attribute_assignments', attributeAssignments, [
          'template_id',
          'attribute_definition_id',
        ]);
        await add('template_attribute_role_access', roleAccess, [
          'template_id',
          'attribute_definition_id',
          'role',
        ]);
        await add('template_asset_requirements', assetRequirements, ['template_id', 'type_code']);
        const storedAssignments = await readWhereIn(
          tx,
          'template_attribute_assignments',
          'template_id',
          [...templateIds.values()],
        );
        const assignmentByKey = new Map(
          storedAssignments.map((row) => [
            `${String(row.template_id)}:${String(row.attribute_definition_id)}`,
            row,
          ]),
        );
        for (const assignment of attributeAssignments) {
          const stored = assignmentByKey.get(
            `${String(assignment.template_id)}:${String(assignment.attribute_definition_id)}`,
          );
          if (!stored || stored.active !== true)
            throw new QasDemoSeedCollisionError(
              'template_attribute_assignments',
              'inactive_assignment',
            );
        }

        await add(
          'products',
          dataset.map((product) => ({
            id: seedId('product', product.sku),
            sku: product.sku,
            name: product.name,
            description: product.description ?? null,
            brand: product.brand ?? null,
            status: 'in_review',
          })),
        );
        const storedProducts = await readWhereIn(
          tx,
          'products',
          'sku',
          dataset.map((product) => product.sku),
        );
        for (const product of dataset) {
          const stored = storedProducts.find((row) => row.sku === product.sku);
          if (
            stored?.brand &&
            product.brand &&
            normalize(String(stored.brand)) !== normalize(product.brand)
          ) {
            throw new QasDemoSeedCollisionError('products', 'existing_different_brand');
          }
        }
        const productIds = new Map(storedProducts.map((row) => [String(row.sku), String(row.id)]));
        const desiredProductTemplates = dataset.map((product) => ({
          product_id: required(productIds, product.sku, 'products'),
          template_id: required(
            templateIds,
            `${product.categorySlug}:${product.variantKey}`,
            'attribute_templates',
          ),
        }));
        await add('product_template_assignments', desiredProductTemplates, ['product_id']);
        const storedProductTemplates = await readWhereIn(
          tx,
          'product_template_assignments',
          'product_id',
          [...productIds.values()],
        );
        for (const assignment of desiredProductTemplates) {
          const stored = storedProductTemplates.find(
            (row) => row.product_id === assignment.product_id,
          );
          if (!stored || stored.template_id !== assignment.template_id)
            throw new QasDemoSeedCollisionError(
              'product_template_assignments',
              'existing_different_template',
            );
        }

        const codes = [
          ...new Set(
            dataset
              .map((product) => product.unifiedCode)
              .filter((code): code is string => Boolean(code)),
          ),
        ];
        await add(
          'equivalence_groups',
          codes.map((code) => ({
            id: seedId('group', code),
            code,
            name: code,
            kind: 'interchange',
          })),
        );
        const storedGroups = await readWhereIn(tx, 'equivalence_groups', 'code', codes);
        const groupIds = new Map(storedGroups.map((row) => [String(row.code), String(row.id)]));
        if (storedGroups.some((row) => row.kind !== 'interchange')) {
          throw new QasDemoSeedCollisionError(
            'equivalence_groups',
            'existing_different_group_kind',
          );
        }
        const memberships = dataset
          .filter((product) => product.unifiedCode)
          .map((product) => ({
            product_id: required(productIds, product.sku, 'products'),
            group_id: required(groupIds, product.unifiedCode!, 'equivalence_groups'),
            role: 'member',
          }));
        const priorMemberships = await readWhereIn(tx, 'equivalence_group_members', 'product_id', [
          ...productIds.values(),
        ]);
        for (const membership of memberships) {
          if (
            priorMemberships.some(
              (row) =>
                row.product_id === membership.product_id && row.group_id !== membership.group_id,
            )
          ) {
            throw new QasDemoSeedCollisionError(
              'equivalence_group_members',
              'existing_different_group',
            );
          }
        }
        await add('equivalence_group_members', memberships, ['group_id', 'product_id']);
        const existingMemberships = await readWhereIn(
          tx,
          'equivalence_group_members',
          'product_id',
          [...productIds.values()],
        );
        for (const membership of memberships) {
          if (
            !existingMemberships.some(
              (row) =>
                row.product_id === membership.product_id && row.group_id === membership.group_id,
            )
          ) {
            throw new QasDemoSeedCollisionError('equivalence_group_members', 'missing_membership');
          }
        }

        const identifiers: InsertRow[] = [];
        const existingIdentifiers = await readWhereIn(
          tx,
          'product_identifiers',
          'value',
          dataset.flatMap((product) => [
            product.sku,
            ...(product.providerCode ? [product.providerCode] : []),
          ]),
        );
        const identifierOwners = new Map(
          existingIdentifiers.map((row) => [
            `${String(row.type)}:${String(row.value)}`,
            String(row.product_id),
          ]),
        );
        let conflictingProviders = 0;
        const providerCounts = new Map<string, number>();
        for (const product of dataset) {
          if (product.providerCode)
            providerCounts.set(
              product.providerCode,
              (providerCounts.get(product.providerCode) ?? 0) + 1,
            );
        }
        for (const product of dataset) {
          const productId = required(productIds, product.sku, 'products');
          for (const identifier of [
            { type: 'sku', value: product.sku },
            ...(product.providerCode
              ? [{ type: 'manufacturer_part_number', value: product.providerCode }]
              : []),
          ]) {
            const key = `${identifier.type}:${identifier.value}`;
            const owner = identifierOwners.get(key);
            if (owner && owner !== productId) {
              if (
                identifier.type === 'manufacturer_part_number' &&
                (providerCounts.get(identifier.value) ?? 0) > 1 &&
                [...productIds.values()].includes(owner)
              ) {
                conflictingProviders += 1;
                continue;
              }
              throw new QasDemoSeedCollisionError(
                'product_identifiers',
                'sku_owned_by_another_product',
              );
            }
            identifierOwners.set(key, productId);
            identifiers.push({
              id: seedId('identifier', key),
              product_id: productId,
              ...identifier,
            });
          }
        }
        if (conflictingProviders)
          warnings.push({
            code: 'PROVIDER_IDENTIFIER_ALREADY_OWNED_SKIPPED',
            count: conflictingProviders,
          });
        await add('product_identifiers', identifiers);

        const values: InsertRow[] = [];
        for (const product of dataset) {
          const templateId = required(
            templateIds,
            `${product.categorySlug}:${product.variantKey}`,
            'attribute_templates',
          );
          for (const [key, value] of Object.entries(product.values)) {
            const definition = definitions.find((row) => row.key === key);
            const definitionId = required(definitionIds, key, 'attribute_definitions');
            if (!assignmentByKey.has(`${templateId}:${definitionId}`))
              throw new QasDemoSeedCollisionError(
                'product_attribute_values',
                'attribute_outside_template',
              );
            validateStoredValue(value, definition!);
            values.push({
              product_id: required(productIds, product.sku, 'products'),
              attribute_definition_id: definitionId,
              source: definition!.source_authority === 'erp' ? 'erp' : 'import',
              confidence: 1,
              version: 1,
              value_text:
                typeof value === 'string' && definition!.data_type !== 'date' ? value : null,
              value_date: definition!.data_type === 'date' ? String(value) : null,
              value_number: typeof value === 'number' ? value : null,
              value_boolean: typeof value === 'boolean' ? value : null,
            });
          }
        }
        await add('product_attribute_values', values, ['product_id', 'attribute_definition_id']);

        const homologs = [...manifest.relations.homologs, ...(options.supplement?.homologs ?? [])];
        const homologCodes = [
          ...new Set(
            homologs.map((relation) => String(relation.codigo_homologo).trim().toUpperCase()),
          ),
        ];
        const homologSkuCandidates = homologCodes.length
          ? [
              ...(await tx.execute(
                sql`SELECT sku, brand FROM products WHERE UPPER(TRIM(sku)) IN (${sql.join(
                  homologCodes.map((code) => sql`${code}`),
                  sql`, `,
                )})`,
              )),
            ]
          : [];
        for (const relation of homologs) {
          if (
            homologSkuCandidates.some(
              (product) =>
                String(product.sku).trim().toUpperCase() ===
                  String(relation.codigo_homologo).trim().toUpperCase() &&
                String(product.brand ?? '')
                  .trim()
                  .toUpperCase() === relation.marca_homologo.trim().toUpperCase(),
            )
          ) {
            throw new QasDemoSeedCollisionError(
              'external_homologs',
              'reference_is_owned_catalog_sku',
            );
          }
        }
        const oem = [...manifest.relations.oem, ...(options.supplement?.oem ?? [])];
        const applications = [
          ...manifest.relations.applications,
          ...(options.supplement?.applications ?? []),
        ];
        await add(
          'external_homologs',
          homologs.map((relation) => ({
            id: seedId(
              'homolog',
              `${relation.codigo_unificador}:${relation.marca_homologo}:${String(relation.codigo_homologo)}`,
            ),
            equivalence_group_id: required(
              groupIds,
              relation.codigo_unificador,
              'equivalence_groups',
            ),
            external_code: String(relation.codigo_homologo),
            external_brand: relation.marca_homologo,
            active: normalize(relation.estado) !== 'INACTIVO',
            approval_status:
              'approvalStatus' in relation ? String(relation.approvalStatus) : 'pending',
            source: 'import',
          })),
        );
        await add(
          'group_oem_codes',
          oem.map((relation) => ({
            id: seedId('oem', `${relation.codigo_unificador}:${String(relation.codigo_oem)}`),
            equivalence_group_id: required(
              groupIds,
              relation.codigo_unificador,
              'equivalence_groups',
            ),
            oem_code: String(relation.codigo_oem),
            brands: relation.marca
              .split(',')
              .map((brand) => brand.trim())
              .filter(Boolean),
            active: normalize(relation.estado) !== 'INACTIVO',
            approval_status:
              'approvalStatus' in relation ? String(relation.approvalStatus) : 'pending',
            source: 'import',
          })),
        );
        await add(
          'group_applications',
          applications.map((relation) => {
            const type =
              'vehicleType' in relation && relation.vehicleType
                ? String(relation.vehicleType)
                : applicationType(dataset, relation.codigo_unificador);
            return {
              id: seedId('application', JSON.stringify(relation)),
              equivalence_group_id: required(
                groupIds,
                relation.codigo_unificador,
                'equivalence_groups',
              ),
              vehicle_type: type,
              make: relation.marca_vehiculo,
              model: relation.modelo,
              body_style: relation.tipo ?? null,
              fuel: relation.combustible ?? null,
              traction: relation.traccion ?? null,
              displacement: relation.cilindraje === undefined ? null : String(relation.cilindraje),
              year_from: relation.ano_desde ?? null,
              year_to: relation.ano_hasta ?? null,
              area: relation.area ?? null,
              subarea: relation.subarea ?? null,
              active: normalize(relation.estado) !== 'INACTIVO',
              source: 'import',
            };
          }),
        );
        const after = await counts(tx);
        const result: QasDemoSeedResult = {
          mode: options.apply ? 'apply' : 'dry-run',
          sourceSha256: manifest.source.sha256,
          datasetSha256,
          productCount: dataset.length,
          warnings,
          insertedIds,
          tables: Object.fromEntries(
            TABLES.map((table) => [
              table,
              {
                before: before[table]!,
                inserted: insertedIds[table]!.length,
                after: after[table]!,
              },
            ]),
          ),
        };
        for (const table of TABLES) {
          if (after[table] !== before[table]! + insertedIds[table]!.length)
            throw new QasDemoSeedCollisionError(table, 'concurrent_table_change');
        }
        if (!options.apply) throw new DryRunRollback(result);
        return result;
      },
      { isolationLevel: 'serializable' },
    );
  } catch (error) {
    if (error instanceof DryRunRollback) return error.result;
    throw error;
  }
}

function seedId(scope: string, key: string): string {
  const bytes = createHash('sha1')
    .update(NAMESPACE)
    .update(`${scope}:${key}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parameter(column: string, value: InsertRow[string]): SQL {
  if (JSON_COLUMNS.has(column)) return sql`${JSON.stringify(value)}::jsonb`;
  if (Array.isArray(value))
    return sql`ARRAY[${sql.join(
      value.map((item) => sql`${item}`),
      sql`, `,
    )}]::text[]`;
  return sql`${value}`;
}

async function readWhereIn(
  tx: Tx,
  table: Table,
  column: string,
  values: readonly string[],
): Promise<Row[]> {
  if (!values.length) return [];
  return [
    ...(await tx.execute(
      sql`SELECT * FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} IN (${sql.join(
        [...new Set(values)].map((value) => sql`${value}`),
        sql`, `,
      )})`,
    )),
  ];
}

async function counts(tx: Tx): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of TABLES) {
    const [row] = await tx.execute(
      sql`SELECT COUNT(*)::int AS count FROM ${sql.identifier(table)}`,
    );
    result[table] = Number(row!.count);
  }
  return result;
}

function required(map: ReadonlyMap<string, string>, key: string, table: Table): string {
  const value = map.get(key);
  if (!value) throw new QasDemoSeedCollisionError(table, 'unresolved_natural_key');
  return value;
}

function normalize(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .toUpperCase();
}

function applicationType(products: readonly QasDemoSupplementProduct[], group: string): string {
  const types = new Set(
    products
      .filter((product) => product.unifiedCode === group)
      .map((product) => normalize(String(product.values.tipo_aplicacion ?? '')))
      .filter(Boolean),
  );
  if (types.size !== 1 || !['AUTOMOTRIZ', 'INDUSTRIAL'].includes([...types][0]!))
    throw new QasDemoSeedCollisionError('group_applications', 'explicit_vehicle_type_required');
  return [...types][0]!;
}

function validateStoredValue(value: ClientAttributeValue, definition: Row): void {
  const type = definition.data_type;
  if (
    (type === 'number' || type === 'measurement') &&
    (typeof value !== 'number' || !Number.isFinite(value))
  )
    throw new QasDemoSeedCollisionError('product_attribute_values', 'numeric_type_mismatch');
  if (type === 'boolean' && typeof value !== 'boolean')
    throw new QasDemoSeedCollisionError('product_attribute_values', 'boolean_type_mismatch');
  if (['text', 'enum', 'date'].includes(String(type)) && typeof value !== 'string')
    throw new QasDemoSeedCollisionError('product_attribute_values', 'text_type_mismatch');
  if (
    type === 'enum' &&
    Array.isArray(definition.allowed_values) &&
    definition.allowed_values.length &&
    !definition.allowed_values.includes(value)
  )
    throw new QasDemoSeedCollisionError('product_attribute_values', 'enum_value_mismatch');
}

function validateSupplement(
  products: readonly QasDemoSupplementProduct[],
  manifest: ClientTemplateManifest,
): void {
  const seen = new Set<string>();
  for (const product of products) {
    if (
      !product.sku.trim() ||
      product.sku.length > 64 ||
      !product.name.trim() ||
      product.name.length > 300 ||
      seen.has(product.sku)
    )
      throw new Error('QAS demo product identity is invalid or repeated.');
    seen.add(product.sku);
    if (
      !manifest.templates.some(
        (template) =>
          template.categorySlug === product.categorySlug &&
          template.variantKey === product.variantKey,
      )
    )
      throw new Error('QAS demo product references an unknown template variant.');
  }
}
