import { ValidationError } from '@cdr/shared';

export type CatalogShareTerm = '1d' | '3d' | '7d' | '1m' | '3m' | '6m' | 'never';
export interface CatalogActor {
  readonly id: string;
  readonly email: string;
}
export interface ProductCatalog {
  readonly code: string;
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly fileName: string;
  readonly fileSize: number;
  readonly objectKey: string;
  readonly createdBy: CatalogActor;
  readonly createdAt: Date;
  readonly updatedBy: CatalogActor;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
  readonly deletedBy: CatalogActor | null;
}
export interface ProductCatalogShare {
  readonly id: string;
  readonly catalogId: string;
  readonly tokenDigest: string;
  readonly term: CatalogShareTerm;
  readonly note: string;
  readonly expiresAt: Date | null;
  readonly createdBy: CatalogActor;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
  readonly revokedBy: CatalogActor | null;
  readonly views: number;
  readonly lastViewedAt: Date | null;
  readonly updatedAt: Date;
}
export interface CatalogWithShares {
  readonly catalog: ProductCatalog;
  readonly shares: ProductCatalogShare[];
}
export interface CatalogMetadata {
  readonly title: string;
  readonly description: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
}
export const MAX_CATALOG_PDF_BYTES = 50 * 1024 * 1024;
export function validateCatalogMetadata(input: CatalogMetadata): CatalogMetadata {
  const title = input.title.trim(),
    description = input.description.trim();
  if (!title || title.length > 120 || description.length > 1000)
    throw new ValidationError('Invalid catalog title or description');
  if (
    !validDate(input.validFrom) ||
    (input.validUntil !== null &&
      (!validDate(input.validUntil) || input.validUntil < input.validFrom))
  )
    throw new ValidationError('Invalid catalog validity dates');
  return { title, description, validFrom: input.validFrom, validUntil: input.validUntil };
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validateCatalogPdf(file: {
  readonly filename: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
}): string {
  if (
    !/\.pdf$/iu.test(file.filename) ||
    file.mimeType.toLowerCase() !== 'application/pdf' ||
    !file.content.length ||
    file.content.length > MAX_CATALOG_PDF_BYTES ||
    String.fromCharCode(...file.content.slice(0, 5)) !== '%PDF-'
  )
    throw new ValidationError('A PDF up to 50 MB with a valid PDF signature is required');
  const base = file.filename.replace(/\\/gu, '/').split('/').at(-1) ?? '';
  const safe = base
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .replace(/^\.+/u, '')
    .trim();
  return `${safe.replace(/\.pdf$/iu, '').slice(0, 175) || 'catalog'}.pdf`;
}
export function catalogValidity(
  catalog: ProductCatalog,
  now: Date,
): 'scheduled' | 'expired' | 'current' {
  const today = now.toISOString().slice(0, 10);
  return today < catalog.validFrom
    ? 'scheduled'
    : catalog.validUntil && today > catalog.validUntil
      ? 'expired'
      : 'current';
}
export function shareState(
  share: ProductCatalogShare,
  catalog: ProductCatalog,
  now: Date,
): 'revoked' | 'expired' | 'catalog_unavailable' | 'active' {
  if (share.revokedAt) return 'revoked';
  if (share.expiresAt && share.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (catalog.deletedAt || catalogValidity(catalog, now) !== 'current')
    return 'catalog_unavailable';
  return 'active';
}
export function shareExpiresAt(term: CatalogShareTerm, now: Date): Date | null {
  if (term === 'never') return null;
  const date = new Date(now);
  if (term.endsWith('d')) date.setUTCDate(date.getUTCDate() + Number.parseInt(term, 10));
  else date.setUTCMonth(date.getUTCMonth() + Number.parseInt(term, 10));
  return date;
}
export function nextCatalogVersion(previous: Date, now: Date): Date {
  return new Date(Math.max(previous.getTime() + 1, now.getTime()));
}
