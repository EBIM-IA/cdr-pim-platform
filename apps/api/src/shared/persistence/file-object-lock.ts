import { sql } from 'drizzle-orm';
import type { Database } from '../../database/drizzle.client';
import type { FileObjectLockScope } from '../../modules/file-maintenance/domain/ports/file-maintenance.port';
import type { DatabaseTransaction } from './record-audit-within-transaction';

const transactions = new WeakMap<FileObjectLockScope, DatabaseTransaction>();
/** Writers and cleanup use the same transaction-level lock; UUID keys are never reused. */
export async function lockFileObject(transaction: DatabaseTransaction, key: string): Promise<void> {
  await transaction.execute(sql`SELECT set_config('lock_timeout', '10000', true)`);
  await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 4871230))`);
}
export function transactionForFileScope(scope: FileObjectLockScope): DatabaseTransaction {
  const transaction = transactions.get(scope);
  if (!transaction) throw new Error('File object scope is no longer active');
  return transaction;
}
export async function withFileObjectLock<T>(
  database: Database,
  key: string,
  work: (scope: FileObjectLockScope) => Promise<T>,
): Promise<T> {
  return database.transaction(async (transaction) => {
    await lockFileObject(transaction, key);
    const scope: FileObjectLockScope = { id: Symbol('file-object-scope') };
    transactions.set(scope, transaction);
    try {
      return await work(scope);
    } finally {
      transactions.delete(scope);
    }
  });
}
