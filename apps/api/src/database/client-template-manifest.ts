import clientTemplateManifestJson from './client-template-manifest.json';

export const CLIENT_TEMPLATE_ROLES = ['ADMINISTRADOR', 'COMPRAS', 'VENTAS'] as const;
export const CLIENT_TEMPLATE_ASSET_TYPES = ['FT', 'MSDS', 'CERT', 'FOTO', 'PLANO'] as const;

export type ClientTemplateRole = (typeof CLIENT_TEMPLATE_ROLES)[number];
export type ClientTemplateAssetType = (typeof CLIENT_TEMPLATE_ASSET_TYPES)[number];
export type ClientAttributeDataType =
  'text' | 'number' | 'boolean' | 'date' | 'enum' | 'measurement';
export type ClientAttributeSourceAuthority = 'pim' | 'erp' | 'supplier' | 'calculated';
export type ClientAttributeValue = string | number | boolean;

export interface ClientTemplateManifest {
  readonly version: number;
  readonly source: {
    readonly fileName: string;
    readonly sha256: string;
    readonly sheetCount: number;
    readonly templateCount: number;
    readonly productCount: number;
  };
  readonly categories: readonly ClientManifestCategory[];
  readonly definitions: readonly ClientManifestDefinition[];
  readonly templates: readonly ClientManifestTemplate[];
  readonly relations: {
    readonly oem: readonly ClientManifestOemRelation[];
    readonly homologs: readonly ClientManifestHomologRelation[];
    readonly applications: readonly ClientManifestApplicationRelation[];
  };
}

export interface ClientManifestCategory {
  readonly excelRow: number;
  readonly number: string | null;
  readonly name: string;
  readonly slug: string;
  readonly application: string | null;
  readonly sourcePriority: Readonly<
    Partial<Record<'tecdoc' | 'fabricante' | 'archivo' | 'manual', number>>
  >;
  readonly defined: boolean;
  readonly templateSheet: string | null;
}

export interface ClientManifestDefinition {
  readonly key: string;
  readonly label: string;
  readonly dataType: ClientAttributeDataType;
  readonly unit: string | null;
  readonly sourceAuthority: ClientAttributeSourceAuthority;
}

export interface ClientManifestTemplateAttribute {
  readonly key: string;
  readonly required: boolean;
  readonly replicable: boolean;
  readonly searchable: boolean;
  readonly includeInTechnicalSheet: boolean;
  readonly roles: Readonly<
    Record<
      ClientTemplateRole,
      {
        readonly canView: boolean;
        readonly canEdit: boolean;
        readonly canImport: boolean;
        readonly canExport: boolean;
      }
    >
  >;
}

export interface ClientManifestTemplate {
  readonly sheet: string;
  readonly slug: string;
  readonly name: string;
  readonly application: string | null;
  readonly headerRow: number;
  readonly assets: readonly {
    readonly type: ClientTemplateAssetType;
    readonly required: boolean;
  }[];
  readonly attributes: readonly ClientManifestTemplateAttribute[];
  readonly products: readonly ClientManifestProduct[];
}

export interface ClientManifestProduct {
  readonly excelRow: number;
  readonly sku: string;
  readonly providerCode: string;
  readonly unifiedCode: string;
  readonly name: string;
  readonly line: string;
  readonly application: string;
  readonly brand: string;
  readonly values: Readonly<Record<string, ClientAttributeValue>>;
}

export interface ClientManifestOemRelation {
  readonly codigo_unificador: string;
  readonly codigo_oem: string | number;
  readonly marca: string;
}

export interface ClientManifestHomologRelation {
  readonly codigo_unificador: string;
  readonly codigo_homologo: string | number;
  readonly marca_homologo: string;
}

export interface ClientManifestApplicationRelation {
  readonly codigo_unificador: string;
  readonly marca_vehiculo: string;
  readonly modelo: string;
  readonly ano_desde?: number;
  readonly ano_hasta?: number;
  readonly area?: string;
  readonly subarea?: string;
}

const PRODUCT_FIELD_LIMITS = {
  sku: 64,
  providerCode: 120,
  unifiedCode: 120,
  name: 300,
  brand: 120,
} as const;

