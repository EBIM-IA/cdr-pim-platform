import type { ProductNameConfig, ProductNameToken, ProductSalesVariantDto } from '@cdr/contracts';

export interface NamingApplication {
  readonly id: string;
  readonly make: string | null;
  readonly model: string | null;
  readonly bodyStyle: string | null;
  readonly fuel: string | null;
  readonly traction: string | null;
  readonly displacement: string | null;
  readonly yearFrom: number | null;
  readonly yearTo: number | null;
  readonly area: string | null;
  readonly subarea: string | null;
  readonly engine: string | null;
}

export interface ProductNamingContext {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly brand: string;
  readonly providerCode: string;
  readonly unifiedCode: string;
  readonly category: readonly string[];
  readonly template: string;
  readonly applicationType: string;
  /** Only values visible to the requesting actor may enter the naming engine. */
  readonly attributes: Readonly<Record<string, string | number | boolean | null>>;
  readonly applications: readonly NamingApplication[];
}

const token = (field: string, before = ''): ProductNameToken => ({
  field,
  before,
  after: '',
  format: 'auto',
});

export const DEFAULT_PRODUCT_NAME_CONFIG: ProductNameConfig = {
  enabled: true,
  mixedMode: 'applications',
  maxApplications: 1,
  moreApplications: false,
  automotive: [
    token('category:name'),
    token('erp:marca', 'Marca'),
    token('application:subarea', 'Para'),
    token('application:make', 'de'),
    token('application:model'),
    token('application:yearFrom'),
    token('application:yearTo', '-'),
  ],
  industrial: [token('erp:codigoProveedor'), token('category:name'), token('erp:marca')],
};

export const normalizeProductText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('es');

export function categoryDisplayName(path: readonly string[]): string {
  const n2 = (path[1] ?? (path.length === 1 ? path[0] : '') ?? '').trim();
  const n3 = (path[2] ?? '').trim();
  const a = normalizeProductText(n2),
    b = normalizeProductText(n3);
  if (!n3 || a === b) return n2;
  if (
    !n2 ||
    /^(herramienta (manual|electrica|hidraulica)|accesorios|direccion|embrague|partes de reductores|cajeras)$/u.test(
      a,
    ) ||
    b.includes(a)
  )
    return n3;
  return `${n2} ${n3}`;
}

function fieldValue(field: string, ctx: ProductNamingContext, app?: NamingApplication): string {
  const [namespace, key = ''] = field.split(':');
  let value: unknown;
  if (namespace === 'category')
    value =
      key === 'name' ? categoryDisplayName(ctx.category) : ctx.category[Number(key.slice(1)) - 1];
  else if (namespace === 'template') value = ctx.template;
  else if (namespace === 'application') value = app?.[key as keyof NamingApplication];
  else if (namespace === 'erp') {
    const baseFields: Readonly<Record<string, string>> = {
      codigoArticulo: ctx.sku,
      codigoProveedor: ctx.providerCode,
      codigoUnificador: ctx.unifiedCode,
      marca: ctx.brand,
      tipoAplicacion: ctx.applicationType,
    };
    value = Object.hasOwn(baseFields, key) ? baseFields[key] : ownAttributeValue(ctx, key);
  } else if (namespace === 'attribute') value = ownAttributeValue(ctx, key);
  return value === null || value === undefined ? '' : String(value).trim();
}

function ownAttributeValue(
  ctx: ProductNamingContext,
  key: string,
): string | number | boolean | null | undefined {
  // A missing configured field must not resolve to Object.prototype (constructor, toString, etc.).
  return Object.hasOwn(ctx.attributes, key) ? ctx.attributes[key] : undefined;
}

