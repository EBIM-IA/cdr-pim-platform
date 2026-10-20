import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AiCommercialProposalRequest,
  type AiCommercialProposalResponse,
  type AiExtractionCandidatesRequest,
  type AiExtractionCandidatesResponse,
  aiCommercialProposalRequestSchema,
  aiCommercialProposalResponseSchema,
  aiExtractionCandidatesRequestSchema,
  aiExtractionCandidatesResponseSchema,
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
    private readonly generateProposal: GenerateCommercialProposalUseCase,
    private readonly extractCandidates: ExtractAssetCandidatesUseCase,
  ) {}

  @Post('products/:productId/commercial-proposal')
  @HttpCode(200)
  @RateLimit('ai')
  @ApiOperation({
    summary: 'Generate a non-persisted commercial-copy candidate for one product',
  })
  @ApiOkResponse({ schema: openApiSchema(aiCommercialProposalResponseSchema) })
  async commercialProposal(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(aiCommercialProposalRequestSchema))
    body: AiCommercialProposalRequest,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<AiCommercialProposalResponse> {
    const result = await this.generateProposal.execute(productId, body, actor);
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
      persisted: false,
      requiresHumanReview: true,
    };
  }

  @Post('assets/:assetId/extraction-candidates')
  @HttpCode(200)
  @RateLimit('ai')
  @RequireCapabilities(Capability.CatalogRead, Capability.AiDocumentExtract)
  @ApiOperation({
    summary: 'Extract non-persisted attribute candidates from an existing private asset',
  })
  @ApiOkResponse({ schema: openApiSchema(aiExtractionCandidatesResponseSchema) })
  async extractionCandidates(
    @Param('assetId') assetId: string,
    @Body(new ZodValidationPipe(aiExtractionCandidatesRequestSchema))
    body: AiExtractionCandidatesRequest,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<AiExtractionCandidatesResponse> {
    const result = await this.extractCandidates.execute(assetId, body, actor);
    return {
      assetId: result.assetId,
      productId: result.productId,
      sku: result.sku,
      filename: result.filename,
      model: result.model,
      candidates: [...result.candidates],
      persisted: false,
      requiresHumanReview: true,
    };
  }
}
