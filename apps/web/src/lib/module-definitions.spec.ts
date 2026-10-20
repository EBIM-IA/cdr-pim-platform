import { describe, expect, it } from 'vitest';

import {
  moduleDefinitions,
  moduleMenuCapabilities,
  moduleSlugs,
  type ModuleCapability,
} from '@/lib/module-definitions';

const capabilityStatuses: ReadonlySet<ModuleCapability['status']> = new Set([
  'available',
  'confirmed',
  'next',
  'blocked',
]);

const isNonEmptyText = (value: string) => value.trim().length > 0;

describe('definiciones de módulos', () => {
  it('mantiene slugs únicos y una definición para cada uno', () => {
    expect(new Set(moduleSlugs).size).toBe(moduleSlugs.length);
    expect(Object.keys(moduleDefinitions).sort()).toEqual([...moduleSlugs].sort());
  });

  it('declara una capacidad de acceso directo para cada módulo', () => {
    expect(Object.keys(moduleMenuCapabilities).sort()).toEqual([...moduleSlugs].sort());
    expect(new Set(Object.values(moduleMenuCapabilities)).size).toBe(moduleSlugs.length);
  });

  it.each(moduleSlugs)('mantiene coherente el slug de %s', (slug) => {
    expect(moduleDefinitions[slug].slug).toBe(slug);
  });

  it.each(moduleSlugs)(
    'declara acciones, capacidades y dependencias bien formadas para %s',
    (slug) => {
      const definition = moduleDefinitions[slug];

      expect(definition.actions.length).toBeGreaterThan(0);
      expect(definition.actions.every(isNonEmptyText)).toBe(true);
      expect(definition.dependencies.every(isNonEmptyText)).toBe(true);
      expect(
        definition.capabilities.every(
          (capability) =>
            isNonEmptyText(capability.title) &&
            isNonEmptyText(capability.description) &&
            capabilityStatuses.has(capability.status),
        ),
      ).toBe(true);
    },
  );

  it('mantiene todos los módulos configurados como workspaces operativos', () => {
    expect(
      moduleSlugs.every(
        (slug) =>
          moduleDefinitions[slug].kind === 'workspace' &&
          moduleDefinitions[slug].capabilities.length > 0,
      ),
    ).toBe(true);
  });

  it('distingue capacidades implementadas de reglas todavía confirmadas', () => {
    expect(moduleDefinitions.templates.capabilities).toContainEqual(
      expect.objectContaining({ title: 'Replicables', status: 'available' }),
    );
    expect(moduleDefinitions.applications.capabilities).toContainEqual(
      expect.objectContaining({ title: 'Alcance por código unificador', status: 'confirmed' }),
    );
    expect(moduleDefinitions.equivalences.capabilities).toContainEqual(
      expect.objectContaining({ title: 'Elegibilidad de homólogos', status: 'confirmed' }),
    );
    expect(moduleDefinitions.publication.capabilities).toContainEqual(
      expect.objectContaining({ title: 'Publicabilidad por SKU', status: 'available' }),
    );
  });

  it('identifica una fuente autenticada para cada módulo', () => {
    expect(
      moduleSlugs.every((slug) => /autenticad/iu.test(moduleDefinitions[slug].dataSource)),
    ).toBe(true);
  });
});
