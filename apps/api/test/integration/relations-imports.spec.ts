import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, assertUuid } from '@cdr/shared';

import { GroupApplication } from '../../src/modules/applications/domain/entities/group-application';
import { DrizzleGroupApplicationRepository } from '../../src/modules/applications/infrastructure/persistence/drizzle-group-application.repository';
import { DrizzleExternalHomologRepository } from '../../src/modules/equivalences/infrastructure/persistence/drizzle-external-homolog.repository';
import {
  ExternalHomolog,
  HomologApprovalStatus,
} from '../../src/modules/equivalences/domain/entities/external-homolog';
import { GroupOemCode } from '../../src/modules/equivalences/domain/entities/group-oem-code';
import { DrizzleGroupOemCodeRepository } from '../../src/modules/equivalences/infrastructure/persistence/drizzle-group-oem-code.repository';
import { ImportBatch } from '../../src/modules/imports/domain/entities/import-batch';
import { DrizzleImportBatchRepository } from '../../src/modules/imports/infrastructure/persistence/drizzle-import-batch.repository';
import { type TestDatabase, createTestDatabase } from './database.helper';

const productId = assertUuid('10000000-0000-4000-8000-000000000001');
const groupId = assertUuid('20000000-0000-4000-8000-000000000001');
const now = new Date('2026-10-05T10:00:00.000Z');

