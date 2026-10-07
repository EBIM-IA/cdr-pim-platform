import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { AiController } from '../../src/modules/ai/presentation/ai.controller';
import { ApplicationsController } from '../../src/modules/applications/presentation/applications.controller';
import { AuditController } from '../../src/modules/audit/presentation/audit.controller';
import { CatalogAdministrationController } from '../../src/modules/catalog-schema/presentation/catalog-administration.controller';
import { DynamicCatalogController } from '../../src/modules/catalog-schema/presentation/dynamic-catalog.controller';
import { ProductsController } from '../../src/modules/catalog/presentation/products.controller';
import { CodeAffixesController } from '../../src/modules/code-affixes/presentation/code-affixes.controller';
import { ExternalHomologsController } from '../../src/modules/equivalences/presentation/external-homologs.controller';
import { HealthController } from '../../src/modules/health/presentation/health.controller';
import { AuthController } from '../../src/modules/identity/presentation/auth.controller';
import { Capability } from '../../src/modules/identity/domain/entities/role';
import { ImportsController } from '../../src/modules/imports/presentation/imports.controller';
import { ProductAssetsController } from '../../src/modules/product-assets/presentation/product-assets.controller';
import { SearchController } from '../../src/modules/search/presentation/search.controller';
import { WorkspacesController } from '../../src/modules/workspaces/presentation/workspaces.controller';
import { PUBLIC_ROUTE } from '../../src/shared/http/public.decorator';
import { REQUIRED_CAPABILITIES } from '../../src/shared/http/capability.decorator';

const reflector = new Reflector();

function requiredCapabilities(
  controller: abstract new (...args: never[]) => unknown,
  method?: string,
): readonly Capability[] | undefined {
  const targets = method
    ? [controller.prototype[method as keyof typeof controller.prototype], controller]
    : [controller];
  return reflector.getAllAndOverride<readonly Capability[] | undefined>(
    REQUIRED_CAPABILITIES,
    targets,
  );
}

function isPublic(
  controller: abstract new (...args: never[]) => unknown,
  method?: string,
): boolean {
  const targets = method
    ? [controller.prototype[method as keyof typeof controller.prototype], controller]
    : [controller];
  return reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets) ?? false;
}

