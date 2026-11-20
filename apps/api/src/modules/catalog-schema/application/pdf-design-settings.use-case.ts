import { Inject, Injectable } from '@nestjs/common';
import type { PdfDesignSettingsDto } from '@cdr/contracts';
import { ForbiddenError, getCorrelationId, newUuid, type Clock } from '@cdr/shared';
import { CLOCK } from '../../../shared/tokens';
import { AuditAction, createAuditEntry } from '../../audit/domain/entities/audit-entry';
import {
  actorHasCapability,
  Capability,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import {
  PDF_DESIGN_SETTINGS,
  type PdfDesignSettingsPort,
} from '../domain/ports/pdf-design-settings.port';
@Injectable()
export class PdfDesignSettingsUseCase {
  constructor(
    @Inject(PDF_DESIGN_SETTINGS) private readonly settings: PdfDesignSettingsPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  get() {
    return this.settings.get();
  }
  async save(input: PdfDesignSettingsDto, actor: AuthenticatedActor) {
    if (!actorHasCapability(actor, Capability.AdministrationManage))
      throw new ForbiddenError('Solo ADMINISTRADOR puede modificar el diseño de las fichas PDF');
    const before = await this.settings.get();
    return this.settings.save(
      input,
      createAuditEntry({
        resourceType: 'pdf_design',
        resourceId: 'default',
        action: AuditAction.Updated,
        actorId: actor.id,
        source: 'api:pdf-design',
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt: this.clock.now(),
        changes: {
          configuration: { before: auditSummary(before.config), after: auditSummary(input.config) },
        },
      }),
    );
  }
}
// Uploaded font/logo bytes are stored once in settings; audit keeps their names and sizes.
function auditSummary(config: PdfDesignSettingsDto['config']) {
  return JSON.parse(
    JSON.stringify(config, (_key, value: unknown) =>
      typeof value === 'string' && value.startsWith('data:')
        ? `[archivo: ${value.length} caracteres]`
        : value,
    ),
  ) as unknown;
}
