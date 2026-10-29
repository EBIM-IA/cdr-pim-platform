import { Inject, Injectable } from '@nestjs/common';
import type {
  ProductExperienceDto,
  ProductNameConfig,
  ProductNameSettingsDto,
  ProductVariantSearchDto,
} from '@cdr/contracts';
import {
  type Clock,
  type Uuid,
  ConflictError,
  NotFoundError,
  assertUuid,
  getCorrelationId,
  newUuid,
} from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import { createAuditEntry } from '../../audit/domain/entities/audit-entry';
import type { GroupApplication } from '../../applications/domain/entities/group-application';
import {
  GROUP_APPLICATION_REPOSITORY,
  type GroupApplicationRepositoryPort,
} from '../../applications/domain/ports/group-application-repository.port';
import {
  PRODUCT_REPOSITORY,
  type ProductRepositoryPort,
} from '../../catalog/domain/ports/product-repository.port';
import type { Product } from '../../catalog/domain/entities/product';
import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import type { CatalogWorkbookProduct, TemplateAttribute } from '../domain/entities/catalog-schema';
import {
  DYNAMIC_CATALOG_REPOSITORY,
  type DynamicCatalogRepositoryPort,
} from '../domain/ports/dynamic-catalog.repository.port';
import {
  PRODUCT_NAME_SETTINGS,
  type ProductNameSettingsPort,
} from '../domain/ports/product-name-settings.port';
import {
  filterSalesVariants,
  generalProductName,
  productVariants,
  type ProductNamingContext,
} from '../domain/services/product-naming';
import { catalogBusinessRoles } from './catalog-business-roles';

type VisibleAttributes = ProductNamingContext['attributes'];
type ActiveCategories = Awaited<ReturnType<DynamicCatalogRepositoryPort['listActiveCategories']>>;
type ProductSheet = Awaited<ReturnType<DynamicCatalogRepositoryPort['getProductSheet']>>;

