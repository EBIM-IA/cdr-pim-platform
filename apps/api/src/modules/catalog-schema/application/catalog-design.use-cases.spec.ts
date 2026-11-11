import { FixedClock, ForbiddenError, newUuid } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';
import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import type { CatalogDesignRepositoryPort } from '../domain/ports/catalog-design.repository.port';
import { CatalogDesignUseCases } from './catalog-design.use-cases';
const now = new Date('2026-11-10T12:00:00Z');
const buyer: AuthenticatedActor = {
  id: 'buyer',
  email: 'buyer@example.test',
  roles: [Role.Purchasing],
};
const admin: AuthenticatedActor = { ...buyer, id: 'admin', roles: [Role.Administrator] };
function fixture() {
  const repository = {
    exportCategoryAssignments: vi.fn(),
    previewCategoryAssignments: vi.fn(),
    confirmCategoryAssignments: vi.fn(),
    createCategory: vi.fn(),
    moveCategory: vi.fn(),
    configureTemplate: vi.fn(),
    addAttribute: vi.fn(),
    previewInheritance: vi.fn(),
  } satisfies CatalogDesignRepositoryPort;
  return { repository, useCase: new CatalogDesignUseCases(repository, new FixedClock(now)) };
}
describe('catalog design authorization and audit boundary', () => {
  it('blocks every mutation for COMPRAS before persistence', () => {
    const { repository, useCase } = fixture();
    const id = newUuid();
    expect(() =>
      useCase.createCategory(
        { name: 'Categoría', slug: 'categoria', position: 0, parentId: null },
        buyer,
      ),
    ).toThrow(ForbiddenError);
    expect(() =>
      useCase.moveCategory(id, { parentId: null, expectedUpdatedAt: now.toISOString() }, buyer),
    ).toThrow(ForbiddenError);
    expect(() =>
      useCase.configureTemplate(
        id,
        { mode: 'empty', name: 'Nueva', expectedUpdatedAt: now.toISOString() },
        buyer,
      ),
    ).toThrow(ForbiddenError);
    expect(repository.createCategory).not.toHaveBeenCalled();
    expect(repository.moveCategory).not.toHaveBeenCalled();
    expect(repository.configureTemplate).not.toHaveBeenCalled();
  });
  it('generates IDs and trusted audit metadata for an administrator', async () => {
    const { repository, useCase } = fixture();
    await useCase.createCategory(
      { name: 'Nueva', slug: 'nueva', position: 0, parentId: null },
      admin,
    );
    expect(repository.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        audit: expect.objectContaining({
          actorId: 'admin',
          occurredAt: now,
          correlationId: expect.any(String),
        }),
      }),
    );
  });
});
