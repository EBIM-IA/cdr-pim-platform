import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type ProductDraftDto,
  type SaveProductDraftInput,
  saveProductDraftSchema,
} from '@cdr/contracts';

import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { ProductDraftUseCases } from '../application/product-draft.use-cases';

@ApiTags('product drafts')
@Controller('catalog/products/:productId/draft')
@RequireCapabilities(Capability.AttributesWrite)
export class ProductDraftController {
  constructor(private readonly drafts: ProductDraftUseCases) {}

  @Get()
  async get(
    @Param('productId') productId: string,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductDraftDto> {
    const draft = await this.drafts.get(productId, actor);
    return {
      ...draft,
      entries: [...draft.entries],
      updatedAt: draft.updatedAt?.toISOString() ?? null,
    };
  }

  @Patch()
  async save(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(saveProductDraftSchema)) body: SaveProductDraftInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ProductDraftDto> {
    const draft = await this.drafts.save(productId, body, actor);
    return {
      ...draft,
      entries: [...draft.entries],
      updatedAt: draft.updatedAt?.toISOString() ?? null,
    };
  }
}
