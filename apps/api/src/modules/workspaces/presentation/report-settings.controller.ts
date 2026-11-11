import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  reportSettingsSchema,
  updateReportSettingsSchema,
  type UpdateReportSettingsInput,
} from '@cdr/contracts';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { ReportSettingsUseCase } from '../application/report-settings.use-case';

@Controller('reports/preferences')
@RequireCapabilities(Capability.ReportsRead)
export class ReportSettingsController {
  constructor(private readonly settings: ReportSettingsUseCase) {}
  @Get()
  async read(@CurrentActor() actor: AuthenticatedActor) {
    return reportSettingsSchema.parse(await this.settings.execute(actor));
  }
  @Post()
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(updateReportSettingsSchema)) input: UpdateReportSettingsInput,
  ) {
    return reportSettingsSchema.parse(await this.settings.execute(actor, input));
  }
}
