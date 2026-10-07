import type OpenAI from 'openai';

import type {
  GenerationRequest,
  GenerationResult,
  TextGenerationProviderPort,
} from '../../domain/ports/text-generation-provider.port';
import { toDomainError } from './openai.client';
import { responseTuning } from './openai-response-options';

export class OpenAiTextGenerationAdapter implements TextGenerationProviderPort {
  constructor(
    private readonly client: OpenAI,
    readonly model: string,
  ) {}

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    try {
      const response = await this.client.responses.create({
        model: this.model,
        instructions: request.instruction,
        input: request.input,
        store: false,
        ...(request.maxOutputTokens ? { max_output_tokens: request.maxOutputTokens } : {}),
        ...responseTuning(this.model, request.temperature ?? 0.2),
      });

      return {
        text: response.output_text,
        model: response.model,
        ...(response.usage
          ? {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            }
          : {}),
      };
    } catch (error) {
      throw toDomainError(error, 'responses.create');
    }
  }
}
