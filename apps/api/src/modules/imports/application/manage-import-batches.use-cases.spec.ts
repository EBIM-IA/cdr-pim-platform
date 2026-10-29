import { createHash } from 'node:crypto';

import { FixedClock, ValidationError, assertUuid } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import type { GroupApplicationRepositoryPort } from '../../applications/domain/ports/group-application-repository.port';
import { GroupApplication } from '../../applications/domain/entities/group-application';
import type { ExternalHomologRepositoryPort } from '../../equivalences/domain/ports/external-homolog-repository.port';
import { ExternalHomolog } from '../../equivalences/domain/entities/external-homolog';
import type { GroupOemCode } from '../../equivalences/domain/entities/group-oem-code';
import type { GroupOemCodeRepositoryPort } from '../../equivalences/domain/ports/group-oem-code-repository.port';
import type {
  CategoryAttributeImportPort,
  CategoryImportSourceRow,
} from '../../catalog-schema/domain/ports/category-attribute-import.port';
import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { ImportBatch, type ImportTarget } from '../domain/entities/import-batch';
import type { ImportBatchRepositoryPort } from '../domain/ports/import-batch-repository.port';
import {
  ConfirmImportBatchUseCase,
  PreviewImportBatchUseCase,
} from './manage-import-batches.use-cases';

const now = new Date('2026-10-07T10:00:00.000Z');
const groupId = assertUuid('11111111-1111-4111-8111-111111111111');
const actor: AuthenticatedActor = {
  id: 'purchasing-1',
  email: 'compras@example.test',
  roles: [Role.Purchasing],
};

describe('OEM imports', () => {
  it('keeps legacy idempotency hashes valid when no template variant is supplied', async () => {
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          target: 'oem',
          format: 'json',
          categoryCode: null,
          rows: [{ unifiedCode: 'D1672', oemCode: 'OEM-1', brands: ['TOYOTA'] }],
        }),
      )
      .digest('hex');
    const legacy = ImportBatch.preview(
      {
        target: 'oem',
        format: 'json',
        idempotencyKey: 'legacy-idempotency-1',
        payloadHash,
        categoryCode: null,
        createdBy: actor.id,
        rows: [],
      },
      now,
    );
    const imports = new MemoryImportBatchRepository(legacy);

    const repeated = await new PreviewImportBatchUseCase(
      imports,
      new FixedClock(now),
      emptyApplications(),
      emptyHomologs(),
      createOemRepository(true),
      emptyCategoryImports(),
      externalHomologPolicy(),
    ).execute(
      {
        target: 'oem',
        format: 'json',
        idempotencyKey: 'legacy-idempotency-1',
        records: [{ codigo_unificador: 'D1672', codigo_oem: 'OEM-1', marcas: ['TOYOTA'] }],
      },
      actor,
    );

    expect(repeated.toSnapshot().id).toBe(legacy.toSnapshot().id);
  });

  it('validates a group once per preview and confirms real OEM rows idempotently', async () => {
    const imports = new MemoryImportBatchRepository();
    const applications = emptyApplications();
    const homologs = emptyHomologs();
    const saved: GroupOemCode[] = [];
    const oemRepository = createOemRepository(true, (oem) => saved.push(oem));
    const clock = new FixedClock(now);
    const previewUseCase = new PreviewImportBatchUseCase(
      imports,
      clock,
      applications,
      homologs,
      oemRepository,
      emptyCategoryImports(),
      externalHomologPolicy(),
    );
    const confirmUseCase = new ConfirmImportBatchUseCase(
      imports,
      clock,
      applications,
      homologs,
      oemRepository,
      emptyCategoryImports(),
      externalHomologPolicy(),
    );

    const preview = await previewUseCase.execute(
      {
        target: 'oem',
        format: 'json',
        idempotencyKey: 'oem-confirmation-0001',
        records: [
          { codigo_unificador: 'D1672', codigo_oem: 'OEM-1', marcas: ['TOYOTA'] },
          { codigo_unificador: 'D1672', codigo_oem: 'OEM-2', marcas: ['TOYOTA', 'LEXUS'] },
        ],
      },
      actor,
    );

    expect(preview.toSnapshot().rows.every((row) => row.valid)).toBe(true);
    expect(oemRepository.findGroupByCode).toHaveBeenCalledTimes(1);

    const confirmed = await confirmUseCase.execute(preview.toSnapshot().id, actor);
    expect(confirmed.toSnapshot().status).toBe('confirmed');
    expect(oemRepository.findGroupByCode).toHaveBeenCalledTimes(2);
    expect(oemRepository.saveImported).toHaveBeenCalledTimes(2);
    expect(saved.map((oem) => oem.toSnapshot())).toEqual([
      expect.objectContaining({
        unifiedCode: 'D1672',
        oemCode: 'OEM-1',
        brands: ['TOYOTA'],
        source: 'import',
        importBatchId: preview.toSnapshot().id,
      }),
      expect.objectContaining({ oemCode: 'OEM-2', brands: ['TOYOTA', 'LEXUS'] }),
    ]);
    await confirmUseCase.execute(preview.toSnapshot().id, actor);
    expect(oemRepository.saveImported).toHaveBeenCalledTimes(2);
  });

  it('rejects OEM rows for non-automotive groups during row-level preview validation', async () => {
    const imports = new MemoryImportBatchRepository();
    const repository = createOemRepository(false);
    const preview = await new PreviewImportBatchUseCase(
      imports,
      new FixedClock(now),
      emptyApplications(),
      emptyHomologs(),
      repository,
      emptyCategoryImports(),
      externalHomologPolicy(),
    ).execute(
      {
        target: 'oem',
        format: 'csv',
        idempotencyKey: 'oem-non-automotive',
        csv: 'codigo_unificador,codigo_oem,marcas\nIND-1,OEM-1,ACME',
      },
      actor,
    );

    expect(preview.toSnapshot().rows[0]).toMatchObject({
      valid: false,
      errors: ['Los códigos OEM solo se permiten en grupos automotrices'],
    });
  });
});

