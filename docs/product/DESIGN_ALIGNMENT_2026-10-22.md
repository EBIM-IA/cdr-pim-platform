# Alineación con el diseño del cliente — 22 de octubre de 2026

## Referencia y precedencia

Insumo recibido: carpeta `cdr-example-main` del diseñador, revisión entregada el 22 de octubre.
Se comparó el resultado ejecutado de `app.js` y la cascada completa de `styles.css`, además de
`SCREEN_MAP.md` y sus módulos de datos. El README conserva descripciones visuales antiguas: la
versión final usa menú lateral oscuro, logo a color y no tiene barra superior en escritorio.

| Archivo de referencia | SHA-256                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `app.js`              | `4ba8834488e73c15f0f03851197eea58a20473989e9624dd65529d45ee2d59b8` |
| `styles.css`          | `717a64490be946b1cef3430303236fb2436a9e2cbfdbe7eb90a2fd9f76e7b1e2` |
| `SCREEN_MAP.md`       | `50495a164374f82c63b2796935e5c4c387dac4745021b96b216165571c6ffa1c` |

La referencia aporta presentación y recorridos; sus contraseñas libres, selección simulada de
roles, IndexedDB, indicadores ilustrativos y acciones ficticias no constituyen implementación
de producción. Se conservan la API autenticada, la persistencia y las reglas confirmadas en
[las respuestas del cliente del 22 de octubre](CLIENT_RESPONSES_2026-10-22.md), incluyendo
aplicaciones compartidas por código unificador y autoridad del ERP.

El manifiesto existente y la referencia coinciden en las **52 plantillas y 97 registros de
origen**. No se reemplaza el seed ni se copian datos ilustrativos al catálogo persistente.

## Cambios implementados

| Área               | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navegación         | Menú oscuro de 222 px, logo a color, búsqueda y cuenta integradas; colapsado de 65 px y adaptación móvil; opciones filtradas por capacidades. Mapa de pantallas y estados accesibles desde cuenta/pie.                                                                                                                                                                                                                                                                       |
| Identidad visual   | Tipografía estrecha de sistema, ancho completo, tablas blancas con cuadrícula fina, celdas de 13 px, encabezados de 11 px, espaciado 4/8 px y peso regular. Mayúsculas solo visuales; exportaciones conservan el dato original.                                                                                                                                                                                                                                              |
| Ayuda y acceso     | Ayuda compacta junto al título, cierre con Escape y clic exterior. Inicio de sesión con identidad CDR y validación real de credenciales.                                                                                                                                                                                                                                                                                                                                     |
| Dashboard          | KPI compactos y distribución por categorías raíz reales mediante consulta recursiva. Cuenta SKU únicos y enlaza al catálogo filtrado por categoría. Las ramas inactivas no se activan para reproducir cifras de la demo.                                                                                                                                                                                                                                                     |
| Productos          | Vista inicial Catálogo y alternativa Tabla; identidad técnica y esquema cuadriculado. Las dos vistas consultan el workbook del backend, con filtros por ancestros, facetas y paginación sobre el conjunto completo. Los SKU sin plantilla válida siguen visibles como pendientes de clasificación y sin edición de atributos.                                                                                                                                                |
| Ficha de producto  | Jerarquía centrada en el SKU; esquema, datos ERP y control PIM por perfil; especificaciones agrupadas, documentos reales y edición directa autorizada con versiones. El borrador técnico se conserva al alternar pestañas; los cambios de plantilla se bloquean mientras existan ediciones pendientes y el acceso de administrador no abre un segundo editor. La completitud procede de la misma fórmula del backend que el catálogo, incluidos los documentos obligatorios. |
| Categorías         | Árbol plegable, búsqueda por rama/ruta, panel de detalle y tabla alternativa. Edición mediante panel lateral. Los detalles de plantillas se cargan al seleccionar una categoría para evitar 52 peticiones simultáneas al entrar.                                                                                                                                                                                                                                             |
| Plantillas         | Selector lateral, tabla compacta, interruptores de obligatoriedad/replicación/ficha técnica/visibilidad y panel lateral de configuración. Guardado con control de concurrencia y aviso de cambios sin guardar.                                                                                                                                                                                                                                                               |
| Aplicaciones       | Tabla global inicial y contexto por código unificador. Acceso al wizard con destino correcto; se preserva la réplica por grupo del modelo vigente.                                                                                                                                                                                                                                                                                                                           |
| Homólogos y OEM    | Pestañas compactas y accesos a importación con destino correcto. La API rechaza un homólogo que ya es un SKU de la misma marca, también en preview y confirmación masiva; advierte asociaciones con otros grupos.                                                                                                                                                                                                                                                            |
| Documentos         | Contenedor adaptable y tabla desplazable accesible sin desbordar la página. Almacenamiento y descargas siguen pasando por los servicios reales.                                                                                                                                                                                                                                                                                                                              |
| Módulos operativos | Pestañas compactas comunes en IA/calidad, publicación, integraciones, reportes y administración; operaciones existentes y permisos preservados.                                                                                                                                                                                                                                                                                                                              |

## Diferencias deliberadas respecto al prototipo

- El perfil de acceso procede de la identidad autenticada; no se permite elegir un rol para
  conseguir permisos.
- Los códigos unificadores y datos base siguen sujetos a la autoridad de AX. Las operaciones
  no disponibles muestran su dependencia en vez de aparentar una modificación efectiva.
