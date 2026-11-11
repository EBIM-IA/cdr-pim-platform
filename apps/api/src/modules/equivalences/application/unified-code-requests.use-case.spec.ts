import { FixedClock, ForbiddenError } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';
import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { Product } from '../../catalog/domain/entities/product';
import type { ProductRepositoryPort } from '../../catalog/domain/ports/product-repository.port';
import type { UnifiedCodeRequestsPort } from '../domain/ports/unified-code-requests.port';
import { UnifiedCodeRequestsUseCase } from './unified-code-requests.use-case';
const now = new Date('2026-11-10T12:00:00Z');
const input = {
  sku: 'TEST-1',
  currentCode: '6205',
  action: 'correct' as const,
  proposedCode: '6206',
  reason: 'Medida diferente',
};
const admin: AuthenticatedActor = {
  id: 'admin',
  email: 'admin@example.test',
  roles: [Role.Administrator],
};
function fixture() {
  const requests = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  } satisfies UnifiedCodeRequestsPort;
  const product = Product.create({ sku: input.sku, name: 'Prueba', now });
  const products = {
    findById: vi.fn(),
    findBySku: vi.fn(async () => product),
    save: vi.fn(),
    list: vi.fn(),
  } satisfies ProductRepositoryPort;
  return {
    requests,
    products,
    product,
    useCase: new UnifiedCodeRequestsUseCase(requests, products, new FixedClock(now)),
  };
}
describe('unified code request governance', () => {
  it('rejects commercial roles before reading or writing product data', async () => {
    const { useCase, products, requests } = fixture();
    await expect(
      useCase.create(input, { ...admin, roles: [Role.Purchasing] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(products.findBySku).not.toHaveBeenCalled();
    expect(requests.create).not.toHaveBeenCalled();
  });
  it('records a pending request and never writes the ERP-owned product or group', async () => {
    const { useCase, products, requests, product } = fixture();
    await useCase.create(input, admin);
    expect(requests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: product.id,
        status: 'pending_dispatch',
        currentCode: '6205',
        proposedCode: '6206',
        reason: input.reason,
        version: 1,
      }),
      expect.objectContaining({ actorId: 'admin', resourceType: 'unified_code_request' }),
    );
    expect(products.save).not.toHaveBeenCalled();
  });
});
