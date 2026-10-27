import { createServer, type Server, type Socket } from 'node:net';

import { DependencyUnavailableError, FixedClock, ValidationError } from '@cdr/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ClamavScannerAdapter } from './clamav-scanner.adapter';

const clock = new FixedClock(new Date('2026-10-23T12:00:00.000Z'));
const healthyVersion = 'ClamAV 1.5.4/28000/Fri Oct 23 11:00:00 2026';
const resources: { server: Server; sockets: Set<Socket> }[] = [];
async function daemon(handler: (command: string, content: Buffer, socket: Socket) => void) {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => undefined);
    socket.on('close', () => sockets.delete(socket));
    let input = Buffer.alloc(0);
    let command: string | null = null;
    const chunks: Buffer[] = [];
    socket.on('data', (data: Buffer) => {
      input = Buffer.concat([input, data]);
      if (command === null) {
        const end = input.indexOf(0);
        if (end < 0) return;
        command = input.subarray(0, end).toString('ascii');
        input = input.subarray(end + 1);
        if (command !== 'zINSTREAM') {
          handler(command, Buffer.alloc(0), socket);
          return;
        }
      }
      while (input.length >= 4) {
        const size = input.readUInt32BE(0);
        if (input.length < size + 4) return;
        if (size === 0) {
          handler(command, Buffer.concat(chunks), socket);
          return;
        }
        chunks.push(input.subarray(4, size + 4));
        input = input.subarray(size + 4);
      }
    });
  });
  resources.push({ server, sockets });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test daemon did not bind TCP');
  return address.port;
}
function scanner(port: number, timeoutMs = 1000) {
  return new ClamavScannerAdapter({ host: '127.0.0.1', port, timeoutMs, clock });
}
const reply = (socket: Socket, text: string) => socket.end(`${text}\0`);
afterEach(async () => {
  for (const { server, sockets } of resources.splice(0)) {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('ClamavScannerAdapter real TCP protocol', () => {
  it('checks engine signatures and sends every binary byte through framed INSTREAM with backpressure', async () => {
    const received = vi.fn();
    const port = await daemon((command, content, socket) => {
      received(command, content);
      if (command === 'zVERSION') reply(socket, healthyVersion);
      else {
        socket.write('stream: ');
        setImmediate(() => reply(socket, 'OK'));
      }
    });
    const content = new Uint8Array(256 * 1024 + 7).map((_, index) => index % 256);
    await expect(scanner(port).assertClean(content)).resolves.toBeUndefined();
    expect(received.mock.calls.map(([command]) => command)).toEqual(['zVERSION', 'zINSTREAM']);
    const payload = received.mock.calls[1]?.[1] as Buffer;
    expect(payload.byteLength).toBe(content.byteLength);
    // Native binary equality checks every byte without a recursive matcher per byte.
    expect(payload.equals(content)).toBe(true);
  });
  it('blocks a threat reported by the real engine protocol without implementing a sample signature match', async () => {
    const port = await daemon((command, _content, socket) =>
      reply(
        socket,
        command === 'zVERSION' ? healthyVersion : 'stream: Engine.Reported.Threat FOUND',
      ),
    );
    await expect(scanner(port).assertClean(new Uint8Array([1, 2]))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(scanner(port).assertClean(new Uint8Array([1, 2]))).rejects.toThrow(
      'bloqueado por el análisis antimalware',
    );
  });
  it.each([
    'stream: ERROR',
    'stream: INSTREAM size limit exceeded. ERROR',
    'OK',
    'stream: OK\n',
    'stream: OK\0stream: hidden FOUND',
    '',
  ])('fails closed for an unknown or incomplete scan response %j', async (scanReply) => {
    const port = await daemon((command, _content, socket) =>
      reply(socket, command === 'zVERSION' ? healthyVersion : scanReply),
    );
    await expect(scanner(port).assertClean(new Uint8Array([1]))).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );
  });
  it('rejects a response that closes without the required NUL terminator', async () => {
    const port = await daemon((command, _content, socket) =>
      command === 'zVERSION' ? reply(socket, healthyVersion) : socket.end('stream: OK'),
    );
    await expect(scanner(port).assertClean(new Uint8Array([1]))).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );
  });
  it.each([
    'ClamAV 1.5.4',
    'ClamAV 1.5.4/28000/Thu Oct 15 11:00:00 2026',
    'ClamAV 1.5.4/28000/Fri Oct 23 12:00:01 2026',
    'ClamAV 1.5.4/28000/Fri Feb 30 11:00:00 2026',
    'ClamAV 1.5.4/28000/Thu Oct 23 11:00:00 2026',
  ])(
    'rejects missing, stale, future or invalid UTC signatures before scanning: %s',
    async (version) => {
      const commands: string[] = [];
      const port = await daemon((command, _content, socket) => {
        commands.push(command);
        reply(socket, version);
      });
      await expect(scanner(port).assertClean(new Uint8Array([1]))).rejects.toBeInstanceOf(
        DependencyUnavailableError,
      );
      expect(commands).toEqual(['zVERSION']);
    },
  );
  it('accepts signatures exactly seven days old', async () => {
    const port = await daemon((command, _content, socket) =>
      reply(
        socket,
        command === 'zVERSION' ? 'ClamAV 1.5.4/28000/Fri Oct 16 12:00:00 2026' : 'stream: OK',
      ),
    );
    await expect(scanner(port).assertClean(new Uint8Array([1]))).resolves.toBeUndefined();
  });
  it('rejects oversized replies and unavailable engines', async () => {
    const port = await daemon((_command, _content, socket) => reply(socket, 'x'.repeat(4097)));
    await expect(scanner(port).assertClean(new Uint8Array([1]))).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );
    const closedPort = await daemon(() => undefined);
    const resource = resources.pop()!;
    await new Promise<void>((resolve) => resource.server.close(() => resolve()));
    await expect(scanner(closedPort).assertClean(new Uint8Array([1]))).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );
  });
  it('bounds a stalled scan even when the socket remains open', async () => {
    const port = await daemon((command, _content, socket) => {
      if (command === 'zVERSION') reply(socket, healthyVersion);
    });
    await expect(scanner(port, 80).assertClean(new Uint8Array([1]))).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );
  });
});
