/**
 * Outbound port for pushing enriched product information to a sales channel
 * (PrestaShop today; a marketplace or a new storefront tomorrow).
 *
 * The PIM owns product *information* and publishes it. It never reads price or stock back:
 * those belong to the ERP, and mixing the two directions here is exactly how a PIM turns
 * into a second, competing source of truth.
 */
export interface ChannelProductPayload {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string | null;
  readonly brand: string | null;
  readonly attributes: Readonly<Record<string, string>>;
  readonly imageUrls: readonly string[];
}

export interface PublishOutcome {
  readonly channel: string;
  /** The identifier the channel assigned, so subsequent publishes can update in place. */
  readonly externalId: string;
  readonly publishedAt: Date;
}

export interface CommercePublisherPort {
  readonly channel: string;
  publish(payload: ChannelProductPayload): Promise<PublishOutcome>;
  unpublish(productId: string): Promise<void>;
}

export const COMMERCE_PUBLISHER = Symbol('CommercePublisherPort');
