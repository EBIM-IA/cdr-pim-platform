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
    description: 'Consulta la distribución de marcas y estados disponible en el catálogo actual.',
    objective:
      'Presenta la clasificación que el backend puede respaldar hoy sin inferir una taxonomía aún no aprobada.',
    actions: workspaceReadActions,
    dataSource:
      'Los indicadores, avisos y filas provienen de la proyección autenticada del workspace de categorías.',
    limitation:
      'La taxonomía comercial jerárquica todavía no está aprobada; la pantalla muestra agregados por marca y estado, no categorías inferidas.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Catálogo base',
        description: 'Productos y marcas disponibles mediante el contrato compartido.',
        status: 'available',
      },
      {
        title: 'Taxonomía',
        description: 'Categorías, jerarquías y asignaciones versionadas.',
        status: 'blocked',
      },
      {
        title: 'Cobertura',
        description: 'Indicadores por categoría una vez disponible la taxonomía aprobada.',
        status: 'next',
      },
    ],
    dependencies: ['Taxonomía aprobada', 'Contrato y persistencia de categorías'],
  },
  templates: {
    slug: 'templates',
    label: 'Plantillas',
    eyebrow: 'Gobierno de atributos',
    description:
      'Consulta el estado de la persistencia y las dependencias requeridas para gobernar plantillas.',
    objective:
      'Presenta el estado operativo de plantillas y explicita qué capacidades de gobierno todavía están bloqueadas.',
    actions: workspaceReadActions,
    dataSource:
      'Los indicadores, avisos y filas provienen de la proyección autenticada del workspace de plantillas.',
    limitation:
      'La edición y aprobación se habilitarán después de definir permisos, versionado y compatibilidad de plantillas.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Definiciones tipadas',
        description: 'Atributos, unidades, obligatoriedad y prioridad de fuentes por plantilla.',
        status: 'blocked',
      },
      {
        title: 'Versionado y publicación',
        description: 'Borradores, comparación de versiones y activación controlada.',
        status: 'next',
      },
      {
        title: 'Replicables',
        description:
          'Indicador sí/no por atributo de la plantilla; la propagación espera reglas de fuente y compatibilidad.',
        status: 'confirmed',
      },
    ],
    dependencies: [
      'API de plantillas y definiciones',
      'Matriz de permisos y aprobación',
      'Fuente, compatibilidad, conflictos y lista inicial de exclusión',
    ],
  },
  applications: {
    slug: 'applications',
    label: 'Aplicaciones',
    eyebrow: 'Compatibilidad',
    description:
      'Espacio preparado para las relaciones de aplicación compartidas por código unificador.',
    objective:
      'Presenta el estado real de la persistencia de aplicaciones y los grupos unificadores disponibles en el backend.',
    actions: workspaceReadActions,
    dataSource:
      'Los indicadores, avisos y filas provienen de la proyección autenticada del workspace de aplicaciones.',
    limitation:
      'No se muestran compatibilidades inventadas. El backend grupal se implementará mediante el código unificador.',
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
        status: 'next',
      },
      {
        title: 'Herencia efectiva',
        description: 'Resolución de aplicaciones comunes para todos los SKU del grupo.',
        status: 'blocked',
      },
    ],
    dependencies: ['Contrato de aplicaciones', 'API del código unificador', 'Reglas de auditoría'],
  },
  equivalences: {
    slug: 'equivalences',
    label: 'Equivalencias',
    eyebrow: 'Relaciones de producto',
    description:
      'Explica el modelo disponible de grupos internos y el alcance previsto de sus homólogos.',
    objective:
      'Presenta las relaciones respaldadas por el backend y distingue los SKU comercializados de los homólogos externos.',
    actions: workspaceReadActions,
    dataSource:
      'Los indicadores, avisos y filas provienen de la proyección autenticada del workspace de equivalencias.',
    limitation:
      'Solo los homólogos simultáneamente activos y aprobados serán elegibles cuando se habilite la búsqueda ampliada.',
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
        status: 'next',
      },
      {
        title: 'Elegibilidad de homólogos',
        description: 'Solo relaciones simultáneamente activas y aprobadas.',
        status: 'confirmed',
      },
      {
        title: 'Búsqueda por homólogos',
        description: 'Resolver un código externo elegible hacia los SKU comercializados del grupo.',
        status: 'blocked',
      },
    ],
    dependencies: ['Contrato de equivalencias', 'Persistencia de homólogos', 'Estados y permisos'],
  },
  documents: {
    slug: 'documents',
    label: 'Documentos',
    eyebrow: 'Activos digitales',
    description:
      'Consulta el estado del almacenamiento y la persistencia previstos para los activos digitales.',
    objective:
      'Presenta el estado real del almacenamiento y de la persistencia de activos, junto con las dependencias pendientes para su gestión.',
    actions: workspaceReadActions,
    dataSource:
      'Los indicadores, avisos y filas provienen de la proyección autenticada del workspace de documentos.',
    limitation:
      'No se habilitan cargas hasta definir storage, análisis de seguridad, límites y versionado.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Biblioteca por SKU',
        description: 'Fotos y documentos tipados con versión y procedencia.',
        status: 'next',
      },
      {
        title: 'Carga masiva',
        description: 'ZIP por convención o manifiesto con vista previa.',
        status: 'next',
      },
      {
        title: 'Ficha técnica comercial',
        description: 'Formato y selección de campos para la ficha descargable.',
        status: 'blocked',
      },
    ],
    dependencies: [
      'Entidad y API de activos',
      'Almacenamiento de objetos',
      'Contrato común de cargas masivas',
    ],
  },
  imports: {
    slug: 'imports',
    label: 'Importaciones',
    eyebrow: 'Ingreso de información',
    description:
      'Consulta la preparación técnica necesaria para habilitar cargas trazables y seguras.',
    objective:
      'Presenta el estado real de la cola, el almacenamiento temporal y la persistencia requerida para implementar lotes trazables.',
    actions: workspaceReadActions,
    dataSource:
      'Los indicadores, avisos y filas provienen de la proyección autenticada del workspace de importaciones.',
    limitation:
      'La escritura permanece deshabilitada hasta contar con idempotencia, auditoría, permisos y procesamiento asíncrono.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Vista previa',
        description: 'Validación sin persistir y resultado por fila o archivo.',
        status: 'next',
      },
      {
        title: 'Historial de cargas',
        description: 'Actor, archivo, fecha, estado, resultado y errores por lote.',
        status: 'next',
      },
      {
        title: 'Ejecución asíncrona',
        description: 'Idempotencia, reintentos, cola y auditoría de lotes.',
        status: 'blocked',
      },
    ],
    dependencies: ['Contrato de jobs de importación', 'RBAC', 'Cola y almacenamiento temporal'],
  },
  quality: {
    slug: 'quality',
    label: 'IA y Calidad',
    eyebrow: 'Enriquecimiento gobernado',
    description:
      'Hallazgos deterministas sobre los campos base del catálogo y alcance futuro de revisión humana.',
    objective:
      'Presenta los controles y alertas de calidad disponibles sin ejecutar decisiones que el backend no soporte.',
    actions: workspaceReadActions,
    dataSource:
      'Los indicadores, avisos y filas provienen de la proyección autenticada del workspace de calidad.',
    limitation:
      'No se conecta ningún proveedor de IA o TecDoc hasta disponer de licencia, credenciales y reglas de persistencia.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Cola de calidad',
        description: 'Productos incompletos, conflictos y prioridades de revisión.',
        status: 'next',
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
      'Consulta estados persistidos y las dependencias pendientes para definir la publicabilidad.',
    objective:
      'Presenta los estados persistidos de los productos y deja claro que aún no equivalen a elegibilidad de publicación.',
    actions: workspaceReadActions,
    dataSource:
      'Los indicadores, avisos y filas provienen de la proyección autenticada del workspace de publicación.',
    limitation:
      'La regla exacta de publicabilidad, el override por SKU, el ownership y el contrato con ICOM siguen pendientes.',
    kind: 'workspace',
    capabilities: [
      {
        title: 'Publicabilidad por SKU',
        description:
          'Cálculo automático por atributos requeridos, con explicación de faltantes y política de excepción pendiente.',
        status: 'confirmed',
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
      'Regla de publicabilidad',
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