describe('group relationships and imports persistence', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  beforeEach(async () => {
    await database.truncateAll();
    await database.sql`
      INSERT INTO products (id, sku, name, status)
      VALUES (${productId}, 'D1672', 'Pastilla D1672', 'published')
    `;
    await database.sql`
      INSERT INTO equivalence_groups (id, code, name, kind)
      VALUES (${groupId}, 'D1672', 'D1672', 'interchange')
    `;
    await database.sql`
      INSERT INTO equivalence_group_members (group_id, product_id, role)
      VALUES (${groupId}, ${productId}, 'member')
    `;
  });

  afterAll(() => database.close());

  it('resolves applications inherited by a product through its unified-code group', async () => {
    const repository = new DrizzleGroupApplicationRepository(database.db);
    await repository.insertWithAudit(
      GroupApplication.create(
        {
          groupId,
          unifiedCode: 'D1672',
          vehicleType: 'AUTOMOTRIZ',
          make: 'Toyota',
          model: 'Hilux',
        },
        now,
      ),
      {
        action: 'created',
        actorId: 'integration-test',
        correlationId: 'application-inheritance',
        occurredAt: now,
      },
    );

    const rows = await repository.list({ productId, includeInactive: false });
    expect(rows.map((row) => row.toSnapshot())).toEqual([
      expect.objectContaining({ unifiedCode: 'D1672', make: 'Toyota', model: 'Hilux' }),
    ]);
  });

  it('commits manual application and homolog mutations atomically with audit and rejects stale versions', async () => {
    const applications = new DrizzleGroupApplicationRepository(database.db);
    const application = GroupApplication.create(
      {
        groupId,
        unifiedCode: 'D1672',
        vehicleType: 'AUTOMOTRIZ',
        make: 'Toyota',
        model: 'Hilux',
      },
      now,
    );
    await applications.insertWithAudit(application, {
      action: 'created',
      actorId: 'buyer-1',
      correlationId: 'manual-application-create',
      occurredAt: now,
    });
    await expect(
      applications.insertWithAudit(
        GroupApplication.create(
          {
            groupId,
            unifiedCode: 'D1672',
            vehicleType: 'AUTOMOTRIZ',
            make: 'Toyota',
            model: 'Hilux',
          },
          now,
        ),
        {
          action: 'created',
          actorId: 'buyer-1',
          correlationId: 'manual-application-duplicate',
          occurredAt: now,
        },
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const applicationId = application.toSnapshot().id;
    const editedApplication = await applications.findById(applicationId);
    expect(editedApplication).not.toBeNull();
    editedApplication!.update({ model: 'Fortuner' }, new Date('2026-10-05T10:01:00.000Z'));
    await expect(
      applications.updateWithAudit(editedApplication!, now, {
        action: 'updated',
        actorId: 'buyer-1',
        correlationId: '',
        occurredAt: new Date('2026-10-05T10:01:00.000Z'),
      }),
    ).rejects.toBeTruthy();
    expect((await applications.findById(applicationId))?.toSnapshot()).toMatchObject({
      model: 'Hilux',
      updatedAt: now,
    });

    const updatedApplication = await applications.updateWithAudit(editedApplication!, now, {
      action: 'updated',
      actorId: 'buyer-1',
      correlationId: 'manual-application-update',
      occurredAt: new Date('2026-10-05T10:01:00.000Z'),
    });
    expect(updatedApplication.kind).toBe('updated');
    const staleApplication = GroupApplication.rehydrate(editedApplication!.toSnapshot());
    staleApplication.update({ model: 'Tacoma' }, new Date('2026-10-05T10:02:00.000Z'));
    await expect(
      applications.updateWithAudit(staleApplication, now, {
        action: 'updated',
        actorId: 'buyer-1',
        correlationId: 'manual-application-stale',
        occurredAt: new Date('2026-10-05T10:02:00.000Z'),
      }),
    ).resolves.toMatchObject({ kind: 'version_conflict' });

    const homologs = new DrizzleExternalHomologRepository(database.db);
    const homolog = ExternalHomolog.create(
      {
        groupId,
        unifiedCode: 'D1672',
        externalCode: 'D-EXT',
        externalBrand: 'BOSCH',
        approvalStatus: HomologApprovalStatus.Approved,
      },
      now,
    );
    await homologs.insertWithAudit(homolog, {
      action: 'created',
      actorId: 'buyer-1',
      correlationId: 'manual-homolog-create',
      occurredAt: now,
    });
    await expect(
      homologs.insertWithAudit(
        ExternalHomolog.create(
          {
            groupId,
            unifiedCode: 'D1672',
            externalCode: 'd-ext',
            externalBrand: 'bosch',
            approvalStatus: HomologApprovalStatus.Pending,
          },
          now,
        ),
        {
          action: 'created',
          actorId: 'buyer-1',
          correlationId: 'manual-homolog-duplicate',
          occurredAt: now,
        },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    const homologId = homolog.toSnapshot().id;
    const editedHomolog = await homologs.findById(homologId);
    expect(editedHomolog).not.toBeNull();
    editedHomolog!.deactivate(new Date('2026-10-05T10:01:00.000Z'));
    await homologs.updateWithAudit(editedHomolog!, now, {
      action: 'deleted',
      actorId: 'buyer-1',
      correlationId: 'manual-homolog-deactivate',
      occurredAt: new Date('2026-10-05T10:01:00.000Z'),
    });
    expect((await homologs.findById(homologId))?.eligibleForSearch).toBe(false);

    const oemCodes = new DrizzleGroupOemCodeRepository(database.db);
    const oem = GroupOemCode.create(
      {
        groupId,
        unifiedCode: 'D1672',
        oemCode: '04465-0K240',
        brands: ['Toyota'],
        approvalStatus: 'approved',
      },
      now,
    );
    await oemCodes.insertWithAudit(oem, {
      action: 'created',
      actorId: 'buyer-1',
      correlationId: 'manual-oem-create',
      occurredAt: now,
    });
    const oemId = oem.toSnapshot().id;
    const editedOem = await oemCodes.findById(oemId);
    expect(editedOem).not.toBeNull();
    editedOem!.update({ brands: ['Lexus'] }, new Date('2026-10-05T10:01:00.000Z'));
    await expect(
      oemCodes.updateWithAudit(editedOem!, now, {
        action: 'updated',
        actorId: 'buyer-1',
        correlationId: '',
        occurredAt: new Date('2026-10-05T10:01:00.000Z'),
      }),
    ).rejects.toBeTruthy();
    expect((await oemCodes.findById(oemId))?.toSnapshot().brands).toEqual(['TOYOTA']);

    const deactivatedOem = await oemCodes.findById(oemId);
    deactivatedOem!.deactivate(new Date('2026-10-05T10:02:00.000Z'));
    const savedOem = await oemCodes.updateWithAudit(deactivatedOem!, now, {
      action: 'deleted',
      actorId: 'buyer-1',
      correlationId: 'manual-oem-deactivate',
      occurredAt: new Date('2026-10-05T10:02:00.000Z'),
    });
    expect(savedOem.kind).toBe('updated');
    await expect(
      oemCodes.updateWithAudit(deactivatedOem!, now, {
        action: 'updated',
        actorId: 'buyer-1',
        correlationId: 'manual-oem-stale',
        occurredAt: new Date('2026-10-05T10:03:00.000Z'),
      }),
    ).resolves.toMatchObject({ kind: 'version_conflict' });

    await database.sql`
      INSERT INTO group_oem_codes
        (id, equivalence_group_id, oem_code, brands, active, approval_status)
      VALUES
        ('50000000-0000-4000-8000-000000000001', ${groupId}, 'case-key', ARRAY['TOYOTA'], true, 'pending')
    `;
    await expect(
      oemCodes.insertWithAudit(
        GroupOemCode.create(
          {
            groupId,
            unifiedCode: 'D1672',
            oemCode: 'CASE-KEY',
            brands: ['Lexus'],
          },
          now,
        ),
        {
          action: 'created',
          actorId: 'buyer-1',
          correlationId: 'manual-oem-case-duplicate',
          occurredAt: now,
        },
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const auditRows = await database.sql<{ resourceType: string; action: string }[]>`
      SELECT resource_type AS "resourceType", action
      FROM audit_entries
      WHERE resource_id IN (${applicationId}, ${homologId}, ${oemId})
      ORDER BY occurred_at, resource_type, action
    `;
    expect(auditRows).toEqual(
      expect.arrayContaining([
        { resourceType: 'group_application', action: 'created' },
        { resourceType: 'group_application', action: 'updated' },
        { resourceType: 'external_homolog', action: 'created' },
        { resourceType: 'external_homolog', action: 'deleted' },
        { resourceType: 'group_oem_code', action: 'created' },
        { resourceType: 'group_oem_code', action: 'deleted' },
      ]),
    );
    expect(auditRows).toHaveLength(6);
  });

  it('expands only active and approved external homologs to commercial SKUs', async () => {
    await database.sql`
      INSERT INTO external_homologs
        (id, equivalence_group_id, external_code, external_brand, active, approval_status)
      VALUES
        ('30000000-0000-4000-8000-000000000001', ${groupId}, 'OEM-42', 'BOSCH', true, 'approved'),
        ('30000000-0000-4000-8000-000000000002', ${groupId}, 'OEM-42', 'PENDING', true, 'pending'),
        ('30000000-0000-4000-8000-000000000003', ${groupId}, 'OEM-42', 'INACTIVE', false, 'approved')
    `;
    const repository = new DrizzleExternalHomologRepository(database.db);

    const matches = await repository.searchEligible('oem-42');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.homolog.toSnapshot()).toMatchObject({ externalBrand: 'BOSCH' });
    expect(matches[0]?.products).toEqual([expect.objectContaining({ sku: 'D1672' })]);
  });

  it('returns the original durable preview for a repeated idempotency key', async () => {
    const repository = new DrizzleImportBatchRepository(database.db);
    const first = ImportBatch.preview(
      {
        target: 'homologs',
        format: 'json',
        idempotencyKey: 'relations-test-1',
        payloadHash: 'same-hash',
        categoryCode: null,
        createdBy: 'admin',
        rows: [
          {
            rowNumber: 1,
            valid: true,
            data: { externalCode: 'OEM-42' },
            errors: [],
            warnings: [],
          },
        ],
      },
      now,
    );
    const replay = ImportBatch.preview(
      {
        target: 'homologs',
        format: 'json',
        idempotencyKey: 'relations-test-1',
        payloadHash: 'same-hash',
        categoryCode: null,
        createdBy: 'admin',
        rows: [
          {
            rowNumber: 1,
            valid: true,
            data: { externalCode: 'OEM-42' },
            errors: [],
            warnings: [],
          },
        ],
      },
      now,
    );

    const saved = await repository.savePreview(first);
    const repeated = await repository.savePreview(replay);
    expect(repeated.toSnapshot().id).toBe(saved.toSnapshot().id);
  });

  it('commits each imported relation together with its audit and rolls business back if audit fails', async () => {
    const applications = new DrizzleGroupApplicationRepository(database.db);
    const homologs = new DrizzleExternalHomologRepository(database.db);
    const oemCodes = new DrizzleGroupOemCodeRepository(database.db);
    const application = GroupApplication.create(
      {
        groupId,
        unifiedCode: 'D1672',
        vehicleType: 'AUTOMOTRIZ',
        make: 'Toyota',
        model: 'Hilux',
        source: 'import',
      },
      now,
    );
    await expect(
      applications.saveImported(application, {
        actorId: 'buyer-1',
        correlationId: '',
        occurredAt: now,
      }),
    ).rejects.toBeTruthy();
    expect(await applications.list({ unifiedCode: 'D1672', includeInactive: true })).toEqual([]);

    await applications.saveImported(application, {
      actorId: 'buyer-1',
      correlationId: 'row-application',
      occurredAt: now,
    });
    await homologs.saveImported(
      ExternalHomolog.create(
        {
          groupId,
          unifiedCode: 'D1672',
          externalCode: 'D-EXT',
          externalBrand: 'BOSCH',
          active: true,
          approvalStatus: HomologApprovalStatus.Approved,
          source: 'import',
        },
        now,
      ),
      { actorId: 'buyer-1', correlationId: 'row-homolog', occurredAt: now },
    );
    await oemCodes.saveImported(
      GroupOemCode.create(
        {
          groupId,
          unifiedCode: 'D1672',
          oemCode: '04465-0K240',
          brands: ['TOYOTA'],
          source: 'import',
        },
        now,
      ),
      { actorId: 'buyer-1', correlationId: 'row-oem', occurredAt: now },
    );

    const rows = await database.sql<{ resource_type: string; count: number }[]>`
      SELECT resource_type, count(*)::int AS count
      FROM audit_entries
      WHERE correlation_id IN ('row-application', 'row-homolog', 'row-oem')
      GROUP BY resource_type
      ORDER BY resource_type
    `;
    expect(rows).toEqual([
      { resource_type: 'external_homolog', count: 1 },
      { resource_type: 'group_application', count: 1 },
      { resource_type: 'group_oem_code', count: 1 },
    ]);
  });

  it('lets exactly one concurrent request claim an import confirmation', async () => {
    const repository = new DrizzleImportBatchRepository(database.db);
    const preview = await repository.savePreview(
      ImportBatch.preview(
        {
          target: 'category',
          format: 'json',
          idempotencyKey: 'category-claim-1',
          payloadHash: 'category-hash',
          categoryCode: 'pastillas-de-freno',
          createdBy: 'buyer-1',
          rows: [
            {
              rowNumber: 1,
              valid: true,
              data: { sku: 'D1672', descripcion_tecnica: 'Nueva descripción' },
              errors: [],
              warnings: ['Se ignoró la columna archivo_tecnico'],
              metadata: { productId, sku: 'D1672', cells: [] },
            },
          ],
        },
        now,
      ),
    );

    const claims = await Promise.all([
      repository.claimConfirmation(preview.toSnapshot().id, {
        actorId: 'buyer-1',
        correlationId: 'claim-a',
        occurredAt: now,
      }),
      repository.claimConfirmation(preview.toSnapshot().id, {
        actorId: 'buyer-1',
        correlationId: 'claim-b',
        occurredAt: now,
      }),
    ]);
    expect(claims.map((claim) => claim.kind).sort()).toEqual(['busy', 'claimed']);
    const claimed = claims.find((claim) => claim.kind === 'claimed');
    expect(claimed?.kind === 'claimed' && claimed.batch.toSnapshot()).toMatchObject({
      status: 'processing',
      rows: [
        {
          metadata: { productId, sku: 'D1672' },
          warnings: ['Se ignoró la columna archivo_tecnico'],
        },
      ],
    });

    const recovered = await repository.claimConfirmation(preview.toSnapshot().id, {
      actorId: 'buyer-1',
      correlationId: 'claim-recovery',
      occurredAt: new Date(now.getTime() + 16 * 60 * 1_000),
    });
    expect(recovered.kind).toBe('claimed');
    if (recovered.kind !== 'claimed') throw new Error('Expected the stale lease to be reclaimed');
    recovered.batch.failConfirmation();
    await repository.saveConfirmation(recovered.batch, {
      actorId: 'buyer-1',
      correlationId: 'claim-failed',
      occurredAt: new Date(now.getTime() + 16 * 60 * 1_000),
    });
    const [persisted] = await database.sql<
      { status: string; processing_started_at: Date | null; audit_count: number }[]
    >`
      SELECT b.status, b.processing_started_at,
        (SELECT count(*)::int FROM audit_entries a
          WHERE a.resource_type = 'import_batch' AND a.resource_id = b.id::text) AS audit_count
      FROM import_batches b WHERE b.id = ${preview.toSnapshot().id}
    `;
    expect(persisted).toMatchObject({
      status: 'failed',
      processing_started_at: null,
      audit_count: 3,
    });
  });
});
