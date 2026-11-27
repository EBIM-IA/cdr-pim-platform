import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type EcommerceImageImportRequest,
  type EcommerceImageLookupRequest,
  ecommerceImageImportRequestSchema,
  ecommerceImageLookupRequestSchema,
} from '@cdr/contracts';

import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RateLimit } from '../../../shared/http/rate-limit';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { EcommerceImagesUseCase } from '../application/ecommerce-images.use-case';

const publicationCapabilities = [
  Capability.CatalogRead,
  Capability.MenuPublicationView,
  Capability.PublicationExecute,
] as const;

@ApiTags('product-assets')
@Controller('assets/ecommerce')
@RequireCapabilities(...publicationCapabilities)
export class EcommerceImagesController {
  constructor(private readonly images: EcommerceImagesUseCase) {}

  @Get('status')
  @ApiOperation({ summary: 'Check configuration for the ecommerce image source' })
  status() {
    return this.images.status();
  }

  @Get('health')
  @RateLimit('integration')
  @ApiOperation({ summary: 'Check connectivity and credentials with the ecommerce image source' })
  health() {
    return this.images.health();
  }

  @Get('history')
  @ApiOperation({ summary: 'List the most recent imports from the ecommerce image source' })
  history() {
    return this.images.history();
  }

  @Post('lookup')
  @HttpCode(200)
  @RateLimit('integration')
  @ApiOperation({ summary: 'Look up ecommerce images for selected PIM products' })
  lookup(
    @Body(new ZodValidationPipe(ecommerceImageLookupRequestSchema))
    input: EcommerceImageLookupRequest,
  ) {
    return this.images.lookup(input);
  }

  @Post('import')
  @HttpCode(200)
  @RequireCapabilities(...publicationCapabilities, Capability.CatalogWrite)
  @ApiOperation({ summary: 'Import one confirmed ecommerce photo into a private PIM gallery' })
  importPhoto(
    @Body(new ZodValidationPipe(ecommerceImageImportRequestSchema))
    input: EcommerceImageImportRequest,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.images.importPhoto(input, actor);
  }
}
