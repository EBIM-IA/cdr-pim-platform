import { describe, expect, it } from 'vitest';

import { REQUIRED_CAPABILITIES } from '../../../shared/http/capability.decorator';
import { Capability } from '../../identity/domain/entities/role';
import { CatalogAdministrationController } from './catalog-administration.controller';

describe('CatalogAdministrationController authorization', () => {
  it('requires attribute-write capability for catalogue administration endpoints', () => {
    expect(Reflect.getMetadata(REQUIRED_CAPABILITIES, CatalogAdministrationController)).toEqual([
      Capability.AttributesWrite,
    ]);
  });

  it('delegates roleAccess enforcement to the application boundary', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_CAPABILITIES,
        CatalogAdministrationController.prototype.patchTemplateAttribute,
      ),
    ).toBeUndefined();
  });
});
