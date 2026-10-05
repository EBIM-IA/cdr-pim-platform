import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type ImportBatchDto, type PreviewImportInput, previewImportSchema } from '@cdr/contracts';
import { z } from 'zod';

import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { EnqueueProductEmbeddingUseCase } from '../application/enqueue-product-embedding.use-case';
import { EnqueueSkeletonPingUseCase } from '../application/enqueue-skeleton-ping.use-case';
import {
  ConfirmImportBatchUseCase,
  GetImportBatchUseCase,
  PreviewImportBatchUseCase,
} from '../application/manage-import-batches.use-cases';
import type { ImportBatch } from '../domain/entities/import-batch';

const skeletonPingBodySchema = z.object({
  message: z.string().min(1).max(500).default('ping desde la API'),
});

@ApiTags('imports')
@Controller('imports')
@RequireCapabilities(Capability.ImportsExecute)
export class ImportsController {
  constructor(
    private readonly enqueueSkeletonPing: EnqueueSkeletonPingUseCase,
    private readonly enqueueProductEmbedding: EnqueueProductEmbeddingUseCase,
    private readonly previewImportBatch: PreviewImportBatchUseCase,
    private readonly getImportBatch: GetImportBatchUseCase,
    private readonly confirmImportBatch: ConfirmImportBatchUseCase,
  ) {}

  @Post('preview')
  @ApiOperation({ summary: 'Validate and persist a CSV/JSON import preview idempotently' })
  async preview(
    @Body(new ZodValidationPipe(previewImportSchema)) body: PreviewImportInput,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ImportBatchDto> {
    return toImportBatchDto(await this.previewImportBatch.execute(body, actor.id));
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ImportBatchDto> {
    return toImportBatchDto(await this.getImportBatch.execute(id));
  }

  @Post(':id/confirm')
  @ApiOperation({
    summary: 'Confirm a clean staged import; repeated confirmations return the same batch',
  })
  async confirm(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ImportBatchDto> {
    return toImportBatchDto(await this.confirmImportBatch.execute(id, actor));
  }

  @Post('skeleton-ping')
  @RequireCapabilities(Capability.OperationsManage)
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

function toImportBatchDto(batch: ImportBatch): ImportBatchDto {
  const value = batch.toSnapshot();
  const validRows = value.rows.filter((row) => row.valid).length;
  return {
    id: value.id,
    target: value.target,
    format: value.format,
    status: value.status,
    idempotencyKey: value.idempotencyKey,
    categoryCode: value.categoryCode,
    totalRows: value.rows.length,
    validRows,
    invalidRows: value.rows.length - validRows,
    rows: value.rows.map((row) => ({ ...row, errors: [...row.errors] })),
    createdAt: value.createdAt.toISOString(),
    confirmedAt: value.confirmedAt?.toISOString() ?? null,
  };
}
