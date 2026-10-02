import {
  productIdentifiers,
  products,
} from '../../modules/catalog/infrastructure/persistence/catalog.tables';
import {
  equivalenceGroupMembers,
  equivalenceGroups,
} from '../../modules/equivalences/infrastructure/persistence/equivalences.tables';
import { auditEntries } from '../../modules/audit/infrastructure/persistence/audit.tables';
import { productEmbeddings } from '../../modules/search/infrastructure/persistence/search.tables';

/**
 * Composition root for the database schema.
 *
 * Each module declares the tables it owns inside its own `infrastructure/persistence`
 * folder; this file is the only place that assembles them, mirroring how `AppModule`
 * assembles the Nest modules.
 */
export const schema = {
  auditEntries,
  products,
  productIdentifiers,
  equivalenceGroups,
  equivalenceGroupMembers,
  productEmbeddings,
};

export {
  auditEntries,
  equivalenceGroupMembers,
  equivalenceGroups,
  productEmbeddings,
  productIdentifiers,
  products,
};
