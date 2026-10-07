import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_ASSET_ZIP_MAX_FILES,
  type ProductAssetBulkMode,
  type ProductAssetSelector,
  type ProductAssetType,
} from '@cdr/contracts';
import {
  type Clock,
  NotFoundError,
  ValidationError,
  assertUuid,
  getCorrelationId,
  isDomainError,
  newUuid,
} from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import { AuditAction, createAuditEntry } from '../../audit/domain/entities/audit-entry';
import type { Product } from '../../catalog/domain/entities/product';
import {
  PRODUCT_REPOSITORY,
  type ProductRepositoryPort,
} from '../../catalog/domain/ports/product-repository.port';
import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  ProductAsset,
  buildProductAssetKey,
  type ProductAssetSource,
  type ValidatedAssetFile,
  validateAssetFile,
} from '../domain/entities/product-asset';
import {
  ARCHIVE_READER,
  ASSET_BINARY_STORAGE,
  PRODUCT_ASSET_REPOSITORY,
  type ArchiveEntry,
  type ArchiveReaderPort,
  type AssetBinaryStoragePort,
  type ProductAssetRepositoryPort,
} from '../domain/ports/product-asset-repository.port';

const MAX_MANIFEST_BYTES = 1024 * 1024;

export interface ProductAssetUpload {
  readonly selector: ProductAssetSelector;
  readonly type: ProductAssetType;
  readonly filename: string;
  readonly declaredMimeType: string;
  readonly content: Uint8Array;
  readonly source?: ProductAssetSource;
  readonly position?: number;
}

export interface ProductAssetDownload {
  readonly asset: ProductAsset;
  readonly content: Uint8Array;
}

export type BulkAssetStatus =
  'ready' | 'will_replace' | 'uploaded' | 'replaced' | 'error' | 'ignored';

export interface BulkAssetItem {
  readonly filename: string;
  readonly sku: string | null;
  readonly type: ProductAssetType | null;
  readonly status: BulkAssetStatus;
  readonly message: string | null;
  readonly asset: ProductAsset | null;
}

export interface BulkAssetResult {
  readonly mode: ProductAssetBulkMode;
  readonly archiveName: string;
  readonly total: number;
  readonly valid: number;
  readonly errors: number;
  readonly affectedSkus: number;
  readonly items: BulkAssetItem[];
}

@Injectable()
export class ListProductAssetsUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    @Inject(PRODUCT_ASSET_REPOSITORY)
    private readonly assets: ProductAssetRepositoryPort,
  ) {}

  async execute(selector: ProductAssetSelector): Promise<ProductAsset[]> {
    const product = await resolveProduct(selector, this.products);
    return this.assets.listByProductId(product.id);
  }
}

@Injectable()
export class UploadProductAssetUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    @Inject(PRODUCT_ASSET_REPOSITORY)
    private readonly assets: ProductAssetRepositoryPort,
    @Inject(ASSET_BINARY_STORAGE) private readonly storage: AssetBinaryStoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ProductAssetUpload, actor: AuthenticatedActor): Promise<ProductAsset> {
    const product = await resolveProduct(input.selector, this.products);
    return this.executeForProduct(product, input, actor);
  }

  async executeForProduct(
    product: Product,
    input: ProductAssetUpload,
    actor: AuthenticatedActor,
  ): Promise<ProductAsset> {
    const file = validateAssetFile(input);
    const position =
      input.type === 'FOTO'
        ? (input.position ?? (await this.assets.nextPhotoPosition(product.id)))
        : null;
    if (position !== null && (!Number.isInteger(position) || position < 1 || position > 10_000)) {
      throw new ValidationError('Photo position must be an integer between 1 and 10000');
    }
    return this.persist(product, input.type, file, input.source ?? 'manual', position, actor);
  }

  private async persist(
    product: Product,
    type: ProductAssetType,
    file: ValidatedAssetFile,
    source: ProductAssetSource,
    position: number | null,
    actor: AuthenticatedActor,
  ): Promise<ProductAsset> {
    const id = newUuid();
    const objectKey = buildProductAssetKey({
      productId: product.id,
      assetId: id,
      type,
      extension: file.extension,
    });
    const stored = await this.storage.put({
      key: objectKey,
      content: file.content,
      mimeType: file.mimeType,
      metadata: { productId: product.id, sku: product.sku, type },
    });
    const now = this.clock.now();
    const asset = ProductAsset.create({
      id,
      productId: product.id,
      sku: product.sku,
      type,
      filename: file.filename,
      objectKey: stored.key,
      bucket: stored.bucket,
      mimeType: stored.mimeType,
      size: stored.size,
      checksum: stored.checksum,
      storageVersionId: stored.versionId ?? null,
      position,
      source,
      uploadedBy: actor.id,
      uploadedAt: now,
    });

    let saved: ProductAsset;
    let replaced: ProductAsset | null;
    const correlationId = getCorrelationId() ?? newUuid();
    try {
      ({ saved, replaced } = await this.assets.saveReplacing(
        asset,
        actor.id,
        now,
        (persisted, previous) => {
          const current = persisted.toSnapshot();
          const before = previous?.toSnapshot();
          return createAuditEntry({
            resourceType: 'product_asset',
            resourceId: current.id,
            action: previous ? AuditAction.Updated : AuditAction.Created,
            actorId: actor.id,
            source: source === 'bulk' ? 'api:asset_zip' : 'api',
            correlationId,
            occurredAt: now,
            changes: {
              productId: { after: current.productId },
              sku: { after: current.sku },
              type: { before: before?.type, after: current.type },
              filename: { before: before?.filename, after: current.filename },
              position: { before: before?.position, after: current.position },
              checksum: { before: before?.checksum, after: current.checksum },
            },
          });
        },
      ));
    } catch (error) {
      await this.storage.delete(stored.key).catch(() => undefined);
      throw error;
    }
    if (replaced) await this.storage.delete(replaced.toSnapshot().objectKey).catch(() => undefined);
    return saved;
  }
}

