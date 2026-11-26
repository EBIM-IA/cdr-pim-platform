import { BootstrapCodeAffixesUseCase } from '../application/bootstrap-code-affixes.use-case';
import { SearchAssistantUseCase } from '../application/search-assistant.use-case';
import { Inject } from '@nestjs/common';
import {
  QUALITY_CANDIDATE_CAPTURE,
  type QualityCandidateCapturePort,
} from '../../quality/domain/ports/quality-candidate-capture.port';
import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AiCommercialProposalRequest,
  type AiCommercialProposalResponse,
  type AiExtractionCandidatesRequest,
  type AiExtractionCandidatesResponse,
  type AiSearchAssistantRequest,
  type BootstrapCodeAffixesInput,
  aiCommercialProposalRequestSchema,
  aiCommercialProposalResponseSchema,
  aiExtractionCandidatesRequestSchema,
  aiExtractionCandidatesResponseSchema,
  aiSearchAssistantRequestSchema,
  bootstrapCodeAffixesResultSchema,
  bootstrapCodeAffixesSchema,
} from '@cdr/contracts';

import { RequireCapabilities } from '../../../shared/http/capability.decorator';
import { openApiSchema } from '../../../shared/http/openapi';
import { RateLimit } from '../../../shared/http/rate-limit';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { CurrentActor } from '../../../shared/http/current-actor.decorator';
import { type AuthenticatedActor, Capability } from '../../identity/domain/entities/role';
import {
  ExtractAssetCandidatesUseCase,
  GenerateCommercialProposalUseCase,
} from '../application/generate-ai-candidates.use-cases';

@ApiTags('ai-quality')
@Controller('ai')
@RequireCapabilities(Capability.CatalogRead, Capability.AiQualityExecute)
export class AiController {
  constructor(
    private readonly bootstrapAffixes: BootstrapCodeAffixesUseCase,
    private readonly searchAssistant: SearchAssistantUseCase,
    private readonly generateProposal: GenerateCommercialProposalUseCase,
    private readonly extractCandidates: ExtractAssetCandidatesUseCase,
    @Inject(QUALITY_CANDIDATE_CAPTURE) private readonly capture: QualityCandidateCapturePort,
  ) {}

  @Post('code-affixes/bootstrap')
  @HttpCode(200)
  @RateLimit('ai')
  @RequireCapabilities(Capability.AdministrationManage)
  @ApiOperation({ summary: 'Suggest reviewable code affixes from documents or catalog codes' })
  @ApiBody({ schema: openApiSchema(bootstrapCodeAffixesSchema) })
  @ApiOkResponse({ schema: openApiSchema(bootstrapCodeAffixesResultSchema) })
  async bootstrap(
    @Body(new ZodValidationPipe(bootstrapCodeAffixesSchema)) body: BootstrapCodeAffixesInput,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    const result = await this.bootstrapAffixes.execute(body, actor);
    return {
      ...result,
      items: result.items.map((rule) => {
        const value = rule.toSnapshot();
        return {
          ...value,
          createdAt: value.createdAt.toISOString(),
          updatedAt: value.updatedAt.toISOString(),
          validatedAt: value.validatedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  @Post('search-assistant')
  @HttpCode(200)
  @RateLimit('ai')
  search(
    @Body(new ZodValidationPipe(aiSearchAssistantRequestSchema)) body: AiSearchAssistantRequest,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.searchAssistant.execute(body, actor);
  }

  @Post('products/:productId/commercial-proposal')
  @HttpCode(200)
  @RateLimit('ai')
  @ApiOperation({
    summary: 'Generate a persisted, reviewable commercial-copy candidate for one product',
  })
  @ApiOkResponse({ schema: openApiSchema(aiCommercialProposalResponseSchema) })
  async commercialProposal(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(aiCommercialProposalRequestSchema))
    body: AiCommercialProposalRequest,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<AiCommercialProposalResponse> {
    const result = await this.generateProposal.execute(productId, body, actor);
    const reviewIds = await this.capture.captureCommercial(result, actor);
    return {
      productId: result.productId,
      sku: result.sku,
      channel: result.channel,
      model: result.model,
      proposal: result.proposal,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
      persisted: true,
      reviewIds,
      requiresHumanReview: true,
    };
  }

  @Post('assets/:assetId/extraction-candidates')
  @HttpCode(200)
  @RateLimit('ai')
  @RequireCapabilities(Capability.CatalogRead, Capability.AiDocumentExtract)
  @ApiOperation({
    summary: 'Extract persisted, reviewable attribute candidates from an existing private asset',
  })
  @ApiOkResponse({ schema: openApiSchema(aiExtractionCandidatesResponseSchema) })
  async extractionCandidates(
    @Param('assetId') assetId: string,
    @Body(new ZodValidationPipe(aiExtractionCandidatesRequestSchema))
    body: AiExtractionCandidatesRequest,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<AiExtractionCandidatesResponse> {
    const result = await this.extractCandidates.execute(assetId, body, actor);
    const reviewIds = await this.capture.captureExtraction(result, actor);
    return {
      assetId: result.assetId,
      productId: result.productId,
      sku: result.sku,
      filename: result.filename,
      model: result.model,
      candidates: [...result.candidates],
      persisted: true,
      reviewIds,
      requiresHumanReview: true,
    };
  }
}
