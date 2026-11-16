import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { attributeDefinitions, catalogCategories } from './catalog-schema.tables';
export const catalogCategoryErpCodes = pgTable('catalog_category_erp_codes', {
  categoryId: uuid('category_id')
    .primaryKey()
    .references(() => catalogCategories.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const categoryDynamicAttributes = pgTable('category_dynamic_attributes', {
  attributeDefinitionId: uuid('attribute_definition_id')
    .primaryKey()
    .references(() => attributeDefinitions.id),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => catalogCategories.id),
  required: boolean('required').notNull().default(false),
  includeInTechnicalSheet: boolean('include_in_technical_sheet').notNull().default(true),
  active: boolean('active').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by').notNull(),
});
