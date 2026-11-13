import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { CatalogHomeConfig } from '@cdr/contracts';

export const catalogHomeSettings = pgTable('catalog_home_settings', {
  id: text('id').primaryKey(),
  config: jsonb('config').$type<CatalogHomeConfig>().notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
