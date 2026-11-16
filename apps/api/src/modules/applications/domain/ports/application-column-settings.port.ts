import type {
  ApplicationColumnSettings,
  ApplicationAdditionalColumn,
} from '../entities/application-columns';
import type { AuditWriteContext } from '../../../audit/domain/ports/audit.port';
export interface ApplicationColumnSettingsPort {
  get(): Promise<ApplicationColumnSettings>;
  update(
    columns: readonly ApplicationAdditionalColumn[],
    expectedVersion: number,
    audit: AuditWriteContext,
  ): Promise<ApplicationColumnSettings | null>;
}
export const APPLICATION_COLUMN_SETTINGS = Symbol('ApplicationColumnSettings');
