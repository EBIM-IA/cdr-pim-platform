import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  qualitySourcePrioritySchema,
  type QualitySourcePriorityInput,
  qualityConflictSchema,
  qualityDecisionSchema,
  qualityReviewQuerySchema,
  type QualityConflictInput,
  type QualityDecisionInput,
  type QualityReviewQuery,
} from '@cdr/contracts';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { QualityGovernanceUseCases } from '../application/quality-governance.use-cases';
@Controller('quality')
@RequireCapabilities(Capability.CatalogRead, Capability.AiQualityExecute)
export class QualityGovernanceController {
  constructor(private readonly quality: QualityGovernanceUseCases) {}
  @Get('product-changes') productChanges(
    @Query(new ZodValidationPipe(qualityReviewQuerySchema)) query: QualityReviewQuery,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.quality.productChanges(query, actor);
  }
  @Get('completeness') completeness(@CurrentActor() actor: AuthenticatedActor) {
    return this.quality.completeness(actor);
  }
  @Get('reviews') list(
    @Query(new ZodValidationPipe(qualityReviewQuerySchema)) query: QualityReviewQuery,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.quality.list(query, actor);
  }
  @Get('reviews/:id') get(@Param('id') id: string, @CurrentActor() actor: AuthenticatedActor) {
    return this.quality.get(id, actor);
  }
  @Post('reviews/:id/decision') decide(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(qualityDecisionSchema)) input: QualityDecisionInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.quality.decide(id, input, actor);
  }
  @Post('source-priority') priority(
    @Body(new ZodValidationPipe(qualitySourcePrioritySchema)) input: QualitySourcePriorityInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.quality.updatePriority(input, actor);
  }
  @Post('conflicts') conflict(
    @Body(new ZodValidationPipe(qualityConflictSchema)) input: QualityConflictInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.quality.createConflict(input, actor);
  }
  @Post('duplicates/detect') detect(@CurrentActor() actor: AuthenticatedActor) {
    return this.quality.detect(actor);
  }
}
