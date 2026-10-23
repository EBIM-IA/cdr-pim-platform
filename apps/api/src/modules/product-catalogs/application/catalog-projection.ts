import type { ProductCatalogDto, ProductCatalogShareDto } from '@cdr/contracts';
import {
  catalogValidity,
  shareState,
  type CatalogWithShares,
  type ProductCatalog,
  type ProductCatalogShare,
} from '../domain/entities/product-catalog';
export function projectProductCatalog(record: CatalogWithShares, now: Date): ProductCatalogDto {
  const { catalog, shares } = record;
  const validity = catalogValidity(catalog, now);
  const expiring =
    catalog.validUntil &&
    (Date.parse(`${catalog.validUntil}T00:00:00Z`) -
      Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`)) /
      86400000 <=
      30;
  return {
    id: catalog.id,
    code: catalog.code,
    title: catalog.title,
    description: catalog.description,
    validFrom: catalog.validFrom,
    validUntil: catalog.validUntil,
    status: catalog.deletedAt
      ? 'Eliminado'
      : validity === 'scheduled'
        ? 'Programado'
        : validity === 'expired'
          ? 'Vencido'
          : expiring
            ? 'Por vencer'
            : 'Vigente',
    fileName: catalog.fileName,
    fileSize: catalog.fileSize,
    activeLinks: shares.filter((share) => shareState(share, catalog, now) === 'active').length,
    totalLinks: shares.length,
    createdBy: catalog.createdBy.email || catalog.createdBy.id,
    createdAt: catalog.createdAt.toISOString(),
    updatedBy: catalog.updatedBy.email || catalog.updatedBy.id,
    updatedAt: catalog.updatedAt.toISOString(),
    deletedAt: catalog.deletedAt?.toISOString() ?? null,
    deletedBy: catalog.deletedBy ? catalog.deletedBy.email || catalog.deletedBy.id : null,
  };
}
export function projectCatalogShare(
  share: ProductCatalogShare,
  catalog: ProductCatalog,
  now: Date,
): ProductCatalogShareDto {
  const state = shareState(share, catalog, now);
  return {
    id: share.id,
    term: share.term,
    note: share.note,
    expiresAt: share.expiresAt?.toISOString() ?? null,
    status:
      state === 'active'
        ? 'Activo'
        : state === 'revoked'
          ? 'Revocado'
          : state === 'expired'
            ? 'Vencido'
            : 'Catálogo no vigente',
    createdBy: share.createdBy.email || share.createdBy.id,
    createdAt: share.createdAt.toISOString(),
    updatedAt: share.updatedAt.toISOString(),
    revokedBy: share.revokedBy ? share.revokedBy.email || share.revokedBy.id : null,
    revokedAt: share.revokedAt?.toISOString() ?? null,
    views: share.views,
    lastViewedAt: share.lastViewedAt?.toISOString() ?? null,
  };
}
