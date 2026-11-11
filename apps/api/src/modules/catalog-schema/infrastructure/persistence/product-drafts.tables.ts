import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';
import type { ProductDraftEntry } from '../../domain/ports/product-draft.port';
import { attributeTemplates } from './catalog-schema.tables';

export const productAttributeDrafts = pgTable(
  'product_attribute_drafts',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').notNull(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => attributeTemplates.id),
    entries: jsonb('entries').$type<readonly ProductDraftEntry[]>().notNull(),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.productId, table.actorId] })],
);
