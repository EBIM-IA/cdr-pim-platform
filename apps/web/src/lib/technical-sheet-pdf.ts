import type { PDFFont, PDFPage, PDFImage, PDFEmbeddedPage } from 'pdf-lib';
import { DEFAULT_PDF_DESIGN, type PdfDesign, type PdfDesignConfig } from '@cdr/contracts';
import { decodePdfDataUrl, PDF_FONTS } from '@/lib/pdf-designs';

export interface TechnicalSheetMedia {
  readonly kind: 'photo' | 'plan';
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}
export interface TechnicalSheetDocument {
  readonly sku: string;
  readonly name: string;
  readonly description?: string;
  readonly technicalDescription?: string;
  readonly supplierCode?: string;
  readonly friendlyName?: string;
  readonly brand: string | null;
  readonly category: string;
  readonly template: string;
  readonly templateId?: string;
  readonly unifiedCode?: string;
  readonly unitSystem: 'metric' | 'imperial';
  readonly attributes: readonly {
    key: string;
    label: string;
    value: string;
    sectionKey?: string | null;
    sectionLabel?: string;
    sectionNumber?: number;
  }[];
  readonly brandDescription?: string;
  readonly brandLogo?: string;
  readonly cdrLogo?: Uint8Array;
  readonly media?: readonly TechnicalSheetMedia[];
  readonly design?: PdfDesign;
  readonly templateRule?: PdfDesignConfig['templateRules'][number];
  readonly customFonts?: PdfDesignConfig['fonts'];
  /** Optional byte sources make custom-font generation deterministic outside the browser too. */
  readonly fontBytes?: {
    head?: Uint8Array;
    headBold?: Uint8Array;
    body?: Uint8Array;
    bodyBold?: Uint8Array;
  };
}

