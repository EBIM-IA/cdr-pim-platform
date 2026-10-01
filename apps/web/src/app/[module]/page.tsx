import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ModuleWorkspace } from '@/components/module-workspace';
import { isModuleSlug, moduleDefinitions, moduleSlugs } from '@/lib/module-definitions';

interface ModulePageProps {
  params: Promise<{ module: string }>;
}

export function generateStaticParams() {
  return moduleSlugs.map((module) => ({ module }));
}

export async function generateMetadata({ params }: ModulePageProps): Promise<Metadata> {
  const { module } = await params;

  if (!isModuleSlug(module)) {
    return { title: 'Módulo no encontrado' };
  }

  const definition = moduleDefinitions[module];
  return {
    title: definition.label,
    description: definition.description,
  };
}

export default async function ModulePage({ params }: ModulePageProps) {
  const { module } = await params;

  if (!isModuleSlug(module)) {
    notFound();
  }

  const definition = moduleDefinitions[module];

  return <ModuleWorkspace definition={definition} />;
}
