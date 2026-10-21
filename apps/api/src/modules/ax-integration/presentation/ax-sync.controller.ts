import { Body, Controller, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AX_SYNC_STATUS_ROUTE,
  AX_SYNC_ROUTE,
  type AxSyncAcceptedResponse,
  type AxSyncBatchStatusResponse,
  type AxSyncRequest,
  axBatchIdSchema,
  axSyncAcceptedResponseSchema,
  axSyncBatchStatusResponseSchema,
  axSyncRequestSchema,
} from '@cdr/contracts';

import { openApiSchema } from '../../../shared/http/openapi';
import { RateLimit } from '../../../shared/http/rate-limit';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import {
  GetAxBatchStatusUseCase,
  ReceiveAxBatchUseCase,
} from '../application/receive-ax-batch.use-case';
import { AxIntegrationRoute } from './ax-integration-route.decorator';
import { AX_INBOUND_HEADER } from './guards/ax-integration-auth.guard';

/**
 * Sismetic / Dynamics AX -> PIM, contract v1.1, one-way inbound receiver.
 *
 * The Spanish route is part of the contract delivered to Sismetic: never rename it. This is
 * a master-system integration, deliberately separate from ProductsController (human
 * catalog editing) and ImportsController (file imports).
 *
 * Valid batches are stored durably before the API answers 202. Catalog mutation remains a
 * separate phase because CDR has not approved the field-level overwrite rules.
 */
@ApiTags('ax-integration')
@ApiBearerAuth()
@Controller(AX_SYNC_ROUTE.controller)
@AxIntegrationRoute()
export class AxSyncController {
  constructor(
    private readonly receiveAxBatch: ReceiveAxBatchUseCase,
    private readonly getAxBatchStatus: GetAxBatchStatusUseCase,
  ) {}

  @Post(AX_SYNC_ROUTE.action)
  @HttpCode(202)
  @RateLimit('integration')
  @Header('Cache-Control', 'no-store')
  @Header(AX_INBOUND_HEADER, 'true')
  @ApiOperation({
    summary: 'Receive and persist an AX product batch',
  })
  @ApiAcceptedResponse({ schema: openApiSchema(axSyncAcceptedResponseSchema) })
  async sincronizar(
    @Body(new ZodValidationPipe(axSyncRequestSchema)) batch: AxSyncRequest,
  ): Promise<AxSyncAcceptedResponse> {
    return axSyncAcceptedResponseSchema.parse(await this.receiveAxBatch.execute(batch));
  }

  @Get(`${AX_SYNC_STATUS_ROUTE}/:idLote`)
  @RateLimit('integration')
  @Header('Cache-Control', 'no-store')
  @Header(AX_INBOUND_HEADER, 'true')
  @ApiOperation({ summary: 'Read the durable reception status of an AX batch' })
  @ApiOkResponse({ schema: openApiSchema(axSyncBatchStatusResponseSchema) })
  async estado(
    @Param('idLote', new ZodValidationPipe(axBatchIdSchema)) idLote: string,
  ): Promise<AxSyncBatchStatusResponse> {
    return axSyncBatchStatusResponseSchema.parse(await this.getAxBatchStatus.execute(idLote));
  }
}
