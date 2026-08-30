/**
 * Outbound port for binary assets (product images, supplier PDFs, import files).
 *
 * PostgreSQL stores only the *metadata* — key, bucket, mime type, size, checksum, version
 * and the relation to a product or document. The bytes live in object storage. See
 * `docs/architecture/DATA_ARCHITECTURE.md`.
 */
export interface StoredObject {
  readonly key: string;
  readonly bucket: string;
  readonly mimeType: string;
  readonly size: number;
  /** Base64 SHA-256 of the content, used for integrity checks and de-duplication. */
  readonly checksum: string;
  readonly versionId?: string;
}

export interface PutObjectCommand {
  readonly key: string;
  readonly content: Uint8Array;
  readonly mimeType: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface ObjectStoragePort {
  put(command: PutObjectCommand): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /**
   * Time-limited download URL.
   *
   * Buckets are private with public access blocked; browsers reach an asset only through
   * one of these. The default TTL is short on purpose — a leaked URL expires by itself.
   */
  presignGet(key: string, ttlSeconds: number): Promise<string>;
  /** Time-limited upload URL, so large files never transit the API container. */
  presignPut(key: string, ttlSeconds: number, mimeType: string): Promise<string>;
}

export const OBJECT_STORAGE = Symbol('ObjectStoragePort');
