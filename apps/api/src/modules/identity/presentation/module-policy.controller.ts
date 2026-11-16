import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { modulePolicySchema, type ModulePolicy as ModulePolicyDto } from '@cdr/contracts';
import { CurrentActor, RequireCapabilities } from './decorators/auth.decorators';
import { Capability, type AuthenticatedActor } from '../domain/entities/role';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ModulePolicyUseCase } from '../application/module-policy.use-case';

@Controller('identity/module-policies')
@RequireCapabilities(Capability.AdministrationManage)
export class ModulePolicyController {
  constructor(private readonly policies: ModulePolicyUseCase) {}
  @Get() read() {
    return this.policies.read();
  }
  @Post('reset') reset(@CurrentActor() actor: AuthenticatedActor) {
    return this.policies.reset(actor);
  }
  @Patch() save(
    @Body(new ZodValidationPipe(modulePolicySchema)) body: ModulePolicyDto,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.policies.save(body, actor);
  }
}
