export const moduleSlugs = [
  'categories',
  'templates',
  'applications',
  'equivalences',
  'documents',
  'imports',
  'quality',
  'publication',
  'integrations',
  'reports',
  'administration',
] as const;

export type ModuleSlug = (typeof moduleSlugs)[number];
export type ModuleKind = 'catalog-insight' | 'workspace';
export type CapabilityStatus = 'available' | 'confirmed' | 'next' | 'blocked';

/** Capability required to open a module directly, not only to render its menu item. */
export const moduleMenuCapabilities: Readonly<Record<ModuleSlug, AuthCapability>> = {
  categories: 'menu:categories:view',
  templates: 'menu:templates:view',
  applications: 'menu:applications:view',
  equivalences: 'menu:equivalences:view',
  documents: 'menu:documents:view',
  imports: 'menu:imports:view',
  quality: 'menu:ai-quality:view',
  publication: 'menu:publication:view',
  integrations: 'menu:integrations:view',
  reports: 'menu:reports:view',
  administration: 'menu:administration:view',
};

export interface ModuleCapability {
  title: string;
  description: string;
  status: CapabilityStatus;
}

export interface ModuleDefinition {
  slug: ModuleSlug;
  label: string;
  eyebrow: string;
  description: string;
  objective: string;
  actions: readonly string[];
  dataSource: string;
  limitation: string;
  kind: ModuleKind;
  capabilities: readonly ModuleCapability[];
  dependencies: readonly string[];
}

const workspaceReadActions = [
  'Consulta los indicadores y registros publicados por el backend.',
  'Busca cualquier valor dentro de las filas cargadas.',
  'Revisa los avisos operativos y qué capacidades están soportadas o bloqueadas.',
] as const;

