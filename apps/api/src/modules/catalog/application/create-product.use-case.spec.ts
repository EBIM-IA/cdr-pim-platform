import { ConflictError, FixedClock } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { InMemoryProductRepository } from '../../../../test/fakes/in-memory-product.repository';
import type { AuditEntry } from '../../audit/domain/entities/audit-entry';
import type { AuditPort } from '../../audit/domain/ports/audit.port';
import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { CreateProductUseCase } from './create-product.use-case';

const clock = new FixedClock(new Date('2026-08-30T12:00:00.000Z'));
const actor: AuthenticatedActor = {
  id: 'editor-1',
  email: 'editor@casadelruliman.com',
  roles: [Role.Editor],
};

function collectingAudit(): { port: AuditPort; entries: AuditEntry[] } {
  const entries: AuditEntry[] = [];
  return {
    entries,
    port: { record: async (entry) => void entries.push(entry) },
  };
}

describe('CreateProductUseCase', () => {
  it('persists a new draft product', async () => {
    const repository = new InMemoryProductRepository();
    const audit = collectingAudit();
    const useCase = new CreateProductUseCase(repository, clock, audit.port);

    const product = await useCase.execute({ sku: '6205-2rs', name: 'Rodamiento' }, actor);

    expect(product.status).toBe('draft');
    expect(await repository.findBySku('6205-2RS')).not.toBeNull();
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      resourceType: 'product',
      resourceId: product.id,
      action: 'created',
      actorId: actor.id,
      source: 'api',
      changes: { sku: { after: '6205-2RS' }, status: { after: 'draft' } },
    });
  });

  it('rejects a duplicate SKU regardless of casing', async () => {
    const repository = new InMemoryProductRepository();
    const audit = collectingAudit();
    const useCase = new CreateProductUseCase(repository, clock, audit.port);

    await useCase.execute({ sku: '6205-2RS', name: 'Rodamiento' }, actor);
    await expect(useCase.execute({ sku: '6205-2rs', name: 'Otro' }, actor)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(audit.entries).toHaveLength(1);
  });
});