function formatValue(value: string, tk: ProductNameToken): string {
  const format =
    tk.format === 'auto'
      ? /^erp:codigo|^application:(yearFrom|yearTo|engine)$/u.test(tk.field)
        ? 'original'
        : /^(erp:marca|application:(make|model))$/u.test(tk.field)
          ? 'title'
          : 'lower'
      : tk.format;
  if (format === 'original') return value;
  if (format === 'upper') return value.toLocaleUpperCase('es');
  if (format === 'lower') return value.toLocaleLowerCase('es');
  return value
    .toLocaleLowerCase('es')
    .replace(
      /(^|[\s\-/(])([a-záéíóúñü])/gu,
      (_m, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase('es'),
    )
    .replace(/[a-z0-9]*\d[a-z0-9]*/giu, (word) => word.toUpperCase());
}

function joinTokens(
  tokens: readonly ProductNameToken[],
  ctx: ProductNamingContext,
  app?: NamingApplication,
): string {
  return tokens.reduce((text, tk) => {
    const raw = fieldValue(tk.field, ctx, app);
    // Missing fields omit their affixes too; zero and false are valid values.
    if (!raw) return text;
    const before = tk.before.trim(),
      after = tk.after.trim();
    const prefix =
      before && /^[-–/·,.:;)]$/u.test(before)
        ? before
        : `${text ? ' ' : ''}${before ? `${before} ` : ''}`;
    return `${text}${prefix}${formatValue(raw, tk)}${after ? ` ${after}` : ''}`;
  }, '');
}

function compose(
  tokens: readonly ProductNameToken[],
  ctx: ProductNamingContext,
  apps: readonly NamingApplication[],
  maxApplications: number,
  moreApplications: boolean,
): string {
  const first = tokens.findIndex((tk) => tk.field.startsWith('application:'));
  if (first < 0) return joinTokens(tokens, ctx);
  const last = tokens.findLastIndex((tk) => tk.field.startsWith('application:'));
  const segment = tokens.slice(first, last + 1);
  let applicationText = joinTokens(segment, ctx, apps[0]);
  // Shared area/subarea and product text appear once; additional vehicles repeat only their identity.
  const vehicleTokens = segment.filter((tk) =>
    /^application:(make|model|bodyStyle|fuel|traction|engine|yearFrom|yearTo)$/u.test(tk.field),
  );
  const extras = apps
    .slice(1, maxApplications)
    .map((app) =>
      joinTokens(
        vehicleTokens.map((tk, index) => (index === 0 ? { ...tk, before: '' } : tk)),
        ctx,
        app,
      ),
    )
    .filter(Boolean);
  const remaining = apps.length - Math.min(maxApplications, apps.length);
  if (moreApplications && remaining > 0)
    extras.push(`${remaining} modelo${remaining === 1 ? '' : 's'} más`);
  if (applicationText && extras.length)
    applicationText +=
      extras.length === 1
        ? ` y ${extras[0]}`
        : `, ${extras.slice(0, -1).join(', ')} y ${extras.at(-1)}`;
  return [
    joinTokens(tokens.slice(0, first), ctx),
    applicationText,
    joinTokens(tokens.slice(last + 1), ctx),
  ]
    .filter(Boolean)
    .join(' ');
}

function finish(text: string, fallback: string): string {
  return (
    text
      .replace(/\s+/gu, ' ')
      .trim()
      .replace(
        /(^|\s)([a-záéíóúñü])([a-záéíóúñü]*)(?=\s|$)/iu,
        (_m, space: string, letter: string, rest: string) =>
          space + letter.toLocaleUpperCase('es') + rest,
      ) || fallback
  );
}

export function productVariants(
  ctx: ProductNamingContext,
  config: ProductNameConfig,
): ProductSalesVariantDto[] {
  const type = normalizeProductText(ctx.applicationType);
  const automotive = /automotri/u.test(type),
    industrial = /industrial/u.test(type);
  const choices: Array<{ tipo: 'automotriz' | 'industrial'; app?: NamingApplication }> = [];
  if (automotive || !industrial) {
    if (ctx.applications.length)
      choices.push(...ctx.applications.map((app) => ({ tipo: 'automotriz' as const, app })));
    else if (!industrial) choices.push({ tipo: 'automotriz' });
  }
  if (industrial || !choices.length) choices.push({ tipo: 'industrial' });
  return choices.map(({ tipo, app }) => ({
    productId: ctx.id,
    codigoArticulo: ctx.sku,
    nombreAmigable: config.enabled
      ? finish(
          compose(
            config[tipo === 'industrial' ? 'industrial' : 'automotive'],
            ctx,
            app ? [app] : [],
            1,
            false,
          ),
          ctx.sku,
        )
      : ctx.sku,
    tipo,
    marca: ctx.brand,
    codigoProveedor: ctx.providerCode,
    codigoUnificador: ctx.unifiedCode,
    aplicacion: app
      ? {
          id: app.id,
          marcaVehiculo: app.make ?? '',
          modelo: app.model ?? '',
          tipo: app.bodyStyle ?? '',
          combustible: app.fuel ?? '',
          traccion: app.traction ?? '',
          cilindraje: app.displacement ?? '',
          anioDesde: app.yearFrom,
          anioHasta: app.yearTo,
          area: app.area ?? '',
          subarea: app.subarea ?? '',
          motor: app.engine ?? '',
        }
      : null,
    ficha: `/products/${encodeURIComponent(ctx.id)}${tipo === 'industrial' ? '?uso=industrial' : app ? `?aplicacion=${encodeURIComponent(app.id)}` : ''}`,
  }));
}

export function generalProductName(ctx: ProductNamingContext, config: ProductNameConfig): string {
  if (!config.enabled) return ctx.sku;
  const type = normalizeProductText(ctx.applicationType);
  const mixed = /automotri/u.test(type) && /industrial/u.test(type);
  const automotive = mixed
    ? config.mixedMode === 'automotive' ||
      (config.mixedMode === 'applications' && ctx.applications.length > 0)
    : /automotri/u.test(type) || (!/industrial/u.test(type) && ctx.applications.length > 0);
  return finish(
    compose(
      config[automotive ? 'automotive' : 'industrial'],
      ctx,
      automotive ? ctx.applications : [],
      config.maxApplications,
      config.moreApplications,
    ),
    ctx.sku,
  );
}

/** Vehicle terms select the matching application of each SKU, never another vehicle of that SKU. */
export function filterSalesVariants(
  variants: readonly ProductSalesVariantDto[],
  query: string,
  contexts: readonly ProductNamingContext[] = [],
): ProductSalesVariantDto[] {
  const normalizedQuery = normalizeProductText(query).trim();
  const terms = [...new Set(normalizedQuery.split(/\s+/u).filter(Boolean))];
  const contextByProduct = new Map(contexts.map((ctx) => [ctx.id, ctx]));
  const byProduct = new Map<string, ProductSalesVariantDto[]>();
  for (const variant of variants) {
    const group = byProduct.get(variant.productId) ?? [];
    group.push(variant);
    byProduct.set(variant.productId, group);
  }
  const selected: Array<{ variant: ProductSalesVariantDto; vehicle: boolean }> = [];
  for (const group of byProduct.values()) {
    const base = group[0]!;
    const commonText = normalizeProductText(
      `${base.codigoArticulo} ${base.marca} ${base.codigoProveedor} ${base.codigoUnificador}`,
    );
    const vehicleText = (v: ProductSalesVariantDto) =>
      normalizeProductText(`${v.aplicacion?.marcaVehiculo ?? ''} ${v.aplicacion?.modelo ?? ''}`);
    // A product brand can also name a vehicle make (Toyota, Suzuki); that alone must not discard variants.
    const vehicleTerms = terms.filter(
      (term) =>
        !commonText.includes(term) &&
        group.some((v) => v.aplicacion && vehicleText(v).includes(term)),
    );
    const ctx = contextByProduct.get(base.productId);
    const sharedText = normalizeProductText(
      [
        commonText,
        ctx?.name ?? '',
        ctx?.category.join(' ') ?? '',
        ctx?.template ?? '',
        ctx?.applicationType ?? '',
        ...Object.values(ctx?.attributes ?? {}),
      ].join(' '),
    );
    const applicationText = (v: ProductSalesVariantDto) =>
      normalizeProductText(Object.values(v.aplicacion ?? {}).join(' '));
    // The workbook can match terms in distinct applications. Fuel, years, etc. must then
    // match the selected vehicle itself; product-wide visible values remain common to all variants.
    const applicationTerms = vehicleTerms.length
      ? terms.filter(
          (term) =>
            !sharedText.includes(term) &&
            group.some((v) => v.aplicacion && applicationText(v).includes(term)),
        )
      : [];
    for (const variant of group) {
      if (
        !vehicleTerms.length ||
        (variant.aplicacion &&
          vehicleTerms.every((term) => vehicleText(variant).includes(term)) &&
          applicationTerms.every((term) => applicationText(variant).includes(term)))
      ) {
        selected.push({ variant, vehicle: vehicleTerms.length > 0 });
      }
    }
  }
  return selected
    .sort(
      (a, b) =>
        Number(normalizeProductText(b.variant.codigoArticulo) === normalizedQuery) -
          Number(normalizeProductText(a.variant.codigoArticulo) === normalizedQuery) ||
        Number(b.vehicle) - Number(a.vehicle),
    )
    .map(({ variant }) => variant);
}
