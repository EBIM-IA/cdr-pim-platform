import { configureCategoryTemplateSchema, adminTemplateSchema, uuidSchema } from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success)
    return securePrivateResponse(
      NextResponse.json({ message: 'Identificador no válido' }, { status: 400 }),
    );
  return proxyPrivateApi({
    request,
    method: 'POST',
    path: `/catalog/admin/categories/${encodeURIComponent(id.data)}/template`,
    inputSchema: configureCategoryTemplateSchema,
    outputSchema: adminTemplateSchema,
  });
}
