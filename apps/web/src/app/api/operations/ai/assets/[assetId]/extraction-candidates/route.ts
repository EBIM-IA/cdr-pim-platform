import {
  aiExtractionCandidatesRequestSchema,
  aiExtractionCandidatesResponseSchema,
  uuidSchema,
} from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { AI_UPSTREAM_TIMEOUT_MS, securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> },
) {
  const assetId = uuidSchema.safeParse((await context.params).assetId);
  if (!assetId.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'El documento indicado no es válido.' }, { status: 400 }),
    );
  }

  return proxyPrivateApi({
    request,
    method: 'POST',
    path: `/ai/assets/${encodeURIComponent(assetId.data)}/extraction-candidates`,
    inputSchema: aiExtractionCandidatesRequestSchema,
    outputSchema: aiExtractionCandidatesResponseSchema,
    timeoutMs: AI_UPSTREAM_TIMEOUT_MS,
  });
}
