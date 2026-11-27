import { EcommerceImageSourceError } from '../../domain/ports/ecommerce-image-source.port';

const MAX_UNITS_PER_MINUTE = 120;
const MINUTE_MS = 60_000;
const MAX_CONCURRENT_DOWNLOADS = 2;

export interface NarvizRequestBudget {
  reserve(units: number): void | Promise<void>;
  pause(delayMs: number): void | Promise<void>;
  withDownload<T>(operation: () => Promise<T>): Promise<T>;
}

/** Budget for tests and single-instance applications. */
export class InMemoryNarvizRequestBudget implements NarvizRequestBudget {
  private readonly requests: { timestamp: number; units: number }[] = [];
  private spent = 0;
  private pausedUntil = 0;
  private activeDownloads = 0;
  private readonly downloadWaiters: (() => void)[] = [];

  reserve(units: number): void {
    const now = Date.now();
    let oldest = this.requests[0];
    while (oldest && oldest.timestamp <= now - MINUTE_MS) {
      this.requests.shift();
      this.spent -= oldest.units;
      oldest = this.requests[0];
    }

    let availableAt = this.pausedUntil;
    let spent = this.spent;
    for (const request of this.requests) {
      if (spent + units <= MAX_UNITS_PER_MINUTE) break;
      spent -= request.units;
      availableAt = Math.max(availableAt, request.timestamp + MINUTE_MS);
    }

    if (availableAt > now) {
      throw new EcommerceImageSourceError({
        status: 429,
        upstreamCode: 'RATE_LIMITED',
        retryAfterSeconds: Math.ceil((availableAt - now) / 1000),
      });
    }

    this.requests.push({ timestamp: now, units });
    this.spent += units;
  }

  pause(delayMs: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + delayMs);
  }

  async withDownload<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeDownloads < MAX_CONCURRENT_DOWNLOADS) this.activeDownloads += 1;
    else await new Promise<void>((resolve) => this.downloadWaiters.push(resolve));

    try {
      return await operation();
    } finally {
      const waiter = this.downloadWaiters.shift();
      if (waiter) waiter();
      else this.activeDownloads -= 1;
    }
  }
}