const RELATION_FIELD_LIMITS = {
  code: 160,
  brand: 160,
  applicationMake: 160,
  applicationModel: 200,
  applicationNotes: 2_000,
} as const;

const MIN_APPLICATION_YEAR = 1886;
const MAX_APPLICATION_YEAR = 2200;

/**
 * Generated, source-traceable input for local/test data only. Production catalogue data still
 * enters through the import/API boundaries; keeping the workbook outside the runtime avoids an
 * Excel parser dependency in the API container.
 */
export const CLIENT_TEMPLATE_MANIFEST =
  clientTemplateManifestJson as unknown as ClientTemplateManifest;

/** Fails fast when a regenerated manifest loses referential or type integrity. */
export function assertClientTemplateManifest(manifest: ClientTemplateManifest): void {
  if (manifest.version !== 1)
    throw new Error(`Unsupported client template manifest v${manifest.version}`);
  if (!/^[a-f0-9]{64}$/.test(manifest.source.sha256)) {
    throw new Error('Client template manifest source SHA-256 is invalid');
  }
  if (manifest.source.sheetCount < manifest.source.templateCount) {
    throw new Error('Client template manifest reports more templates than workbook sheets');
  }
  if (manifest.source.templateCount !== manifest.templates.length) {
    throw new Error('Client template manifest template count does not match its payload');
  }

  assertUnique(
    'category slugs',
    manifest.categories.map((category) => category.slug),
  );
  assertUnique(
    'template slugs',
    manifest.templates.map((template) => template.slug),
  );
  assertUnique(
    'template sheets',
    manifest.templates.map((template) => template.sheet),
  );
  assertUnique(
    'attribute definition keys',
    manifest.definitions.map((definition) => definition.key),
  );

  const definitions = new Map(
    manifest.definitions.map((definition) => [definition.key, definition]),
  );
  const categories = new Map(manifest.categories.map((category) => [category.slug, category]));
  const allProducts = manifest.templates.flatMap((template) => template.products);
  const unifiedCodes = new Set(allProducts.map((product) => product.unifiedCode));

  assertUnique(
    'product SKUs',
    allProducts.map((product) => product.sku),
  );
  if (manifest.source.productCount !== allProducts.length) {
    throw new Error('Client template manifest product count does not match its payload');
  }

  for (const category of manifest.categories) {
    if (category.defined !== (category.templateSheet !== null)) {
      throw new Error(`Category ${category.slug} has an inconsistent template state`);
    }
    const priorities = Object.values(category.sourcePriority);
    if (
      priorities.some((priority) => !Number.isInteger(priority) || priority < 1 || priority > 4) ||
      new Set(priorities).size !== priorities.length
    ) {
      throw new Error(`Category ${category.slug} has invalid source priorities`);
    }
  }

  for (const template of manifest.templates) {
    const category = categories.get(template.slug);
    if (!category?.defined || category.templateSheet !== template.sheet) {
      throw new Error(`Template ${template.slug} is not linked to its defined category`);
    }
    assertUnique(
      `attribute keys in template ${template.slug}`,
      template.attributes.map((attribute) => attribute.key),
    );
    assertUnique(
      `asset types in template ${template.slug}`,
      template.assets.map((asset) => asset.type),
    );
    for (const asset of template.assets) {
      if (!CLIENT_TEMPLATE_ASSET_TYPES.includes(asset.type)) {
        throw new Error(`Template ${template.slug} has unsupported asset type ${asset.type}`);
      }
    }

    const templateAttributeKeys = new Set(template.attributes.map((attribute) => attribute.key));
    for (const attribute of template.attributes) {
      if (!definitions.has(attribute.key)) {
        throw new Error(`Template ${template.slug} references unknown attribute ${attribute.key}`);
      }
      for (const role of CLIENT_TEMPLATE_ROLES) {
        const access = attribute.roles[role];
        if (!access) throw new Error(`Template ${template.slug} omits role ${role}`);
        if (!access.canView && (access.canEdit || access.canImport || access.canExport)) {
          throw new Error(
            `Template ${template.slug}/${attribute.key}/${role} grants actions without visibility`,
          );
        }
      }
    }

    for (const product of template.products) {
      assertRequiredText(
        product.sku,
        `Product in template ${template.slug} has an invalid SKU`,
        PRODUCT_FIELD_LIMITS.sku,
      );
      assertRequiredText(
        product.providerCode,
        `Product ${product.sku} has an invalid provider code`,
        PRODUCT_FIELD_LIMITS.providerCode,
      );
      assertRequiredText(
        product.unifiedCode,
        `Product ${product.sku} has an invalid unified code`,
        PRODUCT_FIELD_LIMITS.unifiedCode,
      );
      assertRequiredText(
        product.name,
        `Product ${product.sku} has an invalid name`,
        PRODUCT_FIELD_LIMITS.name,
      );
      assertOptionalText(
        product.brand,
        `Product ${product.sku} has an invalid brand`,
        PRODUCT_FIELD_LIMITS.brand,
      );
      for (const [key, value] of Object.entries(product.values)) {
        if (!templateAttributeKeys.has(key)) {
          throw new Error(`Product ${product.sku} has non-applicable attribute ${key}`);
        }
        const definition = definitions.get(key);
        if (!definition || !valueMatchesType(value, definition.dataType)) {
          throw new Error(
            `Product ${product.sku} has an invalid ${definition?.dataType ?? 'unknown'} value for ${key}`,
          );
        }
      }
    }
  }

  assertUnique(
    'product provider codes',
    allProducts.map((product) => product.providerCode.trim()),
  );

  for (const relation of [
    ...manifest.relations.oem,
    ...manifest.relations.homologs,
    ...manifest.relations.applications,
  ]) {
    if (!unifiedCodes.has(relation.codigo_unificador)) {
      throw new Error(`Relation references unknown unified code ${relation.codigo_unificador}`);
    }
  }

  const applicationTypeByUnifiedCode = new Map<string, string>();
  for (const relation of manifest.relations.applications) {
    const types = [
      ...new Set(
        allProducts
          .filter((product) => product.unifiedCode === relation.codigo_unificador)
          .map((product) => product.values.tipo_aplicacion)
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .map((value) => value.trim().toUpperCase()),
      ),
    ];
    const [applicationType] = types;
    if (
      types.length !== 1 ||
      (applicationType !== 'AUTOMOTRIZ' && applicationType !== 'INDUSTRIAL')
    ) {
      throw new Error(
        `Application relation ${relation.codigo_unificador} requires one valid AUTOMOTRIZ/INDUSTRIAL application type`,
      );
    }
    applicationTypeByUnifiedCode.set(relation.codigo_unificador, applicationType);
  }

  for (const relation of manifest.relations.oem) {
    assertRequiredText(
      relation.codigo_unificador,
      'OEM relation has an invalid unified code',
      PRODUCT_FIELD_LIMITS.unifiedCode,
    );
    assertRelationCode(relation.codigo_oem, 'OEM relation has an invalid OEM code');
    assertRequiredText(
      relation.marca,
      'OEM relation has an invalid brand',
      RELATION_FIELD_LIMITS.brand,
    );
  }
  assertUnique(
    'OEM relation natural keys',
    manifest.relations.oem.map((relation) =>
      naturalKey(relation.codigo_unificador, relation.codigo_oem),
    ),
  );

  for (const relation of manifest.relations.homologs) {
    assertRequiredText(
      relation.codigo_unificador,
      'Homolog relation has an invalid unified code',
      PRODUCT_FIELD_LIMITS.unifiedCode,
    );
    assertRelationCode(relation.codigo_homologo, 'Homolog relation has an invalid homolog code');
    assertRequiredText(
      relation.marca_homologo,
      'Homolog relation has an invalid homolog brand',
      RELATION_FIELD_LIMITS.brand,
    );
  }
  assertUnique(
    'homolog relation natural keys',
    manifest.relations.homologs.map((relation) =>
      naturalKey(relation.codigo_unificador, relation.codigo_homologo, relation.marca_homologo),
    ),
  );

  for (const relation of manifest.relations.applications) {
    assertRequiredText(
      relation.codigo_unificador,
      'Application relation has an invalid unified code',
      PRODUCT_FIELD_LIMITS.unifiedCode,
    );
    assertRequiredText(
      relation.marca_vehiculo,
      `Application relation ${relation.codigo_unificador} has an invalid make`,
      RELATION_FIELD_LIMITS.applicationMake,
    );
    assertRequiredText(
      relation.modelo,
      `Application relation ${relation.codigo_unificador} has an invalid model`,
      RELATION_FIELD_LIMITS.applicationModel,
    );
    assertApplicationYear(relation.ano_desde, 'ano_desde', relation.codigo_unificador);
    assertApplicationYear(relation.ano_hasta, 'ano_hasta', relation.codigo_unificador);
    if (
      relation.ano_desde !== undefined &&
      relation.ano_hasta !== undefined &&
      relation.ano_desde > relation.ano_hasta
    ) {
      throw new Error(
        `Application relation ${relation.codigo_unificador} has ano_desde after ano_hasta`,
      );
    }
    assertOptionalText(
      relation.area ?? '',
      `Application relation ${relation.codigo_unificador} has an invalid area`,
      RELATION_FIELD_LIMITS.applicationNotes,
    );
    assertOptionalText(
      relation.subarea ?? '',
      `Application relation ${relation.codigo_unificador} has an invalid subarea`,
      RELATION_FIELD_LIMITS.applicationNotes,
    );
    const notes = [
      relation.area ? `Área: ${relation.area}` : null,
      relation.subarea ? `Subárea: ${relation.subarea}` : null,
    ]
      .filter((value): value is string => value !== null)
      .join(' · ');
    if (notes.length > RELATION_FIELD_LIMITS.applicationNotes) {
      throw new Error(
        `Application relation ${relation.codigo_unificador} notes exceed ${RELATION_FIELD_LIMITS.applicationNotes} characters`,
      );
    }
  }
  assertUnique(
    'application relation natural keys',
    manifest.relations.applications.map((relation) =>
      naturalKey(
        relation.codigo_unificador,
        applicationTypeByUnifiedCode.get(relation.codigo_unificador) ?? '',
        relation.marca_vehiculo,
        relation.modelo,
        relation.ano_desde ?? 0,
        relation.ano_hasta ?? 0,
        '',
      ),
    ),
  );
}

