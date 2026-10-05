import {
  productIdentifiers,
  products,
} from '../../modules/catalog/infrastructure/persistence/catalog.tables';
import {
  equivalenceGroupMembers,
  equivalenceGroups,
} from '../../modules/equivalences/infrastructure/persistence/equivalences.tables';
import { groupApplications } from '../../modules/applications/infrastructure/persistence/applications.tables';
import {
  auditChangeItems,
  auditEntries,
} from '../../modules/audit/infrastructure/persistence/audit.tables';
import {
  attributeDefinitions,
  attributeTemplates,
  catalogCategories,
  productAttributeValues,
  productTemplateAssignments,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
} from '../../modules/catalog-schema/infrastructure/persistence/catalog-schema.tables';
import { externalHomologs } from '../../modules/equivalences/infrastructure/persistence/external-homologs.tables';
import {
  importBatches,
  importRows,
} from '../../modules/imports/infrastructure/persistence/imports.tables';
import { productEmbeddings } from '../../modules/search/infrastructure/persistence/search.tables';

/**
 * Composition root for the database schema.
 *
 * Each module declares the tables it owns inside its own `infrastructure/persistence`
 * folder; this file is the only place that assembles them, mirroring how `AppModule`
 * assembles the Nest modules.
 */
export const schema = {
  auditChangeItems,
  auditEntries,
  attributeDefinitions,
  attributeTemplates,
  catalogCategories,
  externalHomologs,
  groupApplications,
  importBatches,
  importRows,
  products,
  productIdentifiers,
  productAttributeValues,
  productTemplateAssignments,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
  equivalenceGroups,
  equivalenceGroupMembers,
  productEmbeddings,
};

export {
  auditChangeItems,
  auditEntries,
  attributeDefinitions,
  attributeTemplates,
  catalogCategories,
  equivalenceGroupMembers,
  equivalenceGroups,
  externalHomologs,
  groupApplications,
  importBatches,
  importRows,
  productEmbeddings,
  productIdentifiers,
  productAttributeValues,
  productTemplateAssignments,
  products,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
};
