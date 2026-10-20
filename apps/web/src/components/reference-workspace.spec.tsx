import type { WorkspaceDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const workspaceData = vi.hoisted(() => ({ useWorkspaceData: vi.fn() }));

vi.mock('@/components/use-workspace-data', () => workspaceData);

import { ReferenceWorkspace } from '@/components/reference-workspace';
import { moduleDefinitions } from '@/lib/module-definitions';

const reportsWorkspace: WorkspaceDto = {
  slug: 'reports',
  operationalStatus: 'partial',
  generatedAt: '2026-10-19T12:00:00.000Z',
  metrics: [],
  columns: [
    { key: 'section', label: 'Sección', type: 'text' },
    { key: 'indicator', label: 'Indicador', type: 'text' },
    { key: 'value', label: 'Cantidad', type: 'number' },
  ],
  rows: [
    {
      id: 'summary',
      values: { section: 'Estado', indicator: 'draft', value: 1 },
    },
  ],
  totalRows: 1,
  notices: [],
  actions: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/reports');
});

describe('ReferenceWorkspace report views', () => {
  it('requests the API projection associated with each report selector', () => {
    workspaceData.useWorkspaceData.mockReturnValue({
      workspace: reportsWorkspace,
      loading: false,
      error: null,
      reload: vi.fn(),
    });
    render(<ReferenceWorkspace definition={moduleDefinitions.reports} />);

    expect(workspaceData.useWorkspaceData).toHaveBeenLastCalledWith('reports', {
      report: 'summary',
    });
    expect(screen.getByRole('button', { name: /Reporte atributos/u })).toBeVisible();
    expect(screen.getByRole('button', { name: /Reporte general/u })).toBeVisible();
    expect(screen.getByRole('button', { name: /Resultados de período/u })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Reporte general/u }));
    expect(workspaceData.useWorkspaceData).toHaveBeenLastCalledWith('reports', {
      report: 'general_results',
    });

    fireEvent.click(screen.getByRole('button', { name: /Resultados de período/u }));
    expect(workspaceData.useWorkspaceData).toHaveBeenLastCalledWith('reports', {
      report: 'period_results',
    });
  });
});
