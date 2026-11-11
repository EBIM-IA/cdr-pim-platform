import { describe, expect, it } from 'vitest';
import { parseClosedReportPeriods } from './closed-report-periods';
describe('parseClosedReportPeriods', () => {
  it('imports actual monthly cells, preserves zero and skips empty/history summaries', () => {
    expect(
      parseClosedReportPeriods([
        ['MES', 'ITEMS ACT 2024', 'ITEMS ACT 2025'],
        ['ENERO', 0, 250],
        ['FEBRERO', '', 251],
        ['TOTAL', 0, 501],
        ['PROMEDIO', 0, 250],
      ]),
    ).toEqual([
      { year: 2024, month: 1, total: 0 },
      { year: 2025, month: 1, total: 250 },
      { year: 2025, month: 2, total: 251 },
    ]);
  });
  it('rejects ambiguous numeric strings and duplicate months instead of corrupting history', () => {
    expect(() =>
      parseClosedReportPeriods([
        ['MES', 'ITEMS ACT 2024'],
        ['ENERO', '1,250'],
      ]),
    ).toThrow('entero');
    expect(() =>
      parseClosedReportPeriods([
        ['MES', 'ITEMS ACT 2024'],
        ['ENERO', 250],
        ['ENERO', 251],
      ]),
    ).toThrow('repetidos');
  });
});
