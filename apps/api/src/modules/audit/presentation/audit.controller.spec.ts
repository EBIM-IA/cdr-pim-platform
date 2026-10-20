import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { REQUIRED_CAPABILITIES } from '../../../shared/http/capability.decorator';
import { Capability } from '../../identity/domain/entities/role';
import type { ExportAuditChangesUseCase } from '../application/export-audit-changes.use-case';
import type { ListAuditChangesUseCase } from '../application/list-audit-changes.use-case';
import { AuditController } from './audit.controller';

describe('AuditController', () => {
  it('requires the dedicated audit capability', () => {
    const required = new Reflector().get<readonly Capability[]>(
      REQUIRED_CAPABILITIES,
      AuditController,
    );
    expect(required).toEqual([Capability.AuditRead]);
  });

  it('delegates validated pagination and filters', async () => {
    const execute = vi.fn().mockResolvedValue({ items: [], page: 2, pageSize: 10, total: 0 });
    const controller = new AuditController(
      { execute } as unknown as ListAuditChangesUseCase,
      { execute: vi.fn() } as unknown as ExportAuditChangesUseCase,
    );
    const result = await controller.list({
      page: 2,
      pageSize: 10,
      sku: '6202',
      field: 'diameter',
    });
    expect(execute).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      sku: '6202',
      field: 'diameter',
    });
    expect(result.total).toBe(0);
  });

  it('delegates the filtered CSV export', async () => {
    const execute = vi.fn().mockResolvedValue('\uFEFF"Fecha"\r\n');
    const controller = new AuditController(
      { execute: vi.fn() } as unknown as ListAuditChangesUseCase,
      { execute } as unknown as ExportAuditChangesUseCase,
    );
    const result = await controller.export({
      page: 1,
      pageSize: 25,
      source: 'api',
    });

    expect(execute).toHaveBeenCalledWith({ page: 1, pageSize: 25, source: 'api' });
    expect(result).toBe('\uFEFF"Fecha"\r\n');
  });
});
