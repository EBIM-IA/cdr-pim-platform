import { ValidationError } from '@cdr/shared';

import type { MalwareScannerPort } from './malware-scanner.port';
import type { ObjectStoragePort, PutObjectCommand, StoredObject } from './object-storage.port';

/** Persistence gate: only the exact bytes accepted by the scanner are written downstream. */
export class ScanningObjectStorageAdapter implements ObjectStoragePort {
  constructor(
    private readonly storage: ObjectStoragePort,
    private readonly scanner: MalwareScannerPort,
  ) {}

  async put(command: PutObjectCommand): Promise<StoredObject> {
    const content = Uint8Array.from(command.content);
    await this.scanner.assertClean(content);
    return this.storage.put({ ...command, content });
  }
  get(key: string): Promise<Uint8Array> {
    return this.storage.get(key);
  }
  delete(key: string): Promise<void> {
    return this.storage.delete(key);
  }
  exists(key: string): Promise<boolean> {
    return this.storage.exists(key);
  }
  presignGet(key: string, ttlSeconds: number): Promise<string> {
    return this.storage.presignGet(key, ttlSeconds);
  }
  presignPut(_key: string, _ttlSeconds: number, _mimeType: string): Promise<string> {
    return Promise.reject(
      new ValidationError(
        'La carga directa está bloqueada: los archivos requieren análisis antimalware antes de almacenarse.',
      ),
    );
  }
}
