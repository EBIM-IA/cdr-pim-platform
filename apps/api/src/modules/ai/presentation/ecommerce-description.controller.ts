import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ecommerceMutationSchema,
  ecommerceVariantSchema,
  type EcommerceMutationInput,
  type EcommerceVariantInput,
} from '@cdr/contracts';
import { RateLimit } from '../../../shared/http/rate-limit';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { EcommerceDescriptionUseCases } from '../application/ecommerce-description.use-cases';
@Controller('ecommerce-descriptions')
@RequireCapabilities(Capability.CatalogRead, Capability.AttributesRead, Capability.ApplicationsRead)
export class EcommerceDescriptionController {
  constructor(private readonly descriptions: EcommerceDescriptionUseCases) {}
  @Get(':id')
  get(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(ecommerceVariantSchema)) input: EcommerceVariantInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.descriptions.get(id, input, actor);
  }
  @Post(':id')
  @RateLimit('ai')
  @RequireCapabilities(Capability.AdministrationManage, Capability.AiQualityExecute)
  mutate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ecommerceMutationSchema)) input: EcommerceMutationInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.descriptions.mutate(id, input, actor);
  }
}
