import { Inject, Injectable } from '@nestjs/common';
import type { Uuid } from '@cdr/shared';

import {
  APPLICATION_SEARCH_READ_MODEL,
  type ApplicationSearchReadModelPort,
} from '../../../applications/domain/ports/application-search-read-model.port';
import {
  GROUP_APPLICATION_REPOSITORY,
  type GroupApplicationRepositoryPort,
} from '../../../applications/domain/ports/group-application-repository.port';
import {
  DYNAMIC_CATALOG_REPOSITORY,
  type DynamicCatalogRepositoryPort,
} from '../../../catalog-schema/domain/ports/dynamic-catalog.repository.port';
import type { CatalogGridProduct } from '../../../catalog-schema/domain/entities/catalog-schema';
import {
  PRODUCT_REPOSITORY,
  type ProductRepositoryPort,
} from '../../../catalog/domain/ports/product-repository.port';
import {
  EQUIVALENCE_GROUP_REPOSITORY,
  type EquivalenceGroupRepositoryPort,
} from '../../../equivalences/domain/ports/equivalence-group-repository.port';
import {
  EXTERNAL_HOMOLOG_REPOSITORY,
  type ExternalHomologRepositoryPort,
} from '../../../equivalences/domain/ports/external-homolog-repository.port';
import {
  GROUP_OEM_CODE_REPOSITORY,
  type GroupOemCodeRepositoryPort,
} from '../../../equivalences/domain/ports/group-oem-code-repository.port';
import type { ProductSearchReadModelPort } from '../../domain/ports/product-search-read-model.port';
import type { VectorSearchHit } from '../../domain/ports/product-vector-index.port';

const BUSINESS_ROLE_ALIASES: Readonly<Record<string, string>> = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  COMPRAS: 'COMPRAS',
  VENTAS: 'VENTAS',
  ADMIN: 'ADMINISTRADOR',
  EDITOR: 'COMPRAS',
  VIEWER: 'VENTAS',
};
const ALL_BUSINESS_ROLES = ['ADMINISTRADOR', 'COMPRAS', 'VENTAS'] as const;

/**
 * Search-owned read model assembled only through ports published by the data owners.
 * This is intentionally not a SQL mega-query over tables from several bounded contexts.
 */
