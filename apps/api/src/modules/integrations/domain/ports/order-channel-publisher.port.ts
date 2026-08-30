/**
 * Outbound port for the order-taking application used by the sales force.
 *
 * Kept separate from `CommercePublisherPort` even though both "publish products": the two
 * consumers have different payloads, different cadences and different failure modes, and
 * collapsing them would force one to carry the other's concerns.
 */
export interface OrderChannelProduct {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly brand: string | null;
  /** Equivalence group codes, so a salesperson can be offered a substitute part. */
  readonly equivalenceCodes: readonly string[];
}

export interface OrderChannelPublisherPort {
  readonly channel: string;
  publishCatalogSlice(products: readonly OrderChannelProduct[]): Promise<{ accepted: number }>;
}

export const ORDER_CHANNEL_PUBLISHER = Symbol('OrderChannelPublisherPort');
