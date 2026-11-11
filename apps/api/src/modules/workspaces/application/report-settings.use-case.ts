import { Inject, Injectable } from '@nestjs/common';
import type { UpdateReportSettingsInput } from '@cdr/contracts';
import { ForbiddenError, ValidationError, type Clock } from '@cdr/shared';
import {
  actorHasCapability,
  Capability,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import { CLOCK } from '../../../shared/tokens';
import { REPORT_SETTINGS, type ReportSettingsPort } from '../domain/ports/report-settings.port';

@Injectable()
export class ReportSettingsUseCase {
  constructor(
    @Inject(REPORT_SETTINGS) private readonly settings: ReportSettingsPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async execute(actor: AuthenticatedActor, input?: UpdateReportSettingsInput) {
    if (!actorHasCapability(actor, Capability.ReportsRead))
      throw new ForbiddenError('Insufficient report access');
    if (input) {
      if (
        input.operation !== 'save-layout' &&
        !actorHasCapability(actor, Capability.AdministrationManage)
      )
        throw new ForbiddenError('Only administrators manage report formats and baselines');
      if (input.operation === 'save-closed-periods') {
        const now = this.clock.now();
        const current = now.getUTCFullYear() * 12 + now.getUTCMonth();
        if (input.periods.some((period) => period.year * 12 + period.month - 1 >= current))
          throw new ValidationError('Only closed calendar months can be imported');
      }
      await this.settings.update(actor.id, input);
    }
    return this.settings.read(actor.id);
  }
}
