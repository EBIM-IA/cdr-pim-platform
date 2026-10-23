import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

import {
  ClamavScannerAdapter,
  InMemoryStorageAdapter,
  ScanningObjectStorageAdapter,
} from '../packages/storage/dist/index.js';
import { buildScannerTestPdf, SCANNER_TEST_EICAR } from './scanner-test-pdf.mjs';

// This command deliberately exercises a real ClamAV daemon. Unit tests use a local
// protocol server; neither suite treats a substring check as a malware engine.
const scanner = new ClamavScannerAdapter({
  host: process.env.CLAMAV_HOST ?? '127.0.0.1',
  port: Number(process.env.CLAMAV_PORT ?? 3310),
  timeoutMs: 30_000,
});
const waitSeconds = Number(process.argv[2] ?? 0);
assert.ok(Number.isInteger(waitSeconds) && waitSeconds >= 0 && waitSeconds <= 600);
const cleanPdf = buildScannerTestPdf(null);
const deadline = Date.now() + waitSeconds * 1000;
for (;;) {
  try {
    await scanner.assertClean(cleanPdf);
    break;
  } catch (error) {
    if (error?.code !== 'DEPENDENCY_UNAVAILABLE' || Date.now() >= deadline) throw error;
    await delay(1000);
  }
}

// EICAR is the harmless, standard antivirus test string, never executable malware.
const eicar = Buffer.from(SCANNER_TEST_EICAR);
assert.equal(eicar.length, 68);
const pdfEicar = buildScannerTestPdf();
const raw = new InMemoryStorageAdapter();
const guarded = new ScanningObjectStorageAdapter(raw, scanner);
await guarded.put({
  key: 'scanner-check/clean.pdf',
  content: cleanPdf,
  mimeType: 'application/pdf',
});
await assert.rejects(
  guarded.put({ key: 'scanner-check/eicar.txt', content: eicar, mimeType: 'text/plain' }),
  (error) => error?.code === 'VALIDATION_FAILED',
);
assert.equal(await raw.exists('scanner-check/eicar.txt'), false);
await assert.rejects(
  guarded.put({ key: 'scanner-check/eicar.pdf', content: pdfEicar, mimeType: 'application/pdf' }),
  (error) => error?.code === 'VALIDATION_FAILED',
);
assert.equal(await raw.exists('scanner-check/eicar.pdf'), false);
assert.deepEqual(Buffer.from(await raw.get('scanner-check/clean.pdf')), cleanPdf);
await assert.rejects(
  guarded.presignPut('scanner-check/bypass.pdf', 60, 'application/pdf'),
  (error) => error?.code === 'VALIDATION_FAILED',
);

// Reserve and release an ephemeral local port: absence of a daemon must block storage.
const listener = createServer();
await new Promise((resolve, reject) =>
  listener.once('error', reject).listen(0, '127.0.0.1', resolve),
);
const address = listener.address();
assert.ok(address && typeof address === 'object');
await new Promise((resolve, reject) =>
  listener.close((error) => (error ? reject(error) : resolve())),
);
const unavailable = new ScanningObjectStorageAdapter(
  raw,
  new ClamavScannerAdapter({ host: '127.0.0.1', port: address.port, timeoutMs: 1000 }),
);
await assert.rejects(
  unavailable.put({
    key: 'scanner-check/unverified.pdf',
    content: cleanPdf,
    mimeType: 'application/pdf',
  }),
  (error) => error?.code === 'DEPENDENCY_UNAVAILABLE',
);
assert.equal(await raw.exists('scanner-check/unverified.pdf'), false);
console.log(
  JSON.stringify({
    cleanPdfStored: true,
    eicarBlocked: true,
    pdfEicarBlocked: true,
    unavailableBlocked: true,
    directWriteBlocked: true,
  }),
);