describe('homolog imports', () => {
  it('rejects catalogue SKU rows and warns when an external reference belongs to another group', async () => {
    const homologs = {
      ...emptyHomologs(),
      findGroupByCode: vi.fn(async (code: string) => ({ id: groupId, code })),
      list: vi.fn(async () => [
        ExternalHomolog.create(
          {
            groupId,
            unifiedCode: 'OTHER-GROUP',
            externalCode: 'QC1672',
            externalBrand: 'WAGNER',
          },
          now,
        ),
      ]),
    };
    const policy = {
      assertExternalReference: vi.fn(async (code: string) => {
        if (code === 'D1672') throw new ValidationError('Ya es un SKU del catálogo');
      }),
    };
    const preview = await new PreviewImportBatchUseCase(
      new MemoryImportBatchRepository(),
      new FixedClock(now),
      emptyApplications(),
      homologs,
      createOemRepository(true),
      emptyCategoryImports(),
      policy,
    ).execute(
      {
        target: 'homologs',
        format: 'json',
        idempotencyKey: 'homolog-catalogue-preview',
        records: [
          { unifiedCode: 'D1672', externalCode: 'D1672', externalBrand: 'AKEBONO' },
          { unifiedCode: 'D1672', externalCode: 'QC1672', externalBrand: 'wagner' },
        ],
      },
      actor,
    );

    expect(preview.toSnapshot().rows).toMatchObject([
      { valid: false, errors: ['Ya es un SKU del catálogo'] },
      {
        valid: true,
        errors: [],
        warnings: ['El homólogo también está asociado a OTHER-GROUP'],
      },
    ]);
    expect(homologs.saveImported).not.toHaveBeenCalled();
    expect(homologs.list).toHaveBeenCalledTimes(1);
  });

  it('rechecks catalogue ownership at confirmation and imports only rows still valid', async () => {
    const imports = new MemoryImportBatchRepository();
    const homologs = {
      ...emptyHomologs(),
      findGroupByCode: vi.fn(async (code: string) => ({ id: groupId, code })),
    };
    let catalogueChanged = false;
    const policy = {
      assertExternalReference: vi.fn(async (code: string) => {
        if (catalogueChanged && code === 'D1672') {
          throw new ValidationError('El SKU fue recibido desde AX después de la previsualización');
        }
      }),
    };
    const common = [
      imports,
      new FixedClock(now),
      emptyApplications(),
      homologs,
      createOemRepository(true),
      emptyCategoryImports(),
      policy,
    ] as const;
    const preview = await new PreviewImportBatchUseCase(...common).execute(
      {
        target: 'homologs',
        format: 'json',
        idempotencyKey: 'homolog-catalogue-confirm',
        records: [
          { unifiedCode: 'D1672', externalCode: 'D1672', externalBrand: 'AKEBONO' },
          { unifiedCode: 'D1672', externalCode: 'QC1672', externalBrand: 'WAGNER' },
        ],
      },
      actor,
    );
    expect(preview.toSnapshot().rows.every((row) => row.valid)).toBe(true);
    catalogueChanged = true;

    const confirmed = await new ConfirmImportBatchUseCase(...common).execute(
      preview.toSnapshot().id,
      actor,
    );

    expect(confirmed.toSnapshot()).toMatchObject({
      status: 'confirmed',
      rows: [
        { valid: false, errors: ['El SKU fue recibido desde AX después de la previsualización'] },
        { valid: true, errors: [] },
      ],
    });
    expect(homologs.saveImported).toHaveBeenCalledTimes(1);
    expect(vi.mocked(homologs.saveImported).mock.calls[0]?.[0].toSnapshot()).toMatchObject({
      externalCode: 'QC1672',
      externalBrand: 'WAGNER',
    });
  });
});

