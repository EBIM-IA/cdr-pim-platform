import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
export const searchEvents = pgTable(
  'search_events',
  {
    id: uuid('id').primaryKey(),
    query: text('query').notNull(),
    resultCount: integer('result_count').notNull(),
    channel: text('channel').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('search_events_occurred_at_idx').on(table.occurredAt)],
);
