import { getContext } from '../primitives/correlation';
import { redact } from './redact';

export const LogLevel = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LoggerOptions {
  readonly service: string;
  readonly environment: string;
  readonly level: LogLevel;
  /** Pretty multi-line output for local development; JSON everywhere else. */
  readonly pretty?: boolean;
}

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  service: string;
  environment: string;
  message: string;
  correlationId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  /** Derives a child logger whose `meta` is merged into every record. */
  child(bindings: Record<string, unknown>): Logger;
}

/**
 * Structured JSON logger.
 *
 * One line per record on stdout is exactly what the CloudWatch Logs `awslogs`/`awsfirelens`
 * driver expects from a Fargate task, so no agent or sidecar is required. Correlation and
 * request identifiers are pulled from AsyncLocalStorage — call sites do not pass them.
 */
export class StructuredLogger implements Logger {
  constructor(
    private readonly options: LoggerOptions,
    private readonly bindings: Record<string, unknown> = {},
  ) {}

  child(bindings: Record<string, unknown>): Logger {
    return new StructuredLogger(this.options, { ...this.bindings, ...bindings });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write('debug', message, meta);
  }
  info(message: string, meta?: Record<string, unknown>): void {
    this.write('info', message, meta);
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    this.write('warn', message, meta);
  }
  error(message: string, meta?: Record<string, unknown>): void {
    this.write('error', message, meta);
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.options.level]) return;

    const context = getContext();
    const details = redact({ ...this.bindings, ...meta }) as Record<string, unknown>;
    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      service: this.options.service,
      environment: this.options.environment,
      message,
      ...(context ? { correlationId: context.correlationId, requestId: context.requestId } : {}),
      ...details,
    };

    // Pretty mode prints the child logger's bindings too — dropping them would hide the
    // correlation and job identifiers exactly where a developer is reading the output.
    const line = this.options.pretty
      ? `${record.timestamp} ${level.toUpperCase().padEnd(5)} [${record.service}] ${message} ${
          Object.keys(details).length ? JSON.stringify(details) : ''
        }`.trimEnd()
      : JSON.stringify(record);

    // This module is the single sanctioned writer to stdout/stderr for the whole platform.
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else process.stdout.write(`${line}\n`);
  }
}

export function createLogger(options: LoggerOptions): Logger {
  return new StructuredLogger(options);
}

/** No-op logger for unit tests that do not assert on logging. */
export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};
