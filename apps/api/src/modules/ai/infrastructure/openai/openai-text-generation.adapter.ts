import type OpenAI from 'openai';

import type {
  GenerationRequest,
  GenerationResult,
  TextGenerationProviderPort,
} from '../../domain/ports/text-generation-provider.port';
import { toDomainError } from './openai.client';

export class OpenAiTextGenerationAdapter implements TextGenerationProviderPort {
  constructor(
    private readonly client: OpenAI,
    readonly model: string,
  ) {}

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: request.temperature ?? 0.2,
        ...(request.maxOutputTokens ? { max_tokens: request.maxOutputTokens } : {}),
        messages: [
          { role: 'system', content: request.instruction },
          { role: 'user', content: request.input },
        ],
      });

      return {
        text: response.choices[0]?.message?.content ?? '',
        model: response.model,
        ...(response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
            }
          : {}),
      };
    } catch (error) {
      throw toDomainError(error, 'chat.completions.create');
    }
  }
}
