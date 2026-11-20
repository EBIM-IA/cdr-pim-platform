import { Body, Controller, Get, Put } from '@nestjs/common';
import { savePdfDesignSettingsSchema, type PdfDesignSettingsDto } from '@cdr/contracts';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { PdfDesignSettingsUseCase } from '../application/pdf-design-settings.use-case';
@Controller('catalog/admin/pdf-design')
@RequireCapabilities(Capability.AttributesRead)
export class PdfDesignSettingsController {
  constructor(private readonly settings: PdfDesignSettingsUseCase) {}
  @Get() get() {
    return this.settings.get();
  }
  @Put()
  @RequireCapabilities(Capability.AdministrationManage)
  save(
    @Body(new ZodValidationPipe(savePdfDesignSettingsSchema)) input: PdfDesignSettingsDto,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.settings.save(input, actor);
  }
}