describe('application imports', () => {
  it('derives vehicleType from the group and persists every PIM(2) application field', async () => {
    const imports = new MemoryImportBatchRepository();
    const saved: GroupApplication[] = [];
    const applications: GroupApplicationRepositoryPort = {
      listForProducts: vi.fn(async () => new Map()),
      findGroupByCode: vi.fn(async (code: string) => ({
        id: groupId,
        code,
        vehicleType: 'AUTOMOTRIZ' as const,
      })),
      findById: vi.fn(async () => null),
      list: vi.fn(async () => []),
      insertWithAudit: vi.fn(async () => undefined),
      updateWithAudit: vi.fn(async (application) => ({
        kind: 'updated' as const,
        value: application,
      })),
      saveImported: vi.fn(async (application) => {
        saved.push(application);
      }),
    };
    const common = [
      imports,
      new FixedClock(now),
      applications,
      emptyHomologs(),
      createOemRepository(true),
      emptyCategoryImports(),
      externalHomologPolicy(),
    ] as const;
    const preview = await new PreviewImportBatchUseCase(...common).execute(
      {
        target: 'applications',
        format: 'json',
        idempotencyKey: 'pim-application-import',
        records: [
          {
            codigo_unificador: 'R177.19',
            marca_vehiculo: 'SUZUKI',
            modelo: 'S-CROSS SX4 M6',
            tipo: 'HB',
            combustible: 'GSL',
            traccion: '4X2',
            cilindraje: '1.6L',
            ano_desde: 2013,
            ano_hasta: 2019,
            area: 'RUEDA POSTERIOR',
            subarea: 'MANZANA 5 PERNOS CON ABS',
          },
        ],
      },
      actor,
    );

    expect(preview.toSnapshot().rows[0]).toMatchObject({
      valid: true,
      data: { vehicleType: 'AUTOMOTRIZ', bodyStyle: 'HB' },
    });
    await new ConfirmImportBatchUseCase(...common).execute(preview.toSnapshot().id, actor);
    expect(saved[0]?.toSnapshot()).toMatchObject({
      vehicleType: 'AUTOMOTRIZ',
      bodyStyle: 'HB',
      fuel: 'GSL',
      traction: '4X2',
      displacement: '1.6L',
      area: 'RUEDA POSTERIOR',
      subarea: 'MANZANA 5 PERNOS CON ABS',
    });
  });
});

