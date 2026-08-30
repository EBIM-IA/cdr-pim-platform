import { Controller, Get, HttpCode, Inject } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { ApiEnv } from '@cdr/config';
import {
  type LivenessResponse,
  type ReadinessResponse,
  livenessResponseSchema,
  readinessResponseSchema,
} from '@cdr/contracts';
import type { Response } from 'express';
import { Res } from '@nestjs/common';

import { openApiSchema } from '../../../shared/http/openapi';
import { API_ENV } from '../../../shared/tokens';
import { type CheckReadinessUseCase } from '../application/check-readiness.use-case';

/**
 * Two probes with two different jobs:
 *
 *  - `/health/live`  — "is this process wedged?" Never touches a dependency, because a
 *    database outage must not make ECS kill and restart every task.
 *  - `/health/ready` — "should the load balancer send me traffic?" Checks dependencies and
 *    answers 503 when it cannot serve, which drains the target instead of failing requests.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly checkReadiness: CheckReadinessUseCase,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — process is running' })
  @ApiOkResponse({ schema: openApiSchema(livenessResponseSchema) })
  live(): LivenessResponse {
    return {
      status: 'ok',
      service: this.env.SERVICE_NAME,
      version: this.env.APP_VERSION,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
    };
  }

  @Get('ready')
  @HttpCode(200)
  @ApiOperation({ summary: 'Readiness probe — dependencies are reachable' })
  @ApiOkResponse({ schema: openApiSchema(readinessResponseSchema) })
  @ApiServiceUnavailableResponse({ description: 'At least one dependency is down' })
  async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponse> {
    const report = await this.checkReadiness.execute();
    response.status(report.status === 'up' ? 200 : 503);
    return report;
  }
}
