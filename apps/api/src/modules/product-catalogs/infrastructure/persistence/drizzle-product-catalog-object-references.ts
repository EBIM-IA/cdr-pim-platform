import { Inject, Injectable } from '@nestjs/common';
import { DependencyUnavailableError, isDomainError } from '@cdr/shared';
import { inArray } from 'drizzle-orm';
import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { transactionForFileScope } from '../../../../shared/persistence/file-object-lock';
import type {
  FileObjectLockScope,
  FileObjectReference,
} from '../../../file-maintenance/domain/ports/file-maintenance.port';
import type { ProductCatalogObjectReferencesPort } from '../../domain/ports/product-catalog-object-references.port';
import { productCatalogs } from './product-catalogs.tables';
@Injectable()
export class DrizzleProductCatalogObjectReferences implements ProductCatalogObjectReferencesPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async inspect(
    _bucket: string,
    keys: readonly string[],
    scope?: FileObjectLockScope,
  ): Promise<FileObjectReference[]> {
    if (!keys.length) return [];
    // Catalogs currently do not persist a bucket. Protect matching keys conservatively
    // across buckets, including expired and soft-deleted catalogs that may be restored.
    try {
      const rows = await (scope ? transactionForFileScope(scope) : this.db)
        .select({ key: productCatalogs.objectKey })
        .from(productCatalogs)
        .where(inArray(productCatalogs.objectKey, [...keys]));
      return rows.map((row) => ({ ...row, protected: true, retiredAt: null }));
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('product-catalog-object-references', error);
    }
  }
}
