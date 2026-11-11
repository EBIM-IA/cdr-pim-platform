import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createUnifiedCodeRequestSchema,
  updateUnifiedCodeRequestSchema,
  type CreateUnifiedCodeRequestInput,
  type UpdateUnifiedCodeRequestInput,
} from '@cdr/contracts';
import { z } from 'zod';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability, type AuthenticatedActor } from '../../identity/domain/entities/role';
import { UnifiedCodeRequestsUseCase } from '../application/unified-code-requests.use-case';
import type { UnifiedCodeRequest } from '../domain/ports/unified-code-requests.port';
@Controller('equivalences/code-requests')
@RequireCapabilities(Capability.AdministrationManage)
export class UnifiedCodeRequestsController {
  constructor(private readonly requests: UnifiedCodeRequestsUseCase) {}
  @Get()
  async list(
    @Query('sku', new ZodValidationPipe(z.string().trim().min(1).max(100).optional()))
    sku: string | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return (await this.requests.list(sku, actor)).map(toDto);
  }
  @Post()
  async create(
    @Body(new ZodValidationPipe(createUnifiedCodeRequestSchema))
    body: CreateUnifiedCodeRequestInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return toDto(await this.requests.create(body, actor));
  }
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUnifiedCodeRequestSchema))
    body: UpdateUnifiedCodeRequestInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return toDto(await this.requests.update(id, body, actor));
  }
}
function toDto(row: UnifiedCodeRequest) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
