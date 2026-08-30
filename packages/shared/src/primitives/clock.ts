/**
 * Time is an injected dependency, never a global.
 *
 * Standard: **every instant handled inside the system is UTC**. Localisation to
 * America/Guayaquil happens only at the presentation edge.
 */
export interface Clock {
  now(): Date;
}

export const SystemClock: Clock = {
  now: () => new Date(),
};

/** Deterministic clock for tests. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

/** Canonical serialisation for API payloads and log records: ISO-8601 with `Z`. */
export function toIsoUtc(date: Date): string {
  return date.toISOString();
}
