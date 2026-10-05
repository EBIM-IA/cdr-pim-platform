/**
 * Pure rules of the TEMPORARY QAS reception of an AX batch.
 *
 * Nothing here decides how a product is stored: that is the next, database-backed phase
 * (docs/integrations/ax/NEXT_DB_PHASE.md). These functions only describe what was received.
 */

/** The fields of a received product these rules read. Structural, so the domain stays free of the HTTP contract. */
export interface ReceivedAxProduct {
  readonly tipoAplicacion?: string | null;
  readonly marca?: string | null;
}

export const AxContractWarningCode = {
  /** v1.1 requires it, but P-05 (template-4 exception) is open: tolerated in the mock. */
  TIPO_APLICACION_MISSING: 'AX_TIPO_APLICACION_MISSING',
  /** Same temporary tolerance as tipoAplicacion. */
  MARCA_MISSING: 'AX_MARCA_MISSING',
} as const;
export type AxContractWarningCode =
  (typeof AxContractWarningCode)[keyof typeof AxContractWarningCode];

export interface AxContractWarning {
  readonly code: AxContractWarningCode;
  /** The open contractual question this tolerance is waiting on. */
  readonly pendingDecision: string;
  readonly count: number;
  /** Zero-based positions in `productos`, capped so a large batch cannot flood the log. */
  readonly productIndexes: readonly number[];
}

/** Positions are logged, never product values: the log must not become a copy of the batch. */
export const MAX_WARNING_INDEXES = 50;

function isAbsent(value: string | null | undefined): boolean {
  return value === undefined || value === null || value.trim() === '';
}

export function contractWarnings(products: readonly ReceivedAxProduct[]): AxContractWarning[] {
  const rules: ReadonlyArray<{
    code: AxContractWarningCode;
    pendingDecision: string;
    missing: (product: ReceivedAxProduct) => boolean;
  }> = [
    {
      code: AxContractWarningCode.TIPO_APLICACION_MISSING,
      pendingDecision: 'P-05',
      missing: (product) => isAbsent(product.tipoAplicacion),
    },
    {
      code: AxContractWarningCode.MARCA_MISSING,
      pendingDecision: 'P-04/P-05',
      missing: (product) => isAbsent(product.marca),
    },
  ];

  return rules.flatMap((rule) => {
    const indexes = products.flatMap((product, index) => (rule.missing(product) ? [index] : []));
    return indexes.length === 0
      ? []
      : [
          {
            code: rule.code,
            pendingDecision: rule.pendingDecision,
            count: indexes.length,
            productIndexes: indexes.slice(0, MAX_WARNING_INDEXES),
          },
        ];
  });
}

/**
 * Deterministic JSON: object keys sorted recursively, array order kept. The same batch
 * always yields the same string whatever the sender's key order or whitespace — the input
 * of the technical `requestHash`.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}
