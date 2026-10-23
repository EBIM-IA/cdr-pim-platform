import type { ExecutionContext } from '@nestjs/common';
import { NotFoundError } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import type { ResolveSharedProductCatalogUseCase } from '../../application/manage-product-catalogs.use-cases';
import { CatalogShareAuthGuard } from './catalog-share-auth.guard';

const token = 'catalog-share-test-'.padEnd(43, 'x');
function context(body: unknown): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ body }) }) } as unknown as ExecutionContext;
}
describe('CatalogShareAuthGuard', () => {
  it('requires the strict JSON-body schema before checking a grant', async () => {
    const verify = vi.fn(),
      guard = new CatalogShareAuthGuard({
        verify,
      } as unknown as ResolveSharedProductCatalogUseCase);
    for (const body of [
      undefined,
      null,
      {},
      { token: '' },
      { token: 'short' },
      { token, other: true },
      token,
    ]) {
      await expect(guard.canActivate(context(body))).rejects.toThrow(NotFoundError);
    }
    expect(verify).not.toHaveBeenCalled();
  });
  it('verifies the grant without executing the public operation or attaching token context', async () => {
    const verify = vi.fn(async () => undefined),
      execute = vi.fn(),
      guard = new CatalogShareAuthGuard({
        verify,
        execute,
      } as unknown as ResolveSharedProductCatalogUseCase);
    const execution = context({ token });
    await expect(guard.canActivate(execution)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledExactlyOnceWith(token);
    expect(execute).not.toHaveBeenCalled();
  });
  it('rejects revoked, expired and unknown grants with generic errors without echoing the token', async () => {
    const verify = vi.fn(async () => {
      throw new NotFoundError('SharedCatalog', 'unavailable');
    });
    const guard = new CatalogShareAuthGuard({
      verify,
    } as unknown as ResolveSharedProductCatalogUseCase);
    let failure: unknown;
    try {
      await guard.canActivate(context({ token }));
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(NotFoundError);
    expect(JSON.stringify(failure)).not.toContain(token);
  });
});
