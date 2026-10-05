import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { RequireRole } from '../../../shared/http/role.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Role } from '../../identity/domain/entities/role';
import { EnqueueProductEmbeddingUseCase } from '../application/enqueue-product-embedding.use-case';
import { EnqueueSkeletonPingUseCase } from '../application/enqueue-skeleton-ping.use-case';

const skeletonPingBodySchema = z.object({
  message: z.string().min(1).max(500).default('ping desde la API'),
});

@ApiTags('imports')
@Controller('imports')
@RequireRole(Role.Editor)
export class ImportsController {
  constructor(
    private readonly enqueueSkeletonPing: EnqueueSkeletonPingUseCase,
    private readonly enqueueProductEmbedding: EnqueueProductEmbeddingUseCase,
  ) {}

  @Post('skeleton-ping')
  @RequireRole(Role.Admin)
  @HttpCode(202)
  @ApiOperation({
    summary: 'Walking-skeleton probe: publishes a SKELETON_PING job for the worker',
  })
  async ping(@Body(new ZodValidationPipe(skeletonPingBodySchema)) body: { message: string }) {
    return this.enqueueSkeletonPing.execute(body.message);
  }

  @Post('products/:productId/embedding')
  @HttpCode(202)
  @ApiOperation({ summary: 'Queue an asynchronous re-embedding of one product' })
  async embed(@Param('productId') productId: string) {
    return this.enqueueProductEmbedding.execute(productId);
  }
}
