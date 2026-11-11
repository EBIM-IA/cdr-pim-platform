import { qualityDecisionSchema, qualityReviewSchema, uuidSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { proxyPrivateApi } from '@/lib/private-api-route';
import { securePrivateResponse } from '@/lib/http-security';
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success)
    return securePrivateResponse(
      NextResponse.json({ message: 'Solicitud inválida.' }, { status: 400 }),
    );
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: `/quality/reviews/${id.data}/decision`,
    inputSchema: qualityDecisionSchema,
    outputSchema: qualityReviewSchema,
  });
}
