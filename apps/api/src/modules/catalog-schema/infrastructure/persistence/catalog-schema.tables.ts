import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { products } from '../../../catalog/infrastructure/persistence/catalog.tables';

export const catalogCategories = pgTable(
  'catalog_categories',
  {
    id: uuid('id').primaryKey(),
    parentId: uuid('parent_id'),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    path: text('path').notNull(),
    position: integer('position').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('catalog_categories_slug_key').on(table.slug),
    uniqueIndex('catalog_categories_path_key').on(table.path),
    index('catalog_categories_parent_position_idx').on(table.parentId, table.position),
  ],
);

export const attributeDefinitions = pgTable(
  'attribute_definitions',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    dataType: text('data_type').notNull(),
    unit: text('unit'),
    allowedValues: jsonb('allowed_values').$type<string[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    sourceAuthority: text('source_authority').notNull().default('pim'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('attribute_definitions_key_key').on(table.key)],
);

export const attributeTemplates = pgTable(
  'attribute_templates',
  {
    id: uuid('id').primaryKey(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => catalogCategories.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    version: integer('version').notNull(),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('attribute_templates_category_version_key').on(table.categoryId, table.version),
    uniqueIndex('attribute_templates_one_active_per_category')
      .on(table.categoryId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const templateAttributeAssignments = pgTable(
  'template_attribute_assignments',
  {
    templateId: uuid('template_id')
      .notNull()
      .references(() => attributeTemplates.id, { onDelete: 'cascade' }),
    attributeDefinitionId: uuid('attribute_definition_id')
      .notNull()
      .references(() => attributeDefinitions.id, { onDelete: 'restrict' }),
    position: integer('position').notNull().default(0),
    required: boolean('required').notNull().default(false),
    replicable: boolean('replicable').notNull().default(false),
    active: boolean('active').notNull().default(true),
    searchable: boolean('searchable').notNull().default(false),
    includeInTechnicalSheet: boolean('include_in_technical_sheet').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.templateId, table.attributeDefinitionId] }),
    index('template_attribute_assignments_display_idx').on(
      table.templateId,
      table.active,
      table.position,
    ),
  ],
);

export const templateAttributeRoleAccess = pgTable(
  'template_attribute_role_access',
  {
    templateId: uuid('template_id').notNull(),
    attributeDefinitionId: uuid('attribute_definition_id').notNull(),
    role: text('role').notNull(),
    canView: boolean('can_view').notNull().default(false),
    canEdit: boolean('can_edit').notNull().default(false),
    canImport: boolean('can_import').notNull().default(false),
    canExport: boolean('can_export').notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.templateId, table.attributeDefinitionId, table.role] }),
    index('template_attribute_role_access_lookup_idx').on(
      table.role,
      table.canView,
      table.templateId,
    ),
  ],
);

export const productTemplateAssignments = pgTable(
  'product_template_assignments',
  {
    productId: uuid('product_id')
      .primaryKey()
      .references(() => products.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id')
      .notNull()
      .references(() => attributeTemplates.id, { onDelete: 'restrict' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('product_template_assignments_template_idx').on(table.templateId, table.productId),
  ],
);

export const productAttributeValues = pgTable(
  'product_attribute_values',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    attributeDefinitionId: uuid('attribute_definition_id')
      .notNull()
      .references(() => attributeDefinitions.id, { onDelete: 'restrict' }),
    valueText: text('value_text'),
    valueNumber: numeric('value_number', { mode: 'number' }),
    valueBoolean: boolean('value_boolean'),
    valueDate: date('value_date'),
    valueJson: jsonb('value_json').$type<unknown>(),
    source: text('source').notNull().default('manual'),
    confidence: numeric('confidence', { precision: 4, scale: 3, mode: 'number' })
      .notNull()
      .default(1),
    version: integer('version').notNull().default(1),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.attributeDefinitionId] }),
    index('product_attribute_values_attribute_text_idx').on(
      table.attributeDefinitionId,
      table.valueText,
    ),
    index('product_attribute_values_attribute_number_idx').on(
      table.attributeDefinitionId,
      table.valueNumber,
    ),
    index('product_attribute_values_attribute_boolean_idx').on(
      table.attributeDefinitionId,
      table.valueBoolean,
    ),
    index('product_attribute_values_attribute_date_idx').on(
      table.attributeDefinitionId,
      table.valueDate,
    ),
  ],
);

export type AttributeDefinitionRow = typeof attributeDefinitions.$inferSelect;
export type ProductAttributeValueRow = typeof productAttributeValues.$inferSelect;
