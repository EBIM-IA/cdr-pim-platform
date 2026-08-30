import { DependencyUnavailableError } from '@cdr/shared';

import type {
  ErpProductPage,
  ErpProductRecord,
  ErpProductSourcePort,
} from '../../domain/ports/erp-product-source.port';

/**
 * Dynamics AX 2012 R2 adapter — **NOT IMPLEMENTED**.
 *
 * This is a deliberate, documented stub, not an oversight. Implementing it requires
 * information that Casa del Rulimán has not provided and that must not be invented:
 *
 *   - the integration surface (AIF service endpoint? a staging/replication database?
 *     a nightly export?) and its authentication scheme;
 *   - the AX entity and field names backing SKU, name, description, brand and MPN;
 *   - the field that reliably marks "modified since" for delta synchronisation;
 *   - network reachability from AWS to the internal AX host over the Site-to-Site VPN
 *     (see `docs/architecture/AWS_ARCHITECTURE.md`).
 *
 * Every method fails loudly with a domain error, so wiring this adapter by accident is
 * impossible to miss. See `docs/architecture/INTEGRATION_ARCHITECTURE.md` for the list of
 * inputs required from CDR before this can be built.
 */
export class AxProductSourceAdapter implements ErpProductSourcePort {
  private static readonly REASON =
    'The Dynamics AX adapter is not implemented: the AX integration surface, entity ' +
    'mapping and VPN connectivity are still pending from Casa del Rulimán.';

  async fetchChangedSince(_since: Date, _cursor?: string): Promise<ErpProductPage> {
    throw new DependencyUnavailableError('dynamics-ax', new Error(AxProductSourceAdapter.REASON));
  }

  async fetchByErpItemId(_erpItemId: string): Promise<ErpProductRecord | null> {
    throw new DependencyUnavailableError('dynamics-ax', new Error(AxProductSourceAdapter.REASON));
  }
}