describe('category imports', () => {
  it('confirms a durable legacy plan that predates template-specific previews', async () => {
    const legacy = ImportBatch.preview(
      {
        target: 'category',
        format: 'json',
        idempotencyKey: 'legacy-category-confirmation-1',
        payloadHash: 'legacy-category-hash',
        categoryCode: 'pastillas-de-freno',
        createdBy: actor.id,
        rows: [
          {
            rowNumber: 1,
            valid: true,
            data: { sku: 'D1672', descripcion_tecnica: 'Ficha histórica' },
            errors: [],
            warnings: [],
            metadata: {
              productId: groupId,
              sku: 'D1672',
              cells: [
                {
                  attributeKey: 'descripcion_tecnica',
                  value: 'Ficha histórica',
                  expectedVersion: 0,
                },
              ],
            },
          },
        ],
      },
      now,
    );
    const imports = new MemoryImportBatchRepository(legacy);
    const categoryImports = emptyCategoryImports();
    const confirmed = await new ConfirmImportBatchUseCase(
      imports,
      new FixedClock(now),
      emptyApplications(),
      emptyHomologs(),
      createOemRepository(true),
      categoryImports,
      externalHomologPolicy(),
    ).execute(legacy.toSnapshot().id, actor);

    expect(confirmed.toSnapshot().status).toBe('confirmed');
    expect(categoryImports.applyRow).toHaveBeenCalledWith(
      expect.objectContaining({
        categorySlug: 'pastillas-de-freno',
        previewedAt: now,
        plan: expect.objectContaining({ productId: groupId, sku: 'D1672' }),
      }),
    );
    expect(categoryImports.applyRow).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.not.objectContaining({ templateId: expect.anything() }),
      }),
    );
  });

  it('confirms valid rows, preserves row-level conflicts and claims the batch once', async () => {
    const imports = new MemoryImportBatchRepository();
    const categoryImports: CategoryAttributeImportPort = {
      prepare: vi.fn(async ({ rows }) =>
        rows.map((row: CategoryImportSourceRow) => ({
          ...row,
          valid: true,
          warnings: ['Se ignoró la columna archivo_tecnico: archivo no importable'],
          plan: {
            productId: groupId,
            sku: String(row.data.sku),
            templateId: groupId,
            cells: [
              {
                attributeKey: 'descripcion_tecnica',
                value: String(row.data.descripcion_tecnica),
                expectedVersion: 0,
              },
            ],
          },
        })),
      ),
      applyRow: vi.fn(async ({ plan }) =>
        plan.sku === 'STALE-1'
          ? { applied: false, errors: ['descripcion_tecnica cambió después de la vista previa'] }
          : { applied: true, errors: [] },
      ),
    };
    const common = [
      imports,
      new FixedClock(now),
      emptyApplications(),
      emptyHomologs(),
      createOemRepository(true),
      categoryImports,
      externalHomologPolicy(),
    ] as const;
    const preview = await new PreviewImportBatchUseCase(...common).execute(
      {
        target: 'category',
        categoryCode: 'pastillas-de-freno',
        templateId: groupId,
        format: 'json',
        idempotencyKey: 'category-confirmation-1',
        records: [
          { sku: 'D1672', descripcion_tecnica: 'Ficha válida' },
          { sku: 'STALE-1', descripcion_tecnica: 'Ficha obsoleta' },
        ],
      },
      actor,
    );
    const confirmed = await new ConfirmImportBatchUseCase(...common).execute(
      preview.toSnapshot().id,
      actor,
    );

    expect(confirmed.toSnapshot()).toMatchObject({
      status: 'confirmed',
      rows: [
        {
          rowNumber: 1,
          valid: true,
          warnings: ['Se ignoró la columna archivo_tecnico: archivo no importable'],
        },
        {
          rowNumber: 2,
          valid: false,
          errors: ['descripcion_tecnica cambió después de la vista previa'],
          warnings: ['Se ignoró la columna archivo_tecnico: archivo no importable'],
        },
      ],
    });
    expect(categoryImports.applyRow).toHaveBeenCalledTimes(2);
    expect(imports.claims).toBe(1);
  });
});

