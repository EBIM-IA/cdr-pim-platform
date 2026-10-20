import type { Uuid } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { IndexProductUseCase } from '../application/index-product.use-case';
import { SemanticSearchUseCase } from '../application/semantic-search.use-case';
import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { SearchController } from './search.controller';

const actor: AuthenticatedActor = {
  id: 'viewer-1',
  email: 'viewer@casadelruliman.local',
  roles: [Role.Viewer],
};

describe('SearchController', () => {
  it('returns the typed semantic result without indexing products during the request', async () => {
    const semanticSearch = {
      execute: vi.fn().mockResolvedValue({
        model: 'fake-embedding-v1',
        dimensions: 1536,
        hits: [
          {
            productId: '11111111-1111-4111-8111-111111111111' as Uuid,
            sku: 'RET-25-32-4',
            name: 'Retenedor métrico de viton',
            score: 0.91,
          },
        ],
      }),
    } as unknown as SemanticSearchUseCase;
    const indexProduct = {
      execute: vi.fn(),
    } as unknown as IndexProductUseCase;
    const controller = new SearchController(semanticSearch, indexProduct);

    await expect(controller.search({ q: 'retén viton', limit: 3 }, actor)).resolves.toEqual({
      query: 'retén viton',
      model: 'fake-embedding-v1',
      dimensions: 1536,
      hits: [
        {
          productId: '11111111-1111-4111-8111-111111111111',
          sku: 'RET-25-32-4',
          name: 'Retenedor métrico de viton',
          score: 0.91,
        },
      ],
    });
    expect(semanticSearch.execute).toHaveBeenCalledWith('retén viton', 3, actor.roles);
    expect(indexProduct.execute).not.toHaveBeenCalled();
  });
});
