import { Inject, Injectable } from '@nestjs/common';
import { DependencyUnavailableError, getCorrelationId, newUuid } from '@cdr/shared';
import type { Sql } from '../../../database/drizzle.client';
import { DATABASE_SQL } from '../../../shared/tokens';
import type { AuthenticatedActor } from '../domain/entities/role';
import type { ModulePolicy, ModulePolicyPort } from '../domain/ports/module-policy.port';

@Injectable()
export class PostgresModulePolicyAdapter implements ModulePolicyPort {
  constructor(@Inject(DATABASE_SQL) private readonly sql: Sql) {}
  async read(): Promise<ModulePolicy[]> {
    try {
      return await this.sql<
        ModulePolicy[]
      >`SELECT role,capability,visible FROM identity_module_policies ORDER BY role,capability`;
    } catch (error) {
      throw new DependencyUnavailableError('identity-module-policies', error);
    }
  }
  async save(policy: ModulePolicy, actor: AuthenticatedActor): Promise<void> {
    try {
      await this.sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('cdr:module-policies'))`;
        const before =
          await tx`SELECT role,capability,visible FROM identity_module_policies WHERE role=${policy.role} AND capability=${policy.capability}`;
        await tx`INSERT INTO identity_module_policies(role,capability,visible,actor_id) VALUES (${policy.role},${policy.capability},${policy.visible},${actor.id}) ON CONFLICT(role,capability) DO UPDATE SET visible=EXCLUDED.visible,actor_id=EXCLUDED.actor_id,updated_at=now()`;
        const auditId = newUuid();
        const resourceId = policy.role + ':' + policy.capability;
        const [previous] = await tx<
          { occurredAt: Date | string }[]
        >`SELECT occurred_at AS "occurredAt" FROM audit_entries WHERE resource_type='module_policy' AND resource_id=${resourceId} ORDER BY occurred_at DESC LIMIT 1`;
        await tx`INSERT INTO audit_entries(id,resource_type,resource_id,action,actor_id,source,correlation_id,changes,occurred_at) VALUES (${auditId}::uuid,'module_policy',${policy.role + ':' + policy.capability},'updated',${actor.id},'api',${getCorrelationId() ?? newUuid()},${JSON.stringify({ policy: { before: before[0] ?? null, after: policy } })}::jsonb,now())`;
        await tx`INSERT INTO audit_change_items(id,audit_entry_id,field_name,before_value,after_value,previous_value_valid_from) VALUES (${newUuid()}::uuid,${auditId}::uuid,'policy',${JSON.stringify(before[0] ?? null)}::jsonb,${JSON.stringify(policy)}::jsonb,${previous ? new Date(previous.occurredAt).toISOString() : null}::timestamptz)`;
      });
    } catch (error) {
      throw new DependencyUnavailableError('identity-module-policies', error);
    }
  }
}
