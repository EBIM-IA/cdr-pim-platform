import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE_MAINTENANCE, type ObjectStorageMaintenancePort } from '@cdr/storage';
import type { FileInventoryPort, FileObjectIdentity } from '../domain/ports/file-maintenance.port';
@Injectable()
export class StorageInventoryAdapter implements FileInventoryPort {
  constructor(
    @Inject(OBJECT_STORAGE_MAINTENANCE) private readonly storage: ObjectStorageMaintenancePort,
  ) {}
  listPage(input: { prefix: string; cursor?: string | null; limit: number }) {
    return this.storage.listPage(input);
  }
  purgeIdentity(object: FileObjectIdentity) {
    return this.storage.purgeIdentity(object);
  }
}
