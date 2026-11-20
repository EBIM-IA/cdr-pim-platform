import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  productAssetBatchQuerySchema,
  updateTechnicalSheetVisibilitySchema,
  type ProductAssetBatchQuery,
  type UpdateTechnicalSheetVisibilityInput,
} from '@cdr/contracts';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { TechnicalSheetVisibilityUseCase } from '../application/technical-sheet-visibility.use-case';

@Controller('assets/technical-sheet-visibility')
@RequireCapabilities(Capability.CatalogRead)
export class TechnicalSheetVisibilityController {
  constructor(private readonly visibility: TechnicalSheetVisibilityUseCase) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(productAssetBatchQuerySchema)) query: ProductAssetBatchQuery,
    @CurrentActor() _actor: AuthenticatedActor,
  ) {
    return this.visibility.list(query.productIds).then((policies) =>
      policies.map((policy) => ({
        ...policy,
        canView: true,
      })),
    );
  }

  @Get(':productId')
  get(@Param('productId') productId: string) {
    return this.visibility.get(productId);
  }

  @Patch(':productId')
  @RequireCapabilities(Capability.AdministrationManage)
  update(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(updateTechnicalSheetVisibilitySchema))
    input: UpdateTechnicalSheetVisibilityInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.visibility.update(productId, input, actor);
  }
}