@Injectable()
export class CompositeProductSearchReadModel implements ProductSearchReadModelPort {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    @Inject(DYNAMIC_CATALOG_REPOSITORY)
    private readonly catalog: DynamicCatalogRepositoryPort,
    @Inject(APPLICATION_SEARCH_READ_MODEL)
    private readonly applicationSearch: ApplicationSearchReadModelPort,
    @Inject(GROUP_APPLICATION_REPOSITORY)
    private readonly applications: GroupApplicationRepositoryPort,
    @Inject(EQUIVALENCE_GROUP_REPOSITORY)
    private readonly groups: EquivalenceGroupRepositoryPort,
    @Inject(EXTERNAL_HOMOLOG_REPOSITORY)
    private readonly homologs: ExternalHomologRepositoryPort,
    @Inject(GROUP_OEM_CODE_REPOSITORY)
    private readonly oemCodes: GroupOemCodeRepositoryPort,
  ) {}

  async findDeterministic(input: {
    query: string;
    roles: readonly string[];
    limit: number;
  }): Promise<VectorSearchHit[]> {
    const roles = normalizeRoles(input.roles);
    const categories = await this.catalog.listActiveCategories(roles);
    const [baseResult, gridsResult, applicationResult, homologResult, oemResult] =
      await Promise.allSettled([
        this.products.list({ page: 1, pageSize: input.limit, q: input.query }),
        Promise.allSettled(
          categories.map((category) =>
            this.catalog.listGrid({
              categoryId: category.id,
              roles,
              page: 1,
              pageSize: input.limit,
              q: input.query,
              filters: [],
            }),
          ),
        ),
        this.applicationSearch.findActiveProductIds(input.query, input.limit),
        this.homologs.searchEligible(input.query),
        this.oemCodes.searchEligible(input.query),
      ]);

    const base = baseResult.status === 'fulfilled' ? baseResult.value.items : [];
    const grids =
      gridsResult.status === 'fulfilled'
        ? gridsResult.value.flatMap((result) =>
            result.status === 'fulfilled' ? [result.value] : [],
          )
        : [];
    const applicationProductIds =
      applicationResult.status === 'fulfilled' ? applicationResult.value : [];
    const homologMatches = homologResult.status === 'fulfilled' ? homologResult.value : [];
    const oemMatches = oemResult.status === 'fulfilled' ? oemResult.value : [];

    const hits = new Map<Uuid, VectorSearchHit>();
    const add = (product: { id: Uuid; sku: string; name: string }) => {
      if (hits.size >= input.limit || hits.has(product.id)) return;
      hits.set(product.id, {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        score: 1,
      });
    };

    for (const product of base) add(product);
    for (const grid of grids) for (const product of grid.items) add(product);
    const applicationProducts = await Promise.allSettled(
      applicationProductIds.map((productId) => this.products.findById(productId)),
    );
    for (const productResult of applicationProducts) {
      if (productResult.status === 'fulfilled' && productResult.value) add(productResult.value);
    }
    for (const match of homologMatches) for (const product of match.products) add(product);
    for (const match of oemMatches) for (const product of match.products) add(product);

    return [...hits.values()];
  }

  async documentParts(productId: Uuid): Promise<readonly string[]> {
    const [attributeParts, groups, applications] = await Promise.all([
      this.universallyVisibleAttributeParts(productId),
      this.groups.findByProductId(productId),
      this.applications.list({ productId, includeInactive: false }),
    ]);

    const relationParts = applications.map((application) => {
      const value = application.toSnapshot();
      return [
        value.vehicleType,
        value.make,
        value.model,
        value.yearFrom,
        value.yearTo,
        value.engine,
        value.notes,
      ]
        .filter((part) => part !== null)
        .join(' ');
    });

    for (const group of groups) {
      const [homologs, oemCodes] = await Promise.all([
        this.homologs.list(group.code, false),
        this.oemCodes.list({ unifiedCode: group.code, includeInactive: false }),
      ]);
      relationParts.push(group.code, group.name);
      relationParts.push(
        ...homologs
          .filter((homolog) => homolog.eligibleForSearch)
          .flatMap((homolog) => {
            const value = homolog.toSnapshot();
            return [value.externalCode, value.externalBrand];
          }),
      );
      relationParts.push(
        ...oemCodes
          .filter((oem) => oem.eligibleForSearch)
          .flatMap((oem) => {
            const value = oem.toSnapshot();
            return [value.oemCode, ...value.brands];
          }),
      );
    }

    return [...new Set([...attributeParts, ...relationParts].map((part) => part.trim()))]
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'es'));
  }

  private async universallyVisibleAttributeParts(productId: Uuid): Promise<string[]> {
    const sheets = await Promise.all(
      ALL_BUSINESS_ROLES.map((role) => this.catalog.getProductSheet(productId, [role])),
    );
    if (sheets.some((sheet) => sheet === null)) return [];

    const completeSheets = sheets.filter(
      (sheet): sheet is NonNullable<typeof sheet> => sheet !== null,
    );
    const [first, ...rest] = completeSheets;
    if (!first) return [];

    return first.schema.attributes
      .filter(
        (attribute) =>
          attribute.searchable &&
          rest.every((sheet) =>
            sheet.schema.attributes.some(
              (candidate) => candidate.key === attribute.key && candidate.searchable,
            ),
          ),
      )
      .flatMap((attribute) => {
        const cell = first.product.attributes[attribute.key];
        if (!cell || cell.value === null) return [];
        return [`${attribute.label}: ${formatAttributeValue(cell.value, attribute.unit)}`];
      });
  }
}

function normalizeRoles(roles: readonly string[]): string[] {
  return [
    ...new Set(
      roles.map((role) => BUSINESS_ROLE_ALIASES[role]).filter((role): role is string => !!role),
    ),
  ];
}

function formatAttributeValue(
  value: CatalogGridProduct['attributes'][string]['value'],
  unit: string | null,
): string {
  return `${String(value)}${unit ? ` ${unit}` : ''}`;
}
