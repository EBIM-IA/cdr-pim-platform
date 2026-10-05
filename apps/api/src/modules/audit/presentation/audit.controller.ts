import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AuditChangeListDto,
  type AuditChangeListQuery,
  auditChangeListQuerySchema,
  auditChangeListSchema,
} from '@cdr/contracts';

import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { openApiSchema } from '../../../shared/http/openapi';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Capability } from '../../identity/domain/entities/role';
import { ListAuditChangesUseCase } from '../application/list-audit-changes.use-case';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit/changes')
@RequireCapabilities(Capability.AuditRead)
export class AuditController {
  constructor(private readonly listAuditChanges: ListAuditChangesUseCase) {}

  @Get()
  @ApiOperation({ summary: 'List immutable field-level business changes' })
  @ApiOkResponse({ schema: openApiSchema(auditChangeListSchema) })
  list(
    @Query(new ZodValidationPipe(auditChangeListQuerySchema)) query: AuditChangeListQuery,
  ): Promise<AuditChangeListDto> {
    return this.listAuditChanges.execute(query);
  }
}
