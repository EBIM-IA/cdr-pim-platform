import { Inject, Injectable } from '@nestjs/common';
import { type Clock, ConflictError, ForbiddenError, getCorrelationId, newUuid } from '@cdr/shared';
import { CLOCK } from '../../../shared/tokens';
import {
  Capability,
  actorHasCapability,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import {
  validateApplicationColumns,
  type ApplicationAdditionalColumn,
} from '../domain/entities/application-columns';
import {
  APPLICATION_COLUMN_SETTINGS,
  type ApplicationColumnSettingsPort,
} from '../domain/ports/application-column-settings.port';
@Injectable()
export class ApplicationColumnSettingsUseCases {
  constructor(
    @Inject(APPLICATION_COLUMN_SETTINGS) private readonly settings: ApplicationColumnSettingsPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  get() {
    return this.settings.get();
  }
  async update(
    input: { columns: readonly ApplicationAdditionalColumn[]; expectedVersion: number },
    actor: AuthenticatedActor,
  ) {
    if (!actorHasCapability(actor, Capability.AdministrationManage))
      throw new ForbiddenError('Solo Administrador puede configurar columnas de aplicaciones');
    validateApplicationColumns(input.columns);
    const result = await this.settings.update(input.columns, input.expectedVersion, {
      actorId: actor.id,
      correlationId: getCorrelationId() ?? newUuid(),
      occurredAt: this.clock.now(),
    });
    if (!result)
      throw new ConflictError(
        'Otra persona modificó las columnas de aplicaciones. Recarga y vuelve a intentar.',
      );
    return result;
  }
}
