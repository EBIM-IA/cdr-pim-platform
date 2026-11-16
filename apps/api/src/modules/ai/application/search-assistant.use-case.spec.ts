import { describe, expect, it, vi } from 'vitest';
import { FixedClock, newUuid } from '@cdr/shared';
import { Product } from '../../catalog/domain/entities/product';
import type { ProductRepositoryPort } from '../../catalog/domain/ports/product-repository.port';
import type { DynamicCatalogRepositoryPort } from '../../catalog-schema/domain/ports/dynamic-catalog.repository.port';
import { Role } from '../../identity/domain/entities/role';
import { SearchAssistantUseCase } from './search-assistant.use-case';
const now = new Date('2026-11-16T15:00:00Z');
const actor = { id: 'admin', email: 'admin@example.test', roles: [Role.Administrator] };
function fixture() {
  const product = Product.create({ id: newUuid(), sku: 'SKF-6205', name: 'Rodamiento', now });
  const products = {
    list: vi.fn().mockResolvedValue({ items: [product], total: 1 }),
    findById: vi.fn().mockResolvedValue(product),
  };
  const catalog = {
    getProductSheet: vi.fn().mockResolvedValue({
      schema: { attributes: [{ key: 'diameter' }] },
      product: { attributes: { diameter: { value: 25 }, hidden: { value: 'private' } } },
    }),
  };
  const generation = {
    model: 'test-generation',
    generate: vi
      .fn()
      .mockResolvedValue({ text: 'El SKF-6205 tiene diámetro 25.', model: 'test-generation' }),
  };
  const audit = { record: vi.fn() };
  const service = new SearchAssistantUseCase(
    products as unknown as ProductRepositoryPort,
    catalog as unknown as DynamicCatalogRepositoryPort,
    generation,
    audit,
    new FixedClock(now),
  );
  return { product, products, catalog, generation, audit, service };
}
describe('search assistant evidence boundary', () => {
  it('loads source identities on the server, applies role visibility and records evidence without logging prompts', async () => {
    const f = fixture();
    const response = await f.service.execute(
      { query: '6205', question: '¿Cuál es el diámetro?', productIds: [f.product.id] },
      actor,
    );
    expect(response.sources).toEqual([
      { productId: f.product.id, sku: 'SKF-6205', name: 'Rodamiento' },
    ]);
    expect(f.catalog.getProductSheet).toHaveBeenCalledWith(f.product.id, ['ADMINISTRADOR']);
    const request = f.generation.generate.mock.calls[0]?.[0] as { input: string } | undefined;
    expect(request?.input).toContain('diameter');
    expect(request?.input).not.toContain('private');
    expect(JSON.stringify(f.audit.record.mock.calls)).not.toContain('¿Cuál');
    expect(f.audit.record).toHaveBeenCalledOnce();
  });
  it('does not call a provider or fabricate evidence when products are not visible', async () => {
    const f = fixture();
    f.catalog.getProductSheet.mockResolvedValue(null);
    const response = await f.service.execute({ query: '6205', question: '¿Sirve?' }, actor);
    expect(response.sources).toEqual([]);
    expect(f.generation.generate).not.toHaveBeenCalled();
  });
});