@Injectable()
export class DownloadProductAssetUseCase {
  constructor(
    @Inject(PRODUCT_ASSET_REPOSITORY)
    private readonly assets: ProductAssetRepositoryPort,
    @Inject(ASSET_BINARY_STORAGE) private readonly storage: AssetBinaryStoragePort,
  ) {}

  async execute(rawId: string): Promise<ProductAssetDownload> {
    const asset = await this.assets.findById(assertUuid(rawId, 'assetId'));
    if (!asset) throw new NotFoundError('ProductAsset', rawId);
    return { asset, content: await this.storage.get(asset.toSnapshot().objectKey) };
  }
}

@Injectable()
export class DeleteProductAssetUseCase {
  constructor(
    @Inject(PRODUCT_ASSET_REPOSITORY)
    private readonly assets: ProductAssetRepositoryPort,
    @Inject(ASSET_BINARY_STORAGE) private readonly storage: AssetBinaryStoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(rawId: string, actor: AuthenticatedActor): Promise<ProductAsset> {
    const id = assertUuid(rawId, 'assetId');
    const now = this.clock.now();
    const correlationId = getCorrelationId() ?? newUuid();
    const asset = await this.assets.softDelete(id, actor.id, now, (deleted) => {
      const snapshot = deleted.toSnapshot();
      return createAuditEntry({
        resourceType: 'product_asset',
        resourceId: snapshot.id,
        action: AuditAction.Deleted,
        actorId: actor.id,
        source: 'api',
        correlationId,
        occurredAt: now,
        changes: {
          active: { before: true, after: false },
          productId: { before: snapshot.productId },
          sku: { before: snapshot.sku },
          filename: { before: snapshot.filename },
        },
      });
    });
    if (!asset) throw new NotFoundError('ProductAsset', rawId);
    const snapshot = asset.toSnapshot();
    await this.storage.delete(snapshot.objectKey).catch(() => undefined);
    return asset;
  }
}

interface PlannedEntry {
  readonly entry: ArchiveEntry;
  readonly product: Product;
  readonly type: ProductAssetType;
  readonly position?: number;
  readonly existing: ProductAsset | null;
}

@Injectable()
export class ProcessProductAssetArchiveUseCase {
  constructor(
    @Inject(ARCHIVE_READER) private readonly archives: ArchiveReaderPort,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    @Inject(PRODUCT_ASSET_REPOSITORY)
    private readonly assets: ProductAssetRepositoryPort,
    private readonly uploader: UploadProductAssetUseCase,
  ) {}

