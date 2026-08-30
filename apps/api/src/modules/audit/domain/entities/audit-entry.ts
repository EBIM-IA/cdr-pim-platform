import { type Uuid, newUuid } from '@cdr/shared';

/**
 * An immutable record of *who changed what, when, and in which business context*.
 *
 * A PIM is a system of record for product information that several people edit and that
 * feeds sales channels — being able to answer "who published this description?" is a
 * requirement, not a nice-to-have.
 */
export const AuditAction = {
  Created: 'created',
  Updated: 'updated',
  Deleted: 'deleted',
  Published: 'published',
  Imported: 'imported',
  AiGenerated: 'ai_generated',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  readonly id: Uuid;
  /** Aggregate type, e.g. `product` or `equivalence_group`. */
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: AuditAction;
  /** `null` when the change was made by a background job rather than a person. */
  readonly actorId: string | null;
  /** `api`, `worker:AX_SYNC`, `worker:AI_EMBEDDING`, ... */
  readonly source: string;
  readonly correlationId: string;
  readonly occurredAt: Date;
  /** Field-level before/after. Must never contain secrets or credentials. */
  readonly changes: Readonly<Record<string, { before?: unknown; after?: unknown }>>;
}

export function createAuditEntry(input: Omit<AuditEntry, 'id'>): AuditEntry {
  return { id: newUuid(), ...input };
}
