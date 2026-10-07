import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
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
import { ExportAuditChangesUseCase } from '../application/export-audit-changes.use-case';
import { ListAuditChangesUseCase } from '../application/list-audit-changes.use-case';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit/changes')
@RequireCapabilities(Capability.AuditRead)
export class AuditController {
  constructor(
    private readonly listAuditChanges: ListAuditChangesUseCase,
    private readonly exportAuditChanges: ExportAuditChangesUseCase,
  ) {}

  @Get('export')
  @ApiOperation({ summary: 'Export filtered immutable business changes as CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'UTF-8 CSV separated with semicolons' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="auditoria.csv"')
  export(
    @Query(new ZodValidationPipe(auditChangeListQuerySchema)) query: AuditChangeListQuery,
  ): Promise<string> {
    return this.exportAuditChanges.execute(query);
  }

  @Get()
  @ApiOperation({ summary: 'List immutable field-level business changes' })
  @ApiOkResponse({ schema: openApiSchema(auditChangeListSchema) })
  list(
    @Query(new ZodValidationPipe(auditChangeListQuerySchema)) query: AuditChangeListQuery,
  ): Promise<AuditChangeListDto> {
    return this.listAuditChanges.execute(query);
  }
}
