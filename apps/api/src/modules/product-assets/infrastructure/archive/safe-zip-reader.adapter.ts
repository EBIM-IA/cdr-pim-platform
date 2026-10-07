import { inflateRawSync } from 'node:zlib';

import {
  PRODUCT_ASSET_MAX_BYTES,
  PRODUCT_ASSET_ZIP_MAX_BYTES,
  PRODUCT_ASSET_ZIP_MAX_FILES,
} from '@cdr/contracts';
import { ValidationError } from '@cdr/shared';

import type {
  ArchiveEntry,
  ArchiveReaderPort,
} from '../../domain/ports/product-asset-repository.port';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 65_557;
const MAX_EXPANSION_RATIO = 100;
const MAX_TOTAL_UNCOMPRESSED = 200 * 1024 * 1024;

interface CentralEntry {
  readonly path: string;
  readonly compression: number;
  readonly checksum: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly localOffset: number;
}

/** A deliberately small ZIP reader: stored/deflate only, no ZIP64, encryption or traversal. */
export class SafeZipReaderAdapter implements ArchiveReaderPort {
  read(content: Uint8Array): ArchiveEntry[] {
    if (content.byteLength === 0 || content.byteLength > PRODUCT_ASSET_ZIP_MAX_BYTES) {
      throw new ValidationError('The ZIP exceeds the allowed 100 MB request limit');
    }
    const archive = Buffer.from(content.buffer, content.byteOffset, content.byteLength);
    const eocdOffset = findEndOfCentralDirectory(archive);
    const disk = archive.readUInt16LE(eocdOffset + 4);
    const centralDisk = archive.readUInt16LE(eocdOffset + 6);
    const entriesOnDisk = archive.readUInt16LE(eocdOffset + 8);
    const entryCount = archive.readUInt16LE(eocdOffset + 10);
    const centralSize = archive.readUInt32LE(eocdOffset + 12);
    const centralOffset = archive.readUInt32LE(eocdOffset + 16);
    if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
      throw new ValidationError('Multi-volume ZIP archives are not supported');
    }
    if (entryCount === 0 || entryCount > PRODUCT_ASSET_ZIP_MAX_FILES) {
      throw new ValidationError(
        `A ZIP must contain between 1 and ${PRODUCT_ASSET_ZIP_MAX_FILES} entries`,
      );
    }
    if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      throw new ValidationError('ZIP64 archives are not supported');
    }
    if (centralOffset + centralSize > eocdOffset) {
      throw new ValidationError('The ZIP central directory is malformed');
    }

    const entries = readCentralEntries(archive, centralOffset, entryCount);
    const totalSize = entries.reduce((total, entry) => total + entry.size, 0);
    if (totalSize > MAX_TOTAL_UNCOMPRESSED) {
      throw new ValidationError('The ZIP expands beyond the 200 MB safety limit');
    }
    return entries
      .filter((entry) => !entry.path.endsWith('/'))
      .map((entry) => extractEntry(archive, entry));
  }
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const first = Math.max(0, archive.length - MAX_EOCD_SEARCH);
  for (let offset = archive.length - 22; offset >= first; offset -= 1) {
    if (archive.readUInt32LE(offset) === EOCD_SIGNATURE) {
      const commentLength = archive.readUInt16LE(offset + 20);
      if (offset + 22 + commentLength === archive.length) return offset;
    }
  }
  throw new ValidationError('The uploaded file is not a valid ZIP archive');
}

function readCentralEntries(archive: Buffer, start: number, count: number): CentralEntry[] {
  const entries: CentralEntry[] = [];
  const seen = new Set<string>();
  let offset = start;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new ValidationError('The ZIP central directory contains an invalid entry');
    }
    const flags = archive.readUInt16LE(offset + 8);
    const compression = archive.readUInt16LE(offset + 10);
    const checksum = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const size = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > archive.length) throw new ValidationError('A ZIP entry exceeds archive bounds');
    if ((flags & 0x1) !== 0) throw new ValidationError('Encrypted ZIP entries are not supported');
    if (compression !== 0 && compression !== 8) {
      throw new ValidationError('Only stored and deflated ZIP entries are supported');
    }
    if (size > PRODUCT_ASSET_MAX_BYTES) {
      throw new ValidationError('A ZIP entry exceeds the 20 MB per-file limit');
    }
    if (size > compressedSize * MAX_EXPANSION_RATIO && size > 1024 * 1024) {
      throw new ValidationError('A ZIP entry has an unsafe expansion ratio');
    }

    const path = decodeName(archive.subarray(offset + 46, offset + 46 + nameLength));
    validateArchivePath(path);
    const identity = path.toLocaleLowerCase('en-US');
    if (seen.has(identity)) throw new ValidationError('The ZIP contains duplicate paths');
    seen.add(identity);
    if (!path.endsWith('/') && size === 0) {
      throw new ValidationError('ZIP asset entries cannot be empty');
    }
    entries.push({ path, compression, checksum, compressedSize, size, localOffset });
    offset = end;
  }
  return entries;
}

function extractEntry(archive: Buffer, entry: CentralEntry): ArchiveEntry {
  const offset = entry.localOffset;
  if (offset + 30 > archive.length || archive.readUInt32LE(offset) !== LOCAL_SIGNATURE) {
    throw new ValidationError('A ZIP local header is malformed');
  }
  const nameLength = archive.readUInt16LE(offset + 26);
  const extraLength = archive.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > archive.length) throw new ValidationError('A ZIP entry exceeds archive bounds');
  const compressed = archive.subarray(dataStart, dataEnd);
  let content: Buffer;
  try {
    content =
      entry.compression === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: entry.size });
  } catch {
    throw new ValidationError('A ZIP entry could not be decompressed safely', {
      path: entry.path,
    });
  }
  if (content.byteLength !== entry.size || crc32(content) !== entry.checksum) {
    throw new ValidationError('A ZIP entry failed its integrity check', { path: entry.path });
  }
  return { path: entry.path, content };
}

function decodeName(value: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    throw new ValidationError('ZIP entry names must be UTF-8');
  }
}

function validateArchivePath(path: string): void {
  const segments = path.split('/');
  if (
    !path ||
    path.length > 260 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    segments.some((segment) => segment === '.' || segment === '..' || segment.length > 180)
  ) {
    throw new ValidationError('The ZIP contains an unsafe entry path');
  }
}

function crc32(content: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc = (crc >>> 8) ^ (CRC32_TABLE[(crc ^ byte) & 0xff] as number);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let entry = value;
  for (let bit = 0; bit < 8; bit += 1) {
    entry = (entry >>> 1) ^ (entry & 1 ? 0xedb88320 : 0);
  }
  return entry >>> 0;
});
