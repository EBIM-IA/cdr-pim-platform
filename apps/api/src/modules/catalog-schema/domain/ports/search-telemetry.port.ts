export const SEARCH_TELEMETRY = Symbol('SearchTelemetryPort');
export interface SearchTelemetryPort {
  /** Stores aggregateable query telemetry without actor identity or credentials. */
  record(query: string, results: number, channel: 'variants' | 'semantic'): Promise<void>;
}
