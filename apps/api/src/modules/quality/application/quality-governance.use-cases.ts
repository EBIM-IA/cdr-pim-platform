import { Inject, Injectable } from '@nestjs/common';
import {
  type QualitySourcePriorityInput,
  type QualityDecisionInput,
  type QualityConflictInput,
  type QualityReviewDto,
  type QualityReviewQuery,
} from '@cdr/contracts';
import {
  assertUuid,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  newUuid,
  getCorrelationId,
  type Clock,
} from '@cdr/shared';
import {
  DUPLICATE_CANDIDATES,
  type DuplicateCandidatesPort,
} from '../../catalog/domain/ports/duplicate-candidates.port';
import { CLOCK } from '../../../shared/tokens';
import { createAuditEntry } from '../../audit/domain/entities/audit-entry';
import {
  DYNAMIC_CATALOG_REPOSITORY,
  type DynamicCatalogRepositoryPort,
} from '../../catalog-schema/domain/ports/dynamic-catalog.repository.port';
import {
  CATALOG_ADMINISTRATION_REPOSITORY,
  type CatalogAdministrationRepositoryPort,
} from '../../catalog-schema/domain/ports/catalog-administration.repository.port';
import {
  validateAttributeValue,
  type TemplateAttribute,
} from '../../catalog-schema/domain/entities/catalog-schema';
import {
  PRODUCT_REPOSITORY,
  type ProductRepositoryPort,
} from '../../catalog/domain/ports/product-repository.port';
import {
  Capability,
  actorHasCapability,
  normalizeBusinessRole,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import {
  QUALITY_GOVERNANCE,
  type QualityGovernancePort,
  type QualityAttributeApplication,
} from '../domain/ports/quality-governance.port';

@Injectable()
export class QualityGovernanceUseCases {
  constructor(
    @Inject(QUALITY_GOVERNANCE) private readonly reviews: QualityGovernancePort,
    @Inject(DYNAMIC_CATALOG_REPOSITORY) private readonly catalog: DynamicCatalogRepositoryPort,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DUPLICATE_CANDIDATES) private readonly duplicates: DuplicateCandidatesPort,
    @Inject(CATALOG_ADMINISTRATION_REPOSITORY)
    private readonly administration: CatalogAdministrationRepositoryPort,
  ) {}
  private allowed(actor: AuthenticatedActor) {
    if (!actorHasCapability(actor, Capability.AiQualityExecute))
      throw new ForbiddenError('Este perfil solo puede consultar el catálogo.');
  }
  productChanges(query: { page: number; pageSize: number }, actor: AuthenticatedActor) {
    this.allowed(actor);
    return this.reviews.productChanges(query);
  }
  completeness(actor: AuthenticatedActor) {
    this.allowed(actor);
    return this.reviews.completeness();
  }
  list(query: QualityReviewQuery, actor: AuthenticatedActor) {
    this.allowed(actor);
    return this.reviews.list(query);
  }
  async get(id: string, actor: AuthenticatedActor) {
    this.allowed(actor);
    const item = await this.reviews.find(assertUuid(id));
    if (!item) throw new NotFoundError('QualityReview', id);
    return item;
  }
  private base(productId: string, sku: string, actor: AuthenticatedActor): QualityReviewDto {
    const now = this.clock.now().toISOString();
    return {
      id: newUuid(),
      kind: 'attribute',
      productId,
      sku,
      attributeKey: null,
      currentValue: null,
      attributeVersion: 0,
      candidates: [],
      proposedIndex: null,
      chosenIndex: null,
      chosenValue: null,
      override: false,
      assetId: null,
      model: null,
      channel: null,
      productB: null,
      status: 'pending',
      duplicateDecision: null,
      reason: null,
      requestedBy: actor.email,
      decidedBy: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
  }
  private audit(item: QualityReviewDto, actor: AuthenticatedActor, before?: QualityReviewDto) {
    return createAuditEntry({
      resourceType: 'quality_review',
      resourceId: item.id,
      action: before ? 'updated' : 'created',
      actorId: actor.id,
      source: 'api:quality-governance',
      correlationId: getCorrelationId() ?? newUuid(),
      occurredAt: this.clock.now(),
      changes: {
        status: { before: before?.status, after: item.status },
        sku: { after: item.sku },
        attribute: { after: item.attributeKey },
        chosenValue: { before: before?.chosenValue, after: item.chosenValue },
        reason: { after: item.reason },
        override: { after: item.override },
        duplicateDecision: { after: item.duplicateDecision },
        version: { before: before?.version, after: item.version },
      },
    });
  }
  async captureExtraction(
    result: {
      productId: string;
      sku: string;
      assetId: string;
      filename: string;
      model: string;
      baseline?: Readonly<
        Record<string, { value: string | number | boolean | null; version: number }>
      >;
      candidates: readonly { key: string; value: string; confidence: number }[];
    },
    actor: AuthenticatedActor,
  ) {
    this.allowed(actor);
    const sheet = await this.catalog.getProductSheet(
      assertUuid(result.productId),
      actor.roles.map(normalizeBusinessRole),
    );
    if (!sheet) throw new NotFoundError('ProductAttributeSheet', result.productId);
    const items = result.candidates.map((candidate) => ({
      ...this.base(result.productId, result.sku, actor),
      attributeKey: candidate.key,
      currentValue: result.baseline?.[candidate.key]
        ? result.baseline[candidate.key]!.value
        : (sheet.product.attributes[candidate.key]?.value ?? null),
      attributeVersion:
        result.baseline?.[candidate.key]?.version ??
        sheet.product.attributes[candidate.key]?.version ??
        0,
      assetId: result.assetId,
      model: result.model,
      candidates: [
        {
          source: 'ai' as const,
          value: candidate.value,
          evidence: result.filename,
          confidence: candidate.confidence,
        },
      ],
      proposedIndex: 0,
    }));
    if (items[0]) await this.reviews.create(items, this.audit(items[0], actor));
    return items.map((item) => item.id);
  }
  async captureCommercial(
    result: {
      productId: string;
      sku: string;
      channel: 'b2c' | 'b2b';
      model: string;
      proposal: string;
      technicalDescription?: string | null;
    },
    actor: AuthenticatedActor,
  ) {
    this.allowed(actor);
    const product = await this.products.findById(assertUuid(result.productId));
    if (!product) throw new NotFoundError('Product', result.productId);
    const item: QualityReviewDto = {
      ...this.base(product.id, product.sku, actor),
      kind: 'commercial',
      currentValue:
        result.technicalDescription !== undefined
          ? result.technicalDescription
          : product.description,
      channel: result.channel,
      model: result.model,
      candidates: [
        {
          source: 'ai',
          value: result.proposal,
          evidence: `Propuesta ${result.channel.toUpperCase()}`,
          confidence: null,
        },
      ],
      proposedIndex: 0,
    };
    await this.reviews.create([item], this.audit(item, actor));
    return [item.id];
  }
  async createConflict(input: QualityConflictInput, actor: AuthenticatedActor) {
    this.allowed(actor);
    const sheet = await this.catalog.getProductSheet(
      assertUuid(input.productId),
      actor.roles.map(normalizeBusinessRole),
    );
    const definition = sheet?.schema.attributes.find(
      (attribute) => attribute.key === input.attributeKey && attribute.permissions.edit,
    );
    if (!sheet || !definition)
      throw new NotFoundError('Editable product attribute', input.attributeKey);
    if (definition.sourceAuthority !== 'pim')
      throw new ForbiddenError('Los datos ERP no compiten entre fuentes.');
    for (const candidate of input.candidates)
      validateAttributeValue(definition, candidate.value, false);
    const categories = await this.administration.listCategories(false);
    const category = categories.find((entry) => entry.id === sheet.schema.category.id);
    const ranks = input.candidates.map((candidate) =>
      candidate.source === 'ai' ? undefined : category?.sourcePriority[candidate.source],
    );
    const confirmed = ranks
      .flatMap((rank, index) => (rank === undefined ? [] : [{ index, rank }]))
      .sort((a, b) => a.rank - b.rank);
    const item: QualityReviewDto = {
      ...this.base(input.productId, sheet.product.sku, actor),
      attributeKey: input.attributeKey,
      currentValue: sheet.product.attributes[input.attributeKey]?.value ?? null,
      attributeVersion: sheet.product.attributes[input.attributeKey]?.version ?? 0,
      candidates: input.candidates,
      proposedIndex: confirmed[0]?.index ?? null,
    };
    await this.reviews.create([item], this.audit(item, actor));
    return item;
  }
  async updatePriority(input: QualitySourcePriorityInput, actor: AuthenticatedActor) {
    this.allowed(actor);
    const categories = await this.administration.listCategories(true);
    const previous = categories.find((category) => category.id === input.categoryId);
    if (!previous) throw new NotFoundError('Category', input.categoryId);
    await this.reviews.updatePriority(
      input,
      createAuditEntry({
        resourceType: 'catalog_category',
        resourceId: input.categoryId,
        action: 'updated',
        actorId: actor.id,
        source: 'api:quality-source-priority',
        correlationId: getCorrelationId() ?? newUuid(),
        occurredAt: this.clock.now(),
        changes: {
          sourcePriority: { before: previous.sourcePriority, after: input.priority },
          reason: { after: input.reason },
        },
      }),
    );
    return { updated: true as const };
  }
  async detect(actor: AuthenticatedActor) {
    this.allowed(actor);
    const pairs = await this.duplicates.detect();
    let created = 0;
    for (const pair of pairs) {
      const existing = await this.reviews.list({
        kind: 'duplicate',
        productId: pair.productA.id,
        page: 1,
        pageSize: 100,
      });
      if (existing.items.some((item) => item.productB?.id === pair.productB.id)) continue;
      const item: QualityReviewDto = {
        ...this.base(pair.productA.id, pair.productA.sku, actor),
        kind: 'duplicate',
        currentValue: pair.productA.name,
        productB: pair.productB,
        candidates: [
          {
            source: 'manual',
            value: pair.productA.name,
            evidence: pair.evidence,
            confidence: null,
          },
        ],
      };
      await this.reviews.create([item], this.audit(item, actor));
      created += 1;
    }
    return { created, scanned: pairs.length };
  }
  async decide(id: string, input: QualityDecisionInput, actor: AuthenticatedActor) {
    const previous = await this.get(id, actor);
    if (previous.version !== input.version || previous.status !== 'pending')
      throw new ConflictError('La solicitud cambió o ya fue decidida. Recarga la bandeja.');
    const chosenIndex = input.chosenIndex ?? previous.proposedIndex;
    if (chosenIndex !== null && !previous.candidates[chosenIndex])
      throw new ValidationError('Selecciona un candidato válido.');
    const candidateValue = chosenIndex === null ? null : previous.candidates[chosenIndex]!.value;
    let chosenValue = input.value !== undefined ? input.value : candidateValue;
    let application: QualityAttributeApplication | undefined;
    if (input.action === 'approve' && previous.kind === 'attribute') {
      if (chosenIndex === null && input.value === undefined)
        throw new ValidationError('Selecciona un candidato o registra el valor humano.');
      const assignment = await this.catalog.findProductAttributeAssignment(
        assertUuid(previous.productId),
        previous.attributeKey!,
        actor.roles.map(normalizeBusinessRole),
      );
      if (
        !assignment ||
        !assignment.definition.permissions.edit ||
        assignment.definition.sourceAuthority !== 'pim'
      )
        throw new ForbiddenError('El atributo ya no es editable por este perfil.');
      chosenValue = coerceCandidate(assignment.definition, chosenValue);
      validateAttributeValue(assignment.definition, chosenValue, false);
      application = {
        productId: assertUuid(previous.productId),
        attributeKey: previous.attributeKey!,
        value: chosenValue,
        expectedVersion: previous.attributeVersion,
        source:
          input.value !== undefined
            ? 'manual'
            : previous.candidates[chosenIndex!]?.source === 'ai'
              ? 'document_extraction'
              : 'manual',
        roles: actor.roles.map(normalizeBusinessRole),
        now: this.clock.now(),
        actorId: actor.id,
        correlationId: getCorrelationId() ?? newUuid(),
      };
    }
    if (previous.kind === 'duplicate' && input.action === 'approve' && !input.duplicateDecision)
      throw new ValidationError('La comparación necesita una decisión humana.');
    const item: QualityReviewDto = {
      ...previous,
      chosenIndex,
      chosenValue,
      override:
        chosenIndex !== previous.proposedIndex ||
        (input.value !== undefined && input.value !== candidateValue),
      status:
        input.action === 'approve'
          ? 'approved'
          : input.action === 'reject'
            ? 'rejected'
            : 'changes_requested',
      reason: input.reason,
      decidedBy: actor.email,
      duplicateDecision: previous.kind === 'duplicate' ? (input.duplicateDecision ?? null) : null,
      updatedAt: this.clock.now().toISOString(),
      version: previous.version + 1,
    };
    await this.reviews.decide(item, input.version, this.audit(item, actor, previous), application);
    return item;
  }
}

function coerceCandidate(
  definition: TemplateAttribute,
  value: string | number | boolean | null,
): string | number | boolean | null {
  if (typeof value !== 'string') return value;
  if (definition.dataType === 'number' || definition.dataType === 'measurement') {
    const suffix = definition.unit?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `^([+-]?\\d+(?:[.,]\\d+)?)\\s*${suffix ? `(?:${suffix})?` : ''}$`,
      'i',
    );
    const match = value.trim().match(pattern);
    if (!match)
      throw new ValidationError(
        `El candidato de ${definition.label} necesita un número válido${definition.unit ? ` en ${definition.unit}` : ''}. Registra un valor humano.`,
      );
    return Number(match[1]!.replace(',', '.'));
  }
  if (definition.dataType === 'boolean') {
    if (/^(?:true|si|sí|1)$/i.test(value.trim())) return true;
    if (/^(?:false|no|0)$/i.test(value.trim())) return false;
  }
  return value;
}