  async execute(input: {
    readonly archiveName: string;
    readonly content: Uint8Array;
    readonly mode: ProductAssetBulkMode;
    readonly actor: AuthenticatedActor;
  }): Promise<BulkAssetResult> {
    const archiveName = safeArchiveName(input.archiveName);
    const entries = this.archives.read(input.content);
    const manifestEntry = uniqueManifest(entries);
    const manifest = manifestEntry ? parseManifest(manifestEntry.content) : new Map();
    const items: BulkAssetItem[] = [];
    const plans: PlannedEntry[] = [];
    const productCache = new Map<string, Product>();
    const nextPhoto = new Map<string, number>();
    const slots = new Set<string>();

    for (const entry of entries) {
      if (isIgnored(entry.path) || entry === manifestEntry) {
        items.push({
          filename: entry.path,
          sku: null,
          type: null,
          status: 'ignored',
          message: 'Archivo auxiliar ignorado.',
          asset: null,
        });
        continue;
      }
      try {
        const reference = referenceForEntry(entry.path, manifest);
        const product = await cachedProduct(reference.sku, productCache, this.products);
        let position = reference.position;
        if (reference.type === 'FOTO' && position === undefined) {
          const current =
            nextPhoto.get(product.id) ?? (await this.assets.nextPhotoPosition(product.id));
          position = current;
          nextPhoto.set(product.id, current + 1);
        }
        const slot = `${product.id}:${reference.type}:${position ?? 0}`;
        if (slots.has(slot)) {
          throw new ValidationError('The ZIP contains more than one file for the same asset slot');
        }
        slots.add(slot);
        validateAssetFile({
          filename: basename(entry.path),
          declaredMimeType: '',
          content: entry.content,
          type: reference.type,
        });
        const existing = await this.assets.findActiveSlot({
          productId: product.id,
          type: reference.type,
          position: position ?? null,
        });
        plans.push({ entry, product, type: reference.type, position, existing });
        items.push({
          filename: entry.path,
          sku: product.sku,
          type: reference.type,
          status: existing ? 'will_replace' : 'ready',
          message: existing ? `Reemplazará ${existing.toSnapshot().filename}.` : null,
          asset: null,
        });
      } catch (error) {
        items.push({
          filename: entry.path,
          sku: null,
          type: null,
          status: 'error',
          message: isDomainError(error) ? error.message : 'No se pudo validar el archivo.',
          asset: null,
        });
      }
    }

    if (input.mode === 'commit') {
      for (const plan of plans) {
        const index = items.findIndex(
          (item) => item.filename === plan.entry.path && item.status !== 'error',
        );
        try {
          const asset = await this.uploader.executeForProduct(
            plan.product,
            {
              selector: { productId: plan.product.id },
              type: plan.type,
              filename: basename(plan.entry.path),
              declaredMimeType: '',
              content: plan.entry.content,
              source: 'bulk',
              ...(plan.position === undefined ? {} : { position: plan.position }),
            },
            input.actor,
          );
          items[index] = {
            ...items[index],
            status: plan.existing ? 'replaced' : 'uploaded',
            asset,
          } as BulkAssetItem;
        } catch (error) {
          items[index] = {
            ...items[index],
            status: 'error',
            message: isDomainError(error) ? error.message : 'No se pudo almacenar el archivo.',
            asset: null,
          } as BulkAssetItem;
        }
      }
    }

    const validItems = items.filter((item) => item.status !== 'error' && item.status !== 'ignored');
    return {
      mode: input.mode,
      archiveName,
      total: items.filter((item) => item.status !== 'ignored').length,
      valid: validItems.length,
      errors: items.filter((item) => item.status === 'error').length,
      affectedSkus: new Set(validItems.map((item) => item.sku).filter(Boolean)).size,
      items,
    };
  }
}

async function resolveProduct(
  selector: ProductAssetSelector,
  products: ProductRepositoryPort,
): Promise<Product> {
  const product = selector.productId
    ? await products.findById(assertUuid(selector.productId, 'productId'))
    : selector.sku
      ? await products.findBySku(selector.sku.trim())
      : null;
  if (!product) {
    throw new NotFoundError('Product', selector.productId ?? selector.sku ?? 'missing-selector');
  }
  return product;
}

async function cachedProduct(
  sku: string,
  cache: Map<string, Product>,
  products: ProductRepositoryPort,
): Promise<Product> {
  const normalized = sku.trim().toUpperCase();
  const cached = cache.get(normalized);
  if (cached) return cached;
  const product = await products.findBySku(normalized);
  if (!product) throw new NotFoundError('Product', normalized);
  cache.set(normalized, product);
  return product;
}

function uniqueManifest(entries: readonly ArchiveEntry[]): ArchiveEntry | null {
  const manifests = entries.filter(
    (entry) => basename(entry.path).toLowerCase() === 'manifiesto.csv',
  );
  if (manifests.length > 1)
    throw new ValidationError('The ZIP contains multiple manifiesto.csv files');
  return manifests[0] ?? null;
}

interface ManifestReference {
  readonly sku: string;
  readonly typeToken: string;
}

function parseManifest(content: Uint8Array): Map<string, ManifestReference> {
  if (content.byteLength > MAX_MANIFEST_BYTES) {
    throw new ValidationError('manifiesto.csv exceeds the 1 MB safety limit');
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(content).replace(/^\uFEFF/, '');
  } catch {
    throw new ValidationError('manifiesto.csv must use UTF-8');
  }
  const rows = parseSemicolonCsv(text).filter((row) => row.some((value) => value.trim()));
  if (rows.length > PRODUCT_ASSET_ZIP_MAX_FILES + 1) {
    throw new ValidationError(
      `manifiesto.csv cannot contain more than ${PRODUCT_ASSET_ZIP_MAX_FILES} data rows`,
    );
  }
  const header = rows.shift()?.map((value) => value.trim().toLowerCase()) ?? [];
  const fileIndex = header.indexOf('archivo');
  const skuIndex = header.indexOf('codigo_articulo');
  const typeIndex = header.indexOf('tipo');
  if (fileIndex < 0 || skuIndex < 0 || typeIndex < 0) {
    throw new ValidationError('manifiesto.csv requires archivo;codigo_articulo;tipo');
  }
  const manifest = new Map<string, ManifestReference>();
  for (const row of rows) {
    const file = row[fileIndex]?.trim() ?? '';
    const sku = row[skuIndex]?.trim() ?? '';
    const typeToken = row[typeIndex]?.trim() ?? '';
    if (!file || !sku || !typeToken)
      throw new ValidationError('manifiesto.csv contains an incomplete row');
    const key = file.toLocaleLowerCase('en-US');
    if (manifest.has(key)) throw new ValidationError('manifiesto.csv repeats an archivo value');
    manifest.set(key, { sku, typeToken });
  }
  return manifest;
}

function parseSemicolonCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] as string;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ';' && !quoted) {
      row.push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else value += character;
  }
  if (quoted) throw new ValidationError('manifiesto.csv contains an unterminated quoted field');
  if (row.length > 0 || value) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function referenceForEntry(
  path: string,
  manifest: ReadonlyMap<string, ManifestReference>,
): { sku: string; type: ProductAssetType; position?: number } {
  const name = basename(path);
  const mapped =
    manifest.get(path.toLocaleLowerCase('en-US')) ?? manifest.get(name.toLocaleLowerCase('en-US'));
  if (mapped) return parseTypeReference(mapped.sku, mapped.typeToken);

  const stem = name.slice(0, name.lastIndexOf('.'));
  const parts = stem.split('__');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new ValidationError('Use SKU__TIPO.ext or include the file in manifiesto.csv');
  }
  return parseTypeReference(parts[0], parts[1]);
}

