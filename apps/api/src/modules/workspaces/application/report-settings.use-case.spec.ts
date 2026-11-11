import { FixedClock, ForbiddenError, ValidationError } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';
import { Role } from '../../identity/domain/entities/role';
import { ReportSettingsUseCase } from './report-settings.use-case';
const clock = new FixedClock(new Date('2026-11-10T12:00:00Z'));
const admin = { id: 'admin', email: 'admin@example.test', roles: [Role.Administrator] };
const buyer = { ...admin, id: 'buyer', roles: [Role.Purchasing] };
function setup() {
  const port = {
    read: vi.fn().mockResolvedValue({ layouts: {}, formats: [], baselines: [] }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  return { port, service: new ReportSettingsUseCase(port, clock) };
}
describe('ReportSettingsUseCase', () => {
  it('keeps personal layouts scoped to the authenticated actor', async () => {
    const { port, service } = setup();
    await service.execute(
      { ...admin, id: 'buyer' },
      { operation: 'save-layout', key: 'general', layout: { order: ['sku'], hidden: [] } },
    );
    expect(port.update).toHaveBeenCalledWith(
      'buyer',
      expect.objectContaining({ operation: 'save-layout' }),
    );
  });
  it('prevents non-admin readers from mutating shared formats and historical cuts', async () => {
    const { port, service } = setup();
    await expect(
      service.execute(buyer, { operation: 'capture-baseline', label: 'Corte' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(port.update).not.toHaveBeenCalled();
  });
  it('rejects current and future months, while accepting observed closed totals including zero', async () => {
    const { port, service } = setup();
    await expect(
      service.execute(admin, {
        operation: 'save-closed-periods',
        source: 'Cliente.xlsx',
        periods: [{ year: 2026, month: 11, total: 250 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await service.execute(admin, {
      operation: 'save-closed-periods',
      source: 'Cliente.xlsx',
      periods: [{ year: 2026, month: 10, total: 0 }],
    });
    expect(port.update).toHaveBeenCalledOnce();
  });
});
