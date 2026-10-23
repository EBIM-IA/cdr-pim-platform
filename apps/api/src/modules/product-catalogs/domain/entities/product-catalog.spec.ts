import { describe, expect, it } from 'vitest';
import {
  catalogValidity,
  MAX_CATALOG_PDF_BYTES,
  shareExpiresAt,
  shareState,
  validateCatalogMetadata,
  validateCatalogPdf,
  type ProductCatalog,
  type ProductCatalogShare,
} from './product-catalog';
const now = new Date('2026-10-23T12:00:00Z');
const catalog = {
  validFrom: '2026-10-23',
  validUntil: '2026-10-23',
  deletedAt: null,
} as ProductCatalog;
const share = { revokedAt: null, expiresAt: null } as ProductCatalogShare;
describe('PDF catalog rules', () => {
  it('validates calendar dates and inclusive catalog end dates in UTC', () => {
    expect(catalogValidity(catalog, now)).toBe('current');
    expect(catalogValidity(catalog, new Date('2026-10-24T00:00:00Z'))).toBe('expired');
    expect(catalogValidity(catalog, new Date('2026-10-22T23:59:59Z'))).toBe('scheduled');
    for (const validFrom of ['2026-02-30', '2026-13-01', 'not-a-date'])
      expect(() =>
        validateCatalogMetadata({ title: 'PDF', description: '', validFrom, validUntil: null }),
      ).toThrow();
    expect(() =>
      validateCatalogMetadata({
        title: 'PDF',
        description: '',
        validFrom: '2026-10-23',
        validUntil: '2026-10-22',
      }),
    ).toThrow();
  });
  it('requires PDF extension, MIME and signature, enforces 50 MB and normalizes filenames', () => {
    const file = {
      filename: '../../ficha\u0000.pdf',
      mimeType: 'application/pdf',
      content: new TextEncoder().encode('%PDF-1.7\n'),
    };
    expect(validateCatalogPdf(file)).toBe('ficha.pdf');
    for (const invalid of [
      { filename: 'a.exe' },
      { mimeType: 'image/png' },
      { content: new TextEncoder().encode('INVALID') },
      { content: new Uint8Array() },
      { content: new Uint8Array(MAX_CATALOG_PDF_BYTES + 1) },
    ])
      expect(() => validateCatalogPdf({ ...file, ...invalid })).toThrow();
  });
  it('checks expiry at its exact instant and catalog availability independently', () => {
    expect(shareState({ ...share, expiresAt: now }, catalog, now)).toBe('expired');
    expect(shareState(share, { ...catalog, deletedAt: now }, now)).toBe('catalog_unavailable');
    expect(shareState({ ...share, revokedAt: now }, catalog, now)).toBe('revoked');
    expect(shareState(share, catalog, now)).toBe('active');
  });
  it('supports all requested durations without inventing a maximum lifetime for never', () => {
    expect(shareExpiresAt('never', now)).toBeNull();
    for (const [term, expected] of [
      ['1d', '2026-10-24'],
      ['3d', '2026-10-26'],
      ['7d', '2026-10-30'],
      ['1m', '2026-11-23'],
      ['3m', '2027-01-23'],
      ['6m', '2027-04-23'],
    ] as const)
      expect(shareExpiresAt(term, now)?.toISOString().slice(0, 10)).toBe(expected);
  });
});
