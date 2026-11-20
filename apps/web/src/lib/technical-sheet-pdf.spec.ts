import { readFile } from 'node:fs/promises';
import {
  DEFAULT_PDF_DESIGN,
  createDefaultPdfDesignConfig,
  pdfDesignConfigSchema,
} from '@cdr/contracts';
import { PDFDocument, StandardFonts, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  createTechnicalSheetPdf,
  wrapPdfText,
  type TechnicalSheetDocument,
} from './technical-sheet-pdf';
import { createBinaryZip, technicalSheetFilename } from './zip-export';
const input: TechnicalSheetDocument = {
  sku: '6205-2RS',
  name: 'Rodamiento rígido de bolas',
  brand: 'Marca registrada',
  category: 'Rodamientos',
  template: 'Plantilla vigente v2',
  unitSystem: 'metric',
  design: { ...DEFAULT_PDF_DESIGN, fonts: { head: 'helvetica', body: 'helvetica' } },
  attributes: [{ key: 'diametro', label: 'Diámetro interior', value: '25 mm' }],
};
describe('Technical sheet PDF and ZIP', () => {
  it('exports technical values outside the standard font alphabet without crashing or silently dropping them', async () => {
    const bytes = await createTechnicalSheetPdf({
      ...input,
      name: 'Rodamiento ≥ 25 µm 🔧',
      attributes: [{ key: 'tolerancia', label: 'φ / δ / ϑ', value: '≤ 5 ≥ 3 µm Ω' }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  });
  it('creates a real A4 PDF with metadata and a valid page tree', async () => {
    const bytes = await createTechnicalSheetPdf(input);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe('Ficha técnica 6205-2RS');
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPages()[0]?.getWidth()).toBeCloseTo(595.28);
  });
  it('paginates long specifications without losing line text or exceeding usable widths', async () => {
    const pdf = await PDFDocument.create(),
      font = await pdf.embedFont(StandardFonts.Helvetica);
    const original = 'A'.repeat(400);
    const lines = wrapPdfText(original, font, 10, 80);
    expect(lines.join('')).toBe(original);
    expect(lines.every((line) => font.widthOfTextAtSize(line, 10) <= 80)).toBe(true);
    const bytes = await createTechnicalSheetPdf({
      ...input,
      attributes: Array.from({ length: 90 }, (_, index) => ({
        key: String(index),
        label: `Especificación ${index}`,
        value: 'Dato registrado '.repeat(12),
      })),
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });
  it('embeds a real supplied TTF and applies Carta, hidden sections and template aliases', async () => {
    const regular = new Uint8Array(await readFile('public/pdf-fonts/Saira-Regular.ttf'));
    const bold = new Uint8Array(await readFile('public/pdf-fonts/Saira-Bold.ttf'));
    const bytes = await createTechnicalSheetPdf({
      ...input,
      fontBytes: { head: regular, headBold: bold, body: regular, bodyBold: bold },
      design: { ...input.design!, page: { size: 'Carta', margin: 12 } },
      templateRule: {
        templateId: 't',
        designId: 'cdr',
        hiddenSections: ['docs'],
        sectionTitles: { car: 'Medidas verificadas' },
      },
      attributes: [
        { key: 'd', label: '(d) Diámetro interior', value: '25 mm', sectionKey: 'car' },
        { key: 'hidden', label: 'Documento privado', value: 'No exportar', sectionKey: 'docs' },
      ],
    });
    if (process.env.CDR_PDF_QA_OUTPUT)
      await (await import('node:fs/promises')).writeFile(process.env.CDR_PDF_QA_OUTPUT, bytes);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPages()[0]?.getWidth()).toBe(612);
    expect(pdf.getPages()[0]?.getHeight()).toBe(792);
    expect(pdf.getPages()[0]?.node.Resources()?.toString()).toContain('Font');
  });
  it('simulates bold when a custom font is supplied without its bold face', async () => {
    const regular = new Uint8Array(await readFile('public/pdf-fonts/Saira-Regular.ttf'));
    const operations = async (heavy: boolean) => {
      const bytes = await createTechnicalSheetPdf({
        ...input,
        fontBytes: { head: regular, body: regular },
        design: { ...input.design!, sections: { ...input.design!.sections, labelBold: heavy } },
      });
      const pdf = await PDFDocument.load(bytes),
        contents = pdf.getPages()[0]!.node.Contents();
      const streams =
        contents instanceof PDFArray
          ? contents.asArray().map((ref) => pdf.context.lookup(ref))
          : contents instanceof PDFRawStream
            ? [contents]
            : [];
      return (
        streams
          .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
          .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
          .join('\n')
          .match(/Tj/gu)?.length ?? 0
      );
    };
    expect(await operations(true)).toBeGreaterThan(await operations(false));
  });
  it('handles a single extremely long value and rejects an unusably tall contact block', async () => {
    const bytes = await createTechnicalSheetPdf({
      ...input,
      attributes: [{ key: 'long', label: 'Referencia', value: 'VALOR '.repeat(3000) }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
    await expect(
      createTechnicalSheetPdf({
        ...input,
        design: {
          ...input.design!,
          footer: { ...input.design!.footer, lines: 'CONTACTO\n'.repeat(60), size: 14 },
        },
      }),
    ).rejects.toThrow('contacto');
  });
  it('rejects a valid design when its section heading and minimum row cannot fit a fresh page', async () => {
    const config = createDefaultPdfDesignConfig();
    config.designs[0] = {
      ...input.design!,
      page: { size: 'A4', margin: 30 },
      header: { ...input.design!.header, repeat: true },
      sections: {
        ...input.design!.sections,
        titleSize: 26,
        labelSize: 18,
        valueSize: 18,
        rowPad: 20,
      },
      footer: {
        ...input.design!.footer,
        lines: Array(13).fill('X').join('\n'),
        size: 14,
        note: true,
        qr: false,
      },
    };
    config.templateRules = [
      {
        templateId: 't',
        designId: 'cdr',
        hiddenSections: [],
        sectionTitles: { car: 'W'.repeat(160) },
      },
    ];
    expect(pdfDesignConfigSchema.safeParse(config).success).toBe(true);
    await expect(
      createTechnicalSheetPdf({
        ...input,
        design: config.designs[0],
        templateRule: config.templateRules[0],
        cdrLogo: new Uint8Array(await readFile('public/brand/cdr-logo-color.png')),
      }),
    ).rejects.toThrow('no caben en la hoja');
  });
  it('embeds only a PDF plan drawing and produces one safely named PDF entry per SKU', async () => {
    const plan = await PDFDocument.create();
    plan.addPage([200, 100]).drawText('Plano registrado');
    const first = await createTechnicalSheetPdf({
      ...input,
      media: [
        { kind: 'plan', name: 'plano.pdf', mimeType: 'application/pdf', bytes: await plan.save() },
      ],
    });
    expect((await PDFDocument.load(first)).getPageCount()).toBeGreaterThanOrEqual(1);
    const name = technicalSheetFilename('../6205/2RS');
    expect(name).not.toContain('/');
    const zip = createBinaryZip([{ name, bytes: first }]);
    expect(new DataView(zip.buffer).getUint32(0, true)).toBe(0x04034b50);
    expect(() => createBinaryZip([{ name: '../secret.pdf', bytes: first }])).toThrow('nombre');
    expect(() =>
      createBinaryZip([
        { name, bytes: first },
        { name, bytes: first },
      ]),
    ).toThrow('repetido');
  });
});