@Injectable()
export class ProductNamingUseCases {
  constructor(
    @Inject(PRODUCT_NAME_SETTINGS) private readonly settings: ProductNameSettingsPort,
    @Inject(DYNAMIC_CATALOG_REPOSITORY) private readonly catalog: DynamicCatalogRepositoryPort,
    @Inject(GROUP_APPLICATION_REPOSITORY)
    private readonly applications: GroupApplicationRepositoryPort,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  getSettings(): Promise<ProductNameSettingsDto> {
    return this.settings.get();
  }

  async saveSettings(
    input: ProductNameSettingsDto,
    actor: AuthenticatedActor,
  ): Promise<ProductNameSettingsDto> {
    const previous = await this.settings.get();
    // The audit's before value must describe precisely the version being replaced.
    if (previous.version !== input.version)
      throw new ConflictError(
        'Otra persona cambió las fórmulas. Recarga la configuración antes de guardar.',
      );
    return this.settings.save(
      input,
      createAuditEntry({
        resourceType: 'product_name_settings',
        resourceId: 'product-name',
        action: 'updated',
        actorId: actor.id,
        source: 'api:product-name-settings',
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt: this.clock.now(),
        changes: { nombre_amigable: { before: previous.config, after: input.config } },
      }),
    );
  }

  async experience(
    productId: string,
    actor: AuthenticatedActor,
    draft?: ProductNameConfig,
  ): Promise<ProductExperienceDto> {
    const id = assertUuid(productId, 'productId');
    const roles = catalogBusinessRoles(actor);
    const [product, sheet, settings, applications, categories, fieldCatalog] = await Promise.all([
      this.products.findById(id),
      this.catalog.getProductSheet(id, roles),
      this.settings.get(),
      this.applications.list({ productId: id, includeInactive: false }),
      this.catalog.listActiveCategories(roles),
      // A draft's field picker includes the visible union of templates, as the formula is global.
      draft ? this.catalog.listWorkbook({ roles, page: 1, pageSize: 1, filters: [] }) : undefined,
    ]);
    if (!product) throw new NotFoundError('Product', productId);
    const columns = sheet?.schema.attributes ?? [];
    const ctx = sheetContext(product, sheet, categories, applications);
    const config = draft ?? settings.config;
    return {
      nombreGeneral: generalProductName(ctx, config),
      variants: productVariants(ctx, config),
      fields: namingFields(fieldCatalog?.columns ?? columns),
    };
  }

  async search(
    query: { q: string; limit: number },
    actor: AuthenticatedActor,
  ): Promise<ProductVariantSearchDto> {
    const roles = catalogBusinessRoles(actor);
    // The workbook supplies authorized values in bulk. No product sheet or aggregate is read per hit.
    const [result, settings, categories, exact] = await Promise.all([
      this.catalog.listWorkbook({ roles, page: 1, pageSize: 100, q: query.q, filters: [] }),
      this.settings.get(),
      this.catalog.listActiveCategories(roles),
      // The exact SKU must remain first even if an earlier alphabetic page has 100 partial matches.
      query.q.trim().length <= 64 ? this.products.findBySku(query.q.trim().toUpperCase()) : null,
    ]);
    const extraExact = exact && !result.items.some((item) => item.id === exact.id) ? exact : null;
    const [applications, exactSheet] = await Promise.all([
      this.applications.listForProducts([
        ...result.items.map((item) => item.id),
        ...(extraExact ? [extraExact.id] : []),
      ]),
      extraExact ? this.catalog.getProductSheet(extraExact.id, roles) : null,
    ]);
    const contexts = result.items.map((item) =>
      workbookContext(item, result.columns, categories, applications.get(item.id) ?? []),
    );
    if (extraExact)
      contexts.unshift(
        sheetContext(extraExact, exactSheet, categories, applications.get(extraExact.id) ?? []),
      );
    const variants = filterSalesVariants(
      contexts.flatMap((ctx) => productVariants(ctx, settings.config)),
      query.q,
      contexts,
    );
    return {
      items: variants.slice(0, query.limit),
      totalProducts: result.total,
      categories: [
        ...new Map(
          result.items.flatMap((item) =>
            item.category ? [[item.category.id, item.category] as const] : [],
          ),
        ).values(),
      ].slice(0, 3),
      brands: [...new Set(result.items.flatMap((item) => (item.brand ? [item.brand] : [])))].slice(
        0,
        3,
      ),
      truncated: result.total > result.items.length || variants.length > query.limit,
    };
  }
}

function readAttribute(
  attributes: VisibleAttributes,
  keys: readonly string[],
): string | number | boolean | undefined {
  return (
    keys
      .map((key) => attributes[key])
      .find((value) => value !== null && value !== undefined && value !== '') ?? undefined
  );
}

function categoryPath(
  category: { readonly id: Uuid; readonly name: string } | null | undefined,
  categories: ActiveCategories,
  attributes: VisibleAttributes,
): string[] {
  const assigned = category ? categories.find((item) => item.id === category.id) : undefined;
  if (assigned)
    return [...(assigned.ancestors ?? []).map((ancestor) => ancestor.name), assigned.name];
  const path = [
    ['categoria_n1', 'categoriaN1'],
    ['categoria_n2', 'categoriaN2'],
    ['categoria_n3', 'categoriaN3'],
  ].map((keys) => String(readAttribute(attributes, keys) ?? ''));
  return path.some(Boolean) ? path : category ? [category.name] : [];
}

function workbookContext(
  item: CatalogWorkbookProduct,
  columns: readonly TemplateAttribute[],
  categories: ActiveCategories,
  applications: readonly GroupApplication[],
): ProductNamingContext {
  const attributes: VisibleAttributes = Object.fromEntries(
    columns.flatMap((column) => {
      const cell = item.attributes[column.key];
      return cell?.applicable ? [[column.key, cell.value]] : [];
    }),
  );
  const snapshots = applications.map((app) => app.toSnapshot());
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    brand: item.brand ?? '',
    providerCode: item.providerCode ?? '',
    unifiedCode: item.unifiedCode ?? snapshots[0]?.unifiedCode ?? '',
    category: categoryPath(item.category, categories, attributes),
    template: item.template?.name ?? '',
    applicationType: String(
      readAttribute(attributes, [
        'tipo_aplicacion',
        'tipoAplicacion',
        'tipo_de_aplicacion',
        'application_type',
      ]) ?? item.applicationTypes.join(' e '),
    ),
    attributes,
    applications: snapshots.filter((app) => app.vehicleType !== 'INDUSTRIAL'),
  };
}

