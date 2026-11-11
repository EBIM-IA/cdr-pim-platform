import type { PDFFont, PDFPage, PDFImage } from 'pdf-lib';

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
  readonly brand: string | null;
  readonly category: string;
  readonly template: string;
  readonly unifiedCode?: string;
  readonly unitSystem: 'metric' | 'imperial';
  readonly attributes: readonly { key: string; label: string; value: string }[];
  readonly brandDescription?: string;
  readonly brandLogo?: string;
  readonly cdrLogo?: Uint8Array;
  readonly media?: readonly TechnicalSheetMedia[];
}

/** Wrap by actual font widths; long unbroken codes are split without dropping characters. */
export function wrapPdfText(value: string, font: PDFFont, size: number, width: number): string[] {
  const output: string[] = [];
  for (const paragraph of value.replace(/\r/gu, '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        output.push(line);
        line = '';
      }
      for (const character of word) {
        if (line && font.widthOfTextAtSize(line + character, size) > width) {
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

/** Generates a real, text-searchable PDF. Only supplied, permission-filtered attributes are rendered. */
export async function createTechnicalSheetPdf(input: TechnicalSheetDocument): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Ficha técnica ${input.sku}`);
  pdf.setAuthor('Casa del Rulimán');
  pdf.setProducer('CDR PIM');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const orange = rgb(0.918, 0.357, 0.047),
    ink = rgb(0.12, 0.13, 0.15),
    gray = rgb(0.4, 0.44, 0.49),
    rule = rgb(0.86, 0.88, 0.9);
  const width = 595.28,
    height = 841.89,
    margin = 36,
    usable = width - margin * 2;
  let page!: PDFPage;
  let y = 0;
  const characterSet = new Set(regular.getCharacterSet());
  const clean = (text: string) =>
    Array.from(text.normalize('NFC'))
      .filter(
        (character) => character.charCodeAt(0) >= 32 || ['\n', '\r', '\t'].includes(character),
      )
      .map((character) =>
        characterSet.has(character.codePointAt(0) ?? 0) || ['\n', '\r', '\t'].includes(character)
          ? character
          : `[U+${character.codePointAt(0)!.toString(16).toUpperCase()}]`,
      )
      .join('');
  function text(value: string, x: number, at: number, size: number, heavy = false, muted = false) {
    page.drawText(clean(value), {
      x,
      y: at,
      size,
      font: heavy ? bold : regular,
      color: muted ? gray : ink,
    });
  }
  function newPage() {
    page = pdf.addPage([width, height]);
    page.drawRectangle({ x: margin, y: height - 26, width: usable, height: 4, color: orange });
    y = height - 51;
    if (pdf.getPageCount() > 1) {
      text(`Ficha técnica · ${input.sku}`, margin, y, 10, true);
      y -= 24;
    }
  }
  function ensure(space: number) {
    if (y - space < 64) newPage();
  }
  function paragraph(
    value: string,
    size = 10,
    heavy = false,
    muted = false,
    x = margin,
    available = usable,
  ) {
    const lines = wrapPdfText(clean(value), heavy ? bold : regular, size, available);
    for (const line of lines) {
      ensure(size * 1.45);
      text(line, x, y, size, heavy, muted);
      y -= size * 1.45;
    }
  }
  function section(label: string) {
    ensure(40);
    y -= 15;
    page.drawText(label, { x: margin, y, size: 10, font: bold, color: orange });
    y -= 11;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      color: rule,
      thickness: 0.7,
    });
    y -= 18;
  }
  async function embeddedImage(bytes: Uint8Array, mimeType: string): Promise<PDFImage> {
    if (mimeType === 'image/png') return pdf.embedPng(bytes);
    if (mimeType === 'image/jpeg') return pdf.embedJpg(bytes);
    throw new Error(`Formato de imagen no compatible: ${mimeType}`);
  }
  function imageInBox(
    image: PDFImage,
    x: number,
    top: number,
    boxWidth: number,
    boxHeight: number,
  ) {
    const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
    const w = image.width * scale,
      h = image.height * scale;
    page.drawImage(image, {
      x: x + (boxWidth - w) / 2,
      y: top - h - (boxHeight - h) / 2,
      width: w,
      height: h,
    });
  }
  newPage();
  if (input.cdrLogo) {
    page.drawRectangle({ x: margin, y: y - 44, width: 155, height: 54, color: ink });
    const logo = await pdf.embedPng(input.cdrLogo);
    imageInBox(logo, margin + 6, y + 4, 143, 42);
  } else text('CASA DEL RULIMÁN', margin, y - 10, 16, true);
  text('FICHA TÉCNICA COMERCIAL', margin + 185, y, 10, true);
  y -= 76;
  paragraph(input.name, 18, true);
  y -= 5;
  paragraph(`Código artículo: ${input.sku}`, 11, true);
  y -= 14;
  const photo = input.media?.find((media) => media.kind === 'photo');
  ensure(156);
  const summaryTop = y;
  page.drawRectangle({
    x: margin,
    y: summaryTop - 145,
    width: 165,
    height: 145,
    color: rgb(0.96, 0.97, 0.98),
  });
  if (photo)
    imageInBox(
      await embeddedImage(photo.bytes, photo.mimeType),
      margin + 6,
      summaryTop - 6,
      153,
      133,
    );
  else text('Fotografía no registrada', margin + 13, summaryTop - 78, 9, false, true);
  const facts = [
    ['Marca', input.brand ?? 'No registrada'],
    ['Categoría', input.category],
    ['Plantilla', input.template],
    ['Código unificador', input.unifiedCode ?? 'No registrado'],
  ];
  let factY = summaryTop - 10;
  for (const [label, value] of facts) {
    text(label!, margin + 185, factY, 8, false, true);
    factY -= 13;
    for (const line of wrapPdfText(clean(value!), bold, 10, usable - 185)) {
      text(line, margin + 185, factY, 10, true);
      factY -= 13;
    }
    factY -= 10;
  }
  y = Math.min(summaryTop - 160, factY);
  if (input.description?.trim()) {
    paragraph(input.description, 10, false, true);
    y -= 7;
  }
  if (input.brandLogo || input.brandDescription) {
    ensure(input.brandLogo ? 120 : 70);
    section('Información de marca');
    if (input.brandLogo) {
      const mime = /^data:(image\/(?:png|jpeg));base64,/u.exec(input.brandLogo)?.[1];
      if (!mime) throw new Error('El logo de marca debe ser PNG o JPEG.');
      ensure(64);
      const logo =
        mime === 'image/png'
          ? await pdf.embedPng(input.brandLogo)
          : await pdf.embedJpg(input.brandLogo);
      imageInBox(logo, margin, y, 120, 54);
      y -= 66;
    }
    if (input.brandDescription) paragraph(input.brandDescription, 10, false, true);
  }
  ensure(65);
  section('Especificaciones publicables');
  if (!input.attributes.length)
    paragraph('No hay atributos exportables con valor para esta plantilla.', 10, false, true);
  for (const attribute of input.attributes) {
    const labels = wrapPdfText(clean(attribute.label), regular, 9, usable * 0.44 - 16);
    const values = wrapPdfText(clean(attribute.value), bold, 10, usable * 0.56 - 16);
    // Each row may continue across pages. No fixed row height can truncate a long specification.
    const lines = Math.max(labels.length, values.length);
    if (lines * 15 + 8 < height - 150) ensure(lines * 15 + 8);
    for (let index = 0; index < lines; index++) {
      ensure(17);
      if (index === 0)
        page.drawLine({
          start: { x: margin, y: y + 11 },
          end: { x: width - margin, y: y + 11 },
          color: rule,
          thickness: 0.35,
        });
      if (labels[index]) text(labels[index]!, margin + 8, y, 9, false, true);
      if (values[index]) text(values[index]!, margin + usable * 0.44 + 8, y, 10, true);
      y -= 15;
    }
    y -= 8;
  }
  const plans = input.media?.filter((media) => media.kind === 'plan') ?? [];
  for (const plan of plans) {
    ensure(240);
    section('Plano del producto');
    paragraph(plan.name, 9, false, true);
    y -= 6;
    if (plan.mimeType === 'application/pdf') {
      // Embed page drawing operators only; original actions/annotations are not copied.
      const drawings = await pdf.embedPdf(plan.bytes);
      if (!drawings.length) throw new Error('El plano PDF no contiene páginas.');
      for (const [drawingIndex, drawing] of drawings.entries()) {
        if (drawingIndex > 0 || y - 70 < 100) {
          newPage();
          section(`Plano del producto · ${drawingIndex + 1}/${drawings.length}`);
        }
        const h = Math.min(500, y - 70),
          scale = Math.min(usable / drawing.width, h / drawing.height);
        page.drawPage(drawing, {
          x: margin + (usable - drawing.width * scale) / 2,
          y: y - drawing.height * scale,
          width: drawing.width * scale,
          height: drawing.height * scale,
        });
        y -= drawing.height * scale + 12;
      }
    } else if (['image/png', 'image/jpeg'].includes(plan.mimeType)) {
      ensure(180);
      imageInBox(await embeddedImage(plan.bytes, plan.mimeType), margin, y, usable, 170);
      y -= 184;
    } else
      paragraph(
        `Plano registrado en PIM (${plan.mimeType}); su formato original no tiene representación en esta ficha.`,
        9,
        false,
        true,
      );
  }
  if (!plans.length) {
    y -= 8;
    paragraph('Plano no registrado.', 9, false, true);
  }
  const total = pdf.getPageCount();
  for (const [index, current] of pdf.getPages().entries()) {
    page = current;
    page.drawLine({
      start: { x: margin, y: 49 },
      end: { x: width - margin, y: 49 },
      color: rule,
      thickness: 0.5,
    });
    text(
      `CDR PIM · ${input.unitSystem === 'metric' ? 'Sistema métrico' : 'Sistema imperial'} · ${input.sku}`,
      margin,
      35,
      8,
      false,
      true,
    );
    const pageLabel = `${index + 1} / ${total}`;
    text(pageLabel, width - margin - regular.widthOfTextAtSize(pageLabel, 8), 35, 8, false, true);
  }
  return pdf.save();
}
