import { assertUuid, ConflictError, newUuid } from '@cdr/shared';
import type { QualityReviewDto } from '@cdr/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  attributeDefinitions,
  attributeTemplates,
  auditEntries,
  catalogCategories,
  productAttributeValues,
  products,
  productTemplateAssignments,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
} from '../../src/database/schema';
import { createAuditEntry } from '../../src/modules/audit/domain/entities/audit-entry';
import { DrizzleQualityGovernanceRepository } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-quality-governance.repository';
import { DrizzleDuplicateCandidates } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-duplicate-candidates';
import { createTestDatabase, type TestDatabase } from './database.helper';
const productId = assertUuid('10000000-0000-4000-8000-000000000001');
const categoryId = assertUuid('20000000-0000-4000-8000-000000000001');
const templateId = assertUuid('30000000-0000-4000-8000-000000000001');
const definitionId = assertUuid('40000000-0000-4000-8000-000000000001');
const now = new Date('2026-11-10T15:00:00Z');
function review(): QualityReviewDto {
  return {
    id: newUuid(),
    kind: 'attribute',
    productId,
    sku: 'TEST-1',
    attributeKey: 'material',
    currentValue: null,
    attributeVersion: 0,
    candidates: [{ source: 'ai', value: 'Acero', evidence: 'Ficha técnica', confidence: 0.9 }],
    proposedIndex: 0,
    chosenIndex: null,
    chosenValue: null,
    override: false,
    assetId: null,
    model: 'simulado',
    channel: null,
    productB: null,
    status: 'pending',
    duplicateDecision: null,
    reason: null,
    requestedBy: 'admin@example.test',
    decidedBy: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    version: 1,
  };
}
function audit(id: string) {
  return createAuditEntry({
    resourceType: 'quality_review',
    resourceId: id,
    action: 'updated',
    actorId: 'admin',
    source: 'test:quality',
    correlationId: newUuid(),
    occurredAt: now,
    changes: { status: { after: 'approved' }, reason: { after: 'Verificado contra ficha.' } },
  });
}
const application = {
  productId,
  attributeKey: 'material',
  value: 'Acero',
  expectedVersion: 0,
  source: 'document_extraction' as const,
  roles: ['ADMINISTRADOR'],
  now,
  actorId: 'admin',
  correlationId: newUuid(),
};
describe('durable quality governance unit of work', () => {
  let database: TestDatabase;
  let repository: DrizzleQualityGovernanceRepository;
  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new DrizzleQualityGovernanceRepository(database.db);
  });
  beforeEach(async () => {
    await database.truncateAll();
    await database.db
      .insert(products)
      .values({ id: productId, sku: 'TEST-1', name: 'Producto de prueba' });
    await database.db
      .insert(catalogCategories)
      .values({ id: categoryId, slug: 'test', name: 'Prueba', path: 'test', updatedAt: now });
    await database.db.insert(attributeDefinitions).values({
      id: definitionId,
      key: 'material',
      label: 'Material',
      dataType: 'text',
      sourceAuthority: 'pim',
    });
    await database.db.insert(attributeTemplates).values({
      id: templateId,
      categoryId,
      variantKey: 'default',
      name: 'Prueba',
      version: 1,
      status: 'active',
    });
    await database.db
      .insert(templateAttributeAssignments)
      .values({ templateId, attributeDefinitionId: definitionId });
    await database.db.insert(templateAttributeRoleAccess).values({
      templateId,
      attributeDefinitionId: definitionId,
      role: 'ADMINISTRADOR',
      canView: true,
      canEdit: true,
    });
    await database.db.insert(productTemplateAssignments).values({ productId, templateId });
  });
  afterAll(() => database?.close());
  it('commits attribute, durable decision and both audit trails; rejects a second concurrent decision', async () => {
    const pending = review();
    await repository.create([pending], audit(pending.id));
    const approved = {
      ...pending,
      status: 'approved' as const,
      chosenIndex: 0,
      chosenValue: 'Acero',
      reason: 'Verificado.',
      version: 2,
    };
    const results = await Promise.allSettled([
      repository.decide(approved, 1, audit(pending.id), application),
      repository.decide(approved, 1, audit(pending.id), application),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await repository.find(pending.id))?.status).toBe('approved');
    const [value] = await database.db
      .select()
      .from(productAttributeValues)
      .where(eq(productAttributeValues.productId, productId));
    expect(value).toMatchObject({ valueText: 'Acero', version: 1, source: 'document_extraction' });
    const events = await database.db.select().from(auditEntries);
    expect(events.some((entry) => entry.resourceType === 'product')).toBe(true);
    expect(events.filter((entry) => entry.resourceType === 'quality_review')).toHaveLength(2);
  });
  it('rolls back the attribute savepoint if the decision audit cannot be appended', async () => {
    const pending = review();
    const duplicateAudit = audit(pending.id);
    await repository.create([pending], duplicateAudit);
    await expect(
      repository.decide(
        { ...pending, status: 'approved', version: 2 },
        1,
        duplicateAudit,
        application,
      ),
    ).rejects.toThrow();
    expect((await repository.find(pending.id))?.status).toBe('pending');
    expect(await database.db.select().from(productAttributeValues)).toHaveLength(0);
  });
  it('keeps a candidate pending when its original attribute version is stale', async () => {
    const pending = review();
    await repository.create([pending], audit(pending.id));
    await database.db.insert(productAttributeValues).values({
      productId,
      attributeDefinitionId: definitionId,
      valueText: 'Nuevo valor',
      version: 1,
    });
    await expect(
      repository.decide(
        { ...pending, status: 'approved', version: 2 },
        1,
        audit(pending.id),
        application,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await repository.find(pending.id))?.status).toBe('pending');
    expect((await database.db.select().from(productAttributeValues))[0]?.valueText).toBe(
      'Nuevo valor',
    );
  });
  it('aggregates completeness across every product and groups by both template and top-level line', async () => {
    const rows = await repository.completeness();
    expect(rows.find((row) => row.kind === 'template' && row.key === templateId)).toMatchObject({
      productCount: 1,
      average: 100,
    });
    expect(rows.find((row) => row.kind === 'line' && row.key === categoryId)).toMatchObject({
      productCount: 1,
      average: 100,
    });
    await database.db
      .update(templateAttributeAssignments)
      .set({ required: true })
      .where(eq(templateAttributeAssignments.attributeDefinitionId, definitionId));
    const withMissing = await repository.completeness();
    expect(withMissing.find((row) => row.kind === 'template')?.average).toBe(0);
    await database.db
      .insert(productAttributeValues)
      .values({ productId, attributeDefinitionId: definitionId, valueText: 'Acero' });
    expect((await repository.completeness()).find((row) => row.kind === 'template')?.average).toBe(
      100,
    );
  });
  it('projects actual products in review without changing their publication state', async () => {
    await database.db
      .update(products)
      .set({ status: 'in_review' })
      .where(eq(products.id, productId));
    const pending = await repository.productChanges({ page: 1, pageSize: 20 });
    expect(pending).toMatchObject({
      total: 1,
      items: [{ productId, sku: 'TEST-1', status: 'in_review' }],
    });
    expect((await database.db.select().from(products))[0]?.status).toBe('in_review');
  });
  it('does not lose source priority changes on stale category edits', async () => {
    const input = {
      categoryId,
      expectedUpdatedAt: now.toISOString(),
      priority: { fabricante: 1, archivo: 2 },
      reason: 'Cliente confirmó.',
    };
    const event = { ...audit(categoryId), occurredAt: new Date(now.getTime() + 1000) };
    await repository.updatePriority(input, event);
    await expect(
      repository.updatePriority({ ...input, priority: { manual: 1 } }, audit(categoryId)),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await database.db.select().from(catalogCategories))[0]?.sourcePriority).toEqual({
      fabricante: 1,
      archivo: 2,
    });
  });
  it('detects shared supplier codes conservatively and persists duplicate dispositions without merging products', async () => {
    const otherId = newUuid();
    const codeId = newUuid();
    await database.db
      .insert(products)
      .values({ id: otherId, sku: 'TEST-2', name: 'Otro producto' });
    await database.db.insert(attributeDefinitions).values({
      id: codeId,
      key: 'codigo_proveedor',
      label: 'Código proveedor',
      dataType: 'text',
      sourceAuthority: 'erp',
    });
    await database.db.insert(productAttributeValues).values([
      { productId, attributeDefinitionId: codeId, valueText: ' GU-1000 ' },
      { productId: otherId, attributeDefinitionId: codeId, valueText: 'gu-1000' },
    ]);
    const pairs = await new DrizzleDuplicateCandidates(database.db).detect();
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.evidence).toContain('codigo_proveedor');
    const pair = pairs[0]!;
    const pending: QualityReviewDto = {
      ...review(),
      kind: 'duplicate',
      productId: pair.productA.id,
      sku: pair.productA.sku,
      productB: pair.productB,
    };
    await repository.create([pending], audit(pending.id));
    await repository.decide(
      {
        ...pending,
        status: 'approved',
        duplicateDecision: 'equivalent',
        reason: 'Mantener separados.',
        version: 2,
      },
      1,
      audit(pending.id),
    );
    expect(await database.db.select().from(products)).toHaveLength(2);
    await repository.create([{ ...pending, id: newUuid() }], audit(pending.id));
    expect((await repository.list({ page: 1, pageSize: 100, kind: 'duplicate' })).total).toBe(1);
  });
});
