import type {
  DocumentExtractionProviderPort,
  DocumentExtractionRequest,
  DocumentExtractionResult,
} from '../../domain/ports/document-extraction-provider.port';

/** Returns empty, well-formed results so pipelines can be exercised without a vendor. */
export class FakeDocumentExtractionAdapter implements DocumentExtractionProviderPort {
  constructor(readonly model = 'fake-extraction-v1') {}

  async extract(request: DocumentExtractionRequest): Promise<DocumentExtractionResult> {
    return {
      model: this.model,
      attributes: request.expectedAttributes.map((key) => ({
        key,
        value: '',
        confidence: 0,
      })),
      rawText: `[fake extraction of ${request.fileName} (${request.mimeType})]`,
    };
  }
}
