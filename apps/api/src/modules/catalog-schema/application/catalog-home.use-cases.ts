import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CatalogHomeSettingsDto } from '@cdr/contracts';
import { ConflictError, ForbiddenError, getCorrelationId, newUuid, type Clock } from '@cdr/shared';
import { CLOCK } from '../../../shared/tokens';
import { createAuditEntry } from '../../audit/domain/entities/audit-entry';
import {
  actorHasCapability,
  Capability,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import {
  CATALOG_HOME_SETTINGS,
  type CatalogHomeSettingsPort,
} from '../domain/ports/catalog-home-settings.port';
@Injectable()
export class CatalogHomeUseCases {
  constructor(
    @Inject(CATALOG_HOME_SETTINGS) private readonly settings: CatalogHomeSettingsPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  get() {
    return this.settings.get();
  }
  async save(input: CatalogHomeSettingsDto, actor: AuthenticatedActor) {
    if (!actorHasCapability(actor, Capability.AdministrationManage))
      throw new ForbiddenError('Solo ADMINISTRADOR configura el Inicio');
    const previous = await this.settings.get();
    if (previous.version !== input.version)
      throw new ConflictError('Otra persona cambió el Inicio. Recarga antes de guardar.');
    const summarize = (config: CatalogHomeSettingsDto['config']) =>
      Object.fromEntries(
        Object.entries(config).map(([key, values]) => [
          key,
          values.map(({ image, ...entry }) => ({
            ...entry,
            hasImage: Boolean(image),
            imageFingerprint: image ? createHash('sha256').update(image).digest('hex') : null,
          })),
        ]),
      );
    return this.settings.save(
      input,
      createAuditEntry({
        resourceType: 'catalog_home_settings',
        resourceId: 'catalog-home',
        action: 'updated',
        actorId: actor.id,
        source: 'api:catalog-home',
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt: this.clock.now(),
        changes: { inicio: { before: summarize(previous.config), after: summarize(input.config) } },
      }),
    );
  }
}
