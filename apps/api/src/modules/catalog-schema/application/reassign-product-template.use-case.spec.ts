import { randomUUID } from 'node:crypto';

import { ConflictError, FixedClock, ForbiddenError, ValidationError } from '@cdr/shared';
import type { Uuid } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import type {
  ProductTemplateAssignmentRepositoryPort,
  ReassignProductTemplateResult,
} from '../domain/ports/product-template-assignment.repository.port';
import { ReassignProductTemplateUseCase } from './reassign-product-template.use-case';

const id = (): Uuid => randomUUID() as Uuid;
const now = new Date('2026-10-20T14:00:00.000Z');
const actor: AuthenticatedActor = {
  id: 'admin-1',
  email: 'admin@casadelruliman.com',
  roles: [Role.Administrator],
};

function repository(result: ReassignProductTemplateResult) {
  return {
    reassign: vi.fn().mockResolvedValue(result),
  } satisfies ProductTemplateAssignmentRepositoryPort;
}

describe('ReassignProductTemplateUseCase', () => {
  it.each([Role.Purchasing, Role.Sales, Role.Editor, Role.Viewer])(
    'rejects a %s reassignment before accessing persistence',
    async (role) => {
      const assignments = repository({ kind: 'product_not_found' });
      await expect(
        new ReassignProductTemplateUseCase(assignments, new FixedClock(now)).execute(
          { productId: id(), templateId: id(), expectedTemplateId: id() },
          { ...actor, roles: [role] },
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(assignments.reassign).not.toHaveBeenCalled();
    },
  );

  it('reassigns a product to another variant without deriving a client mapping', async () => {
    const productId = id();
    const previousTemplateId = id();
    const templateId = id();
    const categoryId = id();
    const assignments = repository({
      kind: 'updated',
      previousTemplateId,
      assignment: {
        productId,
        category: { id: categoryId, slug: 'filtros-aire', name: 'Filtros de aire' },
        template: {
          id: templateId,
          variantKey: '22.2',
          name: 'Filtro de aire cilíndrico',
          version: 1,
        },
        assignedAt: now,
      },
    });

    const result = await new ReassignProductTemplateUseCase(
      assignments,
      new FixedClock(now),
    ).execute({ productId, templateId, expectedTemplateId: previousTemplateId }, actor);

    expect(result).toMatchObject({
      productId,
      previousTemplateId,
      template: { variantKey: '22.2' },
    });
    expect(assignments.reassign).toHaveBeenCalledWith(
      expect.objectContaining({
        productId,
        templateId,
        expectedTemplateId: previousTemplateId,
        roles: ['ADMINISTRADOR'],
        now,
        audit: expect.objectContaining({ actorId: actor.id }),
      }),
    );
  });

  it('reports optimistic conflicts using the current assignment', async () => {
    const assignments = repository({ kind: 'version_conflict', currentTemplateId: id() });
    await expect(
      new ReassignProductTemplateUseCase(assignments, new FixedClock(now)).execute(
        { productId: id(), templateId: id(), expectedTemplateId: id() },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects moving a product across categories', async () => {
    const assignments = repository({ kind: 'different_category' });
    await expect(
      new ReassignProductTemplateUseCase(assignments, new FixedClock(now)).execute(
        { productId: id(), templateId: id(), expectedTemplateId: id() },
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
