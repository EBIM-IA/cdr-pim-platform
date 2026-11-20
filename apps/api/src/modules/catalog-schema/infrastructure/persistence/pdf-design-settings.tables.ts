import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { PdfDesignConfig } from '@cdr/contracts';
export const pdfDesignSettings = pgTable('pdf_design_settings', {
  id: text('id').primaryKey(),
  config: jsonb('config').$type<PdfDesignConfig>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
