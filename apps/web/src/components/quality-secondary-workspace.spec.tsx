import type { WorkspaceDto } from '@cdr/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  QualitySecondaryWorkspace,
  type QualitySecondaryView,
} from './quality-secondary-workspace';

const workspace: WorkspaceDto = {
  slug: 'quality',
  operationalStatus: 'partial',
  generatedAt: '2026-10-05T10:00:00.000Z',
  metrics: [],
  columns: [],
  rows: [],
  totalRows: 0,
  notices: [],
  actions: [
    {
      id: 'review-ai-suggestion',
      label: 'Revisar sugerencia de IA',
      availability: 'blocked',
      reason: 'Faltan contratos de candidatos, evidencia, confianza y aprobación humana.',
    },
  ],
};

const expectedHeading: Record<QualitySecondaryView, string> = {
  extraction: 'Atributos sugeridos',
  commercial: 'Comparación técnica y comercial',
  duplicates: 'Alertas para revisión humana',
  review: 'Solicitudes',
  sources: 'Prioridad de fuentes por categoría',
  conflict: 'Candidatos por fuente',
};

describe('QualitySecondaryWorkspace', () => {
  it.each(Object.entries(expectedHeading) as [QualitySecondaryView, string][])(
    'renders the approved %s hierarchy without invented records',
    (view, heading) => {
      const { unmount } = render(<QualitySecondaryWorkspace view={view} workspace={workspace} />);

      expect(screen.getByText(heading)).toBeInTheDocument();
      expect(
        screen.getByText(
          'Faltan contratos de candidatos, evidencia, confianza y aprobación humana.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText('DUP-127')).not.toBeInTheDocument();
      expect(screen.queryByText('REV-224')).not.toBeInTheDocument();
      unmount();
    },
  );

  it('keeps automatic merges at zero as an explicit invariant', () => {
    render(<QualitySecondaryWorkspace view="duplicates" workspace={workspace} />);

    expect(screen.getByText('Fusiones automáticas')).toBeInTheDocument();
    expect(screen.getByText('El PIM nunca fusiona SKU')).toBeInTheDocument();
  });
});
