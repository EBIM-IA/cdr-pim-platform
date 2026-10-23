import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
export const fileCleanupCandidates = pgTable(
  'file_cleanup_candidates',
  {
    id: uuid('id').primaryKey(),
    bucket: text('bucket').notNull(),
    objectKey: text('object_key').notNull(),
    identity: text('identity').notNull(),
    versionId: text('version_id'),
    etag: text('etag'),
    modifiedAt: timestamp('modified_at', { withTimezone: true }).notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    deleteMarker: boolean('delete_marker').notNull(),
    firstUnreferencedAt: timestamp('first_unreferenced_at', { withTimezone: true }),
    lastObservedAt: timestamp('last_observed_at', { withTimezone: true }).notNull(),
    status: text('status').$type<'pending' | 'protected' | 'deleted'>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('file_cleanup_candidates_identity_key').on(t.bucket, t.objectKey, t.identity),
    index('file_cleanup_candidates_due_idx').on(t.status, t.firstUnreferencedAt, t.id),
  ],
);
export const fileInventoryCursors = pgTable('file_inventory_cursors', {
  namespace: text('namespace').primaryKey(),
  cursor: text('cursor'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
export const fileMaintenanceLeases = pgTable('file_maintenance_leases', {
  name: text('name').primaryKey(),
  token: uuid('token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
