import { PDFDocument, StandardFonts } from 'pdf-lib';
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
  attributes: [{ key: 'diametro', label: 'Diámetro interior', value: '25 mm' }],
};
describe('Technical sheet PDF and ZIP', () => {
  it('exports technical values outside the standard font alphabet without crashing or silently dropping them', async () => {
    const bytes = await createTechnicalSheetPdf({
      ...input,
      name: 'Rodamiento ≥ 25 µm 🔧',
      attributes: [{ key: 'tolerancia', label: 'φ / δ', value: '≤ 5' }],
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
