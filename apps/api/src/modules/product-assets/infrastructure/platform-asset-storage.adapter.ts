import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStoragePort } from '@cdr/storage';

import type {
  AssetBinaryStoragePort,
  StoredAssetBinary,
} from '../domain/ports/product-asset-repository.port';

/** Keeps the application layer independent from the platform storage package. */
@Injectable()
export class PlatformAssetStorageAdapter implements AssetBinaryStoragePort {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort) {}

  put(input: {
    readonly key: string;
    readonly content: Uint8Array;
    readonly mimeType: string;
    readonly metadata: Readonly<Record<string, string>>;
  }): Promise<StoredAssetBinary> {
    return this.storage.put(input);
  }

  get(key: string): Promise<Uint8Array> {
    return this.storage.get(key);
  }

  delete(key: string): Promise<void> {
    return this.storage.delete(key);
  }
}
