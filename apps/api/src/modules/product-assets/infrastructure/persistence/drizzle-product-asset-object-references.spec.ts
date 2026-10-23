import { DependencyUnavailableError, ValidationError } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../../../../database/drizzle.client';
import { DrizzleProductAssetObjectReferences } from './drizzle-product-asset-object-references';

function rejectingDatabase(error: unknown): Database {
  return {
    select: () => ({ from: () => ({ where: vi.fn().mockRejectedValue(error) }) }),
  } as unknown as Database;
}
describe('DrizzleProductAssetObjectReferences error boundary', () => {
  it('translates database failures without exposing the vendor message', async () => {
    const vendor = new Error('private database detail');
    const adapter = new DrizzleProductAssetObjectReferences(rejectingDatabase(vendor));
    const operation = adapter.inspect('private-test', ['private/file.pdf']);
    await expect(operation).rejects.toBeInstanceOf(DependencyUnavailableError);
    await expect(operation).rejects.toMatchObject({
      message: 'Dependency unavailable: product-asset-object-references',
      cause: vendor,
    });
    await expect(operation).rejects.not.toHaveProperty('message', vendor.message);
  });
  it('preserves an existing domain error', async () => {
    const failure = new ValidationError('Invalid reference scope');
    const adapter = new DrizzleProductAssetObjectReferences(rejectingDatabase(failure));
    await expect(adapter.inspect('private-test', ['private/file.pdf'])).rejects.toBe(failure);
  });
});