describe('HTTP RBAC policy', () => {
  it('keeps only login and health explicitly public', () => {
    expect(isPublic(HealthController)).toBe(true);
    expect(isPublic(AuthController, 'login')).toBe(true);

    expect(isPublic(AuthController, 'me')).toBe(false);
    expect(isPublic(ProductsController, 'list')).toBe(false);
    expect(isPublic(SearchController, 'search')).toBe(false);
    expect(isPublic(ImportsController, 'embed')).toBe(false);
    expect(isPublic(WorkspacesController, 'findOne')).toBe(false);
    expect(isPublic(ApplicationsController, 'list')).toBe(false);
    expect(isPublic(AuditController, 'list')).toBe(false);
    expect(isPublic(CatalogAdministrationController, 'templates')).toBe(false);
    expect(isPublic(DynamicCatalogController, 'grid')).toBe(false);
    expect(isPublic(CodeAffixesController, 'list')).toBe(false);
    expect(isPublic(CodeAffixesController, 'parse')).toBe(false);
    expect(isPublic(ExternalHomologsController, 'eligibleSearch')).toBe(false);
    expect(isPublic(ProductAssetsController, 'list')).toBe(false);
    expect(isPublic(AiController, 'commercialProposal')).toBe(false);
    expect(isPublic(AiController, 'extractionCandidates')).toBe(false);
  });

  it('requires explicit capabilities for protected reads', () => {
    expect(requiredCapabilities(AuthController, 'me')).toEqual([Capability.IdentitySelfRead]);
    expect(requiredCapabilities(ProductsController, 'list')).toEqual([Capability.CatalogRead]);
    expect(requiredCapabilities(ProductsController, 'findOne')).toEqual([Capability.CatalogRead]);
    expect(requiredCapabilities(SearchController, 'search')).toEqual([Capability.CatalogRead]);
    expect(requiredCapabilities(WorkspacesController, 'findOne')).toEqual([Capability.CatalogRead]);
    expect(requiredCapabilities(ApplicationsController, 'list')).toEqual([
      Capability.ApplicationsRead,
    ]);
    expect(requiredCapabilities(AuditController, 'list')).toEqual([Capability.AuditRead]);
    expect(requiredCapabilities(CatalogAdministrationController, 'categories')).toEqual([
      Capability.AttributesWrite,
    ]);
    expect(requiredCapabilities(CatalogAdministrationController, 'templates')).toEqual([
      Capability.AttributesWrite,
    ]);
    expect(requiredCapabilities(CatalogAdministrationController, 'template')).toEqual([
      Capability.AttributesWrite,
    ]);
    expect(requiredCapabilities(DynamicCatalogController, 'categories')).toEqual([
      Capability.AttributesRead,
    ]);
    expect(requiredCapabilities(DynamicCatalogController, 'schema')).toEqual([
      Capability.AttributesRead,
    ]);
    expect(requiredCapabilities(DynamicCatalogController, 'grid')).toEqual([
      Capability.AttributesRead,
    ]);
    expect(requiredCapabilities(DynamicCatalogController, 'productSheet')).toEqual([
      Capability.AttributesRead,
    ]);
    expect(requiredCapabilities(CodeAffixesController, 'list')).toEqual([
      Capability.AdministrationManage,
    ]);
    expect(requiredCapabilities(CodeAffixesController, 'parse')).toEqual([
      Capability.AttributesRead,
    ]);
    expect(requiredCapabilities(ExternalHomologsController, 'list')).toEqual([
      Capability.EquivalencesRead,
    ]);
    expect(requiredCapabilities(ExternalHomologsController, 'eligibleSearch')).toEqual([
      Capability.EquivalencesRead,
    ]);
    expect(requiredCapabilities(ImportsController, 'findOne')).toEqual([Capability.ImportsExecute]);
    expect(requiredCapabilities(ProductAssetsController, 'list')).toEqual([Capability.CatalogRead]);
    expect(requiredCapabilities(ProductAssetsController, 'download')).toEqual([
      Capability.CatalogRead,
    ]);
    expect(requiredCapabilities(AiController, 'commercialProposal')).toEqual([
      Capability.CatalogRead,
      Capability.AiQualityExecute,
    ]);
    expect(requiredCapabilities(AiController, 'extractionCandidates')).toEqual([
      Capability.CatalogRead,
      Capability.AiDocumentExtract,
    ]);
  });

  it('uses operation-specific capabilities for mutations', () => {
    expect(requiredCapabilities(ProductsController, 'create')).toEqual([Capability.CatalogWrite]);
    expect(requiredCapabilities(SearchController, 'index')).toEqual([Capability.AiQualityExecute]);
    expect(requiredCapabilities(ImportsController, 'embed')).toEqual([Capability.ImportsExecute]);
    expect(requiredCapabilities(ApplicationsController, 'create')).toEqual([
      Capability.ApplicationsWrite,
    ]);
    expect(requiredCapabilities(ApplicationsController, 'update')).toEqual([
      Capability.ApplicationsWrite,
    ]);
    expect(requiredCapabilities(ApplicationsController, 'deactivate')).toEqual([
      Capability.ApplicationsWrite,
    ]);
    expect(requiredCapabilities(CatalogAdministrationController, 'patchCategory')).toEqual([
      Capability.AttributesWrite,
    ]);
    expect(requiredCapabilities(CatalogAdministrationController, 'patchTemplateAttribute')).toEqual(
      [Capability.AdministrationManage],
    );
    expect(requiredCapabilities(DynamicCatalogController, 'patchAttribute')).toEqual([
      Capability.AttributesWrite,
    ]);
    expect(requiredCapabilities(CodeAffixesController, 'create')).toEqual([
      Capability.AdministrationManage,
    ]);
    expect(requiredCapabilities(CodeAffixesController, 'update')).toEqual([
      Capability.AdministrationManage,
    ]);
    expect(requiredCapabilities(CodeAffixesController, 'validate')).toEqual([
      Capability.AdministrationManage,
    ]);
    expect(requiredCapabilities(CodeAffixesController, 'deactivate')).toEqual([
      Capability.AdministrationManage,
    ]);
    expect(requiredCapabilities(ExternalHomologsController, 'create')).toEqual([
      Capability.EquivalencesWrite,
    ]);
    expect(requiredCapabilities(ExternalHomologsController, 'update')).toEqual([
      Capability.EquivalencesWrite,
    ]);
    expect(requiredCapabilities(ImportsController, 'preview')).toEqual([Capability.ImportsExecute]);
    expect(requiredCapabilities(ImportsController, 'confirm')).toEqual([Capability.ImportsExecute]);
    expect(requiredCapabilities(ProductAssetsController, 'upload')).toEqual([
      Capability.CatalogWrite,
    ]);
    expect(requiredCapabilities(ProductAssetsController, 'bulk')).toEqual([
      Capability.CatalogWrite,
    ]);
    expect(requiredCapabilities(ProductAssetsController, 'remove')).toEqual([
      Capability.CatalogWrite,
    ]);
  });

  it('reserves the operational skeleton probe for operations administrators', () => {
    expect(requiredCapabilities(ImportsController, 'ping')).toEqual([Capability.OperationsManage]);
  });
});
