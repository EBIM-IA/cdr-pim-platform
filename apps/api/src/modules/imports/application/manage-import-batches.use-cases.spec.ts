import { FixedClock, assertUuid } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import type { GroupApplicationRepositoryPort } from '../../applications/domain/ports/group-application-repository.port';
import type { ExternalHomologRepositoryPort } from '../../equivalences/domain/ports/external-homolog-repository.port';
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
    );
    const confirmUseCase = new ConfirmImportBatchUseCase(
      imports,
      clock,
      applications,
      homologs,
      oemRepository,
      emptyCategoryImports(),
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

describe('category imports', () => {
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
    ] as const;
    const preview = await new PreviewImportBatchUseCase(...common).execute(
      {
        target: 'category',
        categoryCode: 'pastillas-de-freno',
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
  private batch: ImportBatch | null = null;
  claims = 0;

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
