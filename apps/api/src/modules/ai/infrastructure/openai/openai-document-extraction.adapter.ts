import type OpenAI from 'openai';

import type {
  DocumentExtractionProviderPort,
  DocumentExtractionRequest,
  DocumentExtractionResult,
  ExtractedAttribute,
} from '../../domain/ports/document-extraction-provider.port';
import { toDomainError } from './openai.client';

const SYSTEM_PROMPT = [
  'You extract technical product attributes from supplier documents for an industrial',
  'bearings and spare-parts catalogue. Return ONLY a JSON object of the form',
  '{"attributes":[{"key":string,"value":string,"confidence":number}]}.',
  'Never invent a value. If an attribute is absent, omit it entirely.',
].join(' ');

/**
 * Document understanding via a multimodal chat completion.
 *
 * The document is sent as a base64 data URL. This is intentionally the *simplest* thing
 * that works and is not tuned for cost — real batching, caching and a page-splitting
 * strategy are deferred until the document ingestion feature is actually specified.
 */
export class OpenAiDocumentExtractionAdapter implements DocumentExtractionProviderPort {
  constructor(
    private readonly client: OpenAI,
    readonly model: string,
  ) {}

  async extract(request: DocumentExtractionRequest): Promise<DocumentExtractionResult> {
    const dataUrl = `data:${request.mimeType};base64,${Buffer.from(request.content).toString('base64')}`;
    const wanted = request.expectedAttributes?.length
      ? `Attributes of interest: ${request.expectedAttributes.join(', ')}.`
      : 'Extract every technical attribute you can identify.';

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: `${wanted} Source file: ${request.fileName}` },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? '{}';
      return {
        model: response.model,
        attributes: parseAttributes(raw),
        rawText: raw,
      };
    } catch (error) {
      throw toDomainError(error, 'documents.extract');
    }
  }
}

/**
 * Parses the model's JSON defensively.
 *
 * A malformed or hallucinated shape must degrade to "no attributes found", never to a
 * crashed worker or — far worse — a half-parsed attribute written into the catalog.
 */
function parseAttributes(raw: string): ExtractedAttribute[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const candidates = (parsed as { attributes?: unknown }).attributes;
  if (!Array.isArray(candidates)) return [];

  return candidates.flatMap((candidate): ExtractedAttribute[] => {
    const item = candidate as { key?: unknown; value?: unknown; confidence?: unknown };
    if (typeof item.key !== 'string' || typeof item.value !== 'string') return [];
    const confidence = typeof item.confidence === 'number' ? item.confidence : 0;
    return [
      {
        key: item.key,
        value: item.value,
        confidence: Math.min(1, Math.max(0, confidence)),
      },
    ];
  });
}
