import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  reportSettingsSchema,
  type ReportSettingsDto,
  type UpdateReportSettingsInput,
} from '@cdr/contracts';
import { DependencyUnavailableError, isDomainError } from '@cdr/shared';
import type { Sql } from '../../../database/drizzle.client';
import { DATABASE_SQL } from '../../../shared/tokens';
import type { ReportSettingsPort } from '../domain/ports/report-settings.port';

@Injectable()
export class PostgresReportSettingsAdapter implements ReportSettingsPort {
  constructor(@Inject(DATABASE_SQL) private readonly sql: Sql) {}
  async read(actorId: string): Promise<ReportSettingsDto> {
    try {
      const [preferences, baselines] = await Promise.all([
        this.sql<
          { kind: string; key: string; value: unknown }[]
        >`SELECT kind, key, value FROM report_preferences WHERE (kind='layout' AND actor_id=${actorId}) OR (kind='format' AND actor_id='*') ORDER BY key`,
        this.sql<
          { id: string; label: string; capturedAt: Date; productCount: number }[]
        >`SELECT id::text, label, captured_at AS "capturedAt", product_count AS "productCount" FROM report_baselines ORDER BY captured_at DESC,id DESC LIMIT 100`,
      ]);
      return reportSettingsSchema.parse({
        layouts: Object.fromEntries(
          preferences.filter((row) => row.kind === 'layout').map((row) => [row.key, row.value]),
        ),
        formats: preferences.filter((row) => row.kind === 'format').map((row) => row.value),
        baselines: baselines.map((row) => ({
          ...row,
          capturedAt: new Date(row.capturedAt).toISOString(),
        })),
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('report-settings-database', error);
    }
  }
  async update(actorId: string, input: UpdateReportSettingsInput): Promise<void> {
    try {
      if (input.operation === 'save-closed-periods') {
        await this.sql.begin(async (transaction) => {
          for (const period of input.periods)
            await transaction`INSERT INTO report_closed_periods(year,month,total,source,actor_id) VALUES (${period.year},${period.month},${period.total},${input.source},${actorId}) ON CONFLICT(year,month) DO UPDATE SET total=EXCLUDED.total,source=EXCLUDED.source,actor_id=EXCLUDED.actor_id,updated_at=now()`;
        });
        return;
      }
      if (input.operation === 'capture-baseline') {
        await this.sql.begin(async (transaction) => {
          const id = randomUUID();
          await transaction`INSERT INTO report_baselines(id,label,actor_id,product_count) VALUES (${id}::uuid,${input.label},${actorId},0)`;
          await transaction`INSERT INTO report_baseline_products(baseline_id,product_id,applications,oem,homologs,attributes)
            SELECT ${id}::uuid, product.id,
              (SELECT COUNT(DISTINCT application.id)::int FROM equivalence_group_members member JOIN group_applications application ON application.equivalence_group_id=member.group_id AND application.active=true WHERE member.product_id=product.id),
              (SELECT COUNT(DISTINCT oem.id)::int FROM equivalence_group_members member JOIN group_oem_codes oem ON oem.equivalence_group_id=member.group_id AND oem.active=true WHERE member.product_id=product.id),
              (SELECT COUNT(DISTINCT homolog.id)::int FROM equivalence_group_members member JOIN external_homologs homolog ON homolog.equivalence_group_id=member.group_id AND homolog.active=true WHERE member.product_id=product.id),
              (SELECT COUNT(*)::int FROM product_attribute_values value JOIN product_template_assignments product_template ON product_template.product_id=value.product_id JOIN attribute_templates template ON template.id=product_template.template_id AND template.status='active' JOIN template_attribute_assignments assignment ON assignment.template_id=template.id AND assignment.attribute_definition_id=value.attribute_definition_id AND assignment.active=true JOIN attribute_definitions definition ON definition.id=assignment.attribute_definition_id AND definition.active=true WHERE value.product_id=product.id AND value.deleted_at IS NULL AND (NULLIF(BTRIM(value.value_text),'') IS NOT NULL OR value.value_number IS NOT NULL OR value.value_boolean IS NOT NULL OR value.value_date IS NOT NULL OR (value.value_json IS NOT NULL AND value.value_json <> 'null'::jsonb)))
            FROM products product`;
          await transaction`UPDATE report_baselines SET product_count=(SELECT COUNT(*)::int FROM report_baseline_products WHERE baseline_id=${id}::uuid) WHERE id=${id}::uuid`;
        });
        return;
      }
      if (input.operation === 'delete-format') {
        await this
          .sql`DELETE FROM report_preferences WHERE actor_id='*' AND kind='format' AND key=${input.key}`;
        return;
      }
      const kind = input.operation === 'save-layout' ? 'layout' : 'format';
      const owner = kind === 'layout' ? actorId : '*';
      const key = input.operation === 'save-layout' ? input.key : input.format.id;
      const value = input.operation === 'save-layout' ? input.layout : input.format;
      await this
        .sql`INSERT INTO report_preferences(actor_id,kind,key,value) VALUES (${owner},${kind},${key},${JSON.stringify(value)}::jsonb) ON CONFLICT(actor_id,kind,key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('report-settings-database', error);
    }
  }
}
