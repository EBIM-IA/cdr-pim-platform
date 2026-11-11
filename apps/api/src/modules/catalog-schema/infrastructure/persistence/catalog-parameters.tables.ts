import { boolean, integer, pgTable, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
export const catalogParameters = pgTable(
  'catalog_parameters',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    description: text('description').notNull().default(''),
    target: text('target'),
    logoDataUrl: text('logo_data_url'),
    active: boolean('active').notNull().default(true),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('catalog_parameters_kind_value_key').on(table.kind, sql`lower(${table.value})`),
  ],
);
