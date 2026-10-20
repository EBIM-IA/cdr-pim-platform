import { codeAffixSchema, uuidSchema, validateCodeAffixSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'La regla indicada no es válida.' }, { status: 400 }),
    );
  }
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: `/code-affixes/${encodeURIComponent(id.data)}/validation`,
    inputSchema: validateCodeAffixSchema,
    outputSchema: codeAffixSchema,
  });
}
