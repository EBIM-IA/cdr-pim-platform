import { Inject, Injectable } from '@nestjs/common';
import {
  type Clock,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  assertUuid,
  getCorrelationId,
  newUuid,
} from '@cdr/shared';
import { CLOCK } from '../../../shared/tokens';
import {
  AuditAction,
  createAuditEntry,
  type AuditEntry,
} from '../../audit/domain/entities/audit-entry';
import { AUDIT_READ_PORT, type AuditReadPort } from '../../audit/domain/ports/audit-read.port';
import {
  Capability,
  actorHasCapability,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import type { ProductCatalogListDto, ProductCatalogListQuery } from '@cdr/contracts';
import type { ProductCatalogQueryPort } from '../domain/ports/product-catalog-query.port';
import { projectProductCatalog } from './catalog-projection';
import {
  catalogValidity,
  nextCatalogVersion,
  shareExpiresAt,
  shareState,
  validateCatalogMetadata,
  validateCatalogPdf,
  type CatalogMetadata,
  type CatalogShareTerm,
  type CatalogWithShares,
  type ProductCatalog,
  type ProductCatalogShare,
} from '../domain/entities/product-catalog';
import {
  CATALOG_BINARY_STORAGE,
  CATALOG_SHARE_TOKEN,
  PRODUCT_CATALOG_REPOSITORY,
  type CatalogBinaryStoragePort,
  type CatalogShareTokenPort,
  type ProductCatalogRepositoryPort,
} from '../domain/ports/product-catalog.port';

export interface CatalogUpload {
  readonly filename: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
}
function available(record: CatalogWithShares): void {
  if (record.catalog.deletedAt) throw new NotFoundError('ProductCatalog', record.catalog.id);
}
function actorSnapshot(actor: AuthenticatedActor) {
  return { id: actor.id, email: actor.email };
}
function audit(
  catalog: ProductCatalog,
  actor: AuthenticatedActor,
  action: AuditEntry['action'],
  changes: AuditEntry['changes'],
): AuditEntry {
  return createAuditEntry({
    resourceType: 'product_catalog',
    resourceId: catalog.id,
    action,
    actorId: actor.id,
    source: 'api',
    correlationId: getCorrelationId() ?? newUuid(),
    occurredAt: catalog.updatedAt,
    changes: { ...changes, actor: { after: actorSnapshot(actor) } },
  });
}
function metadataSnapshot(catalog: ProductCatalog) {
  return {
    title: catalog.title,
    description: catalog.description,
    validFrom: catalog.validFrom,
    validUntil: catalog.validUntil,
    fileName: catalog.fileName,
    fileSize: catalog.fileSize,
    deletedAt: catalog.deletedAt?.toISOString() ?? null,
  };
}
function expectedDate(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new ValidationError('Invalid expectedUpdatedAt');
  return date;
}

@Injectable()
export class ListProductCatalogsUseCase implements ProductCatalogQueryPort {
  constructor(
    @Inject(PRODUCT_CATALOG_REPOSITORY) private readonly repository: ProductCatalogRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(
    query: ProductCatalogListQuery,
    actor: AuthenticatedActor,
  ): Promise<ProductCatalogListDto> {
    if (query.includeDeleted && !actorHasCapability(actor, Capability.ProductCatalogsWrite))
      throw new ForbiddenError('Only catalog editors can view deleted catalogs');
    const now = this.clock.now(),
      result = await this.repository.list({ ...query, now });
    return {
      items: result.items.map((record) => projectProductCatalog(record, now)),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      metrics: result.metrics,
    };
  }
  list(query: ProductCatalogListQuery, actor: AuthenticatedActor): Promise<ProductCatalogListDto> {
    return this.execute(query, actor);
  }
}
@Injectable()
export class GetProductCatalogUseCase {
  constructor(
    @Inject(PRODUCT_CATALOG_REPOSITORY) private readonly repository: ProductCatalogRepositoryPort,
    @Inject(AUDIT_READ_PORT) private readonly auditReader: AuditReadPort,
  ) {}
  async execute(
    id: string,
    actor: AuthenticatedActor,
  ): Promise<CatalogWithShares & { audit: AuditEntry[] }> {
    const record = await this.repository.find(assertUuid(id, 'catalogId'));
    if (
      !record ||
      (record.catalog.deletedAt && !actorHasCapability(actor, Capability.ProductCatalogsWrite))
    )
      throw new NotFoundError('ProductCatalog', id);
    const history = await this.auditReader.listChanges({
      page: 1,
      pageSize: 100,
      resourceType: 'product_catalog',
      resourceId: id,
    });
    const entries = new Map<string, AuditEntry>();
    for (const item of history.items) {
      const prior = entries.get(item.auditEntryId);
      entries.set(item.auditEntryId, {
        id: assertUuid(item.auditEntryId),
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        action: item.action,
        actorId: item.actorId,
        source: item.source,
        correlationId: item.correlationId,
        occurredAt: item.occurredAt,
        changes: { ...prior?.changes, [item.field]: { before: item.before, after: item.after } },
      });
    }
    return { ...record, audit: [...entries.values()].slice(0, 20) };
  }
}
@Injectable()
export class CreateProductCatalogUseCase {
  constructor(
    @Inject(PRODUCT_CATALOG_REPOSITORY) private readonly repository: ProductCatalogRepositoryPort,
    @Inject(CATALOG_BINARY_STORAGE) private readonly storage: CatalogBinaryStoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(
    input: CatalogMetadata,
    file: CatalogUpload | undefined,
    actor: AuthenticatedActor,
  ): Promise<CatalogWithShares> {
    const metadata = validateCatalogMetadata(input);
    if (!file) throw new ValidationError('A PDF file is required');
    const fileName = validateCatalogPdf(file),
      now = this.clock.now(),
      id = newUuid();
    const catalog: ProductCatalog = {
      ...metadata,
      id,
      code: '',
      fileName,
      fileSize: file.content.length,
      objectKey: `product-catalogs/${id}/${newUuid()}.pdf`,
      createdBy: actorSnapshot(actor),
      createdAt: now,
      updatedBy: actorSnapshot(actor),
      updatedAt: now,
      deletedAt: null,
      deletedBy: null,
    };
    // Upload first; a failed transaction can leave a private orphan, never a broken catalog
    // or destruction of the prior version. Operational object retention owns cleanup.
    await this.storage.put(catalog.objectKey, file.content);
    return this.repository.insert(
      catalog,
      audit(catalog, actor, AuditAction.Created, { catalog: { after: metadataSnapshot(catalog) } }),
      async () => {
        if (!(await this.storage.exists(catalog.objectKey)))
          throw new NotFoundError('StoredCatalog', catalog.id);
      },
    );
  }
}
@Injectable()
export class UpdateProductCatalogUseCase {
  constructor(
    @Inject(PRODUCT_CATALOG_REPOSITORY) private readonly repository: ProductCatalogRepositoryPort,
    @Inject(CATALOG_BINARY_STORAGE) private readonly storage: CatalogBinaryStoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(
    id: string,
    input: CatalogMetadata & { expectedUpdatedAt: string },
    file: CatalogUpload | undefined,
    actor: AuthenticatedActor,
  ): Promise<CatalogWithShares> {
    const catalogId = assertUuid(id, 'catalogId'),
      metadata = validateCatalogMetadata(input),
      expected = expectedDate(input.expectedUpdatedAt);
    const existing = await this.repository.find(catalogId);
    if (!existing) throw new NotFoundError('ProductCatalog', id);
    available(existing);
    const fileName = file ? validateCatalogPdf(file) : undefined;
    const objectKey = file ? `product-catalogs/${catalogId}/${newUuid()}.pdf` : undefined;
    if (file && objectKey) await this.storage.put(objectKey, file.content);
    return this.repository.mutate(
      catalogId,
      expected,
      (current) => {
        available(current);
        const catalog: ProductCatalog = {
          ...current.catalog,
          ...metadata,
          ...(file && objectKey && fileName
            ? { fileName, fileSize: file.content.length, objectKey }
            : {}),
          updatedBy: actorSnapshot(actor),
          updatedAt: nextCatalogVersion(current.catalog.updatedAt, this.clock.now()),
        };
        return {
          catalog,
          shares: current.shares,
          audit: audit(catalog, actor, AuditAction.Updated, {
            catalog: {
              before: metadataSnapshot(current.catalog),
              after: metadataSnapshot(catalog),
            },
          }),
        };
      },
      file && objectKey
        ? async () => {
            if (!(await this.storage.exists(objectKey)))
              throw new NotFoundError('StoredCatalog', catalogId);
          }
        : undefined,
    );
  }
}
@Injectable()
export class ChangeProductCatalogDeletionUseCase {
  constructor(
    @Inject(PRODUCT_CATALOG_REPOSITORY) private readonly repository: ProductCatalogRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  execute(
    id: string,
    expectedUpdatedAt: string,
    restore: boolean,
    actor: AuthenticatedActor,
  ): Promise<CatalogWithShares> {
    return this.repository.mutate(
      assertUuid(id, 'catalogId'),
      expectedDate(expectedUpdatedAt),
      (current) => {
        if (!restore) available(current);
        if (restore && !current.catalog.deletedAt)
          throw new ValidationError('The catalog is not deleted');
        const now = nextCatalogVersion(current.catalog.updatedAt, this.clock.now());
        const catalog: ProductCatalog = {
          ...current.catalog,
          deletedAt: restore ? null : now,
          deletedBy: restore ? null : actorSnapshot(actor),
          updatedAt: now,
          updatedBy: actorSnapshot(actor),
        };
        const shares = restore
          ? current.shares
          : current.shares.map((share) =>
              share.revokedAt
                ? share
                : {
                    ...share,
                    revokedAt: now,
                    revokedBy: actorSnapshot(actor),
                    updatedAt: nextCatalogVersion(share.updatedAt, now),
                  },
            );
        return {
          catalog,
          shares,
          audit: audit(catalog, actor, restore ? AuditAction.Updated : AuditAction.Deleted, {
            catalog: {
              before: metadataSnapshot(current.catalog),
              after: metadataSnapshot(catalog),
            },
            revokedShareIds: {
              after: restore
                ? []
                : current.shares.filter((share) => !share.revokedAt).map((share) => share.id),
            },
          }),
        };
      },
    );
  }
}
@Injectable()
export class CreateProductCatalogShareUseCase {
  constructor(
    @Inject(PRODUCT_CATALOG_REPOSITORY) private readonly repository: ProductCatalogRepositoryPort,
    @Inject(CATALOG_SHARE_TOKEN) private readonly tokens: CatalogShareTokenPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(
    id: string,
    input: { term: CatalogShareTerm; note: string; expectedUpdatedAt: string },
    actor: AuthenticatedActor,
  ): Promise<{ record: CatalogWithShares; share: ProductCatalogShare; token: string }> {
    if (
      !['1d', '3d', '7d', '1m', '3m', '6m', 'never'].includes(input.term) ||
      input.note.length > 80
    )
      throw new ValidationError('Invalid share term or note');
    const generated = this.tokens.generate(),
      shareId = newUuid();
    const record = await this.repository.mutate(
      assertUuid(id, 'catalogId'),
      expectedDate(input.expectedUpdatedAt),
      (current) => {
        available(current);
        const now = this.clock.now();
        if (catalogValidity(current.catalog, now) !== 'current')
          throw new ValidationError('Only current catalogs can be shared');
        const share: ProductCatalogShare = {
          id: shareId,
          catalogId: current.catalog.id,
          tokenDigest: generated.digest,
          term: input.term,
          note: input.note.trim(),
          expiresAt: shareExpiresAt(input.term, now),
          createdBy: actorSnapshot(actor),
          createdAt: now,
          revokedAt: null,
          revokedBy: null,
          views: 0,
          lastViewedAt: null,
          updatedAt: now,
        };
        const catalog: ProductCatalog = {
          ...current.catalog,
          updatedAt: nextCatalogVersion(current.catalog.updatedAt, now),
          updatedBy: actorSnapshot(actor),
        };
        return {
          catalog,
          shares: [share, ...current.shares],
          audit: audit(catalog, actor, AuditAction.Updated, {
            sharedLink: {
              after: {
                id: share.id,
                term: share.term,
                note: share.note,
                expiresAt: share.expiresAt?.toISOString() ?? null,
              },
            },
          }),
        };
      },
    );
    return {
      record,
      share: record.shares.find((share) => share.id === shareId)!,
      token: generated.token,
    };
  }
}
@Injectable()
export class RevokeProductCatalogShareUseCase {
  constructor(
    @Inject(PRODUCT_CATALOG_REPOSITORY) private readonly repository: ProductCatalogRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  execute(
    id: string,
    shareId: string,
    expectedUpdatedAt: string,
    actor: AuthenticatedActor,
  ): Promise<CatalogWithShares> {
    assertUuid(shareId, 'shareId');
    return this.repository.mutate(
      assertUuid(id, 'catalogId'),
      { shareId, updatedAt: expectedDate(expectedUpdatedAt) },
      (current) => {
        const share = current.shares.find((item) => item.id === shareId);
        if (!share) throw new NotFoundError('CatalogShare', shareId);
        const now = nextCatalogVersion(current.catalog.updatedAt, this.clock.now());
        const catalog: ProductCatalog = {
          ...current.catalog,
          updatedAt: now,
          updatedBy: actorSnapshot(actor),
        };
        return {
          catalog,
          shares: current.shares.map((item) =>
            item.id === shareId && !item.revokedAt
              ? {
                  ...item,
                  revokedAt: now,
                  revokedBy: actorSnapshot(actor),
                  updatedAt: nextCatalogVersion(item.updatedAt, now),
                }
              : item,
          ),
          audit: audit(catalog, actor, AuditAction.Updated, { revokedShare: { after: shareId } }),
        };
      },
    );
  }
}
@Injectable()
export class DownloadProductCatalogUseCase {
  constructor(
    @Inject(PRODUCT_CATALOG_REPOSITORY) private readonly repository: ProductCatalogRepositoryPort,
    @Inject(CATALOG_BINARY_STORAGE) private readonly storage: CatalogBinaryStoragePort,
  ) {}
  async execute(id: string): Promise<{ catalog: ProductCatalog; content: Uint8Array }> {
    const record = await this.repository.find(assertUuid(id, 'catalogId'));
    if (!record) throw new NotFoundError('ProductCatalog', id);
    available(record);
    return { catalog: record.catalog, content: await this.storage.get(record.catalog.objectKey) };
  }
}
@Injectable()
export class ResolveSharedProductCatalogUseCase {
  constructor(
    @Inject(PRODUCT_CATALOG_REPOSITORY) private readonly repository: ProductCatalogRepositoryPort,
    @Inject(CATALOG_SHARE_TOKEN) private readonly tokens: CatalogShareTokenPort,
    @Inject(CATALOG_BINARY_STORAGE) private readonly storage: CatalogBinaryStoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(
    token: string,
    download: boolean,
  ): Promise<{ catalog: ProductCatalog; expiresAt: Date | null; content?: Uint8Array }> {
    const resolved = await this.authorize(token, !download);
    return {
      catalog: resolved.catalog,
      expiresAt: resolved.share.expiresAt,
      ...(download ? { content: await this.storage.get(resolved.catalog.objectKey) } : {}),
    };
  }
  async verify(token: string): Promise<void> {
    await this.authorize(token, false);
  }
  private async authorize(token: string, visit: boolean) {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) throw unavailableShare();
    const now = this.clock.now();
    const resolved = await this.repository.accessShared(
      this.tokens.digest(token),
      now,
      visit,
      (record, share) => {
        if (shareState(share, record.catalog, this.clock.now()) !== 'active')
          throw unavailableShare();
      },
    );
    if (!resolved) throw unavailableShare();
    return resolved;
  }
}
function unavailableShare(): NotFoundError {
  return new NotFoundError('SharedCatalog', 'unavailable');
}
