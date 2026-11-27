import { pdfDesignSettings } from '../../modules/catalog-schema/infrastructure/persistence/pdf-design-settings.tables';
import {
  catalogCategoryErpCodes,
  categoryDynamicAttributes,
} from '../../modules/catalog-schema/infrastructure/persistence/category-governance.tables';
import { importExecutions } from '../../modules/imports/infrastructure/persistence/import-executions.tables';
import { identityModulePolicies } from '../../modules/identity/infrastructure/module-policy.tables';
import { catalogHomeSettings } from '../../modules/catalog-schema/infrastructure/persistence/catalog-home-settings.tables';
import { productTechnicalSheetVisibility } from '../../modules/product-assets/infrastructure/persistence/technical-sheet-visibility.tables';
import { narvizRequestBudget } from '../../modules/product-assets/infrastructure/persistence/narviz-request-budget.tables';
import { unifiedCodeRequests } from '../../modules/equivalences/infrastructure/persistence/unified-code-requests.tables';
import { catalogParameters } from '../../modules/catalog-schema/infrastructure/persistence/catalog-parameters.tables';
import {
  reportPreferences,
  reportBaselines,
  reportBaselineProducts,
  reportClosedPeriods,
} from '../../modules/workspaces/infrastructure/report-settings.tables';
import { searchEvents } from '../../modules/catalog-schema/infrastructure/persistence/search-telemetry.tables';
import { productAttributeDrafts } from '../../modules/catalog-schema/infrastructure/persistence/product-drafts.tables';
import { qualityReviewItems } from '../../modules/quality/infrastructure/persistence/quality-governance.tables';
import { ecommerceDescriptions } from '../../modules/catalog-schema/infrastructure/persistence/ecommerce-descriptions.tables';
import { productNameSettings } from '../../modules/catalog-schema/infrastructure/persistence/product-name-settings.tables';
import {
  fileCleanupCandidates,
  fileInventoryCursors,
  fileMaintenanceLeases,
} from '../../modules/file-maintenance/infrastructure/persistence/file-maintenance.tables';
import {
  productCatalogs,
  productCatalogShares,
} from '../../modules/product-catalogs/infrastructure/persistence/product-catalogs.tables';
import {
  productIdentifiers,
  products,
} from '../../modules/catalog/infrastructure/persistence/catalog.tables';
import {
  equivalenceGroupMembers,
  equivalenceGroups,
} from '../../modules/equivalences/infrastructure/persistence/equivalences.tables';
import { applicationColumnSettings } from '../../modules/applications/infrastructure/persistence/application-column-settings.tables';
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
import {
  axInboundBatches,
  axInboundRecords,
} from '../../modules/ax-integration/infrastructure/persistence/ax-integration.tables';

/**
 * Composition root for the database schema.
 *
 * Each module declares the tables it owns inside its own `infrastructure/persistence`
 * folder; this file is the only place that assembles them, mirroring how `AppModule`
 * assembles the Nest modules.
 */
export const schema = {
  pdfDesignSettings,
  applicationColumnSettings,
  catalogCategoryErpCodes,
  categoryDynamicAttributes,
  importExecutions,
  productTechnicalSheetVisibility,
  narvizRequestBudget,
  identityModulePolicies,
  unifiedCodeRequests,
  catalogParameters,
  reportPreferences,
  reportBaselines,
  reportBaselineProducts,
  reportClosedPeriods,
  searchEvents,
  productAttributeDrafts,
  qualityReviewItems,
  ecommerceDescriptions,
  productNameSettings,
  catalogHomeSettings,
  fileCleanupCandidates,
  fileInventoryCursors,
  fileMaintenanceLeases,
  axInboundBatches,
  axInboundRecords,
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
  productCatalogs,
  productCatalogShares,
};

export {
  pdfDesignSettings,
  applicationColumnSettings,
  catalogCategoryErpCodes,
  categoryDynamicAttributes,
  productTechnicalSheetVisibility,
  narvizRequestBudget,
  identityModulePolicies,
  unifiedCodeRequests,
  catalogParameters,
  reportPreferences,
  reportBaselines,
  reportBaselineProducts,
  reportClosedPeriods,
  searchEvents,
  productAttributeDrafts,
  qualityReviewItems,
  productNameSettings,
  catalogHomeSettings,
  fileCleanupCandidates,
  fileInventoryCursors,
  fileMaintenanceLeases,
  axInboundBatches,
  axInboundRecords,
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
  productCatalogs,
  productCatalogShares,
  productIdentifiers,
  productAttributeValues,
  productTemplateAssignments,
  products,
  templateAttributeAssignments,
  templateAttributeRoleAccess,
  templateAssetRequirements,
};
