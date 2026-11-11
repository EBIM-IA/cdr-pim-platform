export interface BinaryZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}
const encoder = new TextEncoder();
function u16(bytes: Uint8Array, offset: number, value: number) {
  new DataView(bytes.buffer).setUint16(offset, value, true);
}
function u32(bytes: Uint8Array, offset: number, value: number) {
  new DataView(bytes.buffer).setUint32(offset, value, true);
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function join(parts: readonly Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
/** Plain ZIP entries with UTF-8 names and CRC32. Paths, duplicate names and ZIP64 are rejected. */
export function createBinaryZip(entries: readonly BinaryZipEntry[]): Uint8Array {
  if (!entries.length || entries.length > 65535)
    throw new Error('El ZIP debe contener entre 1 y 65535 archivos.');
  const names = new Set<string>(),
    locals: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (
      !entry.name ||
      Array.from(entry.name).some(
        (character) => character.charCodeAt(0) < 32 || '\\/'.includes(character),
      ) ||
      entry.name === '.' ||
      entry.name === '..' ||
      names.has(entry.name.toLowerCase())
    )
      throw new Error('El ZIP contiene un nombre inválido o repetido.');
    names.add(entry.name.toLowerCase());
    const name = encoder.encode(entry.name),
      crc = crc32(entry.bytes);
    if (
      name.length > 65535 ||
      entry.bytes.length > 0xffffffff ||
      offset + entry.bytes.length > 0xffffffff
    )
      throw new Error('El archivo excede el tamaño ZIP permitido.');
    const local = new Uint8Array(30 + name.length);
    u32(local, 0, 0x04034b50);
    u16(local, 4, 20);
    u16(local, 6, 0x0800);
    u16(local, 12, 0x0021);
    u32(local, 14, crc);
    u32(local, 18, entry.bytes.length);
    u32(local, 22, entry.bytes.length);
    u16(local, 26, name.length);
    local.set(name, 30);
    locals.push(local, entry.bytes);
    const record = new Uint8Array(46 + name.length);
    u32(record, 0, 0x02014b50);
    u16(record, 4, 20);
    u16(record, 6, 20);
    u16(record, 8, 0x0800);
    u16(record, 14, 0x0021);
    u32(record, 16, crc);
    u32(record, 20, entry.bytes.length);
    u32(record, 24, entry.bytes.length);
    u16(record, 28, name.length);
    u32(record, 42, offset);
    record.set(name, 46);
    central.push(record);
    offset += local.length + entry.bytes.length;
  }
  const directory = join(central),
    end = new Uint8Array(22);
  u32(end, 0, 0x06054b50);
  u16(end, 8, entries.length);
  u16(end, 10, entries.length);
  u32(end, 12, directory.length);
  u32(end, 16, offset);
  return join([...locals, directory, end]);
}
export function downloadBinary(bytes: Uint8Array, filename: string, mimeType: string): void {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  const url = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function technicalSheetFilename(sku: string, suffix = ''): string {
  const safe =
    Array.from(sku, (character) =>
      character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character,
    )
      .join('')
      .replace(/[. ]+$/gu, '')
      .trim() || 'sku';
  return `ficha-tecnica-${safe}${suffix}.pdf`;
}
