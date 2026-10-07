import {
  aiCommercialProposalRequestSchema,
  aiCommercialProposalResponseSchema,
  uuidSchema,
} from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { AI_UPSTREAM_TIMEOUT_MS, securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ productId: string }> },
) {
  const productId = uuidSchema.safeParse((await context.params).productId);
  if (!productId.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'El producto indicado no es válido.' }, { status: 400 }),
    );
  }

  return proxyPrivateApi({
    request,
    method: 'POST',
    path: `/ai/products/${encodeURIComponent(productId.data)}/commercial-proposal`,
    inputSchema: aiCommercialProposalRequestSchema,
    outputSchema: aiCommercialProposalResponseSchema,
    timeoutMs: AI_UPSTREAM_TIMEOUT_MS,
  });
}
