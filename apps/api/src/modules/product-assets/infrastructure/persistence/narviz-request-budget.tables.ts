import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const narvizRequestBudget = pgTable(
  'narviz_request_budget',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').$type<'request' | 'download' | 'cooldown'>().notNull(),
    units: integer('units').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('narviz_request_budget_cooldown_key')
      .on(table.kind)
      .where(sql`${table.kind} = 'cooldown'`),
  ],
);
