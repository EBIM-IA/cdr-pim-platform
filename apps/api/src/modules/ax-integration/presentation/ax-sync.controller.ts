import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AX_SYNC_ROUTE,
  type AxSyncAcceptedResponse,
  type AxSyncRequest,
  axSyncAcceptedResponseSchema,
  axSyncRequestSchema,
} from '@cdr/contracts';

import { openApiSchema } from '../../../shared/http/openapi';
import { RateLimit } from '../../../shared/http/rate-limit';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ReceiveAxBatchUseCase } from '../application/receive-ax-batch.use-case';
import { AxIntegrationRoute } from './ax-integration-route.decorator';
import { AX_QAS_MOCK_HEADER } from './guards/ax-integration-auth.guard';

/**
 * Sismetic / Dynamics AX → PIM, contract v1.1 — TEMPORARY QAS MOCK.
 *
 * The Spanish route is part of the contract delivered to Sismetic: never rename it. This is
 * a master-system integration, deliberately separate from ProductsController (human
 * catalog editing) and ImportsController (file imports).
 *
 * There is no `GET /productos/sincronizaciones/{idLote}` yet: a status needs storage, and
 * an in-memory one would invent states that vanish between tasks (STATUS_ENDPOINT =
 * PENDING_DB_PHASE).
 */
@ApiTags('ax-integration')
@ApiBearerAuth()
@Controller(AX_SYNC_ROUTE.controller)
@AxIntegrationRoute()
export class AxSyncController {
  constructor(private readonly receiveAxBatch: ReceiveAxBatchUseCase) {}

  @Post(AX_SYNC_ROUTE.action)
  @HttpCode(202)
  @RateLimit('integration')
  @Header('Cache-Control', 'no-store')
  @Header(AX_QAS_MOCK_HEADER, 'true')
  @ApiOperation({
    summary: 'Receive an AX product batch (QAS mock: validated and queued, not persisted)',
  })
  @ApiAcceptedResponse({ schema: openApiSchema(axSyncAcceptedResponseSchema) })
  async sincronizar(
    @Body(new ZodValidationPipe(axSyncRequestSchema)) batch: AxSyncRequest,
  ): Promise<AxSyncAcceptedResponse> {
    return axSyncAcceptedResponseSchema.parse(await this.receiveAxBatch.execute(batch));
  }
}
