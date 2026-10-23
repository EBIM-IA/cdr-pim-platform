import { performance } from 'node:perf_hooks';
import { createConnection } from 'node:net';

import { type Clock, DependencyUnavailableError, SystemClock, ValidationError } from '@cdr/shared';

import type { MalwareScannerPort } from './malware-scanner.port';

const MAX_REPLY_BYTES = 4096;
const CHUNK_BYTES = 64 * 1024;
const MAX_SIGNATURE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ClamavScannerOptions {
  readonly host: string;
  readonly port: number;
  /** One budget for VERSION plus INSTREAM, including connect, send and response. */
  readonly timeoutMs: number;
  readonly clock?: Clock;
}

/**
 * Talks to the real ClamD daemon using its NUL-framed protocol; no shell or file path is sent.
 * ClamD's ctime VERSION date has no timezone. The deployed daemon MUST run with TZ=UTC.
 * Missing, malformed, future or older-than-seven-day signature metadata fails closed.
 */
export class ClamavScannerAdapter implements MalwareScannerPort {
  private readonly clock: Clock;

  constructor(private readonly options: ClamavScannerOptions) {
    if (
      !options.host.trim() ||
      !Number.isInteger(options.port) ||
      options.port < 1 ||
      options.port > 65535 ||
      !Number.isInteger(options.timeoutMs) ||
      options.timeoutMs < 1 ||
      options.timeoutMs > 30000
    ) {
      throw new Error('Invalid ClamAV connection configuration');
    }
    this.clock = options.clock ?? SystemClock;
  }

  async assertClean(content: Uint8Array): Promise<void> {
    const deadline = performance.now() + this.options.timeoutMs;
    const version = await this.exchange('VERSION', deadline);
    assertCurrentSignatures(version, this.clock.now());
    const result = await this.exchange('INSTREAM', deadline, content);
    if (result === 'stream: OK') return;
    if (/^stream: [\x20-\x7E]+ FOUND$/u.test(result)) {
      throw new ValidationError('El archivo fue bloqueado por el análisis antimalware.');
    }
    throw new DependencyUnavailableError('malware-scanner');
  }

  private exchange(
    command: 'VERSION' | 'INSTREAM',
    deadline: number,
    content?: Uint8Array,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const remaining = deadline - performance.now();
      if (remaining <= 0) {
        reject(new DependencyUnavailableError('malware-scanner'));
        return;
      }
      const socket = createConnection({ host: this.options.host, port: this.options.port });
      const replies: Buffer[] = [];
      let replyBytes = 0;
      let sentAll = false;
      let settled = false;
      const finish = (reply?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (reply === undefined) reject(new DependencyUnavailableError('malware-scanner'));
        else resolve(reply);
      };
      const timer = setTimeout(() => finish(), remaining);
      socket.on('error', () => finish());
      socket.on('close', () => {
        if (!settled) finish();
      });
      socket.on('data', (chunk: Buffer) => {
        replyBytes += chunk.length;
        if (replyBytes > MAX_REPLY_BYTES) {
          finish();
          return;
        }
        replies.push(chunk);
      });
      socket.on('end', () => {
        const bytes = Buffer.concat(replies);
        if (
          !sentAll ||
          bytes.length < 2 ||
          bytes[bytes.length - 1] !== 0 ||
          bytes.subarray(0, -1).some((byte) => byte < 32 || byte > 126)
        ) {
          finish();
          return;
        }
        finish(bytes.subarray(0, -1).toString('ascii'));
      });
      socket.on('connect', () => {
        socket.write(`z${command}\0`);
        if (command === 'VERSION') {
          sentAll = true;
          return;
        }
        let offset = 0;
        const pump = () => {
          if (settled || socket.destroyed) return;
          while (offset < (content?.byteLength ?? 0)) {
            const end = Math.min(offset + CHUNK_BYTES, content!.byteLength);
            const header = Buffer.allocUnsafe(4);
            header.writeUInt32BE(end - offset);
            const frame = Buffer.concat([header, content!.subarray(offset, end)]);
            offset = end;
            if (!socket.write(frame)) {
              socket.once('drain', pump);
              return;
            }
          }
          socket.write(Buffer.alloc(4));
          sentAll = true;
        };
        pump();
      });
    });
  }
}

function assertCurrentSignatures(version: string, now: Date): void {
  const match =
    /^ClamAV [0-9][A-Za-z0-9.+_-]*\/\d+\/([A-Z][a-z]{2}) ([A-Z][a-z]{2}) {1,2}(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/u.exec(
      version,
    );
  if (!match) throw new DependencyUnavailableError('malware-scanner:signatures');
  const [, weekday, month, day, hour, minute, second, year] = match;
  const monthIndex = MONTHS.indexOf(month!);
  const date = new Date(
    Date.UTC(Number(year), monthIndex, Number(day), Number(hour), Number(minute), Number(second)),
  );
  const age = now.getTime() - date.getTime();
  if (
    monthIndex < 0 ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== Number(day) ||
    date.getUTCHours() !== Number(hour) ||
    date.getUTCMinutes() !== Number(minute) ||
    date.getUTCSeconds() !== Number(second) ||
    WEEKDAYS[date.getUTCDay()] !== weekday ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > MAX_SIGNATURE_AGE_MS
  ) {
    throw new DependencyUnavailableError('malware-scanner:signatures');
  }
}
