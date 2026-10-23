import { Inject, Injectable } from '@nestjs/common';
import { DependencyUnavailableError, isDomainError } from '@cdr/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { transactionForFileScope } from '../../../../shared/persistence/file-object-lock';
import type {
  FileObjectLockScope,
  FileObjectReference,
} from '../../../file-maintenance/domain/ports/file-maintenance.port';
import type { ProductAssetObjectReferencesPort } from '../../domain/ports/product-asset-object-references.port';
import { productAssets } from './product-assets.tables';
@Injectable()
export class DrizzleProductAssetObjectReferences implements ProductAssetObjectReferencesPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async inspect(
    bucket: string,
    keys: readonly string[],
    scope?: FileObjectLockScope,
  ): Promise<FileObjectReference[]> {
    if (!keys.length) return [];
    try {
      const rows = await (scope ? transactionForFileScope(scope) : this.db)
        .select({ key: productAssets.objectKey, retiredAt: productAssets.deletedAt })
        .from(productAssets)
        .where(and(eq(productAssets.bucket, bucket), inArray(productAssets.objectKey, [...keys])));
      return rows.map((row) => ({ ...row, protected: row.retiredAt === null }));
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('product-asset-object-references', error);
    }
  }
}
