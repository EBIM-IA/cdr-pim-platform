import { Body, Controller, Get, Patch } from '@nestjs/common';
import { catalogHomeSettingsSchema, type CatalogHomeSettingsDto } from '@cdr/contracts';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { CatalogHomeUseCases } from '../application/catalog-home.use-cases';
@Controller('catalog/home')
export class CatalogHomeController {
  constructor(private readonly home: CatalogHomeUseCases) {}
  @Get()
  @RequireCapabilities(Capability.CatalogRead)
  get() {
    return this.home.get();
  }
  @Patch()
  @RequireCapabilities(Capability.AdministrationManage)
  save(
    @Body(new ZodValidationPipe(catalogHomeSettingsSchema)) input: CatalogHomeSettingsDto,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.home.save(input, actor);
  }
}
