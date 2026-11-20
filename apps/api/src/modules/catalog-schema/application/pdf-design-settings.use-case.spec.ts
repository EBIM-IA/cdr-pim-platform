import { createDefaultPdfDesignConfig, type PdfDesignSettingsDto } from '@cdr/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../../audit/domain/entities/audit-entry';
import { Role } from '../../identity/domain/entities/role';
import { PdfDesignSettingsUseCase } from './pdf-design-settings.use-case';

const now = new Date('2026-11-20T14:00:00.000Z');
const administrator = {
  id: 'administrator',
  email: 'admin@example.test',
  roles: [Role.Administrator],
};
const clock = { now: () => now };

describe('Shared PDF design settings', () => {
  it('returns the stored shared configuration and concurrency token', async () => {
    const settings: PdfDesignSettingsDto = {
      config: createDefaultPdfDesignConfig(),
      updatedAt: now.toISOString(),
    };
    const port = { get: vi.fn().mockResolvedValue(settings), save: vi.fn() };
    await expect(new PdfDesignSettingsUseCase(port, clock).get()).resolves.toEqual(settings);
    expect(port.save).not.toHaveBeenCalled();
  });

  it.each([Role.Purchasing, Role.Sales])(
    'rejects design changes by %s before reading or writing settings',
    async (role) => {
      const port = { get: vi.fn(), save: vi.fn() };
      await expect(
        new PdfDesignSettingsUseCase(port, clock).save(
          { config: createDefaultPdfDesignConfig(), updatedAt: null },
          { ...administrator, roles: [role] },
        ),
      ).rejects.toThrow('ADMINISTRADOR');
      expect(port.get).not.toHaveBeenCalled();
      expect(port.save).not.toHaveBeenCalled();
    },
  );

  it('forwards the expected token and audits design changes without duplicating uploaded bytes', async () => {
    const previous = { config: createDefaultPdfDesignConfig(), updatedAt: now.toISOString() };
    const config = createDefaultPdfDesignConfig();
    config.designs[0]!.name = 'Diseño aprobado';
    config.cdrLogoDataUrl = 'data:image/png;base64,AQID';
    config.fonts = [
      { id: 'cliente', name: 'Cliente', regularDataUrl: 'data:font/ttf;base64,AQID' },
    ];
    const input = { config, updatedAt: previous.updatedAt };
    const stored = { ...input, updatedAt: '2026-11-20T14:00:00.001Z' };
    const port = {
      get: vi.fn().mockResolvedValue(previous),
      save: vi.fn().mockResolvedValue(stored),
    };
    await expect(
      new PdfDesignSettingsUseCase(port, clock).save(input, administrator),
    ).resolves.toEqual(stored);
    expect(port.save).toHaveBeenCalledWith(
      input,
      expect.objectContaining({
        resourceType: 'pdf_design',
        resourceId: 'default',
        actorId: administrator.id,
        source: 'api:pdf-design',
        action: 'updated',
        occurredAt: now,
      }),
    );
    const audit = port.save.mock.calls[0]![1] as AuditEntry;
    expect(audit.changes.configuration?.before).toEqual(previous.config);
    expect(audit.changes.configuration?.after).toMatchObject({
      designs: [expect.objectContaining({ name: 'Diseño aprobado' }), expect.any(Object)],
      cdrLogoDataUrl: `[archivo: ${config.cdrLogoDataUrl.length} caracteres]`,
      fonts: [
        expect.objectContaining({
          regularDataUrl: `[archivo: ${config.fonts[0]!.regularDataUrl.length} caracteres]`,
        }),
      ],
    });
    expect(JSON.stringify(audit)).not.toContain('base64');
  });
});
