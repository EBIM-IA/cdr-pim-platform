import { Inject, Injectable } from '@nestjs/common';
import type {
  CodeAffixListQuery,
  CreateCodeAffixInput,
  ParseProductCodeInput,
  UpdateCodeAffixInput,
  ValidateCodeAffixInput,
} from '@cdr/contracts';
import {
  type Clock,
  ConflictError,
  NotFoundError,
  assertUuid,
  getCorrelationId,
  newUuid,
} from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import { AuditAction, createAuditEntry } from '../../audit/domain/entities/audit-entry';
import { AUDIT_PORT, type AuditPort } from '../../audit/domain/ports/audit.port';
import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import { CodeAffix, type CodeAffixSnapshot } from '../domain/entities/code-affix';
import {
  CODE_AFFIX_REPOSITORY,
  type CodeAffixRepositoryPort,
} from '../domain/ports/code-affix.repository.port';
import { parseProductCode, type ParsedProductCode } from '../domain/services/code-parser';

@Injectable()
export class ListCodeAffixesUseCase {
  constructor(
    @Inject(CODE_AFFIX_REPOSITORY) private readonly repository: CodeAffixRepositoryPort,
  ) {}

  execute(query: CodeAffixListQuery): Promise<CodeAffix[]> {
    return this.repository.list(query);
  }
}

@Injectable()
export class CreateCodeAffixUseCase {
  constructor(
    @Inject(CODE_AFFIX_REPOSITORY) private readonly repository: CodeAffixRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async execute(input: CreateCodeAffixInput, actor: AuthenticatedActor): Promise<CodeAffix> {
    const now = this.clock.now();
    const rule = CodeAffix.create(
      {
        kind: input.kind,
        token: input.token,
        meaning: input.meaning,
        attribute: input.attribute ?? null,
        impliedValue: input.impliedValue ?? null,
        brand: input.brand ?? null,
        family: input.family ?? null,
        source: input.source,
        confidence: input.confidence ?? null,
        evidence: input.evidence ?? null,
        boreRule: input.boreRule,
        priority: input.priority,
      },
      actor.id,
      now,
    );
    await this.repository.insert(rule);
    await this.record(AuditAction.Created, actor, undefined, rule.toSnapshot(), now);
    return rule;
  }

  private async record(
    action: AuditAction,
    actor: AuthenticatedActor,
    before: CodeAffixSnapshot | undefined,
    after: CodeAffixSnapshot,
    occurredAt: Date,
  ): Promise<void> {
    await this.audit.record(
      createAuditEntry({
        resourceType: 'code_affix',
        resourceId: after.id,
        action,
        actorId: actor.id,
        source: 'api',
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt,
        changes: changes(before, after),
      }),
    );
  }
}

abstract class MutateCodeAffixUseCase {
  constructor(
    protected readonly repository: CodeAffixRepositoryPort,
    protected readonly clock: Clock,
    protected readonly audit: AuditPort,
  ) {}

  protected async load(id: string): Promise<CodeAffix> {
    const rule = await this.repository.findById(assertUuid(id, 'codeAffixId'));
    if (!rule) throw new NotFoundError('CodeAffix', id);
    return rule;
  }

  protected async persist(
    rule: CodeAffix,
    expectedUpdatedAt: Date,
    actor: AuthenticatedActor,
    before: CodeAffixSnapshot,
    action: AuditAction,
  ): Promise<CodeAffix> {
    const result = await this.repository.save(rule, expectedUpdatedAt);
    if (result.kind === 'not_found') throw new NotFoundError('CodeAffix', before.id);
    if (result.kind === 'version_conflict') {
      throw new ConflictError('The code-affix rule was modified by another request', {
        codeAffixId: before.id,
        actualUpdatedAt: result.actualUpdatedAt.toISOString(),
      });
    }
    const after = result.value.toSnapshot();
    await this.audit.record(
      createAuditEntry({
        resourceType: 'code_affix',
        resourceId: after.id,
        action,
        actorId: actor.id,
        source: 'api',
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt: after.updatedAt,
        changes: changes(before, after),
      }),
    );
    return result.value;
  }
}

@Injectable()
export class UpdateCodeAffixUseCase extends MutateCodeAffixUseCase {
  constructor(
    @Inject(CODE_AFFIX_REPOSITORY) repository: CodeAffixRepositoryPort,
    @Inject(CLOCK) clock: Clock,
    @Inject(AUDIT_PORT) audit: AuditPort,
  ) {
    super(repository, clock, audit);
  }

  async execute(
    id: string,
    input: UpdateCodeAffixInput,
    actor: AuthenticatedActor,
  ): Promise<CodeAffix> {
    const rule = await this.load(id);
    const before = rule.toSnapshot();
    const { expectedUpdatedAt, ...update } = input;
    rule.update(update, this.clock.now());
    return this.persist(rule, new Date(expectedUpdatedAt), actor, before, AuditAction.Updated);
  }
}

@Injectable()
export class ValidateCodeAffixUseCase extends MutateCodeAffixUseCase {
  constructor(
    @Inject(CODE_AFFIX_REPOSITORY) repository: CodeAffixRepositoryPort,
    @Inject(CLOCK) clock: Clock,
    @Inject(AUDIT_PORT) audit: AuditPort,
  ) {
    super(repository, clock, audit);
  }

  async execute(
    id: string,
    input: ValidateCodeAffixInput,
    actor: AuthenticatedActor,
  ): Promise<CodeAffix> {
    const rule = await this.load(id);
    const before = rule.toSnapshot();
    rule.validate(input.decision, actor.id, this.clock.now());
    return this.persist(
      rule,
      new Date(input.expectedUpdatedAt),
      actor,
      before,
      AuditAction.Updated,
    );
  }
}

@Injectable()
export class DeactivateCodeAffixUseCase extends MutateCodeAffixUseCase {
  constructor(
    @Inject(CODE_AFFIX_REPOSITORY) repository: CodeAffixRepositoryPort,
    @Inject(CLOCK) clock: Clock,
    @Inject(AUDIT_PORT) audit: AuditPort,
  ) {
    super(repository, clock, audit);
  }

  async execute(id: string, actor: AuthenticatedActor): Promise<CodeAffix> {
    const rule = await this.load(id);
    const before = rule.toSnapshot();
    rule.deactivate(this.clock.now());
    return this.persist(rule, before.updatedAt, actor, before, AuditAction.Deleted);
  }
}

@Injectable()
export class ParseProductCodeUseCase {
  constructor(
    @Inject(CODE_AFFIX_REPOSITORY) private readonly repository: CodeAffixRepositoryPort,
  ) {}

  async execute(input: ParseProductCodeInput): Promise<ParsedProductCode> {
    const rules = await this.repository.list({
      status: 'validated',
      includeInactive: false,
    });
    return parseProductCode(
      input.code,
      rules.map((rule) => rule.toSnapshot()),
      { brand: input.brand, family: input.family },
    );
  }
}

function changes(
  before: CodeAffixSnapshot | undefined,
  after: CodeAffixSnapshot,
): Readonly<Record<string, { before?: unknown; after?: unknown }>> {
  const fields = [
    'kind',
    'token',
    'meaning',
    'attribute',
    'impliedValue',
    'brand',
    'family',
    'source',
    'confidence',
    'status',
    'evidence',
    'boreRule',
    'priority',
    'active',
    'validatedBy',
    'validatedAt',
  ] as const;
  return Object.fromEntries(
    fields
      .filter((field) => before === undefined || before[field] !== after[field])
      .map((field) => [field, { before: before?.[field], after: after[field] }]),
  );
}
