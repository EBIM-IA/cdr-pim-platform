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

export const moduleDefinitions: Record<ModuleSlug, ModuleDefinition> = {
  categories: {
    slug: 'categories',
    label: 'Categorías',
    eyebrow: 'Estructura del catálogo',
    description:
      'Explora las líneas presentes en el catálogo y su cobertura de productos y marcas.',
    objective:
      'Resume la clasificación disponible para detectar líneas con baja cobertura o datos pendientes.',
    actions: [
      'Consulta productos y marcas por línea.',
      'Identifica categorías presentes en la muestra actual.',
      'Abre el catálogo para revisar sus productos.',
    ],
    dataSource:
      'La API actual entrega productos y marcas; la taxonomía todavía no forma parte del contrato HTTP.',
    limitation:
      'La taxonomía comercial jerárquica todavía no está aprobada; se muestra la clasificación plana vigente.',
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
    description: 'Espacio para versionar plantillas, definiciones de atributos y reglas por línea.',
    objective:
      'Centraliza la estructura técnica que determina qué información requiere cada familia de productos.',
    actions: [
      'Revisar versiones y estado de cada plantilla.',
      'Agregar, quitar o renombrar atributos sin cambiar el código de la aplicación.',
      'Definir unidades, obligatoriedad, orden y si cada atributo es replicable.',
    ],
    dataSource:
      'El dominio contiene definiciones tipadas de atributos; PostgreSQL y la API todavía no persisten ni exponen plantillas.',
    limitation:
      'La edición y aprobación se habilitarán después de definir permisos, versionado y compatibilidad de plantillas.',
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
      'Organiza la compatibilidad automotriz e industrial que comparten los SKU de un mismo grupo.',
    actions: [
      'Buscar por SKU como acceso rápido al grupo correspondiente.',
      'Registrar aplicaciones de forma manual o mediante carga masiva.',
      'Revisar qué SKU heredan cada aplicación por código unificador.',
    ],
    dataSource:
      'El contrato actual no expone aplicaciones; el espacio documenta el alcance confirmado sin simular compatibilidades.',
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
      'Separa claramente los SKU comercializados por CDR de los códigos homólogos externos usados para búsqueda.',
    actions: [
      'Consultar los grupos unificadores disponibles.',
      'Revisar los SKU miembros de cada grupo.',
      'Registrar homólogos externos manualmente o por carga masiva.',
      'Revisar conteos y preparar solo homólogos activos y aprobados para búsqueda.',
    ],
    dataSource:
      'La base contiene el modelo inicial de grupos, pero todavía no existe una API de equivalencias u homólogos.',
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
      'Espacio para administrar imágenes, fichas técnicas, certificados, planos y hojas de seguridad.',
    objective:
      'Gobierna activos versionados por SKU y prepara su publicación hacia los canales externos.',
    actions: [
      'Consultar activos por SKU, tipo y estado.',
      'Gestionar una carga individual desde la ficha del SKU.',
      'Preparar cargas masivas mediante ZIP y una convención que identifique el SKU.',
      'Revisar reemplazos, errores y versiones anteriores.',
    ],
    dataSource:
      'El contrato HTTP actual no expone activos; existen el modelo de metadatos y el puerto de almacenamiento, sin persistencia ni API.',
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
    description: 'Centro de cargas con vista previa, validación por fila y confirmación explícita.',
    objective:
      'Concentra los lotes de productos, aplicaciones, homólogos y documentos con resultados trazables.',
    actions: [
      'Crear una carga y validar su estructura.',
      'Revisar errores, advertencias y cambios propuestos.',
      'Consultar quién cargó el archivo, cuándo, su estado y resultado.',
      'Confirmar únicamente registros válidos y descargar resultados.',
    ],
    dataSource:
      'La interfaz se conectará a un recurso común de trabajos de importación; actualmente no existe ese endpoint.',
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
    description: 'Bandeja para conflictos, sugerencias y controles de calidad con revisión humana.',
    objective:
      'Prioriza problemas de información y conserva evidencia para cada sugerencia automática o externa.',
    actions: [
      'Revisar conflictos y atributos incompletos.',
      'Comparar candidatos por fuente y confianza.',
      'Aceptar, rechazar o corregir propuestas con auditoría.',
    ],
    dataSource:
      'La API actual no entrega puntajes de calidad; candidatos, confianza y conflictos requieren contratos adicionales.',
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
      'Control de productos elegibles, bloqueos y sincronización hacia canales comerciales.',
    objective:
      'Explica por qué una ficha puede publicarse y conserva el resultado de cada intento de salida.',
    actions: [
      'Revisar elegibilidad y bloqueos por producto.',
      'Preparar lotes de publicación y desactivación.',
      'Consultar resultados, reintentos y última versión enviada.',
    ],
    dataSource:
      'La API actual entrega el estado del producto; todavía no expone completitud ni decisión de publicabilidad.',
    limitation:
      'La publicación automática por completitud fue validada, pero el override por SKU, ownership y contrato con ICOM siguen pendientes.',
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
    description: 'Monitor de intercambio con ERP, PrestaShop y futuras fuentes externas.',
    objective:
      'Hace visible la salud, contratos, lotes y errores de cada conexión sin acoplarlos al núcleo del catálogo.',
    actions: [
      'Consultar estado y última actividad por integración.',
      'Revisar lotes, errores y reintentos.',
      'Validar contratos antes de activar credenciales reales.',
    ],
    dataSource:
      'El entorno local solo dispone de API y PostgreSQL; los adaptadores externos todavía no están conectados.',
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
      'Indicadores de cobertura, calidad y estado calculados sobre el catálogo disponible.',
    objective:
      'Ofrece una lectura operativa del catálogo sin presentar una muestra como si fuera un agregado global.',
    actions: [
      'Consultar distribución por estado y calidad.',
      'Identificar líneas con productos incompletos.',
      'Distinguir los totales de API de los cálculos sobre la muestra.',
    ],
    dataSource:
      'La API permite consultar totales y estados de productos; calidad, categorías y exportaciones aún no tienen agregados propios.',
    limitation:
      'Los agregados globales y exportaciones requieren un endpoint de analítica dedicado.',
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
      'Espacio para usuarios, roles, permisos, catálogos auxiliares y configuración auditada.',
    objective:
      'Centraliza los controles administrativos que protegen cambios, aprobaciones e integraciones.',
    actions: [
      'Gestionar usuarios, roles y permisos por capacidad.',
      'Configurar catálogos auxiliares y políticas.',
      'Consultar eventos de auditoría y retención.',
    ],
    dataSource:
      'Existe un puerto de auditoría con salida temporal a logs; no hay persistencia durable, autenticación ni APIs administrativas.',
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
