import { Inject, Injectable } from '@nestjs/common';
import type { AuditChangeListDto, AuditChangeListQuery } from '@cdr/contracts';

import { AUDIT_READ_PORT, type AuditReadPort } from '../domain/ports/audit-read.port';

@Injectable()
export class ListAuditChangesUseCase {
  constructor(@Inject(AUDIT_READ_PORT) private readonly audit: AuditReadPort) {}

  async execute(query: AuditChangeListQuery): Promise<AuditChangeListDto> {
    const result = await this.audit.listChanges({
      ...query,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    return {
      items: result.items.map((item) => ({
        ...item,
        previousValueValidFrom: item.previousValueValidFrom?.toISOString() ?? null,
        occurredAt: item.occurredAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }
}
