import {
  adminTemplateAttributeSchema,
  updateTemplateAttributeSchema,
  uuidSchema,
} from '@cdr/contracts';
import { type NextRequest, NextResponse } from 'next/server';

import { securePrivateResponse } from '@/lib/http-security';
import { proxyPrivateApi } from '@/lib/private-api-route';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; attributeId: string }> },
) {
  const params = await context.params;
  const templateId = uuidSchema.safeParse(params.id);
  const attributeId = uuidSchema.safeParse(params.attributeId);
  if (!templateId.success || !attributeId.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'La plantilla o el atributo no son válidos.' }, { status: 400 }),
    );
  }
  return proxyPrivateApi({
    request,
    method: 'PATCH',
    path: `/catalog/admin/templates/${encodeURIComponent(templateId.data)}/attributes/${encodeURIComponent(attributeId.data)}`,
    inputSchema: updateTemplateAttributeSchema,
    outputSchema: adminTemplateAttributeSchema,
  });
}
