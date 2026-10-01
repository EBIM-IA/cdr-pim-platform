import { workspaceSlugSchema } from '@cdr/contracts';
import { NextResponse } from 'next/server';

import { ApiClientError, createServerApiClient } from '@/lib/api-client';
import { getAccessToken } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const parsedSlug = workspaceSlugSchema.safeParse((await context.params).slug);
  if (!parsedSlug.success) {
    return NextResponse.json({ message: 'El módulo solicitado no es válido.' }, { status: 400 });
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Debes iniciar sesión.' }, { status: 401 });
  }

  try {
    const workspace = await createServerApiClient({ accessToken }).getWorkspace(parsedSlug.data);
    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof ApiClientError) {
      return NextResponse.json(
        { message: error.message, correlationId: error.correlationId },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { message: 'No fue posible conectar con el módulo operativo.' },
      { status: 502 },
    );
  }
}
