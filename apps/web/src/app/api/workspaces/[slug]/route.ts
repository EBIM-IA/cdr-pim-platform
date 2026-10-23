import { workspaceQuerySchema, workspaceSlugSchema } from '@cdr/contracts';
import { NextResponse } from 'next/server';

import { ApiClientError, createServerApiClient } from '@/lib/api-client';
import { securePrivateResponse } from '@/lib/http-security';
import { getAccessToken } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const parsedSlug = workspaceSlugSchema.safeParse((await context.params).slug);
  if (!parsedSlug.success) {
    return securePrivateResponse(
      NextResponse.json({ message: 'El módulo solicitado no es válido.' }, { status: 400 }),
    );
  }
  const searchParams = new URL(request.url).searchParams;
  const parsedQuery = workspaceQuerySchema.safeParse({
    ...Object.fromEntries(searchParams.entries()),
    ...(searchParams.has('field') ? { field: searchParams.getAll('field') } : {}),
  });
  if (!parsedQuery.success) {
    return securePrivateResponse(
      NextResponse.json(
        { message: 'El formato de reporte solicitado no es válido.' },
        { status: 400 },
      ),
    );
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return securePrivateResponse(
      NextResponse.json({ message: 'Debes iniciar sesión.' }, { status: 401 }),
    );
  }

  try {
    const workspace = await createServerApiClient({ accessToken }).getWorkspace(
      parsedSlug.data,
      parsedQuery.data,
    );
    return securePrivateResponse(NextResponse.json(workspace));
  } catch (error) {
    if (error instanceof ApiClientError) {
      return securePrivateResponse(
        NextResponse.json(
          { message: error.message, correlationId: error.correlationId },
          { status: error.status },
        ),
      );
    }
    return securePrivateResponse(
      NextResponse.json(
        { message: 'No fue posible conectar con el módulo operativo.' },
        { status: 502 },
      ),
    );
  }
}
