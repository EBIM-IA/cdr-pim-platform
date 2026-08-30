import type {
  GenerationRequest,
  GenerationResult,
  TextGenerationProviderPort,
} from '../../domain/ports/text-generation-provider.port';

/** Echo-style generator: deterministic, offline, and obviously fake in any output. */
export class FakeTextGenerationAdapter implements TextGenerationProviderPort {
  constructor(readonly model = 'fake-generation-v1') {}

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    return {
      text: `[fake:${this.model}] ${request.instruction.trim()} :: ${request.input.trim()}`,
      model: this.model,
      inputTokens: estimateTokens(request.instruction) + estimateTokens(request.input),
      outputTokens: 0,
    };
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
