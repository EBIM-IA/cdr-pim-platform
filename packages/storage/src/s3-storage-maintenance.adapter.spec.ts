import { describe, expect, it, vi } from 'vitest';
import { S3StorageMaintenanceAdapter } from './s3-storage-maintenance.adapter';
import type { StorageObjectIdentity } from './object-storage-maintenance.port';
const now = new Date('2026-10-23T10:00:00Z');
const object: StorageObjectIdentity = {
  bucket: 'private-test',
  key: 'product-catalogs/a/b.pdf',
  identity: 'v:one',
  versionId: 'one',
  etag: '"etag"',
  modifiedAt: now,
  size: 8,
  deleteMarker: false,
};
function setup() {
  const adapter = new S3StorageMaintenanceAdapter({ bucket: object.bucket, region: 'us-east-1' });
  const send = vi.fn();
  (adapter as unknown as { client: unknown }).client = { send, destroy: vi.fn() };
  return { adapter, send };
}
describe('S3 physical file maintenance', () => {
  it('lists versions and delete markers with durable pagination instead of only visible objects', async () => {
    const { adapter, send } = setup();
    send.mockResolvedValueOnce({ Status: 'Enabled' }).mockResolvedValueOnce({
      Versions: [
        { Key: object.key, VersionId: 'one', ETag: object.etag, LastModified: now, Size: 8 },
      ],
      DeleteMarkers: [{ Key: object.key, VersionId: 'marker', LastModified: now }],
      IsTruncated: true,
      NextKeyMarker: object.key,
      NextVersionIdMarker: 'marker',
    });
    const first = await adapter.listPage({ prefix: 'product-catalogs/', limit: 10 });
    expect(first.items.map((item) => [item.versionId, item.deleteMarker])).toEqual([
      ['one', false],
      ['marker', true],
    ]);
    send.mockResolvedValueOnce({ Status: 'Enabled' }).mockResolvedValueOnce({ IsTruncated: false });
    await adapter.listPage({ prefix: 'product-catalogs/', limit: 10, cursor: first.nextCursor });
    expect(send.mock.calls[3]![0].input).toEqual(
      expect.objectContaining({ KeyMarker: object.key, VersionIdMarker: 'marker', MaxKeys: 10 }),
    );
  });
  it('physically deletes the precise version with an ETag condition', async () => {
    const { adapter, send } = setup();
    send
      .mockResolvedValueOnce({ ETag: object.etag, ContentLength: 8, LastModified: now })
      .mockResolvedValueOnce({});
    await expect(adapter.purgeIdentity(object)).resolves.toBe('deleted');
    expect(send.mock.calls[1]![0].input).toEqual({
      Bucket: object.bucket,
      Key: object.key,
      VersionId: 'one',
      IfMatch: object.etag,
    });
  });
  it('will not create a delete marker if versioning changed after unversioned inventory', async () => {
    const { adapter, send } = setup();
    send.mockResolvedValueOnce({ Status: 'Enabled' });
    await expect(adapter.purgeIdentity({ ...object, versionId: null })).resolves.toBe('changed');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('restarts a stale pagination mode safely when bucket versioning changes', async () => {
    const { adapter, send } = setup();
    send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Contents: [], IsTruncated: true, NextContinuationToken: 'next' });
    const first = await adapter.listPage({ prefix: 'products/', limit: 10 });
    send
      .mockResolvedValueOnce({ Status: 'Suspended' })
      .mockResolvedValueOnce({ Versions: [], IsTruncated: false });
    await adapter.listPage({ prefix: 'products/', limit: 10, cursor: first.nextCursor });
    expect(send.mock.calls[3]![0].input.KeyMarker).toBeUndefined();
  });
  it('does not delete identities that changed and never reports denied deletes as success', async () => {
    const { adapter, send } = setup();
    send.mockResolvedValueOnce({ ETag: 'changed', ContentLength: 8, LastModified: now });
    await expect(adapter.purgeIdentity(object)).resolves.toBe('changed');
    expect(send).toHaveBeenCalledTimes(1);
    send
      .mockReset()
      .mockResolvedValueOnce({ ETag: object.etag, ContentLength: 8, LastModified: now })
      .mockRejectedValueOnce({ name: 'AccessDenied', sensitive: 'not-for-logs' });
    await expect(adapter.purgeIdentity(object)).rejects.toThrow('s3:maintenance-delete');
  });
  it('deletes exact delete-marker versions and treats an already missing version idempotently', async () => {
    const { adapter, send } = setup();
    send.mockResolvedValueOnce({});
    await expect(
      adapter.purgeIdentity({
        ...object,
        versionId: 'marker',
        etag: null,
        size: 0,
        deleteMarker: true,
      }),
    ).resolves.toBe('deleted');
    expect(send.mock.calls[0]![0].input.VersionId).toBe('marker');
    send.mockRejectedValueOnce({ name: 'NoSuchVersion' });
    await expect(adapter.purgeIdentity(object)).resolves.toBe('absent');
  });
});
