import { assertUuid, newUuid } from '@cdr/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedDemoCatalog } from '../../src/database/demo-seed';
import {
  attributeTemplates,
  auditEntries,
  productAttributeValues,
  products,
  productTemplateAssignments,
  templateAttributeRoleAccess,
} from '../../src/database/schema';
import { DrizzleProductTemplateAssignmentRepository } from '../../src/modules/catalog-schema/infrastructure/persistence/drizzle-product-template-assignment.repository';
import { type TestDatabase, createTestDatabase } from './database.helper';

interface VariantFixture {
  readonly productId: string;
  readonly currentTemplateId: string;
  readonly alternateTemplateId: string;
  readonly categoryId: string;
}

describe('DrizzleProductTemplateAssignmentRepository', () => {
  let database: TestDatabase;
  let repository: DrizzleProductTemplateAssignmentRepository;

  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new DrizzleProductTemplateAssignmentRepository(database.db);
  });
  beforeEach(async () => {
    await database.truncateAll();
    await seedDemoCatalog(database.db);
  });
  afterAll(() => database.close());

  it('reassigns within the category, preserves values and audits a published product', async () => {
    const fixture = await findVariantFixture(database);
    const productId = assertUuid(fixture.productId);
    const currentTemplateId = assertUuid(fixture.currentTemplateId);
    const alternateTemplateId = assertUuid(fixture.alternateTemplateId);
    const correlationId = newUuid();
    const now = new Date('2026-10-20T15:00:00.000Z');
    await database.db
      .update(products)
      .set({ status: 'published' })
      .where(eq(products.id, productId));
    const beforeValues = await database.db
      .select()
      .from(productAttributeValues)
      .where(eq(productAttributeValues.productId, productId));

    await expect(
      repository.reassign({
        productId,
        templateId: alternateTemplateId,
        expectedTemplateId: currentTemplateId,
        roles: ['COMPRAS'],
        now,
        audit: { actorId: 'buyer-1', correlationId },
      }),
    ).resolves.toMatchObject({
      kind: 'updated',
      previousTemplateId: currentTemplateId,
      assignment: {
        productId,
        category: { id: fixture.categoryId },
        template: { id: alternateTemplateId },
        assignedAt: now,
      },
    });

    const [assignment] = await database.db
      .select()
      .from(productTemplateAssignments)
      .where(eq(productTemplateAssignments.productId, productId));
    expect(assignment).toMatchObject({ templateId: alternateTemplateId, assignedAt: now });
    expect(
      await database.db
        .select()
        .from(productAttributeValues)
        .where(eq(productAttributeValues.productId, productId)),
    ).toEqual(beforeValues);
    await expect(
      database.db.select().from(products).where(eq(products.id, productId)),
    ).resolves.toMatchObject([{ status: 'in_review' }]);
    await expect(
      database.db.select().from(auditEntries).where(eq(auditEntries.correlationId, correlationId)),
    ).resolves.toMatchObject([
      {
        resourceType: 'product',
        resourceId: productId,
        changes: {
          templateId: { before: currentTemplateId, after: alternateTemplateId },
          status: { before: 'published', after: 'in_review' },
        },
      },
    ]);
  });

  it('detects an optimistic conflict before changing the assignment', async () => {
    const fixture = await findVariantFixture(database);
    const result = await repository.reassign({
      productId: assertUuid(fixture.productId),
      templateId: assertUuid(fixture.alternateTemplateId),
      expectedTemplateId: newUuid(),
      roles: ['COMPRAS'],
      now: new Date('2026-10-20T15:00:00.000Z'),
      audit: { actorId: 'buyer-1', correlationId: newUuid() },
    });
    expect(result).toEqual({
      kind: 'version_conflict',
      currentTemplateId: fixture.currentTemplateId,
    });
  });

  it('rejects an active template from another category', async () => {
    const fixture = await findVariantFixture(database);
    const targetRows = await database.sql<{ id: string }[]>`
      SELECT id
      FROM attribute_templates
      WHERE status = 'active'
        AND category_id <> ${fixture.categoryId}
      ORDER BY id
      LIMIT 1
    `;
    expect(targetRows[0]).toBeTruthy();
    await expect(
      repository.reassign({
        productId: assertUuid(fixture.productId),
        templateId: assertUuid(targetRows[0]!.id),
        expectedTemplateId: assertUuid(fixture.currentTemplateId),
        roles: ['COMPRAS'],
        now: new Date('2026-10-20T15:00:00.000Z'),
        audit: { actorId: 'buyer-1', correlationId: newUuid() },
      }),
    ).resolves.toEqual({ kind: 'different_category' });
  });

  it('rejects an inactive target template', async () => {
    const fixture = await findVariantFixture(database);
    await database.db
      .update(attributeTemplates)
      .set({ status: 'retired' })
      .where(eq(attributeTemplates.id, fixture.alternateTemplateId));
    await expect(
      repository.reassign({
        productId: assertUuid(fixture.productId),
        templateId: assertUuid(fixture.alternateTemplateId),
        expectedTemplateId: assertUuid(fixture.currentTemplateId),
        roles: ['COMPRAS'],
        now: new Date('2026-10-20T15:00:00.000Z'),
        audit: { actorId: 'buyer-1', correlationId: newUuid() },
      }),
    ).resolves.toEqual({ kind: 'template_not_found' });
  });

  it('rejects a target template hidden from all actor roles', async () => {
    const fixture = await findVariantFixture(database);
    await database.db
      .update(templateAttributeRoleAccess)
      .set({ canView: false, canEdit: false, canImport: false, canExport: false })
      .where(
        and(
          eq(templateAttributeRoleAccess.templateId, fixture.alternateTemplateId),
          eq(templateAttributeRoleAccess.role, 'COMPRAS'),
        ),
      );

    await expect(
      repository.reassign({
        productId: assertUuid(fixture.productId),
        templateId: assertUuid(fixture.alternateTemplateId),
        expectedTemplateId: assertUuid(fixture.currentTemplateId),
        roles: ['COMPRAS'],
        now: new Date('2026-10-20T15:00:00.000Z'),
        audit: { actorId: 'buyer-1', correlationId: newUuid() },
      }),
    ).resolves.toEqual({ kind: 'template_not_found' });
  });
});

async function findVariantFixture(database: TestDatabase): Promise<VariantFixture> {
  const rows = await database.sql<VariantFixture[]>`
    SELECT
      p.id AS "productId",
      current_template.id AS "currentTemplateId",
      alternate_template.id AS "alternateTemplateId",
      current_template.category_id AS "categoryId"
    FROM products p
    JOIN product_template_assignments assignment ON assignment.product_id = p.id
    JOIN attribute_templates current_template ON current_template.id = assignment.template_id
    JOIN attribute_templates alternate_template
      ON alternate_template.category_id = current_template.category_id
      AND alternate_template.status = 'active'
      AND alternate_template.id <> current_template.id
    WHERE current_template.status = 'active'
    ORDER BY p.sku, alternate_template.variant_key
    LIMIT 1
  `;
  const fixture = rows[0];
  if (!fixture) throw new Error('Seed must expose a product category with multiple variants');
  return fixture;
}
