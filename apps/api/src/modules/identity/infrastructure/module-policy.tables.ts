import { boolean, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
export const identityModulePolicies = pgTable(
  'identity_module_policies',
  {
    role: text('role').notNull(),
    capability: text('capability').notNull(),
    visible: boolean('visible').notNull(),
    actorId: text('actor_id').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.role, table.capability] })],
);
