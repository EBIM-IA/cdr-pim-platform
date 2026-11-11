import {
  categorySkuAssignmentExportSchema,
  categorySkuAssignmentPreviewSchema,
  confirmedCategorySkuAssignmentsSchema,
  type PreviewCategorySkuAssignmentsInput,
  type ConfirmCategorySkuAssignmentsInput,
} from '@cdr/contracts';
import {
  createCatalogCategorySchema,
  moveCatalogCategorySchema,
  configureCategoryTemplateSchema,
  addTemplateAttributeSchema,
  templateInheritancePreviewSchema,
  type CreateCatalogCategoryInput,
  type MoveCatalogCategoryInput,
  type ConfigureCategoryTemplateInput,
  type AddTemplateAttributeInput,
} from '@cdr/contracts';
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

export function createAdminCategory(input: CreateCatalogCategoryInput) {
  return request('/categories', adminCatalogCategorySchema, {
    method: 'POST',
    body: JSON.stringify(createCatalogCategorySchema.parse(input)),
  });
}
export function moveAdminCategory(id: string, input: MoveCatalogCategoryInput) {
  return request(`/categories/${encodeURIComponent(id)}/parent`, adminCatalogCategorySchema, {
    method: 'PATCH',
    body: JSON.stringify(moveCatalogCategorySchema.parse(input)),
  });
}
export function configureAdminCategoryTemplate(id: string, input: ConfigureCategoryTemplateInput) {
  return request(`/categories/${encodeURIComponent(id)}/template`, adminTemplateSchema, {
    method: 'POST',
    body: JSON.stringify(configureCategoryTemplateSchema.parse(input)),
  });
}
export function addAdminTemplateAttribute(id: string, input: AddTemplateAttributeInput) {
  return request(`/templates/${encodeURIComponent(id)}/attributes`, adminTemplateSchema, {
    method: 'POST',
    body: JSON.stringify(addTemplateAttributeSchema.parse(input)),
  });
}
export function previewAdminTemplateInheritance(id: string, unifiedCode: string) {
  return request(
    `/templates/${encodeURIComponent(id)}/inheritance-preview?${new URLSearchParams({ unifiedCode })}`,
    templateInheritancePreviewSchema,
  );
}

export function exportAdminCategoryAssignments() {
  return request('/category-assignments', categorySkuAssignmentExportSchema);
}
export function previewAdminCategoryAssignments(input: PreviewCategorySkuAssignmentsInput) {
  return request('/category-assignments/preview', categorySkuAssignmentPreviewSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
export function confirmAdminCategoryAssignments(input: ConfirmCategorySkuAssignmentsInput) {
  return request('/category-assignments/confirm', confirmedCategorySkuAssignmentsSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
