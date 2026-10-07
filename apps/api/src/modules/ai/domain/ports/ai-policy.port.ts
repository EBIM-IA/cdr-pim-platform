/** Runtime policy that bounds private evidence before it reaches any AI adapter. */
export interface AiDocumentPolicy {
  readonly maxBytes: number;
}

export const AI_DOCUMENT_POLICY = Symbol('AiDocumentPolicy');
