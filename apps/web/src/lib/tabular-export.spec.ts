import { describe, expect, it } from 'vitest';

import { createCsvText, createXlsxBytes } from './tabular-export';

const data = {
  headers: ['SKU', 'Descripción'],
  rows: [['6202;2RS', 'Rodamiento "premium"']],
  sheetName: 'Productos',
} as const;

describe('tabular export', () => {
  it('creates an Excel-friendly CSV with BOM, semicolons and escaped quotes', () => {
    const csv = createCsvText(data);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"SKU";"Descripción"\r\n');
    expect(csv).toContain('"6202;2RS";"Rodamiento ""premium"""');
    expect(csv).toMatch(/\r\n$/u);
  });

  it('neutralizes spreadsheet formulas in untrusted text cells', () => {
    const csv = createCsvText({ headers: ['Dato'], rows: [['=HYPERLINK("bad")']] });
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
  });

  it('creates an OOXML ZIP containing the filtered worksheet values', () => {
    const bytes = createXlsxBytes(data);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain('xl/worksheets/sheet1.xml');
    expect(decoded).toContain('Rodamiento &quot;premium&quot;');
    expect(decoded).toContain('name="Productos"');
  });
});