function parseTypeReference(
  sku: string,
  rawType: string,
): { sku: string; type: ProductAssetType; position?: number } {
  const token = rawType.trim().toUpperCase();
  const photo = /^FOTO(?:-(\d{1,4}))?$/.exec(token);
  if (photo) {
    const position = photo[1] ? Number(photo[1]) : undefined;
    if (position === 0) throw new ValidationError('FOTO positions start at 1');
    return { sku: sku.trim(), type: 'FOTO', ...(position ? { position } : {}) };
  }
  if (token === 'FT' || token === 'MSDS' || token === 'CERT' || token === 'PLANO') {
    return { sku: sku.trim(), type: token };
  }
  throw new ValidationError('Unknown asset type; use FT, MSDS, CERT, PLANO or FOTO');
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function isIgnored(path: string): boolean {
  const components = path.split('/');
  const name = basename(path);
  return (
    components.some((component) => component === '__MACOSX' || component.startsWith('.')) ||
    /^\.DS_Store$/i.test(name) ||
    /^LEEME(?:\.|$)/i.test(name)
  );
}

function safeArchiveName(value: string): string {
  const name = value.normalize('NFKC').trim();
  if (
    !name ||
    name.length > 180 ||
    name.startsWith('.') ||
    name.includes('/') ||
    name.includes('\\') ||
    !/^[\p{L}\p{N}][\p{L}\p{N} ._()+-]*\.zip$/iu.test(name)
  ) {
    throw new ValidationError('The bulk upload must be a .zip file');
  }
  return name;
}
