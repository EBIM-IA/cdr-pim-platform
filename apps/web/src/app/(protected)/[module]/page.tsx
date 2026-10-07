import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ApplicationsWorkspace } from '@/components/applications-workspace';
import { CategoriesAdminWorkspace } from '@/components/categories-admin-workspace';
import { DocumentsWorkspace } from '@/components/documents-workspace';
import { EquivalencesWorkspace } from '@/components/equivalences-workspace';
import { ImportsWorkspace } from '@/components/imports-workspace';
import { ModuleWorkspace } from '@/components/module-workspace';
import { ReferenceWorkspace } from '@/components/reference-workspace';
import { StatePanel } from '@/components/state-panel';
import { TemplatesAdminWorkspace } from '@/components/templates-admin-workspace';
import {
  isModuleSlug,
  moduleDefinitions,
  moduleMenuCapabilities,
  moduleSlugs,
} from '@/lib/module-definitions';
import { getCurrentActor } from '@/lib/server-auth';

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
  const actor = await getCurrentActor();
  const capabilities = new Set(actor?.capabilities ?? []);

  if (!capabilities.has(moduleMenuCapabilities[module])) {
    return (
      <StatePanel
        variant="error"
        title="Sin permisos para esta pantalla"
        description="Tu rol no tiene habilitado este módulo. Si necesitas acceso, solicítalo a una persona administradora."
      />
    );
  }

  if (module === 'categories') {
    return <CategoriesAdminWorkspace />;
  }
  if (module === 'templates') {
    return (
      <TemplatesAdminWorkspace canManageTemplate={capabilities.has('administration:manage')} />
    );
  }
  if (module === 'applications') {
    return <ApplicationsWorkspace canWrite={capabilities.has('applications:write')} />;
  }
  if (module === 'equivalences') {
    return <EquivalencesWorkspace canWrite={capabilities.has('equivalences:write')} />;
  }
  if (module === 'imports') {
    return <ImportsWorkspace canExecute={capabilities.has('imports:execute')} />;
  }
  if (module === 'documents') {
    return <DocumentsWorkspace canWrite={capabilities.has('catalog:write')} />;
  }
  if (
    module === 'quality' ||
    module === 'publication' ||
    module === 'integrations' ||
    module === 'reports' ||
    module === 'administration'
  ) {
    return <ReferenceWorkspace key={definition.slug} definition={definition} />;
  }

  return <ModuleWorkspace key={definition.slug} definition={definition} />;
}