- La publicación externa, conectores AX/TecDoc/PrestaShop, resolución persistente de conflictos,
  detección de duplicados y catálogos PDF compartidos conservan las limitaciones descritas en
  [la arquitectura de módulos](../architecture/MODULE_ARCHITECTURE.md) y el README.
- El prototipo admite metadatos opcionales adicionales de homólogos; el contrato actual persiste
  código, marca y estado. Esta entrega no añade campos sin un flujo de persistencia completo.
- La taxonomía vigente conserva los niveles y códigos AX del manifiesto PIM(2), incluso
  etiquetas repetidas entre niveles. No se eliminan nodos ni se reasignan productos para
  reproducir ramas de dos niveles del prototipo antiguo.
- Los atributos de origen ERP, la visibilidad por perfil y las reglas del 22 de octubre tienen
  precedencia sobre controles simulados o decisiones provisionales antiguas de la demo.

## Verificación y revisión local

- `pnpm verify`: formato, lint, tipos, pruebas unitarias/arquitectura y build de todo el monorepo.
- API: 339 pruebas unitarias y 108 de integración contra PostgreSQL con pgvector aislado.
- Navegador Chrome: acceso real, consulta de catálogo/ficha, navegación de módulos, ayuda, menú
  y tamaños de escritorio y móvil; verificación del borrador al alternar pestañas sin persistir
  valores de prueba en el catálogo.
- Base aislada: 22 migraciones existentes y seed de 97 productos/52 plantillas. No hay
  migraciones nuevas ni cambios en la base de otro proyecto que ocupa el puerto 5432.

La revisión local usa web `http://localhost:3100`, API `http://127.0.0.1:4101` y PostgreSQL
local en el puerto 5544. La configuración guardada `.env` y los servicios publicados no se
modifican. La publicación debe seguir CI y la promoción de artefactos inmutables existentes.

## Cobertura de navegación

Smoke autenticado sobre la API y base locales: 38 rutas, sin errores HTTP, excepciones de
JavaScript ni alertas de carga. Esta verificación certifica renderizado y acceso; las acciones
bloqueadas por una integración pendiente conservan esa condición. Documentos se volvió a
verificar después de corregir el desborde de sus controles de carga.

| Referencia       | Ruta                                                             | Pantalla renderizada             |
| ---------------- | ---------------------------------------------------------------- | -------------------------------- |
| 4                | `/`                                                              | Dashboard                        |
| 5                | `/products`                                                      | Catálogo maestro de productos    |
| 6                | `/products/2035e709-7c2a-5186-8b70-60f97915c7e2`                 | 1200-TVH-C3                      |
| 7                | `/products/2035e709-7c2a-5186-8b70-60f97915c7e2?view=enrichment` | 1200-TVH-C3                      |
| 8                | `/categories`                                                    | Árbol de categorías              |
| 9                | `/templates`                                                     | Plantilla dinámica               |
| 10               | `/applications`                                                  | Aplicaciones                     |
| 11               | `/equivalences`                                                  | Código Unificador y Homólogos    |
| 12               | `/equivalences?view=homologs`                                    | Código Unificador y Homólogos    |
| 13               | `/documents`                                                     | Imágenes y documentos            |
| 14               | `/imports`                                                       | Importaciones                    |
| 15               | `/imports?view=new`                                              | Nueva importación                |
| 16               | `/imports?view=result`                                           | Resultado de importación         |
| 17               | `/quality?view=search`                                           | Búsqueda inteligente             |
| 18               | `/quality?view=extraction`                                       | Revisión de extracción IA        |
| 19               | `/quality?view=commercial`                                       | Descripción comercial con IA     |
| 20               | `/quality?view=quality`                                          | Calidad del catálogo             |
| 21               | `/quality?view=duplicates`                                       | Posibles duplicados              |
| 22               | `/quality?view=review`                                           | Bandeja de revisión y aprobación |
| 23               | `/quality?view=sources`                                          | Prioridad de fuentes             |
| 24               | `/quality?view=conflict`                                         | Resolver conflicto de fuentes    |
| 25               | `/publication?view=channels`                                     | Publicación por canal            |
| 26               | `/publication?view=prestashop`                                   | Canal PrestaShop                 |
| 27               | `/publication?view=images`                                       | Migración de imágenes PrestaShop |
| 28               | `/integrations?view=sources`                                     | Fuentes externas                 |
| 29               | `/integrations?view=monitor`                                     | Monitor de integraciones         |
| 30               | `/integrations?view=batches`                                     | Detalle de lote Sismetic / AX    |
| 31               | `/administration?view=users`                                     | Usuarios                         |
| 32               | `/administration?view=roles`                                     | Roles y permisos                 |
| 33               | `/administration?view=audit`                                     | Auditoría y trazabilidad         |
| 34               | `/reports?view=reports`                                          | Resumen de reportes              |
| 35               | `/reports?view=searches`                                         | Reporte de búsquedas             |
| 36               | `/administration?view=settings`                                  | Catálogos de configuración       |
| 37               | `/catalogs`                                                      | Catálogos de productos           |
| oem              | `/equivalences?view=oem`                                         | Código Unificador y Homólogos    |
| attribute-report | `/reports?view=attribute-report`                                 | REPORTE ATRIBUTOS                |
| general-report   | `/reports?view=general-report`                                   | REPORTE GENERAL (RESULTADOS)     |
| period-report    | `/reports?view=period-report`                                    | REPORTE RESULTADOS DE PERIODO    |
