import { describe, expect, it } from 'vitest';

import {
  type AttributeDraft,
  buildTemplateAttributeUpdateInput,
  completeRoleAccess,
  updateRolePermission,
} from '@/components/templates-admin-workspace';

const draft: AttributeDraft = {
  active: true,
  required: false,
  replicable: true,
  searchable: true,
  includeInTechnicalSheet: false,
  position: '2',
  roleAccess: [
    {
      role: 'ADMINISTRADOR',
      canView: true,
      canEdit: true,
      canImport: true,
      canExport: true,
    },
  ],
};

describe('template role access editor', () => {
  it('completes a sparse matrix with every supported business role', () => {
    const matrix = completeRoleAccess([
      {
        role: 'COMPRAS',
        canView: true,
        canEdit: true,
        canImport: false,
        canExport: false,
      },
    ]);

    expect(matrix.map((entry) => entry.role)).toEqual(['ADMINISTRADOR', 'COMPRAS', 'VENTAS']);
    expect(matrix.find((entry) => entry.role === 'VENTAS')).toMatchObject({
      canView: false,
      canEdit: false,
    });
  });

  it('grants visibility with a dependent permission and revokes dependents with visibility', () => {
    const imported = updateRolePermission([], 'VENTAS', 'canImport', true);
    expect(imported.find((entry) => entry.role === 'VENTAS')).toMatchObject({
      canView: true,
      canImport: true,
    });

    const hidden = updateRolePermission(imported, 'VENTAS', 'canView', false);
    expect(hidden.find((entry) => entry.role === 'VENTAS')).toMatchObject({
      canView: false,
      canEdit: false,
      canImport: false,
      canExport: false,
    });
  });

  it('omits roleAccess for operators without administration capability', () => {
    expect(buildTemplateAttributeUpdateInput(draft, '2026-10-05T12:00:00.000Z', false)).toEqual({
      active: true,
      required: false,
      replicable: true,
      searchable: true,
      includeInTechnicalSheet: false,
      position: 2,
      expectedUpdatedAt: '2026-10-05T12:00:00.000Z',
    });
  });

  it('includes roleAccess only for administrators', () => {
    expect(
      buildTemplateAttributeUpdateInput(draft, '2026-10-05T12:00:00.000Z', true),
    ).toMatchObject({ roleAccess: draft.roleAccess });
  });
});
