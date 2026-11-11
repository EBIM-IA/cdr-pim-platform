import { Inject, Injectable } from '@nestjs/common';
import {
  assertUuid,
  newUuid,
  getCorrelationId,
  ForbiddenError,
  ValidationError,
  type Clock,
} from '@cdr/shared';
import { CLOCK } from '../../../shared/tokens';
import {
  actorHasCapability,
  Capability,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import {
  CATALOG_PARAMETERS,
  type CatalogParametersPort,
  type CatalogParameterKind,
} from '../domain/ports/catalog-parameters.port';
@Injectable()
export class CatalogParametersUseCase {
  constructor(
    @Inject(CATALOG_PARAMETERS) private readonly parameters: CatalogParametersPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  list(kind: CatalogParameterKind) {
    return this.parameters.list(kind);
  }
  save(
    input: {
      id?: string;
      kind: CatalogParameterKind;
      value: string;
      description: string;
      target: string | null;
      logoDataUrl: string | null;
      active: boolean;
      expectedVersion: number;
    },
    actor: AuthenticatedActor,
  ) {
    if (!actorHasCapability(actor, Capability.AdministrationManage))
      throw new ForbiddenError('Solo ADMINISTRADOR modifica parámetros');
    if (input.kind === 'synonym' && normalize(input.value) === normalize(input.target ?? ''))
      throw new ValidationError('El término y su sinónimo deben ser diferentes');
    return this.parameters.save({
      ...input,
      id: input.id ? assertUuid(input.id) : newUuid(),
      audit: {
        actorId: actor.id,
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt: this.clock.now(),
      },
    });
  }
}
function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('es');
}
