import { Inject, Injectable } from '@nestjs/common';
import type { BulkValidateCodeAffixesInput } from '@cdr/contracts';
import { ForbiddenError, isDomainError } from '@cdr/shared';
import {
  Capability,
  actorHasCapability,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import {
  CODE_AFFIX_REPOSITORY,
  type CodeAffixRepositoryPort,
} from '../domain/ports/code-affix.repository.port';
import { ValidateCodeAffixUseCase } from './manage-code-affixes.use-cases';
@Injectable()
export class BulkValidateCodeAffixesUseCase {
  constructor(
    @Inject(CODE_AFFIX_REPOSITORY) private readonly repository: CodeAffixRepositoryPort,
    private readonly validate: ValidateCodeAffixUseCase,
  ) {}
  async execute(input: BulkValidateCodeAffixesInput, actor: AuthenticatedActor) {
    if (!actorHasCapability(actor, Capability.AdministrationManage))
      throw new ForbiddenError('Solo Administración valida afijos.');
    const items = [],
      errors = [];
    for (const item of input.items) {
      const rule = await this.repository.findById(
        item.id as Parameters<CodeAffixRepositoryPort['findById']>[0],
      );
      const snapshot = rule?.toSnapshot();
      if (
        !snapshot ||
        !snapshot.active ||
        snapshot.status !== 'pending_validation' ||
        snapshot.source !== 'ai_suggestion' ||
        (snapshot.confidence ?? 0) < 0.9 ||
        !snapshot.evidence
      ) {
        errors.push({
          id: item.id,
          message:
            'Solo se validan sugerencias IA pendientes, activas, con evidencia y confianza ≥ 90 %.',
        });
        continue;
      }
      try {
        items.push(
          await this.validate.execute(
            item.id,
            { expectedUpdatedAt: item.expectedUpdatedAt, decision: 'validated' },
            actor,
          ),
        );
      } catch (error) {
        if (!isDomainError(error)) throw error;
        errors.push({ id: item.id, message: error.message });
      }
    }
    return { items, errors };
  }
}
