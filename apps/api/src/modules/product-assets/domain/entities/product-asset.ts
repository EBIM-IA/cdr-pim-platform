import type { ProductAssetType } from '@cdr/contracts';
import { PRODUCT_ASSET_MAX_BYTES } from '@cdr/contracts';
import { type Uuid, ValidationError, newUuid } from '@cdr/shared';

export type ProductAssetKind = 'image' | 'document';
export type ProductAssetSource = 'manual' | 'bulk';

export interface ProductAssetSnapshot {
  readonly id: Uuid;
  readonly productId: Uuid;
  readonly sku: string;
  readonly kind: ProductAssetKind;
  readonly type: ProductAssetType;
  readonly filename: string;
  readonly objectKey: string;
  readonly bucket: string;
  readonly mimeType: string;
  readonly size: number;
  readonly checksum: string;
  readonly storageVersionId: string | null;
  readonly position: number | null;
  readonly source: ProductAssetSource;
  readonly uploadedBy: string;
  readonly uploadedAt: Date;
  readonly replacesAssetId: Uuid | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
}

export interface ValidatedAssetFile {
  readonly filename: string;
  readonly content: Uint8Array;
  readonly mimeType: string;
  readonly extension: string;
}

const TYPE_MIMES: Readonly<Record<ProductAssetType, readonly string[]>> = {
  FT: ['application/pdf'],
  MSDS: ['application/pdf'],
  CERT: ['application/pdf', 'image/jpeg', 'image/png'],
  PLANO: ['application/pdf', 'image/jpeg', 'image/png', 'image/vnd.dwg'],
  FOTO: ['image/jpeg', 'image/png', 'image/webp'],
};

const MIME_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/vnd.dwg': ['dwg'],
};

const SAFE_FILENAME = /^[\p{L}\p{N}][\p{L}\p{N} ._()+-]*$/u;

export class ProductAsset {
  private constructor(private readonly state: ProductAssetSnapshot) {}

  static create(
    input: Omit<
      ProductAssetSnapshot,
      'id' | 'kind' | 'deletedAt' | 'deletedBy' | 'storageVersionId' | 'replacesAssetId'
    > & {
      readonly id?: Uuid;
      readonly storageVersionId?: string | null;
      readonly replacesAssetId?: Uuid | null;
    },
  ): ProductAsset {
    if (input.type === 'FOTO' && (!input.position || input.position < 1)) {
      throw new ValidationError('A product photo requires a positive position');
    }
    if (input.type !== 'FOTO' && input.position !== null) {
      throw new ValidationError('Only product photos may have a position');
    }
    return new ProductAsset({
      ...input,
      id: input.id ?? newUuid(),
      kind: input.type === 'FOTO' ? 'image' : 'document',
      storageVersionId: input.storageVersionId ?? null,
      replacesAssetId: input.replacesAssetId ?? null,
      deletedAt: null,
      deletedBy: null,
    });
  }

  static rehydrate(snapshot: ProductAssetSnapshot): ProductAsset {
    return new ProductAsset(snapshot);
  }

  toSnapshot(): ProductAssetSnapshot {
    return { ...this.state };
  }
}

export function validateAssetFile(input: {
  readonly filename: string;
  readonly declaredMimeType: string;
  readonly content: Uint8Array;
  readonly type: ProductAssetType;
}): ValidatedAssetFile {
  const filename = normalizeFilename(input.filename);
  if (input.content.byteLength === 0) throw new ValidationError('The uploaded file is empty');
  if (input.content.byteLength > PRODUCT_ASSET_MAX_BYTES) {
    throw new ValidationError('The uploaded file exceeds the 20 MB limit', {
      maxBytes: PRODUCT_ASSET_MAX_BYTES,
    });
  }

  const detectedMimeType = detectProductAssetMimeType(input.content);
  if (!detectedMimeType) throw new ValidationError('The file signature is not a supported format');
  if (!TYPE_MIMES[input.type].includes(detectedMimeType)) {
    throw new ValidationError(`File format is not allowed for asset type ${input.type}`, {
      type: input.type,
      detectedMimeType,
    });
  }

  const extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  if (!MIME_EXTENSIONS[detectedMimeType]?.includes(extension)) {
    throw new ValidationError('The filename extension does not match the file content', {
      extension,
      detectedMimeType,
    });
  }

  const declared = normalizeDeclaredMime(input.declaredMimeType);
  if (declared && declared !== detectedMimeType) {
    throw new ValidationError('The declared MIME type does not match the file content', {
      declaredMimeType: declared,
      detectedMimeType,
    });
  }

  return { filename, content: input.content, mimeType: detectedMimeType, extension };
}

export function buildProductAssetKey(input: {
  readonly productId: Uuid;
  readonly assetId: Uuid;
  readonly type: ProductAssetType;
  readonly extension: string;
}): string {
  const folder = input.type === 'FOTO' ? 'images' : 'documents';
  return `products/${input.productId}/${folder}/${input.assetId}.${input.extension}`;
}

function normalizeFilename(raw: string): string {
  const filename = raw.normalize('NFKC').trim();
  if (
    filename.length === 0 ||
    filename.length > 180 ||
    filename === '.' ||
    filename === '..' ||
    filename.startsWith('.') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    !SAFE_FILENAME.test(filename) ||
    filename.lastIndexOf('.') < 1
  ) {
    throw new ValidationError('The uploaded filename is not safe', { field: 'filename' });
  }
  return filename;
}

function normalizeDeclaredMime(raw: string): string | null {
  const mime = raw.trim().toLowerCase().split(';', 1)[0] ?? '';
  if (!mime || mime === 'application/octet-stream') return null;
  if (mime === 'image/jpg' || mime === 'image/pjpeg') return 'image/jpeg';
  if (mime === 'application/acad' || mime === 'application/x-acad') return 'image/vnd.dwg';
  return mime;
}

/** Canonical MIME detected from bytes; safe to reuse when bytes are read back from storage. */
export function detectProductAssetMimeType(content: Uint8Array): string | null {
  if (startsWith(content, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return 'application/pdf';
  }
  if (startsWith(content, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (
    startsWith(content, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(content.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return 'image/webp';
  }
  const dwgHeader = new TextDecoder('ascii').decode(content.subarray(0, 6));
  if (/^AC10\d{2}$/.test(dwgHeader)) return 'image/vnd.dwg';
  return null;
}

function startsWith(content: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => content[index] === byte);
}
