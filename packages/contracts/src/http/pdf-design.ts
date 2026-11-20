import { z } from 'zod';

const key = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/u);
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !value.includes('\u0000'), 'Texto no válido.');
const number = (min: number, max: number) => z.number().finite().min(min).max(max);
const color = z.string().regex(/^#[0-9a-f]{6}$/iu);
const casing = z.enum(['none', 'upper', 'title', 'lower']);
const image = z
  .string()
  .max(700_000)
  .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/u);
const fontData = z
  .string()
  .max(4_000_000)
  .regex(/^data:font\/ttf;base64,[A-Za-z0-9+/]+={0,2}$/u);
const url = z
  .string()
  .max(2000)
  .url()
  .refine((value) => /^https?:\/\//iu.test(value), 'Usa una dirección HTTP o HTTPS.');

/** Presentation only: it never grants access to a product or an attribute. */
export const pdfDesignSchema = z
  .object({
    id: key,
    name: z.string().trim().min(1).max(160),
    page: z.object({ size: z.enum(['A4', 'Carta']), margin: number(5, 30) }).strict(),
    fonts: z.object({ head: key, body: key }).strict(),
    colors: z
      .object({
        primary: color,
        title: color,
        text: color,
        label: color,
        value: color,
        line: color,
        bandText: color,
        footerBg: color,
        footerText: color,
      })
      .strict(),
    header: z
      .object({
        cdr: z.boolean(),
        brand: z.boolean(),
        logoH: number(20, 110),
        brandScale: number(30, 100),
        brandW: number(15, 50),
        swap: z.boolean(),
        gap: number(0, 80),
        repeat: z.boolean(),
      })
      .strict(),
    title: z
      .object({
        source: z.enum(['supplier', 'code', 'name', 'friendly', 'codeName']),
        size: number(10, 48),
        case: casing,
        sub: z.enum(['template', 'category', 'name', 'brand', 'none']),
        subSize: number(7, 30),
        subCase: casing,
        rule: z.boolean(),
        ruleW: number(20, 600),
        ruleT: number(0.3, 4),
      })
      .strict(),
    desc: z
      .object({
        show: z.boolean(),
        source: z.enum(['auto', 'tech']),
        label: text(100),
        size: number(6, 16),
        justify: z.boolean(),
        maxLines: number(1, 40).int(),
      })
      .strict(),
    media: z
      .object({
        photo: z.boolean(),
        plano: z.boolean(),
        h: number(80, 340),
        radius: number(0, 40),
        border: number(0, 4),
        grid: z.boolean(),
        hideEmpty: z.boolean(),
      })
      .strict(),
    index: z.object({ show: z.boolean(), size: number(7, 20), case: casing }).strict(),
    sections: z
      .object({
        style: z.enum(['card', 'band', 'line']),
        align: z.enum(['center', 'left']),
        case: casing,
        titleSize: number(7, 26),
        radius: number(0, 40),
        border: number(0, 4),
        labelSize: number(6, 18),
        valueSize: number(6, 18),
        labelBold: z.boolean(),
        valueBold: z.boolean(),
        split: number(25, 85),
        inset: number(0, 120),
        rowPad: number(1, 20),
        zebra: z.boolean(),
        lines: z.boolean(),
        keep: z.boolean(),
        gap: number(0, 80),
        numbered: z.boolean(),
        symbols: z.boolean(),
      })
      .strict(),
    footer: z
      .object({
        band: z.boolean(),
        qr: z.boolean(),
        qrSize: number(24, 120),
        qrMode: z.enum(['web', 'product']),
        qrUrl: url,
        productUrl: url,
        lines: text(1000),
        size: number(5, 14),
        align: z.enum(['center', 'left', 'right']),
        pageNum: z.boolean(),
        note: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type PdfDesign = z.infer<typeof pdfDesignSchema>;

export const pdfDesignConfigSchema = z
  .object({
    defaultDesignId: key,
    designs: z.array(pdfDesignSchema).min(1).max(30),
    templateRules: z
      .array(
        z
          .object({
            templateId: z.string().trim().min(1).max(120),
            designId: key,
            hiddenSections: z.array(text(120)).max(100),
            sectionTitles: z.record(z.string().max(120), text(160)),
          })
          .strict(),
      )
      .max(300),
    fonts: z
      .array(
        z
          .object({
            id: key,
            name: z.string().trim().min(1).max(120),
            regularDataUrl: fontData,
            boldDataUrl: fontData.optional(),
          })
          .strict(),
      )
      .max(12),
    cdrLogoDataUrl: image.nullable(),
    brandLogos: z
      .array(z.object({ brand: z.string().trim().min(1).max(160), dataUrl: image }).strict())
      .max(250),
  })
  .strict()
  .superRefine((config, ctx) => {
    const ids = new Set(config.designs.map((design) => design.id));
    if (ids.size !== config.designs.length || !ids.has(config.defaultDesignId))
      ctx.addIssue({
        code: 'custom',
        message: 'Diseños repetidos o diseño predeterminado inexistente.',
      });
    for (const rule of config.templateRules)
      if (!ids.has(rule.designId))
        ctx.addIssue({ code: 'custom', message: 'Una plantilla apunta a un diseño inexistente.' });
    if (
      new Set(config.templateRules.map((rule) => rule.templateId)).size !==
      config.templateRules.length
    )
      ctx.addIssue({ code: 'custom', message: 'Una plantilla tiene más de una configuración.' });
    if (
      new Set(config.brandLogos.map((logo) => logo.brand.toLocaleUpperCase('es'))).size !==
      config.brandLogos.length
    )
      ctx.addIssue({ code: 'custom', message: 'Hay logotipos de marca repetidos.' });
    const fontIds = new Set([...PDF_BUILTIN_FONT_IDS, ...config.fonts.map((font) => font.id)]);
    if (fontIds.size !== PDF_BUILTIN_FONT_IDS.length + config.fonts.length)
      ctx.addIssue({ code: 'custom', message: 'Hay identificadores de fuentes repetidos.' });
    for (const design of config.designs)
      if (!fontIds.has(design.fonts.head) || !fontIds.has(design.fonts.body))
        ctx.addIssue({ code: 'custom', message: 'Un diseño utiliza una fuente inexistente.' });
    if (JSON.stringify(config).length > 24_000_000)
      ctx.addIssue({
        code: 'custom',
        message: 'La configuración supera 24 MB. Reduce los archivos antes de guardar.',
      });
  });
export const pdfDesignSettingsSchema = z
  .object({ config: pdfDesignConfigSchema, updatedAt: z.string().datetime().nullable() })
  .strict();
export type PdfDesignConfig = z.infer<typeof pdfDesignConfigSchema>;
export type PdfDesignSettingsDto = z.infer<typeof pdfDesignSettingsSchema>;
export const PDF_BUILTIN_FONT_IDS = [
  'helvetica',
  'saira',
  'rajdhani',
  'barlow',
  'inter',
  'roboto',
  'montserrat',
  'merriweather',
] as const;

/** Approved visual defaults, without simulated product data or unverified telephone numbers. */
export const DEFAULT_PDF_DESIGN: PdfDesign = {
  id: 'cdr',
  name: 'Casa del Rulimán · ejemplos',
  page: { size: 'A4', margin: 10 },
  fonts: { head: 'saira', body: 'saira' },
  colors: {
    primary: '#FF4E00',
    title: '#1F2126',
    text: '#1F2126',
    label: '#4D545C',
    value: '#4D545C',
    line: '#E0E0E0',
    bandText: '#FFFFFF',
    footerBg: '#FF4E00',
    footerText: '#FFFFFF',
  },
  header: {
    cdr: true,
    brand: true,
    logoH: 46,
    brandScale: 72,
    brandW: 36,
    swap: false,
    gap: 22,
    repeat: false,
  },
  title: {
    source: 'supplier',
    size: 24,
    case: 'none',
    sub: 'template',
    subSize: 13,
    subCase: 'none',
    rule: true,
    ruleW: 170,
    ruleT: 0.9,
  },
  desc: { show: true, source: 'auto', label: 'Descripción', size: 10, justify: true, maxLines: 8 },
  media: { photo: true, plano: true, h: 190, radius: 10, border: 1, grid: true, hideEmpty: false },
  index: { show: true, size: 12, case: 'title' },
  sections: {
    style: 'card',
    align: 'center',
    case: 'upper',
    titleSize: 14,
    radius: 14,
    border: 1,
    labelSize: 11,
    valueSize: 10.5,
    labelBold: true,
    valueBold: false,
    split: 68,
    inset: 34,
    rowPad: 5.5,
    zebra: false,
    lines: true,
    keep: true,
    gap: 22,
    numbered: false,
    symbols: true,
  },
  footer: {
    band: true,
    qr: true,
    qrSize: 52,
    qrMode: 'web',
    qrUrl: 'https://www.casadelruliman.ec',
    productUrl: 'https://www.casadelruliman.ec/?s={codigo}',
    lines: '@casadelruliman\nwww.casadelruliman.ec',
    size: 7.5,
    align: 'center',
    pageNum: false,
    note: false,
  },
};
export const COMPACT_PDF_DESIGN: PdfDesign = {
  ...DEFAULT_PDF_DESIGN,
  id: 'compacta',
  name: 'Compacta · una página',
  fonts: { head: 'helvetica', body: 'helvetica' },
  colors: { ...DEFAULT_PDF_DESIGN.colors, primary: '#1D4E89', footerBg: '#1D4E89' },
  header: { ...DEFAULT_PDF_DESIGN.header, logoH: 34, gap: 14 },
  title: { ...DEFAULT_PDF_DESIGN.title, size: 18, subSize: 11 },
  desc: { ...DEFAULT_PDF_DESIGN.desc, size: 9, maxLines: 4 },
  media: { ...DEFAULT_PDF_DESIGN.media, h: 130, radius: 4 },
  index: { ...DEFAULT_PDF_DESIGN.index, show: false },
  sections: {
    ...DEFAULT_PDF_DESIGN.sections,
    style: 'line',
    titleSize: 10.5,
    labelSize: 9,
    valueSize: 9,
    split: 55,
    rowPad: 3,
    gap: 12,
    keep: false,
  },
  footer: {
    ...DEFAULT_PDF_DESIGN.footer,
    band: false,
    qr: false,
    size: 7,
    pageNum: true,
    note: true,
  },
};
export const DEFAULT_PDF_DESIGN_CONFIG: PdfDesignConfig = {
  defaultDesignId: 'cdr',
  designs: [DEFAULT_PDF_DESIGN, COMPACT_PDF_DESIGN],
  templateRules: [],
  fonts: [],
  cdrLogoDataUrl: null,
  brandLogos: [],
};
export const savePdfDesignSettingsSchema = pdfDesignSettingsSchema;
export const createDefaultPdfDesignConfig = (): PdfDesignConfig =>
  JSON.parse(JSON.stringify(DEFAULT_PDF_DESIGN_CONFIG)) as PdfDesignConfig;
export const defaultPdfDesignConfig = DEFAULT_PDF_DESIGN_CONFIG;
