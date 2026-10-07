import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { PreviewImportInput } from '@cdr/contracts';
import {
  type Clock,
  ConflictError,
  NotFoundError,
  ValidationError,
  type Uuid,
  assertUuid,
  getCorrelationId,
  isDomainError,
  newUuid,
} from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import { GroupApplication } from '../../applications/domain/entities/group-application';
import {
  GROUP_APPLICATION_REPOSITORY,
  type GroupApplicationRepositoryPort,
} from '../../applications/domain/ports/group-application-repository.port';
import {
  ExternalHomolog,
  HomologApprovalStatus,
} from '../../equivalences/domain/entities/external-homolog';
import {
  EXTERNAL_HOMOLOG_REPOSITORY,
  type ExternalHomologRepositoryPort,
} from '../../equivalences/domain/ports/external-homolog-repository.port';
import { GroupOemCode, OemApprovalStatus } from '../../equivalences/domain/entities/group-oem-code';
import {
  GROUP_OEM_CODE_REPOSITORY,
  type GroupOemCodeRepositoryPort,
} from '../../equivalences/domain/ports/group-oem-code-repository.port';
import {
  type AuthenticatedActor,
  normalizeBusinessRole,
} from '../../identity/domain/entities/role';
import {
  CATEGORY_ATTRIBUTE_IMPORT,
  type CategoryAttributeImportPort,
  type CategoryImportRowPlan,
} from '../../catalog-schema/domain/ports/category-attribute-import.port';
import {
  ImportBatch,
  type ImportRecord,
  type ImportRow,
  type ImportTarget,
} from '../domain/entities/import-batch';
import {
  IMPORT_BATCH_REPOSITORY,
  type ImportBatchRepositoryPort,
} from '../domain/ports/import-batch-repository.port';
import { parseImportPayload } from './parse-import-payload';

@Injectable()
export class PreviewImportBatchUseCase {
  constructor(
    @Inject(IMPORT_BATCH_REPOSITORY) private readonly repository: ImportBatchRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GROUP_APPLICATION_REPOSITORY)
    private readonly applications: GroupApplicationRepositoryPort,
    @Inject(EXTERNAL_HOMOLOG_REPOSITORY)
    private readonly homologs: ExternalHomologRepositoryPort,
    @Inject(GROUP_OEM_CODE_REPOSITORY)
    private readonly oemCodes: GroupOemCodeRepositoryPort,
    @Inject(CATEGORY_ATTRIBUTE_IMPORT)
    private readonly categoryAttributes: CategoryAttributeImportPort,
  ) {}

  async execute(input: PreviewImportInput, actor: AuthenticatedActor): Promise<ImportBatch> {
    const parsedRows = parseImportPayload(input);
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          target: input.target,
          format: input.format,
          categoryCode: input.categoryCode ?? null,
          rows: parsedRows.map((row) => row.data),
        }),
      )
      .digest('hex');
    const existing = await this.repository.findByIdempotency(input.target, input.idempotencyKey);
    if (existing) return assertSamePayload(existing, payloadHash);
    const rows =
      input.target === 'category'
        ? await this.prepareCategoryRows(input.categoryCode as string, parsedRows, actor)
        : await this.validateBusinessRules(input.target, parsedRows);

    const preview = ImportBatch.preview(
      {
        target: input.target,
        format: input.format,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
        categoryCode: input.categoryCode ?? null,
        createdBy: actor.id,
        rows,
      },
      this.clock.now(),
    );
    return assertSamePayload(await this.repository.savePreview(preview), payloadHash);
  }

  private async prepareCategoryRows(
    categorySlug: string,
    rows: readonly ImportRow[],
    actor: AuthenticatedActor,
  ): Promise<ImportRow[]> {
    const prepared = await this.categoryAttributes.prepare({
      categorySlug,
      rows,
      roles: businessRoles(actor),
    });
    return prepared.map((row) => ({
      rowNumber: row.rowNumber,
      valid: row.valid,
      data: row.data as ImportRecord,
      errors: row.errors,
      warnings: row.warnings,
      metadata: row.plan ?? {},
    }));
  }

  private async validateBusinessRules(
    target: ImportTarget,
    rows: readonly ImportRow[],
  ): Promise<ImportRow[]> {
    if (target === 'category') return [...rows];
    const seen = new Set<string>();
    const groups = new Map<
      string,
      Promise<{ id: Uuid; code: string; automotive?: boolean } | null>
    >();
    const result: ImportRow[] = [];
    for (const row of rows) {
      const errors = [...row.errors];
      if (row.valid) {
        const unifiedCode = text(row.data.unifiedCode).toUpperCase();
        const group = await memoized<
          string,
          { id: Uuid; code: string; automotive?: boolean } | null
        >(groups, unifiedCode, () => {
          if (target === 'applications') return this.applications.findGroupByCode(unifiedCode);
          if (target === 'homologs') return this.homologs.findGroupByCode(unifiedCode);
          return this.oemCodes.findGroupByCode(unifiedCode);
        });
        if (!group) errors.push(`El código unificador ${unifiedCode || 'vacío'} no existe`);
        if (target === 'oem' && group && !group.automotive) {
          errors.push('Los códigos OEM solo se permiten en grupos automotrices');
        }
        const key =
          target === 'applications'
            ? applicationKey(row.data)
            : target === 'homologs'
              ? homologKey(row.data)
              : oemKey(row.data);
        if (seen.has(key)) errors.push('Fila duplicada dentro del archivo');
        else seen.add(key);
      }
      result.push({ ...row, valid: errors.length === 0, errors });
    }
    return result;
  }
}

