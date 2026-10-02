import { NextResponse } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';

export const dynamic = 'force-dynamic';

/**
 * Anonymous liveness probe for the load balancer and the container HEALTHCHECK.
 *
 * It answers 200 without touching the API, the database or the session, and reveals
 * nothing about the deployment (no version, environment or dependency state). Whether the
 * API can serve is the API target group's own health check.
 */
export function GET() {
  return securePrivateResponse(NextResponse.json({ status: 'ok' }));
}
