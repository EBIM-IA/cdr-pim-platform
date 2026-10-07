import { Module } from '@nestjs/common';
import { resolveAiCapabilityProviders, type ApiEnv } from '@cdr/config';

import { API_ENV } from '../../shared/tokens';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogSchemaModule } from '../catalog-schema/catalog-schema.module';
import { ProductAssetsModule } from '../product-assets/product-assets.module';
import {
  ExtractAssetCandidatesUseCase,
  GenerateCommercialProposalUseCase,
} from './application/generate-ai-candidates.use-cases';
import { DOCUMENT_EXTRACTION_PROVIDER } from './domain/ports/document-extraction-provider.port';
import { AI_DOCUMENT_POLICY } from './domain/ports/ai-policy.port';
import { EMBEDDING_PROVIDER } from './domain/ports/embedding-provider.port';
import { TEXT_GENERATION_PROVIDER } from './domain/ports/text-generation-provider.port';
import { FakeDocumentExtractionAdapter } from './infrastructure/fake/fake-document-extraction.adapter';
import { FakeEmbeddingAdapter } from './infrastructure/fake/fake-embedding.adapter';
import { FakeTextGenerationAdapter } from './infrastructure/fake/fake-text-generation.adapter';
import { OpenAiDocumentExtractionAdapter } from './infrastructure/openai/openai-document-extraction.adapter';
import { OpenAiEmbeddingAdapter } from './infrastructure/openai/openai-embedding.adapter';
import { OpenAiTextGenerationAdapter } from './infrastructure/openai/openai-text-generation.adapter';
import { createOpenAiClient } from './infrastructure/openai/openai.client';
import { AiController } from './presentation/ai.controller';

/**
 * Selects the AI adapter set from configuration.
 *
 * This module is the *entire* blast radius of an AI vendor change: adding
 * `AnthropicEmbeddingAdapter` means one new file plus one new branch here. No use case,
 * no controller and no domain type changes — that is the point of ADR-007.
 *
 * `fake` is the default so a developer with no API key, and CI, both get a working system.
 */
@Module({
  imports: [CatalogModule, CatalogSchemaModule, ProductAssetsModule],
  controllers: [AiController],
  providers: [
    {
      provide: AI_DOCUMENT_POLICY,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => ({ maxBytes: env.AI_DOCUMENT_MAX_BYTES }),
    },
    {
      provide: EMBEDDING_PROVIDER,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) =>
        resolveAiCapabilityProviders(env).embeddings === 'openai'
          ? new OpenAiEmbeddingAdapter(
              createOpenAiClient({
                apiKey: env.OPENAI_API_KEY as string,
                ...(env.OPENAI_BASE_URL ? { baseUrl: env.OPENAI_BASE_URL } : {}),
                timeoutMs: env.OPENAI_TIMEOUT_MS,
                maxRetries: env.OPENAI_MAX_RETRIES,
              }),
              env.AI_EMBEDDING_MODEL,
              env.AI_EMBEDDING_DIMENSIONS,
            )
          : new FakeEmbeddingAdapter('fake-embedding-v1', env.AI_EMBEDDING_DIMENSIONS),
    },
    {
      provide: TEXT_GENERATION_PROVIDER,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) =>
        resolveAiCapabilityProviders(env).generation === 'openai'
          ? new OpenAiTextGenerationAdapter(
              createOpenAiClient({
                apiKey: env.OPENAI_API_KEY as string,
                ...(env.OPENAI_BASE_URL ? { baseUrl: env.OPENAI_BASE_URL } : {}),
                timeoutMs: env.OPENAI_TIMEOUT_MS,
                maxRetries: env.OPENAI_MAX_RETRIES,
              }),
              env.AI_GENERATION_MODEL,
            )
          : new FakeTextGenerationAdapter(),
    },
    {
      provide: DOCUMENT_EXTRACTION_PROVIDER,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) =>
        resolveAiCapabilityProviders(env).documentExtraction === 'openai'
          ? new OpenAiDocumentExtractionAdapter(
              createOpenAiClient({
                apiKey: env.OPENAI_API_KEY as string,
                ...(env.OPENAI_BASE_URL ? { baseUrl: env.OPENAI_BASE_URL } : {}),
                timeoutMs: env.OPENAI_TIMEOUT_MS,
                maxRetries: env.OPENAI_MAX_RETRIES,
              }),
              env.AI_DOCUMENT_EXTRACTION_MODEL,
            )
          : new FakeDocumentExtractionAdapter(),
    },
    GenerateCommercialProposalUseCase,
    ExtractAssetCandidatesUseCase,
  ],
  exports: [EMBEDDING_PROVIDER, TEXT_GENERATION_PROVIDER, DOCUMENT_EXTRACTION_PROVIDER],
})
export class AiModule {}
