import type { WorkspaceDto } from '@cdr/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchCompleteReport,
  matchReportField,
  parseCsvHeaders,
  personalDefinition,
  projectReport,
  reportColumns,
  reportQuery,
  reportRows,
} from './reports';

const api = vi.hoisted(() => ({ fetchWorkspace: vi.fn() }));
vi.mock('@/lib/workspace-api', () => api);
const workspace: WorkspaceDto = {
  slug: 'reports',
  operationalStatus: 'operational',
  generatedAt: '2026-10-22T00:00:00.000Z',
  metrics: [],
  columns: [
    { key: 'sku', label: 'Código artículo', type: 'text' },
    { key: 'attribute:diameter', label: 'Diámetro', type: 'number' },
  ],
  rows: [{ id: '1', values: { sku: '6205', 'attribute:diameter': 25 } }],
  totalRows: 1,
  notices: [],
  actions: [],
};
beforeEach(() => vi.clearAllMocks());
describe('reports', () => {
  it('reads quoted CSV headers without treating quoted separators as new columns', () => {
    expect(
      parseCsvHeaders(
        '\uFEFF"Código artículo";"Descripción; comercial";"Texto ""cliente"""\r\n1;2;3',
      ),
    ).toEqual(['Código artículo', 'Descripción; comercial', 'Texto "cliente"']);
    expect(() => parseCsvHeaders('"Sin cierre')).toThrow('comillas');
  });
  it('maps headers to live fields and preserves repeated headers and unmapped columns', () => {
    const fields = [
      { id: 'sku', label: 'SKU' },
      { id: 'attribute:diameter', label: 'Diámetro' },
    ];
    expect(matchReportField('Código artículo', fields)).toBe('sku');
    expect(matchReportField('DIÁMETRO', fields)).toBe('attribute:diameter');
    const definition = personalDefinition({
      id: 'personal-1',
      title: 'Cliente',
      file: 'cliente.csv',
      fields: [
        { header: 'Código', field: 'sku' },
        { header: 'Medida', field: 'attribute:diameter' },
        { header: 'Nota', field: '' },
        { header: 'Repetido', field: 'sku' },
      ],
    });
    expect(reportQuery(definition, { q: '6205' })).toEqual({
      report: 'products_by_category',
      q: '6205',
      field: ['sku', 'attribute:diameter'],
    });
    const columns = reportColumns(definition, workspace),
      rows = reportRows(definition, workspace);
    expect(projectReport(columns, rows, { order: [], hidden: [] })).toEqual({
      headers: ['Código', 'Medida', 'Nota', 'Repetido'],
      rows: [['6205', 25, null, '6205']],
    });
  });
  it('projects ordered visible columns and applies column filters to the full result set', () => {
    const rows = [
      ...workspace.rows,
      { id: '2', values: { sku: '6206', 'attribute:diameter': 30 } },
    ];
    expect(
      projectReport(
        workspace.columns,
        rows,
        { order: ['attribute:diameter', 'sku'], hidden: ['sku'] },
        { sku: '6206' },
      ),
    ).toEqual({ headers: ['Diámetro'], rows: [[30]] });
  });
  it('loads every page sequentially using the same category, dates and fields', async () => {
    api.fetchWorkspace.mockResolvedValueOnce({ ...workspace, totalRows: 2 }).mockResolvedValueOnce({
      ...workspace,
      rows: [{ id: '2', values: { sku: '6206', 'attribute:diameter': 30 } }],
      totalRows: 2,
    });
    const query = {
      report: 'products_by_category' as const,
      categoryId: '11111111-1111-4111-8111-111111111111',
      from: '2026-10-01',
      to: '2026-10-22',
      field: ['sku'],
    };
    const result = await fetchCompleteReport(query);
    expect(result.rows).toHaveLength(2);
    expect(api.fetchWorkspace).toHaveBeenNthCalledWith(2, 'reports', undefined, {
      ...query,
      page: 2,
      pageSize: 1000,
    });
  });
  it('fails visibly when pagination stops progressing instead of exporting a truncated file', async () => {
    api.fetchWorkspace.mockResolvedValue({ ...workspace, totalRows: 2 });
    await expect(fetchCompleteReport({ report: 'products_by_category' })).rejects.toThrow(
      'cambió durante',
    );
  });
});

it('keeps an export usable when a category removes the only visible dynamic attribute', () => {
  expect(
    projectReport(workspace.columns, workspace.rows, {
      order: ['removed-attribute', 'sku', 'attribute:diameter'],
      hidden: ['sku', 'attribute:diameter'],
    }),
  ).toEqual({ headers: ['Código artículo'], rows: [['6205']] });
});
