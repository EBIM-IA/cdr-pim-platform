import {
  type AdminCatalogCategoryDto,
  type AdminTemplateAttributeDto,
  type AdminTemplateDto,
  type UpdateCatalogCategoryInput,
  type UpdateTemplateAttributeInput,
  adminCatalogCategorySchema,
  adminTemplateAttributeSchema,
  adminTemplateSchema,
} from '@cdr/contracts';
import { z } from 'zod';

import { authenticatedBffFetch } from '@/lib/bff-client';

const ADMIN_PATH = '/api/catalog/admin';

export class CatalogAdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CatalogAdminApiError';
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await authenticatedBffFetch(`${ADMIN_PATH}${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `La operación respondió con estado ${response.status}.`;
    throw new CatalogAdminApiError(message, response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new CatalogAdminApiError('La respuesta no coincide con el contrato administrativo.', 502);
  }
  return parsed.data;
}

export function listAdminCategories(includeInactive = true): Promise<AdminCatalogCategoryDto[]> {
  const query = new URLSearchParams({ includeInactive: String(includeInactive) });
  return request(`/categories?${query.toString()}`, z.array(adminCatalogCategorySchema));
}

export function updateAdminCategory(
  id: string,
  input: UpdateCatalogCategoryInput,
): Promise<AdminCatalogCategoryDto> {
  return request(`/categories/${encodeURIComponent(id)}`, adminCatalogCategorySchema, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function listAdminTemplates(categoryId?: string): Promise<AdminTemplateDto[]> {
  const query = new URLSearchParams();
  if (categoryId) query.set('categoryId', categoryId);
  const serialized = query.toString();
  return request(`/templates${serialized ? `?${serialized}` : ''}`, z.array(adminTemplateSchema));
}

export function getAdminTemplate(id: string): Promise<AdminTemplateDto> {
  return request(`/templates/${encodeURIComponent(id)}`, adminTemplateSchema);
}

export function updateAdminTemplateAttribute(
  templateId: string,
  attributeId: string,
  input: UpdateTemplateAttributeInput,
): Promise<AdminTemplateAttributeDto> {
  return request(
    `/templates/${encodeURIComponent(templateId)}/attributes/${encodeURIComponent(attributeId)}`,
    adminTemplateAttributeSchema,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}