class MemoryImportBatchRepository implements ImportBatchRepositoryPort {
  private batch: ImportBatch | null;
  claims = 0;

  constructor(initial: ImportBatch | null = null) {
    this.batch = initial;
  }

  async findById(): Promise<ImportBatch | null> {
    return this.batch;
  }

  async findByIdempotency(
    target: ImportTarget,
    idempotencyKey: string,
  ): Promise<ImportBatch | null> {
    const snapshot = this.batch?.toSnapshot();
    return snapshot?.target === target && snapshot.idempotencyKey === idempotencyKey
      ? this.batch
      : null;
  }

  async savePreview(batch: ImportBatch): Promise<ImportBatch> {
    this.batch = batch;
    return batch;
  }

  async claimConfirmation() {
    if (!this.batch) return { kind: 'not_found' as const };
    this.claims += 1;
    this.batch.startConfirmation();
    return { kind: 'claimed' as const, batch: this.batch };
  }

  async updateRowResult(
    _batchId: string,
    rowNumber: number,
    valid: boolean,
    errors: readonly string[],
  ): Promise<void> {
    if (!this.batch) return;
    const snapshot = this.batch.toSnapshot();
    this.batch = ImportBatch.rehydrate({
      ...snapshot,
      rows: snapshot.rows.map((row) =>
        row.rowNumber === rowNumber ? { ...row, valid, errors: [...errors] } : row,
      ),
    });
  }

  async saveConfirmation(batch: ImportBatch): Promise<void> {
    this.batch = batch;
  }
}

function emptyCategoryImports(): CategoryAttributeImportPort {
  return {
    prepare: vi.fn(async () => []),
    applyRow: vi.fn(async () => ({ applied: true, errors: [] })),
  };
}

function emptyApplications(): GroupApplicationRepositoryPort {
  return {
    listForProducts: vi.fn(async () => new Map()),
    findGroupByCode: vi.fn(async () => null),
    findById: vi.fn(async () => null),
    list: vi.fn(async () => []),
    insertWithAudit: vi.fn(async () => undefined),
    updateWithAudit: vi.fn(async (application) => ({
      kind: 'updated' as const,
      value: application,
    })),
    saveImported: vi.fn(async () => undefined),
  };
}

function emptyHomologs(): ExternalHomologRepositoryPort {
  return {
    findGroupByCode: vi.fn(async () => null),
    findById: vi.fn(async () => null),
    list: vi.fn(async () => []),
    searchEligible: vi.fn(async () => []),
    insertWithAudit: vi.fn(async () => undefined),
    updateWithAudit: vi.fn(async (homolog) => ({
      kind: 'updated' as const,
      value: homolog,
    })),
    saveImported: vi.fn(async () => undefined),
  };
}

function createOemRepository(automotive: boolean, onSave?: (oem: GroupOemCode) => void) {
  return {
    findGroupByCode: vi.fn(async (code: string) => ({ id: groupId, code, automotive })),
    findById: vi.fn(async () => null),
    findByNaturalKey: vi.fn(async () => null),
    list: vi.fn(async () => []),
    searchEligible: vi.fn(async () => []),
    insertWithAudit: vi.fn(async (oem: GroupOemCode) => {
      onSave?.(oem);
    }),
    saveImported: vi.fn(async (oem: GroupOemCode) => {
      onSave?.(oem);
    }),
    updateWithAudit: vi.fn(async (oem: GroupOemCode) => ({
      kind: 'updated' as const,
      value: oem,
    })),
  } satisfies GroupOemCodeRepositoryPort;
}

function externalHomologPolicy() {
  return { assertExternalReference: vi.fn(async () => undefined) };
}
