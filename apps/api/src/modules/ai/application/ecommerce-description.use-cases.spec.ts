import type { GenerationRequest } from '../domain/ports/text-generation-provider.port';
import { describe, expect, it, vi } from 'vitest';
import { FixedClock, newUuid } from '@cdr/shared';
import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import type { DynamicCatalogRepositoryPort } from '../../catalog-schema/domain/ports/dynamic-catalog.repository.port';
import type {
  EcommerceDescription,
  EcommerceDescriptionPort,
} from '../../catalog-schema/domain/ports/ecommerce-description.port';
import type { ProductSalesVariantDto } from '@cdr/contracts';
import { EcommerceDescriptionUseCases } from './ecommerce-description.use-cases';
const productId = newUuid(),
  applicationId = newUuid();
const actor: AuthenticatedActor = {
  id: 'admin',
  email: 'admin@example.test',
  roles: [Role.Administrator],
};
const sales: AuthenticatedActor = { ...actor, roles: [Role.Sales] };
const input = { type: 'industrial' as const, applicationId: null };
function fixture() {
  let saved: EcommerceDescription | null = null;
  let diameter = 25;
  const save = vi.fn(async (value: EcommerceDescription, version: number) => {
    if ((saved?.version ?? 0) !== version) throw new Error('version conflict');
    saved = value;
  });
  const repository: EcommerceDescriptionPort = {
    get: async () => saved,
    getMany: async () => (saved ? [saved] : []),
    save,
  };
  const variant: ProductSalesVariantDto = {
    productId,
    codigoArticulo: '6205',
    nombreAmigable: 'Rodamiento SKF 6205',
    tipo: 'industrial',
    marca: 'SKF',
    codigoProveedor: '6205',
    codigoUnificador: 'CU-1',
    aplicacion: null,
    ficha: `/products/${productId}`,
  };
  const experience = {
    experience: vi.fn(async () => ({
      nombreGeneral: variant.nombreAmigable,
      variants: [variant],
      fields: [],
    })),
  };
  const getProductSheet = vi.fn(async (_id: string, roles: readonly string[] = []) => ({
    schema: {
      category: { name: 'Rodamientos' },
      attributes: [
        ...(roles.includes('ADMINISTRADOR')
          ? [
              {
                key: 'adminOnly',
                label: 'Solo Administración',
                unit: null,
                publishable: true,
                sourceAuthority: 'pim',
              },
            ]
          : []),
        {
          key: 'diameter',
          label: 'Diámetro',
          unit: 'mm',
          publishable: true,
          sourceAuthority: 'pim',
        },
        { key: 'private', label: 'Interno', publishable: false, sourceAuthority: 'pim' },
      ],
    },
    product: {
      attributes: {
        diameter: { value: diameter },
        private: { value: 'secret-cost' },
        adminOnly: { value: 'restricted-publicable-value' },
      },
    },
  }));
  const generation = {
    model: 'test-model',
    generate: vi.fn(async (_request: GenerationRequest) => ({
      text: JSON.stringify({
        titulo: 'Rodamiento SKF 6205',
        descripcion: 'Rodamiento con diámetro de 25 mm.',
      }),
      model: 'test-model',
    })),
  };
  const useCases = new EcommerceDescriptionUseCases(
    repository,
    experience,
    { getProductSheet } as unknown as DynamicCatalogRepositoryPort,
    generation,
    new FixedClock(new Date('2026-11-09T15:00:00Z')),
  );
  return {
    useCases,
    generation,
    save,
    experience,
    setDiameter: (value: number) => {
      diameter = value;
    },
  };
}
describe('persisted ecommerce descriptions', () => {
  it('generates once as a pending proposal, approves it explicitly, and serves repeated reads without another model call', async () => {
    const f = fixture();
    expect(await f.useCases.get(productId, input, sales)).toBeNull();
    const generated = await f.useCases.mutate(
      productId,
      { ...input, action: 'generate', version: 0 },
      actor,
    );
    expect(generated).toMatchObject({ status: 'pending', version: 1 });
    expect(await f.useCases.get(productId, input, sales)).toBeNull();
    const approved = await f.useCases.mutate(
      productId,
      { ...input, action: 'approve', version: 1 },
      actor,
    );
    expect(approved).toMatchObject({ status: 'approved', version: 2, approvedBy: actor.email });
    expect(await f.useCases.get(productId, input, sales)).toMatchObject({
      titulo: 'Rodamiento SKF 6205',
    });
    await f.useCases.get(productId, input, sales);
    expect(f.generation.generate).toHaveBeenCalledTimes(1);
    expect(f.generation.generate.mock.calls[0]?.[0]).not.toBeUndefined();
    expect(JSON.stringify(f.generation.generate.mock.calls)).not.toContain('secret-cost');
    expect(JSON.stringify(f.generation.generate.mock.calls)).not.toContain(
      'restricted-publicable-value',
    );
  });
  it('hides stale approved copy from consultation and rejects approval until it is reviewed', async () => {
    const f = fixture();
    await f.useCases.mutate(
      productId,
      {
        ...input,
        action: 'edit',
        version: 0,
        text: { titulo: 'Rodamiento', descripcion: 'Texto revisado.' },
      },
      actor,
    );
    f.setDiameter(30);
    expect(await f.useCases.get(productId, input, sales)).toBeNull();
    expect(await f.useCases.get(productId, input, actor)).toMatchObject({ stale: true });
    await expect(
      f.useCases.mutate(productId, { ...input, action: 'approve', version: 1 }, actor),
    ).rejects.toThrow('datos cambiaron');
    expect(f.generation.generate).not.toHaveBeenCalled();
  });
  it('rejects writes from consultation profiles, outdated versions and nonexistent variants', async () => {
    const f = fixture();
    await expect(
      f.useCases.mutate(productId, { ...input, action: 'generate', version: 0 }, sales),
    ).rejects.toThrow('Administración');
    await f.useCases.mutate(
      productId,
      {
        ...input,
        action: 'edit',
        version: 0,
        text: { titulo: 'Título', descripcion: 'Revisado.' },
      },
      actor,
    );
    await expect(
      f.useCases.mutate(productId, { ...input, action: 'generate', version: 0 }, actor),
    ).rejects.toThrow('cambió');
    await expect(
      f.useCases.get(productId, { type: 'automotriz', applicationId }, actor),
    ).rejects.toThrow('SalesVariant');
    expect(f.generation.generate).not.toHaveBeenCalled();
  });
  it('never persists malformed output or unsupported numeric claims', async () => {
    const f = fixture();
    f.generation.generate.mockResolvedValueOnce({ text: 'not JSON', model: 'test-model' });
    await expect(
      f.useCases.mutate(productId, { ...input, action: 'generate', version: 0 }, actor),
    ).rejects.toThrow('ai:invalid-ecommerce-output');
    f.generation.generate.mockResolvedValueOnce({
      text: JSON.stringify({ titulo: 'SKF', descripcion: 'Resiste 99999 rpm.' }),
      model: 'test-model',
    });
    await expect(
      f.useCases.mutate(productId, { ...input, action: 'generate', version: 0 }, actor),
    ).rejects.toThrow('ai:unsupported-ecommerce-number');
    expect(f.save).not.toHaveBeenCalled();
  });
  it('rejects a generated result if the source changes during the provider call', async () => {
    const f = fixture();
    f.generation.generate.mockImplementationOnce(async () => {
      f.setDiameter(30);
      return {
        text: JSON.stringify({ titulo: 'SKF', descripcion: 'Rodamiento.' }),
        model: 'test-model',
      };
    });
    await expect(
      f.useCases.mutate(productId, { ...input, action: 'generate', version: 0 }, actor),
    ).rejects.toThrow('cambiaron durante');
    expect(f.save).not.toHaveBeenCalled();
  });
});
