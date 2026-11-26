import { describe, expect, it, vi } from 'vitest';
import { BootstrapCodeAffixesUseCase } from './bootstrap-code-affixes.use-case';
import { CodeAffix } from '../../code-affixes/domain/entities/code-affix';
import type { CodeAffixRepositoryPort } from '../../code-affixes/domain/ports/code-affix.repository.port';
import { Role } from '../../identity/domain/entities/role';
import type { CatalogCodeSample } from '../../catalog-schema/domain/ports/dynamic-catalog.repository.port';
import type { ApprovedHomologCode } from '../../equivalences/domain/ports/external-homolog-repository.port';
const actor = { id: 'admin', email: 'admin@example.test', roles: [Role.Administrator] },
  now = new Date('2026-11-16T15:00:00Z');

function setup(
  items: unknown[],
  sample: readonly CatalogCodeSample[] = [],
  homologs: readonly ApprovedHomologCode[] = [],
) {
  const generate = vi.fn().mockResolvedValue({ model: 'test', text: JSON.stringify({ items }) });
  const sampleCodes = vi.fn().mockResolvedValue(sample);
  const sampleApprovedCodes = vi.fn().mockResolvedValue(homologs);
  const create = { execute: vi.fn(async (input, user) => CodeAffix.create(input, user.id, now)) };
  const service = new BootstrapCodeAffixesUseCase(
    { model: 'test', generate },
    create,
    { list: vi.fn().mockResolvedValue([]) } as unknown as CodeAffixRepositoryPort,
    { sampleCodes },
    { sampleApprovedCodes },
  );
  return { service, generate, sampleCodes, sampleApprovedCodes };
}

describe('AI affix bootstrap', () => {
  it('requires literal evidence, suppresses duplicates, and stores every suggestion pending human validation', async () => {
    const { service, sampleCodes, sampleApprovedCodes } = setup([
      {
        kind: 'suffix',
        token: '2RS',
        meaning: 'Dos sellos',
        confidence: 0.95,
        evidence: '2RS significa dos sellos',
      },
      {
        kind: 'suffix',
        token: 'ZZ',
        meaning: 'Blindado',
        confidence: 0.99,
        evidence: 'Cita inventada',
      },
      {
        kind: 'suffix',
        token: '2RS',
        meaning: 'Duplicado',
        confidence: 0.95,
        evidence: '2RS significa dos sellos',
      },
    ]);
    const result = await service.execute(
      { evidence: 'El fabricante indica que 2RS significa dos sellos para esta familia.' },
      actor,
    );
    expect(sampleCodes).not.toHaveBeenCalled();
    expect(sampleApprovedCodes).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.skipped).toBe(2);
    expect(result.items[0]?.toSnapshot()).toMatchObject({
      source: 'ai_suggestion',
      status: 'pending_validation',
      validatedAt: null,
    });
  });

  it('proposes catalog affixes only from literal, distinct codes in the requested brand', async () => {
    const suggestion = {
      kind: 'suffix',
      token: '2RS',
      meaning: 'Segmento recurrente. Significado por confirmar.',
      confidence: 0.8996,
      brand: 'SKF',
      examples: ['6202-2RS', '6203-2RS'],
    };
    const sample = [
      { kind: 'sku', code: '6202-2RS', brand: 'SKF' },
      { kind: 'provider', code: '6203-2RS', brand: 'SKF' },
    ] as const;
    const homolog = { code: '62042RS', brand: 'SKF' };
    const { service, generate, sampleCodes, sampleApprovedCodes } = setup(
      [
        suggestion,
        { ...suggestion, examples: ['6202-2RS', 'NO-EXISTE-2RS'] },
        { ...suggestion, examples: ['6202-2RS', '6202-2RS'] },
        { ...suggestion, brand: 'NSK' },
        { ...suggestion, token: 'ZZ' },
      ],
      sample,
      [homolog],
    );
    const result = await service.execute(
      { source: 'catalog', brand: 'skf' },
      {
        ...actor,
        roles: [Role.Admin],
      },
    );
    expect(sampleCodes).toHaveBeenCalledWith([Role.Administrator], 'skf');
    expect(sampleApprovedCodes).toHaveBeenCalledWith('skf');
    expect(JSON.parse(generate.mock.calls[0]![0].input)).toMatchObject({
      recordType: 'code_affix_catalog',
      codes: [...sample, { ...homolog, kind: 'homolog' }],
    });
    expect(result).toMatchObject({ sample: { sku: 1, provider: 1, homolog: 1 }, skipped: 4 });
    expect(result.items.map((item) => item.toSnapshot())).toEqual([
      expect.objectContaining({
        brand: 'SKF',
        confidence: 0.899,
        evidence: '6202-2RS\n6203-2RS',
        status: 'pending_validation',
      }),
    ]);
  });

  it('checks administration before reading the catalog and skips generation when the sample is empty', async () => {
    const { service, sampleCodes, sampleApprovedCodes, generate } = setup([]);
    await expect(
      service.execute({ source: 'catalog' }, { ...actor, roles: [Role.Sales] }),
    ).rejects.toThrow('Solo Administración');
    expect(sampleCodes).not.toHaveBeenCalled();
    expect(sampleApprovedCodes).not.toHaveBeenCalled();
    await expect(service.execute({ source: 'catalog' }, actor)).resolves.toMatchObject({
      items: [],
      skipped: 0,
      sample: { sku: 0, provider: 0, homolog: 0 },
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('requires the claimed prefix, series or suffix position in every cited example', async () => {
    const suggestion = {
      meaning: 'Segmento recurrente. Significado por confirmar.',
      confidence: 0.8,
      brand: 'SKF',
      examples: ['-AB6202-2RS-C3', 'AB6304-2RS-C3'],
    };
    const { service } = setup(
      [
        { ...suggestion, kind: 'prefix', token: 'AB' },
        { ...suggestion, kind: 'series', token: '6' },
        { ...suggestion, kind: 'suffix', token: '2RS' },
        { ...suggestion, kind: 'prefix', token: '2RS' },
        { ...suggestion, kind: 'series', token: '2' },
        { ...suggestion, kind: 'suffix', token: 'AB' },
        { ...suggestion, kind: 'suffix', token: 'RS' },
      ],
      suggestion.examples.map((code) => ({ kind: 'sku', code, brand: 'SKF' })),
    );
    const result = await service.execute({ source: 'catalog', brand: 'SKF' }, actor);
    expect(result.skipped).toBe(4);
    expect(result.items.map((item) => item.toSnapshot().token)).toEqual(['AB', '6', '2RS']);
  });
});