export const moduleDefinitions: Record<ModuleSlug, ModuleDefinition> = {
  categories: {
    slug: 'categories',
    label: 'Categorías',
    eyebrow: 'Estructura del catálogo',
    description: 'Administra la taxonomía persistida que organiza las plantillas del catálogo.',
    objective:
      'Permite ordenar, renombrar, activar y desactivar categorías sin eliminar su historial.',
    actions: workspaceReadActions,
    dataSource:
      'Las categorías y sus cambios provienen de la API administrativa autenticada del catálogo.',
    limitation:
      'La creación de categorías y el cambio de jerarquía requieren un contrato administrativo adicional.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Taxonomía persistida',
        description: 'Categorías jerárquicas con orden, vigencia y plantilla asociada.',
        status: 'available',
      },
      {
        title: 'Desactivación segura',
        description: 'Retiro lógico con concurrencia optimista y auditoría inmutable.',
        status: 'available',
      },
      {
        title: 'Cobertura',
        description: 'Indicadores por categoría una vez disponible la taxonomía aprobada.',
        status: 'next',
      },
    ],
    dependencies: ['Contrato futuro de alta y reorganización jerárquica'],
  },
  templates: {
    slug: 'templates',
    label: 'Plantillas',
    eyebrow: 'Gobierno de atributos',
    description: 'Gobierna atributos, reglas de presentación y acceso por rol para cada plantilla.',
    objective:
      'Configura atributos activos, obligatoriedad, replicación, búsqueda y permisos por rol.',
    actions: workspaceReadActions,
    dataSource:
      'Las versiones, asignaciones y matrices de acceso provienen de la API administrativa autenticada del catálogo.',
    limitation:
      'La creación, clonación y publicación de nuevas versiones todavía no tienen endpoints aprobados.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Definiciones tipadas',
        description: 'Atributos, unidades, obligatoriedad y prioridad de fuentes por plantilla.',
        status: 'available',
      },
      {
        title: 'Versionado y publicación',
        description: 'Borradores, comparación de versiones y activación controlada.',
        status: 'next',
      },
      {
        title: 'Replicables',
        description:
          'Indicador por atributo; los valores PIM replicables se propagan y auditan dentro del código unificador.',
        status: 'available',
      },
    ],
    dependencies: ['Contrato futuro para crear y publicar versiones'],
  },
  applications: {
    slug: 'applications',
    label: 'Aplicaciones',
    eyebrow: 'Compatibilidad',
    description: 'Gestiona compatibilidades compartidas por todos los SKU del código unificador.',
    objective:
      'Permite consultar, crear, editar, desactivar y reactivar aplicaciones heredadas por grupo.',
    actions: workspaceReadActions,
    dataSource:
      'Las relaciones se consultan y modifican mediante la API autenticada de aplicaciones.',
    limitation:
      'La carga masiva aplica solo las filas válidas al confirmarse; las rechazadas permanecen trazables en el resultado del lote.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Alcance por código unificador',
        description: 'Regla funcional confirmada para compartir aplicaciones dentro del grupo.',
        status: 'confirmed',
      },
      {
        title: 'Consulta y edición',
        description: 'Búsqueda por SKU, CRUD manual y carga masiva de compatibilidades.',
        status: 'available',
      },
      {
        title: 'Herencia efectiva',
        description: 'Resolución de aplicaciones comunes para todos los SKU del grupo.',
        status: 'available',
      },
    ],
    dependencies: ['Definición definitiva de catálogos de marca, modelo y fuente'],
  },
  equivalences: {
    slug: 'equivalences',
    label: 'Equivalencias',
    eyebrow: 'Relaciones de producto',
    description:
      'Gestiona homólogos externos y resuelve referencias elegibles hacia SKU vendibles.',
    objective: 'Permite mantener código, marca, vigencia y aprobación sin crear SKU artificiales.',
    actions: workspaceReadActions,
    dataSource:
      'Los homólogos y la búsqueda elegible provienen de la API autenticada de equivalencias.',
    limitation:
      'Solo las relaciones simultáneamente activas y aprobadas participan en la búsqueda ampliada.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Modelo de grupos',
        description: 'Estructura N:N para códigos unificadores y sus productos miembros.',
        status: 'available',
      },
      {
        title: 'Gestión de homólogos',
        description:
          'Alta manual o masiva con código unificador, código externo y marca del homólogo.',
        status: 'available',
      },
      {
        title: 'Elegibilidad de homólogos',
        description: 'Solo relaciones simultáneamente activas y aprobadas.',
        status: 'confirmed',
      },
      {
        title: 'Búsqueda por homólogos',
        description: 'Resolver un código externo elegible hacia los SKU comercializados del grupo.',
        status: 'available',
      },
    ],
    dependencies: ['Validación del catálogo definitivo de marcas de homólogos'],
  },
  documents: {
    slug: 'documents',
    label: 'Documentos',
    eyebrow: 'Activos digitales',
    description:
      'Gestiona fotos, fichas y documentos privados asociados individualmente a cada SKU.',
    objective:
      'Permite consultar, cargar, descargar y reemplazar activos por SKU, además de validar o aplicar archivos ZIP masivos.',
    actions: workspaceReadActions,
    dataSource:
      'La API autenticada persiste metadatos y auditoría en PostgreSQL; los binarios usan memoria local o S3 según el entorno.',
    limitation:
      'La memoria local de desarrollo no sobrevive a un reinicio; los ambientes alojados deben usar S3 y el control antimalware definido para operación.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Biblioteca por SKU',
        description: 'Fotos y documentos tipados con versión y procedencia.',
        status: 'available',
      },
      {
        title: 'Carga masiva',
        description:
          'ZIP por convención SKU__TIPO o manifiesto, con validación previa por archivo.',
        status: 'available',
      },
      {
        title: 'Ficha técnica comercial',
        description: 'Vista previa con los atributos activos y exportables de la plantilla.',
        status: 'available',
      },
    ],
    dependencies: ['Diseño comercial definitivo de la ficha PDF', 'Antimalware de producción'],
  },
  imports: {
    slug: 'imports',
    label: 'Importaciones',
    eyebrow: 'Ingreso de información',
    description: 'Valida y confirma lotes CSV, XLSX o JSON con resultado detallado por fila.',
    objective:
      'Ofrece vista previa, idempotencia y confirmación auditable para atributos, aplicaciones y homólogos.',
    actions: workspaceReadActions,
    dataSource:
      'Los lotes y sus filas se validan y persisten mediante la API autenticada de importaciones.',
    limitation:
      'La confirmación es de ejecución única y parcial: cada fila válida se aplica atómicamente con su auditoría y cada rechazo queda visible.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Vista previa',
        description: 'Validación sin persistir y resultado por fila o archivo.',
        status: 'available',
      },
      {
        title: 'Historial de cargas',
        description: 'Actor, archivo, fecha, estado, resultado y errores por lote.',
        status: 'confirmed',
      },
      {
        title: 'Aplicación controlada',
        description:
          'Atributos por categoría, aplicaciones, homólogos y OEM con confirmación auditable.',
        status: 'available',
      },
    ],
    dependencies: ['Ejecución asíncrona para archivos que excedan los límites síncronos acordados'],
  },
  quality: {
    slug: 'quality',
    label: 'IA y Calidad',
    eyebrow: 'Enriquecimiento gobernado',
    description:
      'Completitud y obligatorios faltantes calculados desde las plantillas activas del catálogo.',
    objective:
      'Prioriza los SKU incompletos con controles deterministas y separa las futuras sugerencias de IA.',
    actions: workspaceReadActions,
    dataSource:
      'Los indicadores, avisos y filas provienen de la proyección autenticada del workspace de calidad.',
    limitation:
      'No se conecta ningún proveedor de IA o TecDoc hasta disponer de licencia, credenciales y reglas de persistencia.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Cola de calidad',
        description: 'Productos sin plantilla o con atributos obligatorios activos faltantes.',
        status: 'available',
      },
      {
        title: 'Candidatos trazables',
        description: 'Valor, fuente, confianza, fecha, actor y decisión.',
        status: 'next',
      },
      {
        title: 'IA y fuentes externas',
        description: 'Adaptadores gobernados con revisión humana.',
        status: 'blocked',
      },
    ],
    dependencies: [
      'Procedencia por atributo',
      'Reglas de calidad y conflictos',
      'Licencias y credenciales externas',
    ],
  },
  publication: {
    slug: 'publication',
    label: 'Publicación',
    eyebrow: 'Salida a canales',
    description:
      'Calcula la elegibilidad base por SKU y separa esa condición del envío a un canal.',
    objective:
      'Explica qué SKU cumplen todos los obligatorios activos de su plantilla y cuáles deben completarse.',
    actions: workspaceReadActions,
    dataSource:
      'Los indicadores, avisos y filas provienen de la proyección autenticada del workspace de publicación.',
    limitation:
      'El override por SKU, condiciones adicionales del canal, ownership y contrato con ICOM siguen pendientes.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Publicabilidad por SKU',
        description:
          'Cálculo automático por atributos requeridos, con explicación de faltantes y política de excepción pendiente.',
        status: 'available',
      },
      {
        title: 'Campos expuestos',
        description: 'Mapeo configurable por canal, cambios, reintentos y resultado de envío.',
        status: 'next',
      },
      {
        title: 'Canal PrestaShop',
        description: 'Sincronización mediante el contrato que se acuerde con ICOM.',
        status: 'blocked',
      },
    ],
    dependencies: [
      'Política de override y condiciones adicionales de canal',
      'Contrato con ICOM',
      'Medios, aplicaciones y equivalencias resueltas',
    ],
  },
  integrations: {
    slug: 'integrations',
    label: 'Integraciones',
    eyebrow: 'Conectividad',
    description:
      'Consulta la configuración conocida de ERP, PrestaShop y otras integraciones todavía bloqueadas.',
    objective:
      'Presenta la configuración y capacidades que el backend conoce, sin ejecutar adaptadores externos todavía bloqueados.',
    actions: workspaceReadActions,
    dataSource:
      'Los indicadores, avisos y filas provienen de la proyección autenticada del workspace de integraciones.',
    limitation:
      'ERP/Sismetic, ICOM, TecDoc e IA esperan contratos, ambientes, ownership y credenciales.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'ERP/Sismetic',
        description: 'Altas, deltas, reconciliación, bajas e idempotencia.',
        status: 'next',
      },
      {
        title: 'PrestaShop/ICOM',
        description: 'Consulta o sincronización del catálogo publicable.',
        status: 'blocked',
      },
      {
        title: 'TecDoc e IA',
        description: 'Fuentes desacopladas mediante adaptadores trazables.',
        status: 'blocked',
      },
    ],
    dependencies: [
      'Contratos externos definitivos',
      'Credenciales y ambientes',
      'Observabilidad y gestión de secretos',
    ],
  },
  reports: {
    slug: 'reports',
    label: 'Reportes',
    eyebrow: 'Seguimiento',
    description:
      'Agregados globales de productos, marcas, estados y grupos unificadores calculados en PostgreSQL.',
    objective:
      'Ofrece una lectura operativa del catálogo distinguiendo las filas cargadas del total informado por el backend.',
    actions: workspaceReadActions,
    dataSource:
      'Los indicadores, avisos y filas provienen de la proyección autenticada del workspace de reportes.',
    limitation:
      'Los indicadores de calidad dependen de reglas aprobadas; las exportaciones e históricos todavía no están implementados.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Totales y estados',
        description: 'Lectura paginada del catálogo y distribución por estado.',
        status: 'available',
      },
      {
        title: 'Calidad y cobertura',
        description: 'Indicadores basados en reglas de calidad aprobadas.',
        status: 'blocked',
      },
      {
        title: 'Exportaciones',
        description: 'Reportes descargables y consultas históricas.',
        status: 'next',
      },
    ],
    dependencies: [
      'Reglas de calidad',
      'Endpoint de analítica',
      'Catálogo definitivo de reportes y política de exportación',
    ],
  },
  administration: {
    slug: 'administration',
    label: 'Administración',
    eyebrow: 'Gobierno y seguridad',
    description:
      'Consulta de la sesión, actor y roles efectivos, con el alcance administrativo pendiente claramente delimitado.',
    objective:
      'Presenta los controles administrativos que el backend puede consultar y deja explícitas las operaciones no habilitadas.',
    actions: workspaceReadActions,
    dataSource:
      'Los indicadores, avisos y filas provienen de la proyección autenticada del workspace de administración.',
    limitation:
      'No se habilitan cambios administrativos sin proveedor de identidad, RBAC y política de retención aprobada.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Usuarios y roles',
        description: 'Acceso por capacidad y separación de funciones.',
        status: 'blocked',
      },
      {
        title: 'Configuración',
        description: 'Catálogos auxiliares y políticas versionadas.',
        status: 'next',
      },
      {
        title: 'Auditoría',
        description: 'Eventos consultables, actor, cambios y retención.',
        status: 'next',
      },
    ],
    dependencies: ['Proveedor de identidad', 'Matriz RBAC', 'Retención y exportación de auditoría'],
  },
};

export function isModuleSlug(value: string): value is ModuleSlug {
  return (moduleSlugs as readonly string[]).includes(value);
}
import type { AuthCapability } from '@cdr/contracts';
