import {
  type PdfDesignConfig,
  type ProductAssetDto,
  type ProductAttributeSheetDto,
} from '@cdr/contracts';
import { fetchProductExperience } from '@/lib/product-experience-api';
import { catalogHomeSettings } from '@/lib/catalog-home-api';
import { fetchPdfDesignSettings } from '@/lib/pdf-design-api';
import {
  resolvePdfDesign,
  resolvePdfBrandLogo,
  decodePdfDataUrl,
  normalizeLogoBrand,
  pdfImageDataUrl,
} from '@/lib/pdf-designs';
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
    templateId: sheet.schema.template.id,
    supplierCode:
      String(
        sheet.product.attributes.codigo_proveedor?.value ??
          sheet.product.attributes.codigoProveedor?.value ??
          '',
      ) || undefined,
    friendlyName: sheet.product.name,
    technicalDescription: exported
      .map(
        (attribute) =>
          `${attribute.label}: ${displayMeasurement(attribute.value!, { unit: attribute.unit ?? undefined, attributeKey: attribute.key }, unitSystem)?.primary.text ?? String(attribute.value)}${attribute.unit && !displayMeasurement(attribute.value!, { unit: attribute.unit, attributeKey: attribute.key }, unitSystem) ? ` ${attribute.unit}` : ''}`,
      )
      .join('. '),
    name: sheet.product.name,
    brand: sheet.product.brand,
    category: sheet.schema.category.name,
    template: sheet.schema.template.name,
    unifiedCode: unifiedCodeFromSheet(authorizedSheet),
    unitSystem,
    attributes: exported.map((attribute) => ({
      key: attribute.key,
      ...(attribute.sectionLabel
        ? { sectionLabel: attribute.sectionLabel, sectionNumber: attribute.sectionNumber }
        : sheet.schema.sections?.length
          ? { sectionNumber: sheet.schema.sections.length + 1 }
          : {}),
      ...(attribute.sectionKey ? { sectionKey: attribute.sectionKey } : {}),
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
const HOME_PDF_BRANDS: Record<string, string> = {
  BOSCH: 'bosch',
  CHALLENGE: 'challenge',
  CYCLO: 'cyclo',
  DJF: 'djf',
  FORCELUBE: 'forcelube',
  GMB: 'gmb',
  GOODYEAR: 'goodyear',
  'JASON INDUSTRIAL': 'jason-industrial',
  KOYO: 'koyo-jtekt',
  MRK: 'mrk',
  NSK: 'nsk',
  OKAMI: 'okami',
  SCHAEFFLER: 'schaeffler-luk-ina-fag',
  SEPCO: 'sepco',
  SNR: 'snr',
  STANLEY: 'stanley',
  STP: 'stp',
  TIMKEN: 'timken',
  VDC: 'vdc',
  'WD 40': 'wd-40',
};
export async function technicalSheetBrand(
  brand: string | null,
  signal?: AbortSignal,
  registeredBrands?: Awaited<ReturnType<typeof listCatalogParameters>>,
) {
  if (!brand?.trim()) return {};
  const brands = registeredBrands ?? (await listCatalogParameters('brand', signal));
  const key = normalizeLogoBrand(brand),
    aliases: Record<string, string> = { FAG: 'SCHAEFFLER', INA: 'SCHAEFFLER', LUK: 'SCHAEFFLER' };
  const alias = aliases[key] ?? aliases[key.split(' ')[0] ?? ''];
  const active = brands.filter((item) => item.active);
  const selected = active.find((item) => normalizeLogoBrand(item.value) === key);
  const parent =
    active
      .filter((item) => item.logoDataUrl && key.startsWith(normalizeLogoBrand(item.value) + ' '))
      .sort((a, b) => b.value.length - a.value.length)[0] ??
    active.find((item) => item.logoDataUrl && normalizeLogoBrand(item.value) === alias);
  const own = selected?.logoDataUrl ? selected : parent;
  if (own?.logoDataUrl)
    return {
      brandLogo: own.logoDataUrl,
      brandLogoSource: own === selected ? ('Propio' as const) : ('Heredado' as const),
      brandLogoVia: own.value,
      brandDescription: selected?.description ?? undefined,
    };
  const saved = await catalogHomeSettings(undefined, signal);
  const homeKey =
    alias ??
    (HOME_PDF_BRANDS[key]
      ? key
      : Object.keys(HOME_PDF_BRANDS)
          .filter((candidate) => key.startsWith(candidate + ' '))
          .sort((a, b) => b.length - a.length)[0]);
  const home =
    saved.config.brands.find((entry) => normalizeLogoBrand(entry.key) === key) ??
    saved.config.brands.find((entry) => normalizeLogoBrand(entry.key) === homeKey);
  const url = home ? home.image : homeKey ? `/home/marcas/${HOME_PDF_BRANDS[homeKey]}.png` : null;
  if (!url) return { brandDescription: selected?.description ?? undefined };
  if (url.startsWith('data:'))
    return {
      brandLogo: url,
      brandLogoSource: 'Inicio' as const,
      brandLogoVia: home?.key ?? homeKey,
      brandDescription: selected?.description ?? undefined,
    };
  const bytes = await bytesFromPrivateUrl(url, signal);
  if (url.endsWith('.svg')) {
    const copy = new ArrayBuffer(bytes.length);
    new Uint8Array(copy).set(bytes);
    return {
      brandLogoSource: 'Inicio' as const,
      brandLogoVia: home?.key ?? homeKey,
      brandLogo: await pdfImageDataUrl(new File([copy], 'marca.svg', { type: 'image/svg+xml' })),
      brandDescription: selected?.description ?? undefined,
    };
  }
  const mime = bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg' : 'image/png';
  return {
    brandLogoSource: 'Inicio' as const,
    brandLogoVia: home?.key ?? homeKey,
    brandLogo: `data:${mime};base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))}`,
    brandDescription: selected?.description ?? undefined,
  };
}
export async function technicalSheetLogo(signal?: AbortSignal): Promise<Uint8Array> {
  return bytesFromPrivateUrl('/brand/cdr-logo-color.png', signal);
}
export function technicalSheetDesign(sheet: ProductAttributeSheetDto, config: PdfDesignConfig) {
  const brandLogo = resolvePdfBrandLogo(config, sheet.product.brand ?? '');
  return {
    ...resolvePdfDesign(config, sheet.schema.template.id),
    ...(config.cdrLogoDataUrl ? { cdrLogo: decodePdfDataUrl(config.cdrLogoDataUrl) } : {}),
    ...(brandLogo ? { brandLogo: brandLogo.dataUrl } : {}),
  };
}
/** Names and approved, current commercial copy come from the server's variant projection. */
export interface TechnicalSheetVariantSelection {
  readonly type: 'automotriz' | 'industrial';
  readonly applicationId?: string;
}
export async function technicalSheetCopy(
  sheet: ProductAttributeSheetDto,
  signal?: AbortSignal,
  selection?: TechnicalSheetVariantSelection,
) {
  const experience = await fetchProductExperience(sheet.product.id, signal);
  const variant = selection
    ? experience.variants.find(
        (variant) =>
          variant.tipo === selection.type &&
          (selection.applicationId
            ? variant.aplicacion?.id === selection.applicationId
            : variant.aplicacion === null),
      )
    : experience.variants[0];
  const copy = variant?.descripcionEcommerce;
  return {
    friendlyName: experience.nombreGeneral || sheet.product.name,
    ...(copy ? { description: copy.descripcion } : {}),
  };
}
export async function downloadTechnicalSheetPdf(input: TechnicalSheetDocument): Promise<void> {
  const bytes = await createTechnicalSheetPdf(input);
  downloadBinary(bytes, technicalSheetFilename(input.sku), 'application/pdf');
}
export async function authorizeBulkTechnicalSheets(signal?: AbortSignal): Promise<void> {
  const response = await authenticatedBffFetch('/api/catalog/technical-sheets/authorize', {
    cache: 'no-store',
    signal,
  });
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? 'Tu perfil no tiene habilitada la generación masiva de fichas técnicas PDF.'
        : 'No se pudo comprobar el permiso de fichas técnicas. Vuelve a intentarlo.',
    );
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('allowed' in body) || body.allowed !== true)
    throw new Error('No se pudo comprobar el permiso de fichas técnicas.');
}
export async function downloadTechnicalSheetsZip(
  products: readonly { id: string; sku: string }[],
  assetsByProduct: Readonly<Record<string, ProductAssetDto[]>>,
  options: { signal?: AbortSignal; onProgress?: (complete: number, total: number) => void } = {},
): Promise<number> {
  if (!products.length || products.length > MAX_TECHNICAL_SHEETS_PER_ZIP)
    throw new Error(`Selecciona entre 1 y ${MAX_TECHNICAL_SHEETS_PER_ZIP} SKU con los filtros.`);
  await authorizeBulkTechnicalSheets(options.signal);
  const eligible = products;
  const entries: BinaryZipEntry[] = [],
    filenames = new Set<string>();
  const [cdrLogo, brands, settings] = await Promise.all([
    technicalSheetLogo(options.signal),
    listCatalogParameters('brand', options.signal),
    fetchPdfDesignSettings(options.signal),
  ]);
  for (const product of [...eligible].sort((a, b) =>
    a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0,
  )) {
    options.signal?.throwIfAborted();
    const [sheet, media] = await Promise.all([
      fetchProductTechnicalSheet(product.id, options.signal),
      technicalSheetMedia(assetsByProduct[product.id] ?? [], options.signal),
    ]);
    const [brand, copy] = await Promise.all([
      technicalSheetBrand(sheet.product.brand, options.signal, brands),
      technicalSheetCopy(sheet, options.signal),
    ]);
    const bytes = await createTechnicalSheetPdf({
      ...technicalSheetDocument(sheet, 'metric'),
      cdrLogo,
      media,
      ...brand,
      ...technicalSheetDesign(sheet, settings.config),
      ...copy,
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
    options.onProgress?.(entries.length, eligible.length);
  }
  options.signal?.throwIfAborted();
  downloadBinary(createBinaryZip(entries), 'fichas-tecnicas-cdr.zip', 'application/zip');
  return entries.length;
}
