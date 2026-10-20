import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const codeAffixes = pgTable(
  'code_affixes',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').notNull(),
    token: text('token').notNull(),
    meaning: text('meaning').notNull(),
    attribute: text('attribute'),
    impliedValue: text('implied_value'),
    brand: text('brand'),
    family: text('family'),
    source: text('source').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3, mode: 'number' }),
    status: text('status').notNull().default('draft'),
    evidence: text('evidence'),
    boreRule: text('bore_rule').notNull().default('none'),
    priority: integer('priority').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdBy: text('created_by').notNull(),
    validatedBy: text('validated_by'),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('code_affixes_list_idx').on(
      table.active,
      table.status,
      table.kind,
      table.priority,
      table.token,
    ),
  ],
);

export type CodeAffixRow = typeof codeAffixes.$inferSelect;
