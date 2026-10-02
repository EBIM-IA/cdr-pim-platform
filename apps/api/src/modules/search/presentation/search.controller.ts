import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type SemanticSearchQuery,
  type SemanticSearchResponse,
  semanticSearchQuerySchema,
  semanticSearchResponseSchema,
} from '@cdr/contracts';

import { openApiSchema } from '../../../shared/http/openapi';
import { RequireRole } from '../../../shared/http/role.decorator';
import { RateLimit } from '../../../shared/http/rate-limit';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { Role } from '../../identity/domain/entities/role';
import { IndexProductUseCase } from '../application/index-product.use-case';
import { SemanticSearchUseCase } from '../application/semantic-search.use-case';

@ApiTags('search')
@Controller('search')
@RequireRole(Role.Viewer)
export class SearchController {
  constructor(
    private readonly semanticSearch: SemanticSearchUseCase,
    private readonly indexProduct: IndexProductUseCase,
  ) {}

  @Get('semantic')
  @RateLimit('ai')
  @ApiOperation({ summary: 'Nearest-neighbour product search over pgvector embeddings' })
  @ApiOkResponse({ schema: openApiSchema(semanticSearchResponseSchema) })
  async search(
    @Query(new ZodValidationPipe(semanticSearchQuerySchema)) query: SemanticSearchQuery,
  ): Promise<SemanticSearchResponse> {
    const result = await this.semanticSearch.execute(query.q, query.limit);
    return {
      query: query.q,
      model: result.model,
      dimensions: result.dimensions,
      hits: result.hits.map((hit) => ({
        productId: hit.productId,
        sku: hit.sku,
        name: hit.name,
        score: hit.score,
      })),
    };
  }

  /**
   * Synchronous re-indexing of a single product.
   *
   * Exists so the walking skeleton can be driven from a browser. Bulk re-indexing of the
   * whole catalog is an asynchronous `AI_EMBEDDING` job by design — it must never be a
   * request that an ALB can time out.
   */
  @Post('index/:productId')
  @RateLimit('index')
  @RequireRole(Role.Editor)
  @HttpCode(200)
  @ApiOperation({ summary: 'Index (or re-index) one product embedding synchronously' })
  async index(@Param('productId') productId: string) {
    return this.indexProduct.execute(productId);
  }
}
