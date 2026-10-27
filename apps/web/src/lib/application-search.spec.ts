import type {
  CatalogWorkbookProductDto,
  CatalogWorkbookResultDto,
  GroupApplicationDto,
} from '@cdr/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applicationMatches, findApplicationUnifiedCodes } from './application-search';
import { fetchCatalogWorkbook } from './dynamic-catalog-api';

vi.mock('./dynamic-catalog-api', () => ({ fetchCatalogWorkbook: vi.fn() }));

const application = {
  unifiedCode: 'UNI-6205',
  make: 'TOYOTA',
  model: 'COROLLA',
  area: 'ADMISIÓN',
  yearFrom: 2014,
  yearTo: 2018,
} as GroupApplicationDto;
const page = (
  items: readonly { id: string; unifiedCode: string }[],
  total: number,
): CatalogWorkbookResultDto => ({
  items: items as CatalogWorkbookProductDto[],
  columns: [],
  facets: { brands: [], statuses: [], applicationTypes: [] },
  total,
  page: 1,
  pageSize: 100,
});
beforeEach(() => vi.clearAllMocks());

describe('application search', () => {
  it('matches every normalized term across fields including year columns', () => {
    expect(applicationMatches('toyota corolla admision 2014', application)).toBe(true);
    expect(applicationMatches('corolla 2018', application)).toBe(true);
    expect(applicationMatches('toyota nissan', application)).toBe(false);
  });

  it('paginates product searches and returns only unified codes that have applications', async () => {
    vi.mocked(fetchCatalogWorkbook)
      .mockResolvedValueOnce(page([{ id: 'p1', unifiedCode: 'OTHER' }], 2))
      .mockResolvedValueOnce(page([{ id: 'p2', unifiedCode: 'UNI-6205' }], 2));
    const signal = new AbortController().signal;
    expect(await findApplicationUnifiedCodes('6205 SKF', ['UNI-6205'], signal)).toEqual(
      new Set(['UNI-6205']),
    );
    expect(fetchCatalogWorkbook).toHaveBeenLastCalledWith(
      { page: 2, pageSize: 100, q: '6205 SKF', filter: [] },
      signal,
    );
  });

  it('fails an inconsistent repeated page instead of presenting a partial result as complete', async () => {
    vi.mocked(fetchCatalogWorkbook).mockResolvedValue(
      page([{ id: 'p1', unifiedCode: 'OTHER' }], 2),
    );
    await expect(
      findApplicationUnifiedCodes('SKF', ['UNI-6205'], new AbortController().signal),
    ).rejects.toThrow('El catálogo cambió');
  });

  it('does not request another page for a cancelled query', async () => {
    const controller = new AbortController();
    vi.mocked(fetchCatalogWorkbook).mockImplementation(async () => {
      controller.abort();
      return page([{ id: 'p1', unifiedCode: 'OTHER' }], 2);
    });
    await expect(
      findApplicationUnifiedCodes('SKF', ['UNI-6205'], controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchCatalogWorkbook).toHaveBeenCalledTimes(1);
  });
});
