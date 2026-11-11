import type { AuthenticatedActor } from '../../../identity/domain/entities/role';
export interface QualityCandidateCapturePort {
  captureExtraction(
    result: {
      productId: string;
      sku: string;
      assetId: string;
      filename: string;
      model: string;
      baseline?: Readonly<
        Record<string, { value: string | number | boolean | null; version: number }>
      >;
      candidates: readonly { key: string; value: string; confidence: number }[];
    },
    actor: AuthenticatedActor,
  ): Promise<string[]>;
  captureCommercial(
    result: {
      productId: string;
      sku: string;
      channel: 'b2c' | 'b2b';
      model: string;
      proposal: string;
      technicalDescription?: string | null;
    },
    actor: AuthenticatedActor,
  ): Promise<string[]>;
}
export const QUALITY_CANDIDATE_CAPTURE = Symbol('QualityCandidateCapturePort');
