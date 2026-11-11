import {
  reportSettingsSchema,
  type ReportSettingsDto,
  type UpdateReportSettingsInput,
} from '@cdr/contracts';
import { authenticatedBffFetch } from '@/lib/bff-client';
export async function reportSettings(
  input?: UpdateReportSettingsInput,
): Promise<ReportSettingsDto> {
  const response = await authenticatedBffFetch('/api/operations/reports/preferences', {
    method: input ? 'POST' : 'GET',
    headers: {
      accept: 'application/json',
      ...(input ? { 'content-type': 'application/json' } : {}),
    },
    cache: 'no-store',
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'No se pudo guardar la configuración de reportes.',
    );
  return reportSettingsSchema.parse(body);
}
