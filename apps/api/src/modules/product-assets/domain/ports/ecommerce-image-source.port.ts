import { DependencyUnavailableError } from '@cdr/shared';

export const ECOMMERCE_IMAGE_SOURCE = Symbol('ECOMMERCE_IMAGE_SOURCE');
const DEPENDENCY = 'ecommerce-image-source';

export type EcommerceImageMode = 'resolved' | 'own';

export interface EcommerceImage {
  readonly assetId: string;
  readonly position: number;
  readonly cover: boolean;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly width?: number;
  readonly height?: number;
  readonly downloadPath: string;
}

export interface EcommerceImageLookup {
  readonly sku: string;
  readonly images: readonly EcommerceImage[];
  readonly generatedAt?: string;
}

export interface EcommerceImageIssue {
  readonly code: string;
  readonly message: string;
  readonly correlationId?: string;
  readonly timestamp?: string;
}

export type EcommerceImageBatchItem = {
  readonly index: number;
  readonly sku: string;
} & (
  | { readonly data: EcommerceImageLookup }
  | { readonly status: number; readonly error: EcommerceImageIssue }
);

export interface EcommerceImageSourcePort {
  lookup(sku: string, mode?: EcommerceImageMode): Promise<EcommerceImageLookup>;
  lookupBatch(
    skus: readonly string[],
    mode?: EcommerceImageMode,
  ): Promise<readonly EcommerceImageBatchItem[]>;
  download(image: EcommerceImage): Promise<Uint8Array>;
  health(): Promise<void>;
}

export class EcommerceImageSourceError extends DependencyUnavailableError {
  override readonly details: Readonly<Record<string, unknown>>;
  readonly status?: number;
  readonly upstreamCode?: string;
  readonly correlationId?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    input: {
      readonly status?: number;
      readonly upstreamCode?: string;
      readonly correlationId?: string;
      readonly retryAfterSeconds?: number;
    } = {},
  ) {
    super(DEPENDENCY);
    this.message = 'No se pudo obtener la información solicitada del servicio de imágenes.';
    this.status = input.status;
    this.upstreamCode = input.upstreamCode;
    this.correlationId = input.correlationId;
    this.retryAfterSeconds = input.retryAfterSeconds;
    this.details = Object.freeze({ dependency: DEPENDENCY, ...input });
  }
}
