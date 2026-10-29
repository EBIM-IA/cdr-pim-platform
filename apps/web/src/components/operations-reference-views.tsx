'use client';

import type {
  AdminCatalogCategoryDto,
  AuthenticatedActorDto,
  AuthCapability,
  CatalogWorkbookProductDto,
  WorkspaceDto,
} from '@cdr/contracts';
import { Activity, Database, FileArchive, Search } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { listAdminCategories } from '@/lib/catalog-admin-api';
import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';
import { moduleDefinitions, moduleMenuCapabilities, moduleSlugs } from '@/lib/module-definitions';

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <h2 className="border-b px-4 py-3 text-sm font-semibold">{title}</h2>
      <div className="p-4">{children}</div>
    </Card>
  );
}
function EmptyTable({ columns, message }: { columns: readonly string[]; message: string }) {
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[620px] text-left text-xs">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((label) => (
              <th key={label} className="border-b p-2.5">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={columns.length} className="p-9 text-center text-muted-foreground">
              {message}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
function Indicator({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <Card className="flex gap-3 p-4">
      <Activity className="mt-1 size-5 shrink-0 text-primary" />
      <div>
        <small className="text-muted-foreground">{label}</small>
        <strong className="mt-1 block text-2xl">{value}</strong>
        <small className="mt-1 block text-muted-foreground">{note}</small>
      </div>
    </Card>
  );
}
const sourceInfo = {
  fabricante: {
    label: 'Fabricante',
    description: 'Fichas técnicas, catálogos y planos autorizados',
    state: 'Configurable',
    note: 'Consulta documental por marca.',
  },
  archivo: {
    label: 'Archivo',
    description: 'Archivos de enriquecimiento Excel / CSV',
    state: 'Activo',
    note: 'Carga de atributos por código del artículo.',
  },
  manual: {
    label: 'Manual',
    description: 'Captura del catalogador',
    state: 'Activo',
    note: 'Cambios trazables con revisión humana.',
  },
  tecdoc: {
    label: 'TecDoc',
    description: 'Artículos y aplicaciones vehiculares',
    state: 'Por confirmar',
    note: 'Pendiente de licencia y configuración de conexión.',
  },
} as const;

function ExternalSources() {
  const [products, setProducts] = useState<CatalogWorkbookProductDto[]>([]);
  const [categories, setCategories] = useState<AdminCatalogCategoryDto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<keyof typeof sourceInfo | null>(null);
  useEffect(() => {
    let current = true;
    void listAdminCategories(false)
      .then((items) => {
        if (current) setCategories(items);
      })
      .catch(() => {
        if (current) setError('No pudimos cargar la prioridad de fuentes.');
      });
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchCatalogWorkbook(
        { q: query || undefined, page: 1, pageSize: 25, filter: [] },
        controller.signal,
      )
        .then((result) => {
          setProducts(result.items);
          setSelectedId((id) =>
            result.items.some((item) => item.id === id) ? id : (result.items[0]?.id ?? ''),
          );
        })
        .catch(() => {
          if (!controller.signal.aborted) setError('No pudimos consultar los SKU.');
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const product = products.find((item) => item.id === selectedId);
  const category = categories.find((item) => item.id === product?.category?.id);
  const sources = (Object.keys(sourceInfo) as (keyof typeof sourceInfo)[])
    .map((key) => ({ key, ...sourceInfo[key], rank: category?.sourcePriority[key] }))
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  return (
    <div className="space-y-4">
      <Card className="grid items-end gap-3 p-4 sm:grid-cols-2">
        <label className="relative">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Buscar SKU</span>
          <Input
            type="search"
            placeholder="Código, marca o producto…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Select
          label="SKU en contexto · primeros 25 resultados"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">Selecciona un SKU</option>
          {products.map((item) => (
            <option key={item.id} value={item.id}>
              {item.sku} · {item.brand}
            </option>
          ))}
        </Select>
        {product ? (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {product.template?.name ?? 'Sin plantilla'} · Prioridad BUSQUEDA de la categoría{' '}
            {category?.name ?? 'sin asignar'}
          </p>
        ) : null}
      </Card>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {sources.map((source) => (
          <Card key={source.key} className="p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-full bg-orange-50 font-semibold text-primary">
                {source.rank ?? '—'}
              </span>
              <h2 className="flex-1 text-sm font-semibold">{source.label}</h2>
              <StatusBadge tone={source.state === 'Activo' ? 'success' : 'neutral'}>
                {source.state}
              </StatusBadge>
            </div>
            <p className="mt-3 text-xs">{source.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">{source.note}</p>
            <p className="my-4 text-xs text-muted-foreground">
              Candidatos para este SKU: consulta pendiente de habilitar.
            </p>
            <Button size="sm" variant="outline" onClick={() => setDetail(source.key)}>
              Ver capacidad
            </Button>
          </Card>
        ))}
      </div>
      <Panel title="Candidatos y conflictos del SKU">
        <EmptyTable
          columns={['Atributo', 'Fuente', 'Valor', 'Prioridad', 'Evidencia', 'Estado', 'Acción']}
          message="La consulta de candidatos de fuentes todavía no está disponible."
        />
      </Panel>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <a href="/quality?view=sources">Prioridad de fuentes</a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="/imports?view=new">Cargar archivo</a>
        </Button>
      </div>
      {detail ? (
        <WorkspaceDrawer title={sourceInfo[detail].label} onClose={() => setDetail(null)}>
          <p className="text-sm">{sourceInfo[detail].description}</p>
          <p className="mt-3 text-sm text-muted-foreground">{sourceInfo[detail].note}</p>
        </WorkspaceDrawer>
      ) : null}
    </div>
  );
}

export function IntegrationsReferenceView({
  workspace,
  view,
}: {
  workspace: WorkspaceDto;
  view: 'sources' | 'monitor' | 'batches';
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  if (view === 'sources') return <ExternalSources />;
  if (view === 'batches')
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Lote', '—'],
            ['Recibidos', '—'],
            ['Procesados', '—'],
            ['Con incidencia', '—'],
          ].map(([label, value]) => (
            <Indicator key={label!} label={label!} value={value!} note="Sin lote seleccionado" />
          ))}
        </div>
        <Panel title="Cabecera del lote">
          <dl className="grid gap-4 text-xs sm:grid-cols-4">
            {['Identificador del lote', 'Fecha de envío', 'Recepción PIM', 'Origen'].map(
              (label) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-semibold">—</dd>
                </div>
              ),
            )}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            El detalle de lotes de Sismetic / AX estará disponible al habilitar la conexión.
          </p>
        </Panel>
        <Panel title="Errores por registro">
          <EmptyTable
            columns={[
              'Fila',
              'Código artículo',
              'Código de error',
              'Campo',
              'Mensaje',
              'Estado',
              'Acción',
            ]}
            message="No hay un lote disponible para consultar."
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled>
              Descargar errores
            </Button>
            <Button size="sm" disabled>
              Reprocesar advertencias
            </Button>
          </div>
        </Panel>
        <Button asChild size="sm" variant="outline">
          <a href="/integrations?view=monitor">Volver al monitor</a>
        </Button>
      </div>
    );
  const components = workspace.rows.filter(
    (row) => !['ax-mock', 'queue', 'storage', 'postgresql', 'ai'].includes(row.id),
  );
  const configured = components.filter((row) => row.values.configured === true).length;
  const detail = components.find((row) => row.id === detailId);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicator
          label="Conectores externos"
          value={components.length}
          note={`${configured} configurados`}
        />
        <Indicator label="Procesados" value="—" note="Historial no disponible" />
        <Indicator label="Registros con error" value="—" note="Historial no disponible" />
        <Indicator label="En proceso" value="—" note="Historial no disponible" />
      </div>
      <Panel title="Ejecuciones recientes">
        <EmptyTable
          columns={[
            'Integración',
            'Lote',
            'Fecha',
            'Recibidos',
            'Procesados',
            'Errores',
            'Estado',
            'Acción',
          ]}
          message="El historial de ejecuciones externas aún no está disponible."
        />
      </Panel>
      <Panel title="Conectores">
        <div className="grid gap-3 md:grid-cols-3">
          {components.map((row) => (
            <Card key={row.id} className="p-4">
              <Database className="mb-2 size-5 text-primary" />
              <h3 className="text-sm font-semibold">{String(row.values.system ?? row.id)}</h3>
              <p className="my-3 text-xs text-muted-foreground">
                {row.values.configured === true ? 'Configurado' : 'Pendiente de conexión'}
              </p>
              <Button size="sm" variant="outline" onClick={() => setDetailId(row.id)}>
                Detalle
              </Button>
            </Card>
          ))}
        </div>
      </Panel>
      {detail ? (
        <WorkspaceDrawer title={String(detail.values.system)} onClose={() => setDetailId(null)}>
          <p className="text-sm">
            {detail.values.configured === true
              ? 'La conexión está configurada.'
              : 'La conexión está pendiente de configuración.'}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Las ejecuciones y sus errores aparecerán en el monitor cuando el conector esté
            habilitado.
          </p>
        </WorkspaceDrawer>
      ) : null}
    </div>
  );
}

const permissions = [
  ['Consultar productos', 'catalog:read'],
  ['Consultar atributos de plantilla', 'attributes:read'],
  ['Editar enriquecimiento', 'attributes:write'],
  ['Editar aplicaciones', 'applications:write'],
  ['Editar códigos y homólogos', 'equivalences:write'],
  ['Importaciones y carga masiva', 'imports:execute'],
  ['Publicación por canal', 'menu:publication:view'],
  ['Configurar plantillas, usuarios y roles', 'administration:manage'],
  ['Consultar auditoría', 'audit:read'],
] as const;

const modulePermissions: readonly { label: string; capability: AuthCapability }[] = [
  { label: 'Dashboard', capability: 'menu:home:view' },
  { label: 'Productos', capability: 'menu:products:view' },
  ...moduleSlugs.map((slug) => ({
    label: moduleDefinitions[slug].label,
    capability: moduleMenuCapabilities[slug],
  })),
];

export function AdministrationReferenceView({
  workspace,
  view,
  actor,
}: {
  workspace: WorkspaceDto;
  view: 'users' | 'roles';
  actor?: AuthenticatedActorDto;
}) {
  if (view === 'users')
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {['Usuarios', 'Activos', 'Inactivos'].map((label) => (
            <Indicator
              key={label}
              label={label}
              value="—"
              note="Directorio pendiente de habilitar"
            />
          ))}
        </div>
        <Panel title="Usuarios">
          <div className="mb-3 flex justify-end">
            <Button
              size="sm"
              disabled
              title="El mantenimiento de usuarios está pendiente de habilitar"
            >
              Nuevo usuario
            </Button>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[650px] text-left text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {['Nombre', 'Correo', 'Rol', 'Estado', 'Acciones'].map((label) => (
                    <th key={label} className="border-b p-2.5">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actor ? (
                  <tr className="border-b">
                    <th scope="row" className="p-2.5 text-left font-medium">
                      Usuario actual
                    </th>
                    <td className="p-2.5">{actor.email}</td>
                    <td className="p-2.5">{actor.roles.join(' · ')}</td>
                    <td className="p-2.5">
                      <StatusBadge tone="success">Sesión activa</StatusBadge>
                    </td>
                    <td className="p-2.5">
                      <Button size="sm" variant="outline" disabled>
                        Editar
                      </Button>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      Identidad de sesión no disponible.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Se muestra la identidad de la sesión actual. El directorio completo y sus altas, bajas y
            cambios de rol están pendientes de habilitar.
          </p>
        </Panel>
      </div>
    );
  const matrix = (
    workspace as WorkspaceDto & { roleCapabilities?: { role: string; capabilities: string[] }[] }
  ).roleCapabilities;
  const roles = ['ADMINISTRADOR', 'COMPRAS', 'VENTAS'];
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs text-muted-foreground">Rol de la sesión</p>
        <strong className="mt-1 block text-sm">
          {actor?.roles.join(' · ') ?? 'Consultar permisos vigentes'}
        </strong>
        <p className="mt-2 text-xs text-muted-foreground">
          La visibilidad y edición de cada atributo se configura por plantilla.
        </p>
      </Card>
      <Panel title="Matriz de permisos por rol">
        <div className="overflow-auto">
          <table
            aria-label="Matriz de permisos por rol"
            className="w-full min-w-[650px] text-left text-xs"
          >
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3">Permiso</th>
                {roles.map((role) => (
                  <th key={role} className="p-3">
                    {role}
                    {actor?.roles.includes(role as 'ADMINISTRADOR') ? ' · sesión' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.map(([label, capability]) => (
                <tr key={capability} className="border-t">
                  <th scope="row" className="p-3 text-left font-medium">
                    {label}
                  </th>
                  {roles.map((role) => {
                    const grants = matrix?.find((entry) => entry.role === role);
                    return (
                      <td key={role} className="p-3">
                        <StatusBadge
                          tone={grants?.capabilities.includes(capability) ? 'success' : 'neutral'}
                        >
                          {grants
                            ? grants.capabilities.includes(capability)
                              ? 'Sí'
                              : 'No'
                            : 'Sin información'}
                        </StatusBadge>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Permisos vigentes calculados por el sistema. La edición del conjunto de roles está
          pendiente de habilitar.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled>
            Duplicar rol
          </Button>
          <Button size="sm" disabled>
            Editar permisos
          </Button>
        </div>
      </Panel>
      <Panel title="Módulos visibles por perfil">
        <p className="mb-4 text-xs text-muted-foreground">
          Módulos habilitados para cada rol. La visibilidad de los atributos se configura en
          Plantillas.
        </p>
        <div className="overflow-auto">
          <table
            aria-label="Módulos visibles por perfil"
            className="w-full min-w-[650px] text-left text-xs"
          >
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3">Módulo</th>
                {roles.map((role) => (
                  <th key={role} className="p-3">
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modulePermissions.map(({ label, capability }) => (
                <tr key={capability} className="border-t">
                  <th scope="row" className="p-3 text-left font-medium">
                    {label}
                  </th>
                  {roles.map((role) => {
                    const grants = matrix?.find((entry) => entry.role === role);
                    const visible = Boolean(grants?.capabilities.includes(capability));
                    return (
                      <td key={role} className="p-3">
                        <StatusBadge tone={visible ? 'success' : 'neutral'}>
                          {grants ? (visible ? 'Sí' : 'No') : 'Sin información'}
                        </StatusBadge>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          La matriz muestra los permisos vigentes. El mantenimiento de accesos por perfil está
          pendiente de habilitar.
        </p>
      </Panel>
    </div>
  );
}

export function CatalogsReferenceView() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative min-w-60 flex-1">
          <span className="sr-only">Buscar catálogo</span>
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar catálogo por nombre o marca…" disabled />
        </label>
        <Button disabled>
          <FileArchive className="size-4" />
          Nuevo catálogo PDF
        </Button>
      </div>
      <Panel title="Catálogos de productos">
        <EmptyTable
          columns={[
            'Catálogo',
            'Marca',
            'Vigencia desde',
            'Vigencia hasta',
            'Estado',
            'PDF',
            'Acciones',
          ]}
          message="El registro y mantenimiento de catálogos PDF está pendiente de habilitar."
        />
      </Panel>
    </div>
  );
}
