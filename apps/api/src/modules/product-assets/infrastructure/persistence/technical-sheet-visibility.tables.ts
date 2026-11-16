import { boolean, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';

export const productTechnicalSheetVisibility = pgTable('product_technical_sheet_visibility', {
  productId: uuid('product_id')
    .primaryKey()
    .references(() => products.id, { onDelete: 'cascade' }),
  visible: boolean('visible').notNull().default(true),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
