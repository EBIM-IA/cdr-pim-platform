import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
export const reportPreferences = pgTable(
  'report_preferences',
  {
    actorId: text('actor_id').notNull(),
    kind: text('kind').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.actorId, table.kind, table.key] })],
);
export const reportBaselines = pgTable('report_baselines', {
  id: uuid('id').primaryKey(),
  label: text('label').notNull(),
  actorId: text('actor_id').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  productCount: integer('product_count').notNull(),
});
export const reportBaselineProducts = pgTable(
  'report_baseline_products',
  {
    baselineId: uuid('baseline_id')
      .notNull()
      .references(() => reportBaselines.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull(),
    applications: integer('applications').notNull(),
    oem: integer('oem').notNull(),
    homologs: integer('homologs').notNull(),
    attributes: integer('attributes').notNull(),
  },
  (table) => [primaryKey({ columns: [table.baselineId, table.productId] })],
);

export const reportClosedPeriods = pgTable(
  'report_closed_periods',
  {
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    total: integer('total').notNull(),
    source: text('source').notNull(),
    actorId: text('actor_id').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.year, table.month] })],
);
