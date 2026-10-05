import { adminTemplateListQuerySchema, adminTemplateSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = adminTemplateListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'El filtro de plantillas no es válido.' }, { status: 400 }),
    );
  }
  const params = new URLSearchParams();
  if (query.data.categoryId) params.set('categoryId', query.data.categoryId);
  const serialized = params.toString();
  return proxyPrivateApi({
    request,
    method: 'GET',
    path: `/catalog/admin/templates${serialized ? `?${serialized}` : ''}`,
    outputSchema: z.array(adminTemplateSchema),
  });
}
