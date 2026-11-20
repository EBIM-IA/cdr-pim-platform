import type { CatalogParameterDto } from '@cdr/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogHomeSettings } from '@/lib/catalog-home-api';
import { listCatalogParameters } from '@/lib/catalog-parameters-api';
import { authenticatedBffFetch } from '@/lib/bff-client';
import { technicalSheetBrand } from './technical-sheet-export';

vi.mock('@/lib/catalog-home-api', () => ({ catalogHomeSettings: vi.fn() }));
vi.mock('@/lib/catalog-parameters-api', () => ({ listCatalogParameters: vi.fn() }));
vi.mock('@/lib/bff-client', () => ({ authenticatedBffFetch: vi.fn() }));
const parameter = (
  value: string,
  logoDataUrl: string | null,
  active = true,
): CatalogParameterDto => ({
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'brand',
  value,
  description: `Información ${value}`,
  target: null,
  logoDataUrl,
  active,
  version: 1,
  updatedAt: '2026-11-20T14:00:00.000Z',
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listCatalogParameters).mockResolvedValue([]);
  vi.mocked(catalogHomeSettings).mockResolvedValue({
    config: { brands: [], categories: [] },
    version: 0,
  });
});

describe('Technical sheet brand logo fallback', () => {
  it('prefers an active own logo over parent branding and does not request Home settings', async () => {
    const brands = [
      parameter('OKAMI', 'data:image/png;base64,AQ=='),
      parameter('OKAMI FRENOS', 'data:image/png;base64,Ag=='),
    ];
    await expect(technicalSheetBrand('okami-frenos', undefined, brands)).resolves.toMatchObject({
      brandLogo: 'data:image/png;base64,Ag==',
      brandDescription: 'Información OKAMI FRENOS',
    });
    expect(listCatalogParameters).not.toHaveBeenCalled();
    expect(catalogHomeSettings).not.toHaveBeenCalled();
  });

  it('inherits the longest active parent logo and uses the manufacturer alias for FAG', async () => {
    const brands = [
      parameter('OKAMI', 'data:image/png;base64,AQ=='),
      parameter('OKAMI FRENOS', 'data:image/png;base64,Ag=='),
      parameter('SCHAEFFLER', 'data:image/png;base64,Aw=='),
    ];
    await expect(
      technicalSheetBrand('OKAMI FRENOS PREMIUM', undefined, brands),
    ).resolves.toMatchObject({ brandLogo: 'data:image/png;base64,Ag==' });
    await expect(technicalSheetBrand('FAG AUTOMOTRIZ', undefined, brands)).resolves.toMatchObject({
      brandLogo: 'data:image/png;base64,Aw==',
    });
    expect(catalogHomeSettings).not.toHaveBeenCalled();
  });

  it('falls back to the Home image when no registered logo is available', async () => {
    vi.mocked(listCatalogParameters).mockResolvedValue([parameter('OKAMI', null)]);
    vi.mocked(catalogHomeSettings).mockResolvedValue({
      config: {
        categories: [],
        brands: [
          { key: 'OKAMI', text: 'OKAMI', visible: true, image: 'data:image/png;base64,AQID' },
        ],
      },
      version: 1,
    });
    const request = new AbortController();
    await expect(technicalSheetBrand('OKAMI FRENOS', request.signal)).resolves.toMatchObject({
      brandLogo: 'data:image/png;base64,AQID',
    });
    expect(catalogHomeSettings).toHaveBeenCalledWith(undefined, request.signal);
    expect(authenticatedBffFetch).not.toHaveBeenCalled();
  });

  it('uses the bundled parent image for an alias and preserves explicit image removal from Home', async () => {
    vi.mocked(authenticatedBffFetch).mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71])),
    );
    await expect(technicalSheetBrand('INA')).resolves.toMatchObject({
      brandLogo: 'data:image/png;base64,iVBORw==',
    });
    expect(authenticatedBffFetch).toHaveBeenCalledWith(
      '/home/marcas/schaeffler-luk-ina-fag.png',
      expect.objectContaining({ cache: 'no-store' }),
    );
    vi.mocked(authenticatedBffFetch).mockClear();
    vi.mocked(catalogHomeSettings).mockResolvedValue({
      config: {
        categories: [],
        brands: [{ key: 'SCHAEFFLER', text: 'SCHAEFFLER', visible: true, image: null }],
      },
      version: 2,
    });
    expect((await technicalSheetBrand('INA')).brandLogo).toBeUndefined();
    expect(authenticatedBffFetch).not.toHaveBeenCalled();
  });

  it('ignores inactive registered logos and leaves an unknown brand as text', async () => {
    vi.mocked(listCatalogParameters).mockResolvedValue([
      parameter('MARCA INACTIVA', 'data:image/png;base64,AQID', false),
    ]);
    expect((await technicalSheetBrand('MARCA INACTIVA')).brandLogo).toBeUndefined();
    expect(authenticatedBffFetch).not.toHaveBeenCalled();
  });

  it('preserves JPEG bytes from a valid Home logo instead of labeling them as PNG', async () => {
    vi.mocked(catalogHomeSettings).mockResolvedValue({
      config: {
        categories: [],
        brands: [
          {
            key: 'MARCA PROPIA',
            text: 'Marca propia',
            visible: true,
            image: '/home/marcas/marca-propia.jpg',
          },
        ],
      },
      version: 1,
    });
    vi.mocked(authenticatedBffFetch).mockResolvedValue(
      new Response(new Uint8Array([255, 216, 255, 0])),
    );
    await expect(technicalSheetBrand('MARCA PROPIA')).resolves.toMatchObject({
      brandLogo: 'data:image/jpeg;base64,/9j/AA==',
      brandLogoSource: 'Inicio',
    });
  });
});
