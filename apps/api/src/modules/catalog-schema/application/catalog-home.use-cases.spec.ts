import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '@cdr/shared';
import { Role } from '../../identity/domain/entities/role';
import { CatalogHomeUseCases } from './catalog-home.use-cases';
const actor = { id: 'test-admin', email: 'admin@example.test', roles: [Role.Administrator] };
const clock: Clock = { now: () => new Date('2026-11-13T12:00:00Z') };
const input = {
  version: 1,
  config: {
    brands: [{ key: 'BOSCH', visible: true, image: 'data:image/png;base64,aGVsbG8=', text: '' }],
    categories: [],
  },
};
describe('Home configuration authorization and audit', () => {
  it('rejects both consultation profiles before writing', async () => {
    const port = { get: vi.fn(), save: vi.fn() };
    const service = new CatalogHomeUseCases(port, clock);
    for (const role of [Role.Purchasing, Role.Sales])
      await expect(service.save(input, { ...actor, roles: [role] })).rejects.toThrow(
        'Solo ADMINISTRADOR',
      );
    expect(port.save).not.toHaveBeenCalled();
    expect(port.get).not.toHaveBeenCalled();
  });
  it('rejects an obsolete configuration instead of overwriting the current one', async () => {
    const port = { get: vi.fn().mockResolvedValue({ ...input, version: 2 }), save: vi.fn() };
    await expect(new CatalogHomeUseCases(port, clock).save(input, actor)).rejects.toThrow(
      'Otra persona',
    );
    expect(port.save).not.toHaveBeenCalled();
  });
  it('records image changes as fingerprints without storing the image in the audit', async () => {
    const port = {
      get: vi.fn().mockResolvedValue({
        ...input,
        config: { ...input.config, brands: [{ ...input.config.brands[0]!, image: null }] },
      }),
      save: vi.fn().mockResolvedValue({ ...input, version: 2 }),
    };
    await new CatalogHomeUseCases(port, clock).save(input, actor);
    const audit = port.save.mock.calls[0]?.[1];
    expect(audit.actorId).toBe(actor.id);
    expect(JSON.stringify(audit)).not.toContain('data:image');
    expect(audit.changes.inicio.before.brands[0].imageFingerprint).toBeNull();
    expect(audit.changes.inicio.after.brands[0].imageFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
