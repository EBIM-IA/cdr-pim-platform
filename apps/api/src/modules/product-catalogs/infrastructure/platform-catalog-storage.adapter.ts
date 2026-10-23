import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStoragePort } from '@cdr/storage';
import { DependencyUnavailableError } from '@cdr/shared';
import type { CatalogBinaryStoragePort } from '../domain/ports/product-catalog.port';

@Injectable()
export class PlatformCatalogStorageAdapter implements CatalogBinaryStoragePort {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort) {}
  async put(key: string, content: Uint8Array): Promise<void> {
    try {
      await this.storage.put({ key, content, mimeType: 'application/pdf' });
    } catch {
      throw new DependencyUnavailableError('catalog-storage');
    }
  }
  async get(key: string): Promise<Uint8Array> {
    try {
      return await this.storage.get(key);
    } catch {
      throw new DependencyUnavailableError('catalog-storage');
    }
  }
}
