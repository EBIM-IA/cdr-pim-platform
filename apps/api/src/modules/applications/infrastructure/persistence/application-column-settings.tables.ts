import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { ApplicationAdditionalColumn } from '../../domain/entities/application-columns';
export const applicationColumnSettings = pgTable('application_column_settings', {
  id: text('id').primaryKey(),
  columns: jsonb('columns').$type<ApplicationAdditionalColumn[]>().notNull().default([]),
  version: integer('version').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
