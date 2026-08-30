import { Module } from '@nestjs/common';

import { COMMERCE_PUBLISHER } from './domain/ports/commerce-publisher.port';
import { ERP_PRODUCT_SOURCE } from './domain/ports/erp-product-source.port';
import { ORDER_CHANNEL_PUBLISHER } from './domain/ports/order-channel-publisher.port';
import { InMemoryErpProductSource } from './infrastructure/ax/in-memory-erp-product-source.adapter';
import { OrdersPublisherAdapter } from './infrastructure/orders/orders-publisher.adapter';
import { PrestashopPublisherAdapter } from './infrastructure/prestashop/prestashop-publisher.adapter';

/**
 * Bounded context for every external system Casa del Rulimán already runs.
 *
 * The ERP port is currently bound to the in-memory source, NOT to `AxProductSourceAdapter`:
 * the real adapter throws by design until the AX integration surface is specified, and
 * binding it here would break local development for no benefit. Swapping it is one line,
 * and that is exactly the property this architecture is buying.
 */
@Module({
  providers: [
    { provide: ERP_PRODUCT_SOURCE, useFactory: () => new InMemoryErpProductSource([]) },
    { provide: COMMERCE_PUBLISHER, useClass: PrestashopPublisherAdapter },
    { provide: ORDER_CHANNEL_PUBLISHER, useClass: OrdersPublisherAdapter },
  ],
  exports: [ERP_PRODUCT_SOURCE, COMMERCE_PUBLISHER, ORDER_CHANNEL_PUBLISHER],
})
export class IntegrationsModule {}