function namingFields(columns: readonly TemplateAttribute[]): ProductExperienceDto['fields'] {
  const fields = [
    ...['name', 'n1', 'n2', 'n3'].map((key) => ({
      field: `category:${key}`,
      label:
        key === 'name'
          ? 'Nombre de categoría (N2 + N3 con regla)'
          : `Categoría ${key.toUpperCase()}`,
      group: 'Categoría',
    })),
    { field: 'template:name', label: 'Nombre de plantilla', group: 'Categoría' },
    ...[
      ['codigoArticulo', 'Código de artículo'],
      ['codigoProveedor', 'Código de proveedor'],
      ['codigoUnificador', 'Código unificador'],
      ['marca', 'Marca'],
      ['tipoAplicacion', 'Tipo de aplicación'],
    ].map(([field, label]) => ({ field: `erp:${field}`, label: label!, group: 'Datos base ERP' })),
    ...columns.map((column) => ({
      field: `${column.sourceAuthority === 'erp' ? 'erp' : 'attribute'}:${column.key}`,
      label: column.label,
      group: column.sourceAuthority === 'erp' ? 'Datos base ERP' : 'Atributos de plantilla',
    })),
    ...[
      ['make', 'Marca del vehículo'],
      ['model', 'Modelo'],
      ['yearFrom', 'Año desde'],
      ['yearTo', 'Año hasta'],
      ['area', 'Área'],
      ['subarea', 'Subárea'],
      ['bodyStyle', 'Tipo'],
      ['fuel', 'Combustible'],
      ['traction', 'Tracción'],
      ['displacement', 'Cilindraje'],
      ['engine', 'Motor'],
    ].map(([field, label]) => ({
      field: `application:${field}`,
      label: label!,
      group: 'Aplicación (vehículo)',
    })),
  ];
  return [...new Map(fields.map((field) => [field.field, field])).values()];
}

function sheetContext(
  product: Product,
  sheet: ProductSheet,
  categories: ActiveCategories,
  applications: readonly GroupApplication[],
): ProductNamingContext {
  const columns = sheet?.schema.attributes ?? [];
  const attributes: VisibleAttributes = Object.fromEntries(
    columns.map((column) => [column.key, sheet?.product.attributes[column.key]?.value ?? null]),
  );
  const read = (...keys: string[]) => readAttribute(attributes, keys);
  const snapshots = applications.map((app) => app.toSnapshot());
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    brand: product.brand ?? '',
    providerCode: String(
      read('codigo_proveedor', 'codigoProveedor') ??
        product.identifiers.find((item) => item.type === 'manufacturer_part_number')?.value ??
        '',
    ),
    unifiedCode: String(
      read('codigo_unificador', 'codigoUnificador') ?? snapshots[0]?.unifiedCode ?? '',
    ),
    category: categoryPath(sheet?.schema.category, categories, attributes),
    template: sheet?.schema.template.name ?? '',
    applicationType: String(
      read('tipo_aplicacion', 'tipoAplicacion', 'tipo_de_aplicacion', 'application_type') ??
        [...new Set(snapshots.flatMap((app) => (app.vehicleType ? [app.vehicleType] : [])))].join(
          ' e ',
        ),
    ),
    attributes,
    applications: snapshots.filter((app) => app.vehicleType !== 'INDUSTRIAL'),
  };
}
