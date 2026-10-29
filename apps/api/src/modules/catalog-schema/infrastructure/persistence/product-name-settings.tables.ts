import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { ProductNameConfig } from '@cdr/contracts';

export const productNameSettings = pgTable('product_name_settings', {
  id: text('id').primaryKey(),
  config: jsonb('config').$type<ProductNameConfig>().notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
