import { afterEach, describe, expect, it, vi } from 'vitest';

import { newExecutionContext, runWithContext } from '../primitives/correlation';
import { StructuredLogger } from './logger';

function captureJson(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  return { lines, restore: () => spy.mockRestore() };
}

const options = {
  service: 'cdr-pim-worker',
  environment: 'local',
  level: 'info' as const,
};

afterEach(() => vi.restoreAllMocks());

describe('StructuredLogger', () => {
  it('emits one JSON object per line with the mandatory fields', () => {
    const { lines, restore } = captureJson();
    new StructuredLogger(options).info('job completed', { durationMs: 3 });
    restore();

    const record = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(record).toMatchObject({
      level: 'info',
      service: 'cdr-pim-worker',
      environment: 'local',
      message: 'job completed',
      durationMs: 3,
    });
    expect(typeof record.timestamp).toBe('string');
  });

  it('picks up the ambient correlation and request ids', () => {
    const { lines, restore } = captureJson();
    runWithContext(newExecutionContext('trace-1'), () =>
      new StructuredLogger(options).info('job started'),
    );
    restore();

    const record = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(record.correlationId).toBe('trace-1');
    expect(record.requestId).toBeTypeOf('string');
  });

  it('keeps child bindings on every record, including in pretty mode', () => {
    const { lines, restore } = captureJson();
    const child = new StructuredLogger({ ...options, pretty: true }).child({ jobId: 'job-9' });
    child.info('job started');
    restore();

    expect(lines[0]).toContain('job-9');
  });

  it('redacts secrets before they can reach CloudWatch', () => {
    const { lines, restore } = captureJson();
    new StructuredLogger(options).info('provider call', { apiKey: 'sk-live-secret' });
    restore();

    expect(lines[0]).not.toContain('sk-live-secret');
    expect(lines[0]).toContain('[REDACTED]');
  });

  it('honours the configured level', () => {
    const { lines, restore } = captureJson();
    new StructuredLogger({ ...options, level: 'warn' }).info('should not appear');
    restore();

    expect(lines).toHaveLength(0);
  });
});