@Injectable()
export class GetImportBatchUseCase {
  constructor(
    @Inject(IMPORT_BATCH_REPOSITORY) private readonly repository: ImportBatchRepositoryPort,
  ) {}

  async execute(id: string): Promise<ImportBatch> {
    const batch = await this.repository.findById(assertUuid(id, 'importBatchId'));
    if (!batch) throw new NotFoundError('ImportBatch', id);
    return batch;
  }
}

@Injectable()
export class ConfirmImportBatchUseCase {
  constructor(
    @Inject(IMPORT_BATCH_REPOSITORY) private readonly repository: ImportBatchRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GROUP_APPLICATION_REPOSITORY)
    private readonly applications: GroupApplicationRepositoryPort,
    @Inject(EXTERNAL_HOMOLOG_REPOSITORY)
    private readonly homologs: ExternalHomologRepositoryPort,
    @Inject(GROUP_OEM_CODE_REPOSITORY)
    private readonly oemCodes: GroupOemCodeRepositoryPort,
    @Inject(CATEGORY_ATTRIBUTE_IMPORT)
    private readonly categoryAttributes: CategoryAttributeImportPort,
  ) {}

  async execute(id: string, actor: AuthenticatedActor): Promise<ImportBatch> {
    const batchId = assertUuid(id, 'importBatchId');
    let batch = await this.repository.findById(batchId);
    if (!batch) throw new NotFoundError('ImportBatch', id);
    const before = batch.toSnapshot();
    if (before.status === 'confirmed') return batch;
    const now = this.clock.now();
    const correlationId = getCorrelationId() ?? newUuid();
    const audit = { actorId: actor.id, correlationId, occurredAt: now };
    const claim = await this.repository.claimConfirmation(batchId, audit);
    if (claim.kind === 'not_found') throw new NotFoundError('ImportBatch', id);
    if (claim.kind === 'confirmed') return claim.batch;
    if (claim.kind === 'busy') {
      throw new ConflictError('El lote ya está siendo confirmado o no puede reintentarse', {
        batchId,
        status: claim.status,
      });
    }
    batch = claim.batch;
    try {
      if (before.target === 'category') {
        await this.applyCategoryRows(batch, actor, now, correlationId);
      } else {
        await this.applyValidRows(batch, actor, now, confirmationCache());
      }
      batch = (await this.repository.findById(batchId)) ?? batch;
      if (!batch.toSnapshot().rows.some((row) => row.valid)) {
        batch.failConfirmation();
        await this.repository.saveConfirmation(batch, audit);
        return (await this.repository.findById(batchId)) ?? batch;
      }
    } catch (error) {
      const claimed = (await this.repository.findById(batchId)) ?? batch;
      claimed.failConfirmation();
      await this.repository.saveConfirmation(claimed, audit);
      throw error;
    }
    batch.confirm(now);
    await this.repository.saveConfirmation(batch, audit);
    const after = batch.toSnapshot();
    return (await this.repository.findById(after.id)) ?? batch;
  }

  private async applyCategoryRows(
    batch: ImportBatch,
    actor: AuthenticatedActor,
    now: Date,
    correlationId: string,
  ): Promise<void> {
    const snapshot = batch.toSnapshot();
    const categorySlug = snapshot.categoryCode;
    if (!categorySlug) throw new ValidationError('Category imports require a category slug');
    for (const row of snapshot.rows.filter((candidate) => candidate.valid)) {
      const plan = parseCategoryPlan(row.metadata);
      if (!plan) {
        await this.repository.updateRowResult(snapshot.id, row.rowNumber, false, [
          'La vista previa no contiene un plan de confirmación válido',
        ]);
        continue;
      }
      const result = await this.categoryAttributes.applyRow({
        categorySlug,
        plan,
        roles: businessRoles(actor),
        actorId: actor.id,
        batchId: snapshot.id,
        correlationId,
        now,
      });
      if (!result.applied) {
        await this.repository.updateRowResult(snapshot.id, row.rowNumber, false, result.errors);
      }
    }
  }

  private async applyValidRows(
    batch: ImportBatch,
    actor: AuthenticatedActor,
    now: Date,
    cache: ConfirmationCache,
  ): Promise<void> {
    const snapshot = batch.toSnapshot();
    const correlationId = getCorrelationId() ?? newUuid();
    for (const row of snapshot.rows.filter((candidate) => candidate.valid)) {
      try {
        if (snapshot.target === 'applications') {
          await this.applyApplication(snapshot.id, row.data, actor, now, correlationId, cache);
        } else if (snapshot.target === 'homologs') {
          await this.applyHomolog(snapshot.id, row.data, actor, now, correlationId, cache);
        } else if (snapshot.target === 'oem') {
          await this.applyOemCode(snapshot.id, row.data, actor, now, correlationId, cache);
        }
      } catch (error) {
        if (!isDomainError(error)) throw error;
        await this.repository.updateRowResult(snapshot.id, row.rowNumber, false, [error.message]);
      }
    }
  }

  private async applyApplication(
    batchId: Uuid,
    data: ImportRecord,
    actor: AuthenticatedActor,
    now: Date,
    correlationId: string,
    cache: ConfirmationCache,
  ): Promise<void> {
    const unifiedCode = text(data.unifiedCode).toUpperCase();
    const group = await memoized(cache.applicationGroups, unifiedCode, () =>
      this.applications.findGroupByCode(unifiedCode),
    );
    if (!group) throw new NotFoundError('EquivalenceGroup', unifiedCode);
    const fields = applicationFields(data);
    const applications = await memoized(cache.applications, unifiedCode, () =>
      this.applications.list({ unifiedCode, includeInactive: true }),
    );
    const current = applications.find(
      (candidate) => applicationKey(candidate.toSnapshot()) === applicationKey(data),
    );
    const application =
      current ??
      GroupApplication.create(
        {
          groupId: group.id,
          unifiedCode: group.code,
          source: 'import',
          importBatchId: batchId,
          ...fields,
        },
        now,
      );
    if (!current) applications.push(application);
    if (current) current.update({ ...fields, active: true }, now);
    application.markImported(batchId, now);
    await this.applications.saveImported(application, {
      actorId: actor.id,
      correlationId,
      occurredAt: now,
    });
  }

  private async applyHomolog(
    batchId: Uuid,
    data: ImportRecord,
    actor: AuthenticatedActor,
    now: Date,
    correlationId: string,
    cache: ConfirmationCache,
  ): Promise<void> {
    const unifiedCode = text(data.unifiedCode).toUpperCase();
    const group = await memoized(cache.homologGroups, unifiedCode, () =>
      this.homologs.findGroupByCode(unifiedCode),
    );
    if (!group) throw new NotFoundError('EquivalenceGroup', unifiedCode);
    const homologs = await memoized(cache.homologs, unifiedCode, () =>
      this.homologs.list(unifiedCode, true),
    );
    const existing = homologs.find(
      (candidate) => homologKey(candidate.toSnapshot()) === homologKey(data),
    );
    const fields = {
      externalCode: text(data.externalCode),
      externalBrand: text(data.externalBrand),
      active: boolean(data.active, true),
      approvalStatus: homologApproval(data.approvalStatus),
    };
    const homolog =
      existing ??
      ExternalHomolog.create(
        {
          groupId: group.id,
          unifiedCode: group.code,
          source: 'import',
          importBatchId: batchId,
          ...fields,
        },
        now,
      );
    if (!existing) homologs.push(homolog);
    if (existing) existing.update(fields, now);
    homolog.markImported(batchId, now);
    await this.homologs.saveImported(homolog, {
      actorId: actor.id,
      correlationId,
      occurredAt: now,
    });
  }

  private async applyOemCode(
    batchId: Uuid,
    data: ImportRecord,
    actor: AuthenticatedActor,
    now: Date,
    correlationId: string,
    cache: ConfirmationCache,
  ): Promise<void> {
    const unifiedCode = text(data.unifiedCode).toUpperCase();
    const group = await memoized(cache.oemGroups, unifiedCode, () =>
      this.oemCodes.findGroupByCode(unifiedCode),
    );
    if (!group) throw new NotFoundError('EquivalenceGroup', unifiedCode);
    if (!group.automotive) {
      throw new ValidationError('OEM codes are only allowed for automotive equivalence groups', {
        unifiedCode: group.code,
      });
    }

    const naturalKey = oemKey(data);
    const existing = await memoized(cache.oemCodes, naturalKey, () =>
      this.oemCodes.findByNaturalKey(group.id, text(data.oemCode)),
    );
    const fields = {
      oemCode: text(data.oemCode),
      brands: brands(data.brands),
      active: boolean(data.active, true),
      approvalStatus: oemApproval(data.approvalStatus),
    };
    const oem =
      existing ??
      GroupOemCode.create(
        {
          groupId: group.id,
          unifiedCode: group.code,
          source: 'import',
          importBatchId: batchId,
          ...fields,
        },
        now,
      );
    if (existing) existing.update(fields, now);
    else cache.oemCodes.set(naturalKey, Promise.resolve(oem));
    oem.markImported(batchId, now);
    await this.oemCodes.saveImported(oem, {
      actorId: actor.id,
      correlationId,
      occurredAt: now,
    });
  }
}