function valueMatchesType(value: ClientAttributeValue, dataType: ClientAttributeDataType): boolean {
  if (dataType === 'number' || dataType === 'measurement') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  if (dataType === 'boolean') return typeof value === 'boolean';
  return typeof value === 'string';
}

function assertRequiredText(
  value: unknown,
  field: string,
  maximum: number,
): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field}: a non-blank string is required`);
  }
  if (value.length > maximum) {
    throw new Error(`${field}: must contain at most ${maximum} characters`);
  }
}

function assertOptionalText(
  value: unknown,
  field: string,
  maximum: number,
): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${field}: a string is required`);
  if (value.length > maximum) {
    throw new Error(`${field}: must contain at most ${maximum} characters`);
  }
}

function assertRelationCode(value: unknown, field: string): void {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`${field}: a string or finite number is required`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`${field}: a string or finite number is required`);
  }
  assertRequiredText(String(value), field, RELATION_FIELD_LIMITS.code);
}

function assertApplicationYear(value: unknown, field: string, unifiedCode: string): void {
  if (value === undefined) return;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_APPLICATION_YEAR ||
    value > MAX_APPLICATION_YEAR
  ) {
    throw new Error(
      `Application relation ${unifiedCode} has invalid ${field}; expected an integer from ${MIN_APPLICATION_YEAR} to ${MAX_APPLICATION_YEAR}`,
    );
  }
}

function naturalKey(...values: readonly (string | number)[]): string {
  return JSON.stringify(values.map((value) => String(value).trim().toLocaleLowerCase('es')));
}

function assertUnique(resource: string, values: readonly string[]): void {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    throw new Error(
      `Client template manifest has duplicate ${resource}: ${[...new Set(duplicates)].join(', ')}`,
    );
  }
}

assertClientTemplateManifest(CLIENT_TEMPLATE_MANIFEST);
