import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStoragePort } from '@cdr/storage';
import { DependencyUnavailableError, isDomainError } from '@cdr/shared';
import type { CatalogBinaryStoragePort } from '../domain/ports/product-catalog.port';

@Injectable()
export class PlatformCatalogStorageAdapter implements CatalogBinaryStoragePort {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort) {}
  async put(key: string, content: Uint8Array): Promise<void> {
    try {
      await this.storage.put({ key, content, mimeType: 'application/pdf' });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('catalog-storage');
    }
  }
  async get(key: string): Promise<Uint8Array> {
    try {
      return await this.storage.get(key);
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('catalog-storage');
    }
  }
  async exists(key: string): Promise<boolean> {
    try {
      return await this.storage.exists(key);
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('catalog-storage');
    }
  }
}
