import type { ReportSettingsDto, UpdateReportSettingsInput } from '@cdr/contracts';

export const REPORT_SETTINGS = Symbol('ReportSettingsPort');
export interface ReportSettingsPort {
  read(actorId: string): Promise<ReportSettingsDto>;
  update(actorId: string, input: UpdateReportSettingsInput): Promise<void>;
}
