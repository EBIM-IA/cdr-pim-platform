import type {
  GenerationRequest,
  GenerationResult,
  TextGenerationProviderPort,
} from '../../domain/ports/text-generation-provider.port';

/** Echo-style generator: deterministic, offline, and obviously fake in any output. */
export class FakeTextGenerationAdapter implements TextGenerationProviderPort {
  constructor(readonly model = 'fake-generation-v1') {}

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    let data: unknown = null;
    try {
      data = JSON.parse(request.input);
    } catch {
      /* Unstructured requests retain the plain echo behavior. */
    }
    if (
      data &&
      typeof data === 'object' &&
      'recordType' in data &&
      data.recordType === 'ecommerce_product_facts'
    ) {
      const facts = data as { nombre?: string; codigo?: string };
      return {
        text: JSON.stringify({
          titulo: (facts.nombre ?? facts.codigo ?? 'Producto').slice(0, 110),
          descripcion: `Texto de demostración para ${facts.codigo ?? 'el producto'}. Revisa la información registrada antes de aprobar.`,
        }),
        model: this.model,
        inputTokens: estimateTokens(request.input),
        outputTokens: 0,
      };
    }
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
