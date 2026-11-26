import { DEFAULT_PDF_DESIGN, type PdfDesignConfig } from '@cdr/contracts';

export const PDF_FONTS = [
  ['helvetica', 'Helvetica · estándar PDF', '', ''],
  ['saira', 'Saira · ejemplos CDR', 'Saira-Regular.ttf', 'Saira-Bold.ttf'],
  ['rajdhani', 'Rajdhani · condensada', 'Rajdhani-Medium.ttf', 'Rajdhani-Bold.ttf'],
  ['barlow', 'Barlow', 'Barlow-Regular.ttf', 'Barlow-Bold.ttf'],
  ['inter', 'Inter', 'Inter-Regular.ttf', 'Inter-Bold.ttf'],
  ['roboto', 'Roboto', 'Roboto-Regular.ttf', 'Roboto-Bold.ttf'],
  ['montserrat', 'Montserrat', 'Montserrat-Regular.ttf', 'Montserrat-Bold.ttf'],
  [
    'merriweather',
    'Merriweather · con serifa',
    'Merriweather-Regular.ttf',
    'Merriweather-Bold.ttf',
  ],
] as const;
export function resolvePdfDesign(config: PdfDesignConfig, templateId?: string) {
  const templateRule = config.templateRules.find((rule) => rule.templateId === templateId);
  const design =
    config.designs.find((item) => item.id === (templateRule?.designId ?? config.defaultDesignId)) ??
    config.designs[0] ??
    DEFAULT_PDF_DESIGN;
  return { design, templateRule, customFonts: config.fonts };
}
export const normalizeLogoBrand = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleUpperCase('es')
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
const ALIAS: Record<string, string> = { FAG: 'SCHAEFFLER', INA: 'SCHAEFFLER', LUK: 'SCHAEFFLER' };
export function resolvePdfBrandLogo(config: PdfDesignConfig, brand: string) {
  const normalized = normalizeLogoBrand(brand),
    entries = config.brandLogos.map((entry) => ({
      ...entry,
      key: normalizeLogoBrand(entry.brand),
    }));
  const own = entries.find((entry) => entry.key === normalized);
  if (own) return { dataUrl: own.dataUrl, source: 'Propio', via: own.brand };
  const alias = ALIAS[normalized] ?? ALIAS[normalized.split(' ')[0] ?? ''];
  const parent =
    entries
      .filter((entry) => normalized.startsWith(`${entry.key} `))
      .sort((a, b) => b.key.length - a.key.length)[0] ??
    entries.find((entry) => entry.key === alias);
  return parent ? { dataUrl: parent.dataUrl, source: 'Heredado', via: parent.brand } : undefined;
}
export function suggestedLogoFilename(brand: string): string {
  const stem =
    brand
      .replace(/[<>:"/\\|?*]|\p{Cc}/gu, ' ')
      .replace(/\s+/gu, ' ')
      .replace(/^[. ]+|[. ]+$/gu, '') || 'Logotipo';
  const reserved = /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/iu.test(stem);
  return `${reserved ? `Logo ${stem}` : stem}.png`;
}
export function matchLogoFilename(filename: string, brands: readonly string[]): string {
  const compact = (value: string) => normalizeLogoBrand(value).replace(/[^A-Z0-9]/gu, '');
  const basename =
    filename
      .split(/[/\\]/u)
      .at(-1)
      ?.replace(/\.[^.]+$/u, '') ?? '';
  const literalMatch = brands.find(
    (brand) => brand.localeCompare(basename, 'es', { sensitivity: 'accent' }) === 0,
  );
  if (literalMatch) return literalMatch;
  const name = normalizeLogoBrand(basename);
  const exact = compact(name);
  if (!exact) return '';
  const exactMatches = brands.filter((brand) => compact(brand) === exact);
  if (exactMatches.length > 0) return exactMatches.length === 1 ? exactMatches[0]! : '';
  const withoutLabels = compact(
    name.replace(
      /\b(LOGOTIPO|LOGOTYPE|LOGO|MARCA|BRAND|COLOR|OFICIAL|FINAL|HD|RGB|CMYK|V\d+)\b/gu,
      '',
    ),
  );
  if (!withoutLabels) return '';
  const matchesWithoutLabels = brands.filter((brand) => compact(brand) === withoutLabels);
  if (matchesWithoutLabels.length > 0)
    return matchesWithoutLabels.length === 1 ? matchesWithoutLabels[0]! : '';
  return (
    [...brands]
      .sort((a, b) => b.length - a.length)
      .find((brand) => compact(brand).length >= 3 && withoutLabels.startsWith(compact(brand))) ?? ''
  );
}
export function decodePdfDataUrl(value: string): Uint8Array {
  const raw = atob(value.slice(value.indexOf(',') + 1));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
export async function pdfImageDataUrl(file: File): Promise<string> {
  if (!/\.(png|jpe?g|svg|webp)$/iu.test(file.name) || file.size > 5 * 1024 * 1024)
    throw new Error('Elige PNG, JPG, SVG o WEBP de hasta 5 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
      image.src = url;
    });
    const scale = Math.min(1, 800 / Math.max(image.naturalWidth, image.naturalHeight)),
      canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo convertir el logotipo.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/png');
    if (data.length > 700_000)
      throw new Error('La imagen sigue siendo demasiado grande. Usa un logotipo más sencillo.');
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
