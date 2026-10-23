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

it('exports every report to a distinct worksheet with safe unique names', async () => {
  const { createWorkbookXlsxBytes } = await import('./tabular-export');
  const bytes = createWorkbookXlsxBytes([
    { ...data, sheetName: 'Reporte / Cliente' },
    { ...data, sheetName: 'reporte / cliente', rows: [['6206', 'Segundo reporte']] },
  ]);
  const decoded = new TextDecoder().decode(bytes);
  expect(decoded).toContain('xl/worksheets/sheet2.xml');
  expect(decoded).toContain('sheet name="Reporte - Cliente"');
  expect(decoded).toContain('sheet name="reporte - cliente (2)"');
  expect(decoded).toContain('Segundo reporte');
  expect(decoded).toContain(
    'Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"',
  );
});

it('keeps formulas as text and removes invalid XML controls from imported headers and values', () => {
  const source = new TextDecoder().decode(
    createXlsxBytes({ headers: ['=SUM(A1)\u0000'], rows: [['=HYPERLINK("example")\u0001']] }),
  );
  expect(source).toContain('=SUM(A1)');
  expect(source).toContain('t="inlineStr"');
  expect(source).not.toContain('<f>');
  const worksheet = /<worksheet[\s\S]*<\/worksheet>/u.exec(source)?.[0];
  expect(worksheet).not.toContain('\u0001');
  expect(source).not.toContain('SUM(A1)\u0000');
});