export function wrapPdfText(value: string, font: PDFFont, size: number, width: number): string[] {
  const output: string[] = [],
    safeWidth = Math.max(12, width);
  for (const paragraph of value.replace(/\r/gu, '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= safeWidth) {
        line = candidate;
        continue;
      }
      if (line) {
        output.push(line);
        line = '';
      }
      for (const character of word) {
        if (line && font.widthOfTextAtSize(line + character, size) > safeWidth) {
          output.push(line);
          line = '';
        }
        line += character;
      }
    }
    output.push(line);
  }
  return output;
}
const lower = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'y',
  'e',
  'o',
  'u',
  'a',
  'al',
  'en',
  'con',
  'por',
  'para',
  'sin',
  'sobre',
]);
export function pdfTextCase(value: string, mode: PdfDesign['title']['case']) {
  if (mode === 'upper') return value.toLocaleUpperCase('es');
  if (mode === 'lower') return value.toLocaleLowerCase('es');
  if (mode !== 'title') return value;
  return value
    .toLocaleLowerCase('es')
    .replace(
      /(^|[\s(/-])(\p{L}+)/gu,
      (all: string, before: string, word: string, at: number) =>
        before +
        (at && lower.has(word) ? word : word.charAt(0).toLocaleUpperCase('es') + word.slice(1)),
    );
}
const fontCache = new Map<string, Promise<Uint8Array>>();
async function fontFile(name: string) {
  let pending = fontCache.get(name);
  if (!pending) {
    pending = fetch(`/pdf-fonts/${name}`).then(async (response) => {
      if (!response.ok) throw new Error(`No se pudo cargar la fuente ${name}.`);
      return new Uint8Array(await response.arrayBuffer());
    });
    fontCache.set(name, pending);
    pending.catch(() => fontCache.delete(name));
  }
  return pending;
}

/** One renderer for designer preview, individual download and ZIP. Inputs are already server-authorized. */
export async function createTechnicalSheetPdf(input: TechnicalSheetDocument): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib'),
    pdf = await PDFDocument.create();
  const d = input.design ?? DEFAULT_PDF_DESIGN,
    s = d.sections,
    f = d.footer;
  pdf.setTitle(`Ficha técnica ${input.sku}`);
  pdf.setAuthor('Casa del Rulimán');
  pdf.setProducer('CDR PIM');
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica),
    helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const embedded = new Map<string, Promise<PDFFont>>();
  async function embedFont(bytes: Uint8Array, id: string) {
    let pending = embedded.get(id);
    if (!pending) {
      const fontkit = await import('@pdf-lib/fontkit');
      pdf.registerFontkit(fontkit.default);
      pending = pdf.embedFont(bytes, { subset: true });
      embedded.set(id, pending);
    }
    return pending;
  }
  const simulatedBold = new Set<PDFFont>();
  async function fontPair(kind: 'head' | 'body'): Promise<[PDFFont, PDFFont]> {
    const id = d.fonts[kind],
      provided = input.fontBytes?.[kind],
      providedBold = input.fontBytes?.[kind === 'head' ? 'headBold' : 'bodyBold'];
    if (provided) {
      const normal = await embedFont(provided, `${kind}-r`),
        heavy = providedBold
          ? await embedFont(providedBold, `${kind}-b`)
          : await embedFont(provided, `${kind}-fake-bold`);
      if (!providedBold) simulatedBold.add(heavy);
      return [normal, heavy];
    }
    if (id === 'helvetica') return [helvetica, helveticaBold];
    const custom = input.customFonts?.find((entry) => entry.id === id);
    if (custom) {
      const normal = await embedFont(decodePdfDataUrl(custom.regularDataUrl), `${id}-r`),
        heavy = custom.boldDataUrl
          ? await embedFont(decodePdfDataUrl(custom.boldDataUrl), `${id}-b`)
          : await embedFont(decodePdfDataUrl(custom.regularDataUrl), `${id}-fake-bold`);
      if (!custom.boldDataUrl) simulatedBold.add(heavy);
      return [normal, heavy];
    }
    // Server callers supply bytes; browser callers load bundled, licensed local fonts.
    if (typeof window === 'undefined') return [helvetica, helveticaBold];
    const builtin = PDF_FONTS.find((entry) => entry[0] === id);
    if (!builtin?.[2]) throw new Error(`La fuente ${id} no está disponible.`);
    return [
      await embedFont(await fontFile(builtin[2]), `${id}-r`),
      await embedFont(await fontFile(builtin[3]), `${id}-b`),
    ];
  }
  const [[regular, bold], [, heading]] = await Promise.all([fontPair('body'), fontPair('head')]);
  const [width, height] = d.page.size === 'Carta' ? [612, 792] : [595.28, 841.89],
    margin = (d.page.margin * 72) / 25.4,
    usable = width - 2 * margin;
  const color = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  const c = Object.fromEntries(
    Object.entries(d.colors).map(([key, value]) => [key, color(value)]),
  ) as Record<keyof PdfDesign['colors'], ReturnType<typeof rgb>>;
  const symbolFont = await pdf.embedFont(StandardFonts.Symbol),
    symbolCharacters = new Set(symbolFont.getCharacterSet());
  const sets = new Map<PDFFont, Set<number>>();
  const characterSet = (font: PDFFont) => {
    let set = sets.get(font);
    if (!set) {
      set = new Set(font.getCharacterSet());
      sets.set(font, set);
    }
    return set;
  };
  function clean(value: string, font = regular) {
    const set = characterSet(font);
    return Array.from(value.normalize('NFC'))
      .filter((char) => char.charCodeAt(0) >= 32 || ['\n', '\r', '\t'].includes(char))
      .map((char) =>
        set.has(char.codePointAt(0) ?? 0) ||
        symbolCharacters.has(char.codePointAt(0) ?? 0) ||
        ['\n', '\r', '\t'].includes(char)
          ? char
          : `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`,
      )
      .join('');
  }
  function runs(value: string, font: PDFFont) {
    const result: { value: string; font: PDFFont }[] = [],
      set = characterSet(font);
    for (const char of clean(value, font)) {
      const actual = set.has(char.codePointAt(0) ?? 0) ? font : symbolFont,
        previous = result.at(-1);
      if (previous?.font === actual) previous.value += char;
      else result.push({ value: char, font: actual });
    }
    return result;
  }
  const measure = (value: string, font: PDFFont, size: number) =>
    runs(value, font).reduce((sum, run) => sum + run.font.widthOfTextAtSize(run.value, size), 0);
  let page!: PDFPage,
    y = height - margin;
  function text(value: string, x: number, at: number, size: number, font = regular, tone = c.text) {
    let cursor = x;
    for (const run of runs(value, font)) {
      page.drawText(run.value, { x: cursor, y: at, size, font: run.font, color: tone });
      if (simulatedBold.has(font))
        page.drawText(run.value, {
          x: cursor + size * 0.025,
          y: at,
          size,
          font: run.font,
          color: tone,
        });
      cursor += run.font.widthOfTextAtSize(run.value, size);
    }
  }
  function lines(value: string, font: PDFFont, size: number, available: number) {
    const output: string[] = [],
      safeWidth = Math.max(12, available);
    for (const paragraph of clean(value, font).replace(/\r/gu, '').split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (measure(candidate, font, size) <= safeWidth) {
          line = candidate;
          continue;
        }
        if (line) {
          output.push(line);
          line = '';
        }
        for (const char of word) {
          if (line && measure(line + char, font, size) > safeWidth) {
            output.push(line);
            line = '';
          }
          line += char;
        }
      }
      output.push(line);
    }
    return output;
  }
  function fitted(value: string, font: PDFFont, size: number, available: number) {
    let out = clean(value, font);
    if (measure(out, font, size) <= available) return out;
    while (out && measure(`${out}…`, font, size) > available) out = out.slice(0, -1);
    return `${out}…`;
  }
  function line(x1: number, y1: number, x2: number, y2: number, tone = c.line, thickness = 0.7) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color: tone, thickness });
  }
  function box(
    x: number,
    top: number,
    w: number,
    h: number,
    radius: number,
    fill?: ReturnType<typeof rgb>,
    stroke?: ReturnType<typeof rgb>,
    thickness = 1,
  ) {
    const r = Math.max(0, Math.min(radius, w / 2, h / 2));
    if (!r) {
      page.drawRectangle({
        x,
        y: top - h,
        width: w,
        height: h,
        ...(fill ? { color: fill } : {}),
        ...(stroke && thickness
          ? { borderColor: stroke, borderWidth: thickness }
          : { borderWidth: 0 }),
      });
      return;
    }
    const path = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    page.drawSvgPath(path, {
      x,
      y: top,
      ...(fill ? { color: fill } : { color: rgb(1, 1, 1), opacity: 0 }),
      ...(stroke && thickness
        ? { borderColor: stroke, borderWidth: thickness, borderOpacity: 1 }
        : { borderWidth: 0 }),
    });
  }
  const qrText =
    f.qrMode === 'product'
      ? f.productUrl.replace(/\{codigo\}/gu, encodeURIComponent(input.sku))
      : f.qrUrl;
  let qr: { size: number; data: Uint8Array } | undefined;
  if (f.qr) {
    const { create } = await import('qrcode');
    const matrix = create(qrText, { errorCorrectionLevel: 'M' }).modules;
    qr = { size: matrix.size, data: matrix.data };
  }
  const footLines = lines(f.lines, regular, f.size, usable * 0.64),
    footLineHeight = f.size * 1.45,
    footHeight = Math.max(
      f.band ? 40 : 26,
      qr ? f.qrSize + 18 : 0,
      footLines.length * footLineHeight + 24,
    ),
    bottom = footHeight + (f.note ? 28 : 12);
  if (footHeight > height * 0.35)
    throw new Error(
      'El contacto del pie ocupa demasiado espacio. Reduce las líneas o el tamaño del texto.',
    );
  async function image(bytes: Uint8Array | string, mime?: string): Promise<PDFImage> {
    const png =
      typeof bytes === 'string'
        ? bytes.startsWith('data:image/png;')
        : mime === 'image/png' || (bytes[0] === 137 && bytes[1] === 80);
    return png ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
  }
  const cdrLogo = input.cdrLogo ? await image(input.cdrLogo) : null,
    brandLogo = input.brandLogo ? await image(input.brandLogo) : null;
  function imageInBox(
    im: PDFImage | PDFEmbeddedPage,
    x: number,
    top: number,
    w: number,
    h: number,
    isPage = false,
  ) {
    const scale = Math.min(w / im.width, h / im.height),
      iw = im.width * scale,
      ih = im.height * scale,
      opts = { x: x + (w - iw) / 2, y: top - (h + ih) / 2, width: iw, height: ih };
    if (isPage) page.drawPage(im as PDFEmbeddedPage, opts);
    else page.drawImage(im as PDFImage, opts);
  }
  function newPage() {
    page = pdf.addPage([width, height]);
    y = height - margin;
    if (pdf.getPageCount() > 1) {
      if (d.header.repeat && cdrLogo) {
        imageInBox(cdrLogo, d.header.swap ? width - margin - 110 : margin, y, 110, 22);
        text(
          fitted(`${input.sku} · ${input.template}`, regular, 8.5, usable - 130),
          d.header.swap ? margin : margin + 130,
          y - 14,
          8.5,
          regular,
          c.label,
        );
        line(margin, y - 30, width - margin, y - 30);
        y -= 46;
      } else y -= 12;
    }
  }
  function ensure(space: number) {
    if (y - space < bottom) newPage();
  }
  newPage();
  const logoH = d.header.logoH,
    brandH = (logoH * d.header.brandScale) / 100,
    brandW = (usable * d.header.brandW) / 100;
  let headerHeight = 0;
  if (d.header.cdr) {
    if (cdrLogo) {
      const w = Math.min(usable * 0.5, (logoH * cdrLogo.width) / cdrLogo.height);
      imageInBox(cdrLogo, d.header.swap ? width - margin - w : margin, y, w, logoH);
    } else
      text(
        'CASA DEL RULIMÁN',
        d.header.swap ? width - margin - 160 : margin,
        y - logoH / 2,
        15,
        heading,
        c.title,
      );
    headerHeight = logoH;
  }
  if (d.header.brand) {
    const x = d.header.swap ? margin : width - margin - brandW;
    if (brandLogo) imageInBox(brandLogo, x, y - (logoH - brandH) / 2, brandW, brandH);
    else if (input.brand)
      text(fitted(input.brand, heading, 18, brandW), x, y - logoH / 2, 18, heading, c.title);
    headerHeight = Math.max(headerHeight, brandH);
  }
  if (headerHeight) y -= headerHeight + d.header.gap;
  const title =
    d.title.source === 'supplier'
      ? input.supplierCode || input.sku
      : d.title.source === 'name'
        ? input.name
        : d.title.source === 'friendly'
          ? input.friendlyName || input.name
          : d.title.source === 'codeName'
            ? `${input.sku} · ${input.name}`
            : input.sku;
  const subtitle = {
    template: input.template,
    category: input.category,
    name: input.name,
    brand: input.brand ?? '',
    none: '',
  }[d.title.sub];
  for (const row of lines(pdfTextCase(title, d.title.case), heading, d.title.size, usable)) {
    ensure(d.title.size * 1.1);
    y -= d.title.size * 0.92;
    text(row, margin, y, d.title.size, heading, c.title);
    y -= d.title.size * 0.12;
  }
  for (const row of lines(
    pdfTextCase(subtitle, d.title.subCase),
    heading,
    d.title.subSize,
    usable,
  ).filter(Boolean)) {
    ensure(d.title.subSize * 1.2);
    y -= d.title.subSize * 1.2;
    text(row, margin, y, d.title.subSize, heading, c.title);
  }
  if (d.title.rule) {
    y -= 12;
    line(margin, y, margin + Math.min(usable, d.title.ruleW), y, c.primary, d.title.ruleT);
  }
  y -= 20;
  const description =
    d.desc.source === 'tech'
      ? (input.technicalDescription ?? input.description)
      : (input.description ?? input.technicalDescription);
  if (d.desc.show && description) {
    if (d.desc.label) {
      ensure(d.desc.size * 2);
      y -= d.desc.size * 1.2;
      text(d.desc.label, margin, y, d.desc.size * 1.12, bold, c.title);
      y -= 3;
    }
    const rows = lines(description, regular, d.desc.size, usable),
      selected =
        rows.length > d.desc.maxLines
          ? [
              ...rows.slice(0, d.desc.maxLines - 1),
              fitted(rows.slice(d.desc.maxLines - 1).join(' '), regular, d.desc.size, usable),
            ]
          : rows;
    for (const [index, row] of selected.entries()) {
      ensure(d.desc.size * 1.4);
      y -= d.desc.size * 1.4;
      const words = row.split(' '),
        extra =
          index < selected.length - 1 && d.desc.justify && words.length > 1
            ? Math.min(6, (usable - measure(row, regular, d.desc.size)) / (words.length - 1))
            : 0;
      if (!extra) text(row, margin, y, d.desc.size);
      else {
        let x = margin;
        for (const word of words) {
          text(word, x, y, d.desc.size);
          x += measure(`${word} `, regular, d.desc.size) + extra;
        }
      }
    }
    y -= 22;
  }
  const boxes: {
    kind: 'photo' | 'plan';
    w: number;
    h: number;
    source?: TechnicalSheetMedia;
    drawing?: PDFImage | PDFEmbeddedPage;
    note?: string;
  }[] = [];
  for (const kind of ['photo', 'plan'] as const) {
    if (kind === 'photo' ? !d.media.photo : !d.media.plano) continue;
    const source = input.media?.find((entry) => entry.kind === kind);
    if (!source && d.media.hideEmpty) continue;
    let drawing: PDFImage | PDFEmbeddedPage | undefined, note: string | undefined;
    if (source?.mimeType === 'application/pdf') {
      const drawings = await pdf.embedPdf(source.bytes, [0]);
      drawing = drawings[0];
      if (!drawing) throw new Error('El plano PDF no contiene páginas.');
    } else if (source && ['image/png', 'image/jpeg'].includes(source.mimeType))
      drawing = await image(source.bytes, source.mimeType);
    else if (source) note = `Formato ${source.mimeType} sin vista previa`;
    boxes.push({
      kind,
      w: d.media.h * (kind === 'photo' ? 1.05 : 0.84),
      h: d.media.h * (kind === 'photo' ? 1 : 0.8),
      source,
      drawing,
      note,
    });
  }
  if (boxes.length) {
    const gap = 26,
      total = boxes.reduce((sum, item) => sum + item.w, 0) + gap * (boxes.length - 1),
      scale = Math.min(1, usable / total),
      maxH = Math.max(...boxes.map((item) => item.h)) * scale;
    ensure(maxH + 10);
    let x = margin + (usable - total * scale) / 2;
    for (const item of boxes) {
      const w = item.w * scale,
        h = item.h * scale,
        top = y - (maxH - h) / 2;
      box(x, top, w, h, d.media.radius, rgb(1, 1, 1));
      if (item.kind === 'plan' && d.media.grid) {
        for (let gx = x + 9; gx < x + w - 4; gx += 9)
          line(gx, top - 4, gx, top - h + 4, rgb(0.88, 0.91, 0.95), 0.35);
        for (let gy = top - 9; gy > top - h + 4; gy -= 9)
          line(x + 4, gy, x + w - 4, gy, rgb(0.88, 0.91, 0.95), 0.35);
      }
      if (item.drawing)
        imageInBox(
          item.drawing,
          x + 10,
          top - 10,
          w - 20,
          h - 20,
          item.source?.mimeType === 'application/pdf',
        );
      else {
        const empty = lines(
          item.note ?? (item.kind === 'photo' ? 'Fotografía no registrada' : 'Plano no registrado'),
          regular,
          8.5,
          w - 24,
        );
        empty.forEach((row, index) =>
          text(
            row,
            x + (w - measure(row, regular, 8.5)) / 2,
            top - h / 2 - index * 11,
            8.5,
            regular,
            c.label,
          ),
        );
      }
      if (d.media.border) box(x, top, w, h, d.media.radius, undefined, c.primary, d.media.border);
      x += w + gap * scale;
    }
    y -= maxH + 26;
  }
  const hidden = new Set(input.templateRule?.hiddenSections ?? ['ident', 'docs']),
    aliases = { car: 'Especificaciones', ...input.templateRule?.sectionTitles },
    grouped = new Map<
      string,
      { title: string; rows: TechnicalSheetDocument['attributes'][number][] }
    >();
  for (const attribute of input.attributes) {
    const key = attribute.sectionKey ?? 'car';
    if (hidden.has(key)) continue;
    let group = grouped.get(key);
    if (!group) {
      group = {
        title:
          (aliases as Record<string, string>)[key] || attribute.sectionLabel || 'Especificaciones',
        rows: [],
      };
      grouped.set(key, group);
    }
    group.rows.push(attribute);
  }
  const groups = [...grouped.values()].map((group, index) => ({
    ...group,
    title: `${s.numbered ? `${index + 1}. ` : ''}${group.title}`,
  }));
  if (d.index.show && groups.length > 1) {
    const labels = groups.map((group) => pdfTextCase(group.title, d.index.case)).join(' / ');
    for (const row of lines(labels, regular, d.index.size, usable)) {
      ensure(d.index.size * 1.4 + 12);
      y -= d.index.size * 1.4;
      text(row, margin, y, d.index.size, regular, c.primary);
    }
    y -= 12;
  }
  const inset = s.style === 'line' ? 0 : s.inset,
    ix = margin + inset,
    iw = usable - 2 * inset,
    split = (iw * s.split) / 100,
    labelWidth = Math.max(20, split - 10),
    valueX = ix + split,
    valueWidth = Math.max(20, iw - split),
    labelFont = s.labelBold ? bold : regular,
    valueFont = s.valueBold ? bold : regular,
    lh = Math.max(s.labelSize, s.valueSize) * 1.22,
    baseBandH = s.style === 'line' ? s.titleSize * 1.7 : s.titleSize * 2.5,
    topPad = s.style === 'line' ? 4 : 14,
    bottomPad = s.style === 'line' ? 6 : 14;
  type Row = { labels: string[]; values: string[]; h: number };
  const headerLines = (title: string, continuation = false) =>
    lines(
      pdfTextCase(`${title}${continuation ? ' (continuación)' : ''}`, s.case),
      heading,
      s.titleSize,
      usable - 32,
    );
  const bandHeight = (title: string, continuation = false) =>
    Math.max(baseBandH, headerLines(title, continuation).length * s.titleSize * 1.2 + 16);
  function sectionCard(title: string, rows: Row[], continuation: boolean) {
    const bandH = bandHeight(title, continuation);
    const bodyH = rows.reduce((sum, row) => sum + row.h, 0),
      cardH = bandH + topPad + bodyH + bottomPad,
      top = y;
    if (s.style === 'card')
      box(margin, top, usable, cardH, s.radius, rgb(1, 1, 1), c.primary, s.border);
    if (s.style !== 'line') {
      box(margin, top, usable, bandH, s.radius, c.primary);
      if (s.style === 'card' && s.radius)
        page.drawRectangle({
          x: margin + (s.border || 0.5),
          y: top - bandH,
          width: usable - 2 * (s.border || 0.5),
          height: Math.min(s.radius, bandH / 2),
          color: c.primary,
        });
    }
    const labels = headerLines(title, continuation),
      firstY = top - bandH / 2 + ((labels.length - 1) * s.titleSize * 1.2) / 2 - s.titleSize * 0.35;
    for (const [index, label] of labels.entries()) {
      const x =
        s.align === 'left' || s.style === 'line'
          ? margin + (s.style === 'line' ? 0 : 16)
          : margin + (usable - measure(label, heading, s.titleSize)) / 2;
      text(
        label,
        x,
        firstY - index * s.titleSize * 1.2,
        s.titleSize,
        heading,
        s.style === 'line' ? c.primary : c.bandText,
      );
    }
    if (s.style === 'line')
      line(margin, top - bandH + 2, width - margin, top - bandH + 2, c.primary, 1.2);
    let ry = top - bandH - topPad;
    rows.forEach((row, index) => {
      if (s.zebra && index % 2)
        page.drawRectangle({
          x: ix,
          y: ry - row.h,
          width: iw,
          height: row.h,
          color: rgb(0.97, 0.972, 0.975),
        });
      const base = ry - s.rowPad - lh * 0.78;
      row.labels.forEach((row, index) =>
        text(row, ix + (s.zebra ? 6 : 0), base - index * lh, s.labelSize, labelFont, c.label),
      );
      row.values.forEach((row, index) =>
        text(row, valueX, base - index * lh, s.valueSize, valueFont, c.value),
      );
      ry -= row.h;
      if (s.lines && index < rows.length - 1) line(ix, ry, ix + iw, ry);
    });
    y -= cardH + s.gap;
  }
  const fullPage = height - margin - (d.header.repeat ? 46 : 12) - bottom;
  for (const group of groups) {
    const bandH = bandHeight(group.title, true);
    const rows: Row[] = [];
    for (const row of group.rows) {
      const labels = lines(
          s.symbols
            ? row.label.replace(/^\(([^)]+)\)\s*/u, '$1 · ')
            : row.label.replace(/^\([^)]+\)\s*/u, '').replace(/^[dDBbφδ]\s*[·:-]\s*/u, ''),
          labelFont,
          s.labelSize,
          labelWidth,
        ),
        values = lines(row.value, valueFont, s.valueSize, valueWidth),
        maxLines = Math.max(
          1,
          Math.floor((fullPage - bandH - topPad - bottomPad - s.rowPad * 2) / lh),
        );
      for (let at = 0; at < Math.max(labels.length, values.length); at += maxLines) {
        const L = labels.slice(at, at + maxLines),
          V = values.slice(at, at + maxLines);
        rows.push({ labels: L, values: V, h: Math.max(L.length, V.length) * lh + 2 * s.rowPad });
      }
    }
    const total = rows.reduce((sum, row) => sum + row.h, 0) + bandH + topPad + bottomPad;
    if (s.keep && total <= fullPage && y - total < bottom && y - bottom < fullPage * 0.4) newPage();
    let continuation = false;
    while (rows.length) {
      let count = 0,
        space = 0;
      const room = y - bottom - bandHeight(group.title, continuation) - topPad - bottomPad;
      while (count < rows.length && space + rows[count]!.h <= room) {
        space += rows[count]!.h;
        count++;
      }
      if (!count) {
        newPage();
        const nextRoom = y - bottom - bandHeight(group.title, continuation) - topPad - bottomPad;
        if (rows[0]!.h > nextRoom)
          throw new Error(
            'El título de sección y una fila no caben en la hoja. Reduce el título, los tamaños, los márgenes o el pie de página.',
          );
        continue;
      }
      sectionCard(group.title, rows.splice(0, count), continuation);
      continuation = true;
      if (rows.length) newPage();
    }
  }
  if (!groups.length) {
    ensure(24);
    text(
      'No hay atributos exportables con valor para esta plantilla.',
      margin,
      y - 14,
      9,
      regular,
      c.label,
    );
  }
  const totalPages = pdf.getPageCount();
  for (const [index, current] of pdf.getPages().entries()) {
    page = current;
    if (f.band) page.drawRectangle({ x: 0, y: 0, width, height: footHeight, color: c.footerBg });
    else line(margin, footHeight, width - margin, footHeight);
    const tw = Math.max(0, ...footLines.map((row) => measure(row, regular, f.size))),
      gap = qr && tw ? 14 : 0,
      totalW = (qr ? f.qrSize : 0) + gap + tw,
      x0 =
        f.align === 'left'
          ? margin
          : f.align === 'right'
            ? width - margin - totalW
            : (width - totalW) / 2,
      cy = footHeight / 2,
      tone = f.band ? c.footerText : c.text;
    if (qr) {
      const qx = x0,
        qy = cy - f.qrSize / 2,
        quiet = 4,
        cell = f.qrSize / (qr.size + quiet * 2);
      page.drawRectangle({ x: qx, y: qy, width: f.qrSize, height: f.qrSize, color: rgb(1, 1, 1) });
      for (let r = 0; r < qr.size; r++)
        for (let col = 0; col < qr.size; col++)
          if (qr.data[r * qr.size + col])
            page.drawRectangle({
              x: qx + (quiet + col) * cell,
              y: qy + (qr.size + quiet - r - 1) * cell,
              width: cell + 0.02,
              height: cell + 0.02,
              color: rgb(0, 0, 0),
            });
    }
    footLines.forEach((row, at) =>
      text(
        row,
        x0 + (qr ? f.qrSize : 0) + gap,
        cy + (footLines.length * footLineHeight) / 2 - f.size * 0.95 - at * footLineHeight,
        f.size,
        regular,
        tone,
      ),
    );
    if (f.pageNum) {
      const label = `Página ${index + 1} de ${totalPages}`;
      text(label, width - margin - measure(label, regular, 7), footHeight + 6, 7, regular, c.label);
    }
    if (f.note)
      text(
        fitted(
          `Generada desde CDR PIM · ${input.sku} · ${input.unitSystem === 'metric' ? 'Sistema métrico' : 'Sistema imperial'}`,
          regular,
          6.5,
          usable,
        ),
        margin,
        footHeight + 17,
        6.5,
        regular,
        c.label,
      );
  }
  return pdf.save();
}
