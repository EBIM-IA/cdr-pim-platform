import { describe, expect, it } from 'vitest';

import { parseFirstXlsxWorksheet, worksheetRowsToRecords } from './xlsx-import';

describe('XLSX import reader', () => {
  it('maps the first row to object keys and ignores visually empty rows', () => {
    expect(
      worksheetRowsToRecords([
        ['codigo_unificador', 'codigo_oem', 'marcas'],
        ['D1672', '04465-0K240', 'TOYOTA;LEXUS'],
        ['', '', ''],
      ]),
    ).toEqual([
      {
        codigo_unificador: 'D1672',
        codigo_oem: '04465-0K240',
        marcas: 'TOYOTA;LEXUS',
      },
    ]);
  });

  it('reads inline strings from the workbook first sheet without a spreadsheet dependency', async () => {
    const workbook = storedZip([
      [
        'xl/workbook.xml',
        '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="OEM" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ],
      [
        'xl/_rels/workbook.xml.rels',
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      ],
      [
        'xl/worksheets/sheet1.xml',
        '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>codigo_unificador</t></is></c><c r="B1" t="inlineStr"><is><t>codigo_oem</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>D1672</t></is></c><c r="B2" t="inlineStr"><is><t>04465-0K240</t></is></c></row></sheetData></worksheet>',
      ],
    ]);

    await expect(parseFirstXlsxWorksheet(workbook)).resolves.toEqual([
      ['codigo_unificador', 'codigo_oem'],
      ['D1672', '04465-0K240'],
    ]);
  });

  it('rejects blank or duplicate headers before building records', () => {
    expect(() => worksheetRowsToRecords([['codigo_oem', '']])).toThrow('encabezados');
    expect(() => worksheetRowsToRecords([['codigo_oem', 'codigo_oem']])).toThrow('únicos');
  });
});

function storedZip(files: readonly (readonly [string, string])[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const [name, source] of files) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(source);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    localParts.push(new Uint8Array(local.buffer), nameBytes, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(42, offset, true);
    centralParts.push(new Uint8Array(central.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return join([...localParts, ...centralParts, new Uint8Array(end.buffer)]).buffer;
}

function join(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
