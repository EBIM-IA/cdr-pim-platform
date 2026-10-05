import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ApplicationsWorkspace } from '@/components/applications-workspace';
import { AuditWorkspace } from '@/components/audit-workspace';
import { CategoriesAdminWorkspace } from '@/components/categories-admin-workspace';
import { EquivalencesWorkspace } from '@/components/equivalences-workspace';
import { ImportsWorkspace } from '@/components/imports-workspace';
import { ModuleWorkspace } from '@/components/module-workspace';
import { TemplatesAdminWorkspace } from '@/components/templates-admin-workspace';
import { isModuleSlug, moduleDefinitions, moduleSlugs } from '@/lib/module-definitions';
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

  if (module === 'categories') {
    return <CategoriesAdminWorkspace />;
  }
  if (module === 'templates') {
    return (
      <TemplatesAdminWorkspace canManageRoleAccess={capabilities.has('administration:manage')} />
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
  if (module === 'reports' && capabilities.has('audit:read')) {
    return <AuditWorkspace />;
  }

  return <ModuleWorkspace key={definition.slug} definition={definition} />;
}
