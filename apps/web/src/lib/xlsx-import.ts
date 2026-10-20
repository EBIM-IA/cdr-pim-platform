const MAX_ZIP_ENTRIES = 2_000;
const MAX_XML_BYTES = 32_000_000;
const MAX_ROWS = 10_001; // header + the API's 10,000-row limit
const MAX_COLUMNS = 200;

interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly offset: number;
}

/** Reads the first worksheet of a browser-provided XLSX without shipping the workbook upstream. */
export async function readFirstXlsxWorksheet(file: File): Promise<Record<string, string>[]> {
  const rows = await parseFirstXlsxWorksheet(await file.arrayBuffer());
  return worksheetRowsToRecords(rows);
}

export async function parseFirstXlsxWorksheet(buffer: ArrayBuffer): Promise<string[][]> {
  const entries = zipEntries(buffer);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const workbook = byName.get('xl/workbook.xml');
  const relationships = byName.get('xl/_rels/workbook.xml.rels');

  if (workbook && relationships) {
    const workbookXml = parseXml(await readZipText(buffer, workbook));
    const relationshipsXml = parseXml(await readZipText(buffer, relationships));
    const firstSheet = workbookXml.getElementsByTagName('sheet')[0];
    const relationId = firstSheet?.getAttribute('r:id');
    const relation = [...relationshipsXml.getElementsByTagName('Relationship')].find(
      (candidate) => candidate.getAttribute('Id') === relationId,
    );
    const target = relation?.getAttribute('Target');
    if (target) sheetPath = workbookTargetPath(target);
  }

  const sheet = byName.get(sheetPath);
  if (!sheet) throw new Error('No se encontró la primera hoja del archivo Excel.');

  const sharedStringsEntry = byName.get('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsEntry
    ? [...parseXml(await readZipText(buffer, sharedStringsEntry)).getElementsByTagName('si')].map(
        (item) =>
          [...item.getElementsByTagName('t')].map((text) => text.textContent ?? '').join(''),
      )
    : [];

  const document = parseXml(await readZipText(buffer, sheet));
  const rowElements = [...document.getElementsByTagName('row')];
  if (rowElements.length > MAX_ROWS) {
    throw new Error('El Excel supera el límite de 10 000 filas de datos.');
  }

  return rowElements.map((row) => {
    const values: string[] = [];
    for (const cell of [...row.getElementsByTagName('c')]) {
      const column = columnIndex(cell.getAttribute('r'));
      if (column >= MAX_COLUMNS) {
        throw new Error(`El Excel supera el límite de ${MAX_COLUMNS} columnas.`);
      }
      const type = cell.getAttribute('t');
      const raw = cell.getElementsByTagName('v')[0]?.textContent ?? '';
      values[column] =
        type === 's'
          ? (sharedStrings[Number(raw)] ?? '')
          : type === 'inlineStr'
            ? [...cell.getElementsByTagName('t')].map((text) => text.textContent ?? '').join('')
            : raw;
    }
    return Array.from(values, (value) => value ?? '');
  });
}

export function worksheetRowsToRecords(
  rows: readonly (readonly string[])[],
): Record<string, string>[] {
  if (rows.length === 0) return [];
  const headers = (rows[0] ?? []).map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/u, '') : header).trim(),
  );
  if (headers.length === 0 || headers.some((header) => !header)) {
    throw new Error('La primera fila del Excel debe contener encabezados sin celdas vacías.');
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error('Los encabezados del Excel deben ser únicos.');
  }

  return rows.slice(1).flatMap((row) => {
    if (row.every((value) => !value.trim())) return [];
    const record: Record<string, string> = Object.create(null) as Record<string, string>;
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    return [record];
  });
}

function zipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  let endOfCentralDirectory = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 66_000); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      endOfCentralDirectory = index;
      break;
    }
  }
  if (endOfCentralDirectory < 0) throw new Error('El archivo no es un XLSX/ZIP válido.');

  const count = view.getUint16(endOfCentralDirectory + 10, true);
  if (count > MAX_ZIP_ENTRIES) throw new Error('El archivo Excel contiene demasiadas entradas.');
  let position = view.getUint32(endOfCentralDirectory + 16, true);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    ensureRange(bytes, position, 46);
    if (view.getUint32(position, true) !== 0x02014b50) {
      throw new Error('El directorio interno del Excel está dañado.');
    }
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    ensureRange(bytes, position + 46, nameLength + extraLength + commentLength);
    const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    const size = view.getUint32(position + 24, true);
    if (size > MAX_XML_BYTES) throw new Error('Una parte interna del Excel es demasiado grande.');
    entries.push({
      name,
      method: view.getUint16(position + 10, true),
      compressedSize: view.getUint32(position + 20, true),
      size,
      offset: view.getUint32(position + 42, true),
    });
    position += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipText(buffer: ArrayBuffer, entry: ZipEntry): Promise<string> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  ensureRange(bytes, entry.offset, 30);
  if (view.getUint32(entry.offset, true) !== 0x04034b50) {
    throw new Error('Una entrada interna del Excel está dañada.');
  }
  const start =
    entry.offset +
    30 +
    view.getUint16(entry.offset + 26, true) +
    view.getUint16(entry.offset + 28, true);
  ensureRange(bytes, start, entry.compressedSize);
  const compressed = bytes.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(compressed);
  if (entry.method !== 8 || typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador no puede descomprimir el XLSX; usa CSV o JSON.');
  }
  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const decompressed = await new Response(stream).arrayBuffer();
  if (decompressed.byteLength > MAX_XML_BYTES || decompressed.byteLength !== entry.size) {
    throw new Error('El contenido interno del Excel no coincide con su tamaño declarado.');
  }
  return new TextDecoder().decode(decompressed);
}

function parseXml(source: string): XMLDocument {
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('El XML interno del Excel no es válido.');
  }
  return document;
}

function workbookTargetPath(target: string): string {
  const normalized = target
    .replace(/\\/gu, '/')
    .replace(/^\/?xl\//u, '')
    .replace(/^\//u, '');
  if (normalized.split('/').some((segment) => segment === '..')) {
    throw new Error('La ruta de la primera hoja del Excel no es segura.');
  }
  return `xl/${normalized}`;
}

function columnIndex(reference: string | null): number {
  const letters = /^([A-Z]+)/u.exec(reference ?? '')?.[1] ?? 'A';
  return [...letters].reduce((result, letter) => result * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function ensureRange(bytes: Uint8Array, start: number, length: number): void {
  if (start < 0 || length < 0 || start + length > bytes.length) {
    throw new Error('El archivo Excel está truncado.');
  }
}
