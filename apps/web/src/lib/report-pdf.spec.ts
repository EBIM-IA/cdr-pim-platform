import { describe, expect, it } from 'vitest';

import { createReportPdf } from './report-pdf';

describe('report PDF', () => {
  it('creates a downloadable PDF with all rows across repeated table headers', () => {
    const bytes = createReportPdf(
      {
        headers: ['SKU', 'Descripción'],
        rows: Array.from({ length: 100 }, (_, index) => [`SKU-${index}`, `Descripción ${index}`]),
      },
      'Catálogo',
      'Categoría: Rodamientos',
    );
    const source = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    expect(source).toMatch(/^%PDF-1.4/u);
    expect(source).toContain('(SKU-99)');
    expect(source).toContain('/Count 4');
    expect(source).toContain('(Categoría: Rodamientos)');
    expect(source).toContain('xref\n');
    expect(source).toMatch(/%%EOF$/u);
  });
  it('preserves wide reports in column bands and repeats the identifier', () => {
    const headers = [
      'SKU',
      ...Array.from({ length: 25 }, (_, index) => `Atributo de cliente ${index}`),
    ];
    const source = new TextDecoder('windows-1252').decode(
      createReportPdf(
        { headers, rows: [['6205', ...headers.slice(1).map((_, index) => `VALUE-${index}`)]] },
        'Ancho',
      ),
    );
    expect(source).toContain('(VALUE-24)');
    expect(source.match(/\(6205\)/gu)?.length).toBeGreaterThan(1);
  });
});
