import { describe, expect, it } from 'vitest';

import { SafeZipReaderAdapter } from './safe-zip-reader.adapter';

describe('SafeZipReaderAdapter', () => {
  it('reads a stored ZIP entry and verifies its checksum', () => {
    const content = new TextEncoder().encode('%PDF-1.7\nexample');
    const archive = storedZip('docs/6205-2RS1__FT.pdf', content);
    const [entry] = new SafeZipReaderAdapter().read(archive);
    expect(entry?.path).toBe('docs/6205-2RS1__FT.pdf');
    expect(Array.from(entry?.content ?? [])).toEqual(Array.from(content));
  });

  it('rejects traversal paths before extracting content', () => {
    const archive = storedZip('../secret.pdf', new TextEncoder().encode('%PDF-1.7'));
    expect(() => new SafeZipReaderAdapter().read(archive)).toThrow(/unsafe entry path/);
  });

  it('rejects a forged checksum', () => {
    const archive = storedZip('asset.pdf', new TextEncoder().encode('%PDF-1.7'));
    archive[30 + Buffer.byteLength('asset.pdf')]! ^= 0xff;
    expect(() => new SafeZipReaderAdapter().read(archive)).toThrow(/integrity/);
  });

  it('rejects an entry with a ZIP-bomb expansion ratio before extraction', () => {
    const archive = Buffer.from(storedZip('asset.pdf', new TextEncoder().encode('%PDF-1.7')));
    const centralOffset = 30 + Buffer.byteLength('asset.pdf') + Buffer.byteLength('%PDF-1.7');
    archive.writeUInt32LE(2 * 1024 * 1024, centralOffset + 24);

    expect(() => new SafeZipReaderAdapter().read(archive)).toThrow(/expansion ratio/);
  });

  it('maps malformed deflate streams to a controlled validation error', () => {
    const archive = Buffer.from(storedZip('asset.pdf', new TextEncoder().encode('%PDF-1.7')));
    const centralOffset = 30 + Buffer.byteLength('asset.pdf') + Buffer.byteLength('%PDF-1.7');
    archive.writeUInt16LE(8, centralOffset + 10);

    expect(() => new SafeZipReaderAdapter().read(archive)).toThrow(/decompressed safely/);
  });
});

function storedZip(path: string, content: Uint8Array): Uint8Array {
  const name = Buffer.from(path);
  const body = Buffer.from(content);
  const checksum = crc32(body);
  const local = Buffer.alloc(30 + name.length + body.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(body.length, 22);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);
  body.copy(local, 30 + name.length);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x800, 8);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(body.length, 24);
  central.writeUInt16LE(name.length, 28);
  name.copy(central, 46);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, end]);
}

function crc32(content: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
