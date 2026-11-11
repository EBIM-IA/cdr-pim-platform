import type { ProductAssetDto, ProductAttributeSheetDto } from '@cdr/contracts';
import { authenticatedBffFetch } from '@/lib/bff-client';
import { listCatalogParameters } from '@/lib/catalog-parameters-api';
import { fetchProductTechnicalSheet } from '@/lib/dynamic-catalog-api';
import { productAssetDownloadUrl } from '@/lib/product-assets-api';
import { technicalAttributesFromSheet, unifiedCodeFromSheet } from '@/lib/product-detail-data';
import {
  createTechnicalSheetPdf,
  type TechnicalSheetDocument,
  type TechnicalSheetMedia,
} from '@/lib/technical-sheet-pdf';
import { displayMeasurement, type MeasurementSystem } from '@/lib/units';
import {
  createBinaryZip,
  downloadBinary,
  technicalSheetFilename,
  type BinaryZipEntry,
} from '@/lib/zip-export';

export const MAX_TECHNICAL_SHEETS_PER_ZIP = 250;
export function technicalSheetDocument(
  sheet: ProductAttributeSheetDto,
  unitSystem: MeasurementSystem,
): TechnicalSheetDocument {
  const exported = technicalAttributesFromSheet(sheet).filter(
    (attribute) =>
      attribute.includeInTechnicalSheet &&
      attribute.canExport &&
      attribute.value !== null &&
      String(attribute.value).trim() !== '',
  );
  const exportedKeys = new Set(exported.map((attribute) => attribute.key));
  const authorizedSheet = {
    ...sheet,
    product: {
      ...sheet.product,
      attributes: Object.fromEntries(
        Object.entries(sheet.product.attributes).filter(([key]) => exportedKeys.has(key)),
      ),
    },
  };
  return {
    sku: sheet.product.sku,
    name: sheet.product.name,
    brand: sheet.product.brand,
    category: sheet.schema.category.name,
    template: `${sheet.schema.template.name} v${sheet.schema.template.version}`,
    unifiedCode: unifiedCodeFromSheet(authorizedSheet),
    unitSystem,
    attributes: exported.map((attribute) => ({
      key: attribute.key,
      label: attribute.label,
      value:
        displayMeasurement(
          attribute.value!,
          { unit: attribute.unit ?? undefined, attributeKey: attribute.key },
          unitSystem,
        )?.primary.text ??
        (typeof attribute.value === 'boolean'
          ? attribute.value
            ? 'Sí'
            : 'No'
          : `${String(attribute.value)}${attribute.unit ? ` ${attribute.unit}` : ''}`),
    })),
  };
}
async function bytesFromPrivateUrl(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await authenticatedBffFetch(url, { cache: 'no-store', signal });
  if (!response.ok)
    throw new Error('No se pudo descargar un activo de la ficha. Actualiza y vuelve a intentar.');
  if (Number(response.headers.get('content-length') ?? 0) > 20 * 1024 * 1024)
    throw new Error('Un activo supera los 20 MB permitidos.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 20 * 1024 * 1024) throw new Error('Un activo supera los 20 MB permitidos.');
  return bytes;
}
async function webpToPng(bytes: Uint8Array): Promise<Uint8Array> {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  const bitmap = await createImageBitmap(new Blob([buffer], { type: 'image/webp' }));
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la fotografía WebP.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error('No se pudo convertir la fotografía.')),
        'image/png',
      ),
    );
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}
export async function technicalSheetMedia(
  assets: readonly ProductAssetDto[],
  signal?: AbortSignal,
): Promise<TechnicalSheetMedia[]> {
  const sorted = [...assets].sort(
    (a, b) =>
      (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
      a.id.localeCompare(b.id),
  );
  const selected = [
    sorted.find((asset) => asset.type === 'FOTO'),
    sorted.find((asset) => asset.type === 'PLANO'),
  ].filter((asset): asset is ProductAssetDto => !!asset);
  return Promise.all(
    selected.map(async (asset) => {
      if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(asset.mimeType))
        return {
          kind: 'plan' as const,
          name: asset.filename,
          mimeType: asset.mimeType,
          bytes: new Uint8Array(),
        };
      const bytes = await bytesFromPrivateUrl(productAssetDownloadUrl(asset.id), signal);
      return {
        kind: asset.type === 'FOTO' ? ('photo' as const) : ('plan' as const),
        name: asset.filename,
        mimeType: asset.mimeType === 'image/webp' ? 'image/png' : asset.mimeType,
        bytes: asset.mimeType === 'image/webp' ? await webpToPng(bytes) : bytes,
      };
    }),
  );
}
export async function technicalSheetBrand(brand: string | null, signal?: AbortSignal) {
  if (!brand?.trim()) return {};
  const brands = await listCatalogParameters('brand', signal);
  const selected = brands.find(
    (item) =>
      item.active &&
      item.value.trim().toLocaleLowerCase('es') === brand.trim().toLocaleLowerCase('es'),
  );
  return {
    brandLogo: selected?.logoDataUrl ?? undefined,
    brandDescription: selected?.description ?? undefined,
  };
}
export async function technicalSheetLogo(signal?: AbortSignal): Promise<Uint8Array> {
  return bytesFromPrivateUrl('/brand/cdr-logo.png', signal);
}
export async function downloadTechnicalSheetPdf(input: TechnicalSheetDocument): Promise<void> {
  const bytes = await createTechnicalSheetPdf(input);
  downloadBinary(bytes, technicalSheetFilename(input.sku), 'application/pdf');
}
export async function downloadTechnicalSheetsZip(
  products: readonly { id: string; sku: string }[],
  assetsByProduct: Readonly<Record<string, ProductAssetDto[]>>,
  options: { signal?: AbortSignal; onProgress?: (complete: number, total: number) => void } = {},
): Promise<void> {
  if (!products.length || products.length > MAX_TECHNICAL_SHEETS_PER_ZIP)
    throw new Error(`Selecciona entre 1 y ${MAX_TECHNICAL_SHEETS_PER_ZIP} SKU con los filtros.`);
  const entries: BinaryZipEntry[] = [],
    filenames = new Set<string>();
  const [cdrLogo, brands] = await Promise.all([
    technicalSheetLogo(options.signal),
    listCatalogParameters('brand', options.signal),
  ]);
  for (const product of [...products].sort((a, b) =>
    a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0,
  )) {
    options.signal?.throwIfAborted();
    const [sheet, media] = await Promise.all([
      fetchProductTechnicalSheet(product.id, options.signal),
      technicalSheetMedia(assetsByProduct[product.id] ?? [], options.signal),
    ]);
    const brand = brands.find(
      (item) =>
        item.active &&
        item.value.toLocaleLowerCase('es') === (sheet.product.brand ?? '').toLocaleLowerCase('es'),
    );
    const bytes = await createTechnicalSheetPdf({
      ...technicalSheetDocument(sheet, 'metric'),
      cdrLogo,
      media,
      brandLogo: brand?.logoDataUrl ?? undefined,
      brandDescription: brand?.description ?? undefined,
    });
    let filename = technicalSheetFilename(sheet.product.sku);
    if (filenames.has(filename.toLowerCase()))
      filename = technicalSheetFilename(sheet.product.sku, `-${product.id}`);
    filenames.add(filename.toLowerCase());
    entries.push({ name: filename, bytes });
    if (entries.reduce((size, entry) => size + entry.bytes.length, 0) > 100 * 1024 * 1024)
      throw new Error(
        'Las fichas superan 100 MB. Reduce el conjunto con los filtros y vuelve a exportar.',
      );
    options.onProgress?.(entries.length, products.length);
  }
  options.signal?.throwIfAborted();
  downloadBinary(createBinaryZip(entries), 'fichas-tecnicas-cdr.zip', 'application/zip');
}
