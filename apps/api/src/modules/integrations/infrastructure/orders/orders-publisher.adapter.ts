import { DependencyUnavailableError } from '@cdr/shared';

import type {
  OrderChannelProduct,
  OrderChannelPublisherPort,
} from '../../domain/ports/order-channel-publisher.port';

/**
 * Order-taking application adapter — **NOT IMPLEMENTED**.
 *
 * Pending from Casa del Rulimán: which tool is in use, whether it exposes an API or expects
 * a file drop, its product model, and its network location (internal vs. internet-facing).
 */
export class OrdersPublisherAdapter implements OrderChannelPublisherPort {
  readonly channel = 'orders';

  async publishCatalogSlice(_products: readonly OrderChannelProduct[]): Promise<{
    accepted: number;
  }> {
    throw new DependencyUnavailableError(
      'orders-channel',
      new Error('The order-channel adapter is not implemented: target system undefined.'),
    );
  }
}