interface ConfirmationCache {
  readonly applicationGroups: Map<string, Promise<{ id: Uuid; code: string } | null>>;
  readonly applications: Map<string, Promise<GroupApplication[]>>;
  readonly homologGroups: Map<string, Promise<{ id: Uuid; code: string } | null>>;
  readonly homologs: Map<string, Promise<ExternalHomolog[]>>;
  readonly oemGroups: Map<string, Promise<{ id: Uuid; code: string; automotive: boolean } | null>>;
  readonly oemCodes: Map<string, Promise<GroupOemCode | null>>;
}

function confirmationCache(): ConfirmationCache {
  return {
    applicationGroups: new Map(),
    applications: new Map(),
    homologGroups: new Map(),
    homologs: new Map(),
    oemGroups: new Map(),
    oemCodes: new Map(),
  };
}

function memoized<Key, Value>(
  cache: Map<Key, Promise<Value>>,
  key: Key,
  load: () => Promise<Value>,
): Promise<Value> {
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = load();
  cache.set(key, pending);
  return pending;
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function number(value: unknown): number | null {
  const valueText = text(value);
  if (!valueText) return null;
  const parsed = Number(valueText);
  return Number.isInteger(parsed) ? parsed : null;
}

function boolean(value: unknown, fallback: boolean): boolean {
  const valueText = text(value).toLowerCase();
  if (!valueText) return fallback;
  return ['true', '1', 'si', 'sí'].includes(valueText);
}

function applicationFields(data: ImportRecord) {
  return {
    vehicleType: text(data.vehicleType) || null,
    make: text(data.make) || null,
    model: text(data.model) || null,
    yearFrom: number(data.yearFrom),
    yearTo: number(data.yearTo),
    engine: text(data.engine) || null,
    notes: text(data.notes) || null,
  };
}

function normalized(value: unknown): string {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function applicationKey(data: {
  readonly unifiedCode?: unknown;
  readonly vehicleType?: unknown;
  readonly make?: unknown;
  readonly model?: unknown;
  readonly yearFrom?: unknown;
  readonly yearTo?: unknown;
  readonly engine?: unknown;
}): string {
  return [
    data.unifiedCode,
    data.vehicleType,
    data.make,
    data.model,
    data.yearFrom,
    data.yearTo,
    data.engine,
  ]
    .map(normalized)
    .join('|');
}

function homologKey(data: {
  readonly unifiedCode?: unknown;
  readonly externalCode?: unknown;
  readonly externalBrand?: unknown;
}): string {
  return [data.unifiedCode, data.externalCode, data.externalBrand].map(normalized).join('|');
}

function oemKey(data: { readonly unifiedCode?: unknown; readonly oemCode?: unknown }): string {
  return [data.unifiedCode, data.oemCode].map(normalized).join('|');
}

function brands(value: unknown): string[] {
  const values = Array.isArray(value) ? value : text(value).split(/[,;|]/u);
  return values.map((brand) => text(brand)).filter(Boolean);
}

function homologApproval(value: unknown): HomologApprovalStatus {
  const candidate = text(value).toLowerCase();
  if (candidate === HomologApprovalStatus.Approved) return HomologApprovalStatus.Approved;
  if (candidate === HomologApprovalStatus.Rejected) return HomologApprovalStatus.Rejected;
  return HomologApprovalStatus.Pending;
}

function oemApproval(value: unknown): OemApprovalStatus {
  const candidate = text(value).toLowerCase();
  if (candidate === OemApprovalStatus.Approved) return OemApprovalStatus.Approved;
  if (candidate === OemApprovalStatus.Rejected) return OemApprovalStatus.Rejected;
  return OemApprovalStatus.Pending;
}

function assertSamePayload(batch: ImportBatch, payloadHash: string): ImportBatch {
  const snapshot = batch.toSnapshot();
  if (snapshot.payloadHash !== payloadHash) {
    throw new ConflictError('The idempotency key was already used with a different payload', {
      batchId: snapshot.id,
      target: snapshot.target,
    });
  }
  return batch;
}

function businessRoles(actor: AuthenticatedActor): string[] {
  return [...new Set(actor.roles.map(normalizeBusinessRole))];
}

function parseCategoryPlan(metadata: unknown): CategoryImportRowPlan | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  if (typeof value.productId !== 'string' || typeof value.sku !== 'string') return null;
  if (!Array.isArray(value.cells)) return null;
  try {
    const productId = assertUuid(value.productId, 'categoryImport.productId');
    const seen = new Set<string>();
    const cells = value.cells.map((candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new Error('Invalid category import cell');
      }
      const cell = candidate as Record<string, unknown>;
      if (
        typeof cell.attributeKey !== 'string' ||
        !cell.attributeKey ||
        seen.has(cell.attributeKey) ||
        typeof cell.expectedVersion !== 'number' ||
        !Number.isInteger(cell.expectedVersion) ||
        cell.expectedVersion < 0 ||
        !isCatalogAttributeValue(cell.value)
      ) {
        throw new Error('Invalid category import cell');
      }
      seen.add(cell.attributeKey);
      return {
        attributeKey: cell.attributeKey,
        value: cell.value,
        expectedVersion: cell.expectedVersion,
      };
    });
    return { productId, sku: value.sku, cells };
  } catch {
    return null;
  }
}

function isCatalogAttributeValue(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}
