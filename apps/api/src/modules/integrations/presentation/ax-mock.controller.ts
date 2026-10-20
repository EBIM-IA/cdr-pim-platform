import type { Response } from 'express';

import { Body, Controller, Get, Headers, HttpCode, Param, Post, Res } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  API_PREFIX,
  type AxMockBatchDto,
  type ReceiveAxMockBatchInput,
  axMockBatchIdSchema,
  axMockBatchSchema,
  axMockIdempotencyKeySchema,
  receiveAxMockBatchSchema,
} from '@cdr/contracts';
import { ValidationError } from '@cdr/shared';

import { openApiSchema } from '../../../shared/http/openapi';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import {
  GetAxMockBatchUseCase,
  ReceiveAxMockBatchUseCase,
} from '../application/manage-ax-mock-batches.use-cases';
import type { StoredAxMockBatch } from '../domain/entities/ax-mock-batch';
import { AxMockAuthenticated } from './ax-mock-auth.decorator';

@ApiTags('integrations-ax-mock')
@Controller('integrations/ax/mock')
@AxMockAuthenticated()
export class AxMockController {
  constructor(
    private readonly receiveBatch: ReceiveAxMockBatchUseCase,
    private readonly getBatch: GetAxMockBatchUseCase,
  ) {}

  @Post('batches')
  @HttpCode(202)
  @ApiOperation({ summary: 'Receive a local-only draft AX/Sismetic PUSH batch' })
  @ApiHeader({ name: 'x-ax-mock-key', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiAcceptedResponse({ schema: openApiSchema(axMockBatchSchema) })
  async receive(
    @Body(new ZodValidationPipe(receiveAxMockBatchSchema)) body: ReceiveAxMockBatchInput,
    @Headers('idempotency-key') idempotencyKeyHeader: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AxMockBatchDto> {
    const idempotencyKey = parseIdempotencyKey(idempotencyKeyHeader);
    const batch = await this.receiveBatch.execute(body, idempotencyKey);
    response.setHeader(
      'Location',
      `${API_PREFIX}/integrations/ax/mock/batches/${encodeURIComponent(batch.batchId)}`,
    );
    return toAxMockBatchDto(batch);
  }

  @Get('batches/:batchId')
  @ApiOperation({ summary: 'Read a batch retained by the local AX mock process' })
  @ApiHeader({ name: 'x-ax-mock-key', required: true })
  @ApiOkResponse({ schema: openApiSchema(axMockBatchSchema) })
  async findOne(
    @Param('batchId', new ZodValidationPipe(axMockBatchIdSchema)) batchId: string,
  ): Promise<AxMockBatchDto> {
    return toAxMockBatchDto(await this.getBatch.execute(batchId));
  }
}

function parseIdempotencyKey(value: unknown): string {
  const parsed = axMockIdempotencyKeySchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ValidationError('Invalid idempotency-key header', {
    issues: parsed.error.issues.map((issue) => ({ message: issue.message })),
  });
}

function toAxMockBatchDto(batch: StoredAxMockBatch): AxMockBatchDto {
  return {
    schemaVersion: batch.schemaVersion,
    batchId: batch.batchId,
    sentAt: batch.sentAt,
    receivedAt: batch.receivedAt,
    status: batch.status,
    totals: { ...batch.totals },
    records: batch.records.map((record) => ({
      ...record,
      issues: record.issues.map((issue) => ({ ...issue })),
    })),
    correlationId: batch.correlationId,
  };
}
