/**
 * Outbound port for pulling structured product data out of a supplier document
 * (PDF datasheet, scanned catalogue page, spreadsheet fragment).
 *
 * The port takes bytes and returns candidate facts — it never writes to the catalog.
 * Whether a candidate is accepted is a domain decision, made by a use case.
 */
export interface DocumentExtractionRequest {
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
  /** Non-empty server-authorized attribute keys; the adapter may return fewer. */
  readonly expectedAttributes: readonly string[];
}

export interface ExtractedAttribute {
  readonly key: string;
  readonly value: string;
  /** Adapter's self-reported confidence in [0,1]; used to route to human review. */
  readonly confidence: number;
}

export interface DocumentExtractionResult {
  readonly model: string;
  readonly attributes: ExtractedAttribute[];
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly rawText?: string;
}

export interface DocumentExtractionProviderPort {
  readonly model: string;
  extract(request: DocumentExtractionRequest): Promise<DocumentExtractionResult>;
}

export const DOCUMENT_EXTRACTION_PROVIDER = Symbol('DocumentExtractionProviderPort');
