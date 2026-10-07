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
  templateAssetRequirements,
} from '../../modules/catalog-schema/infrastructure/persistence/catalog-schema.tables';
import { externalHomologs } from '../../modules/equivalences/infrastructure/persistence/external-homologs.tables';
import { groupOemCodes } from '../../modules/equivalences/infrastructure/persistence/group-oem-codes.tables';
import {
  importBatches,
  importRows,
} from '../../modules/imports/infrastructure/persistence/imports.tables';
import { productEmbeddings } from '../../modules/search/infrastructure/persistence/search.tables';
import { productAssets } from '../../modules/product-assets/infrastructure/persistence/product-assets.tables';
import { codeAffixes } from '../../modules/code-affixes/infrastructure/persistence/code-affix.tables';

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
  codeAffixes,
  externalHomologs,
  groupOemCodes,
  groupApplications,
  importBatches,
  importRows,
  products,
  productIdentifiers,
  productAttributeValues,
  productTemplateAssignments,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
  templateAssetRequirements,
  equivalenceGroups,
  equivalenceGroupMembers,
  productEmbeddings,
  productAssets,
};

export {
  auditChangeItems,
  auditEntries,
  attributeDefinitions,
  attributeTemplates,
  catalogCategories,
  codeAffixes,
  equivalenceGroupMembers,
  equivalenceGroups,
  externalHomologs,
  groupOemCodes,
  groupApplications,
  importBatches,
  importRows,
  productEmbeddings,
  productAssets,
  productIdentifiers,
  productAttributeValues,
  productTemplateAssignments,
  products,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
  templateAssetRequirements,
};
