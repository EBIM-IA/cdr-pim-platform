import { DependencyUnavailableError } from '@cdr/shared';

import type {
  ChannelProductPayload,
  CommercePublisherPort,
  PublishOutcome,
} from '../../domain/ports/commerce-publisher.port';

/**
 * PrestaShop adapter — **NOT IMPLEMENTED** (same rationale as the AX adapter).
 *
 * Pending from Casa del Rulimán: the PrestaShop version and whether its Webservice API is
 * enabled, the API key, the field mapping onto PrestaShop's product/attribute model, and
 * whether the instance is reachable from AWS or only from the internal network.
 */
export class PrestashopPublisherAdapter implements CommercePublisherPort {
  readonly channel = 'prestashop';

  async publish(_payload: ChannelProductPayload): Promise<PublishOutcome> {
    throw new DependencyUnavailableError(
      'prestashop',
      new Error('The PrestaShop adapter is not implemented: API access and field mapping pending.'),
    );
  }

  async unpublish(_productId: string): Promise<void> {
    throw new DependencyUnavailableError(
      'prestashop',
      new Error('The PrestaShop adapter is not implemented: API access and field mapping pending.'),
    );
  }
}
