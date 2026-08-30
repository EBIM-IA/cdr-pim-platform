/**
 * A single readiness check.
 *
 * Modelled as a port so that adding "SQS is reachable" or "the AX VPN tunnel is up" later
 * is a new adapter registered in a list — not a longer `if` in a controller.
 */
export interface HealthCheckResult {
  readonly name: string;
  readonly status: 'up' | 'down';
  readonly latencyMs?: number;
  readonly detail?: string;
}

export interface HealthIndicatorPort {
  readonly name: string;
  check(): Promise<HealthCheckResult>;
}

export const HEALTH_INDICATORS = Symbol('HealthIndicatorPort[]');
