# Revisión de pantallas contra la referencia del cliente

Referencia: <https://cdr-example.pages.dev/> y los archivos originales del diseñador.
La captura aportada por el usuario corresponde a Reportes, referencia #34.

Esta segunda revisión corrige una brecha de la primera entrega: varias rutas estaban
presentes, pero sus tablas operativas genéricas no conservaban las secciones del diseño.
Se revisaron las 35 rutas que representan las pantallas #3–#37. Los 66 estados de interacción
del prototipo no equivalen a 66 rutas de la aplicación.

## Cambios de esta entrega

- **Reportes:** tres formatos del cliente, cuatro adicionales y ocho indicadores. Tarjetas
  con Abrir, Excel y PDF; exportación del conjunto completo; selección, orden y filtros de
  columnas; formato personal desde encabezados Excel/CSV. Solo se guarda configuración por
  actor y navegador, sin copiar datos del catálogo al almacenamiento local.
- **Períodos:** matriz de meses por año, promedio y total. Conserva columnas 2024–2026 del
  formato del cliente y añade los años de auditoría o filtros. Las celdas sin historial se
  conservan vacías; no se importan cifras ilustrativas como actividad de usuarios.
- **Calidad:** selector y búsqueda de SKU, cinco indicadores, requisitos de plantilla,
  valores completos/faltantes, documentos e imágenes y completitud oficial. Consulta
  únicamente el producto seleccionado; reconoce enlaces con `productId` fuera de los
  primeros 25 resultados.
- **Publicación:** canales, campos expuestos, publicabilidad por SKU con paginación y
  configuración de atributos por plantilla. Selección persistida, autorización de
  administrador, auditoría y control de concurrencia. La identidad SKU permanece incluida.
  Vista de consumo por SKU y cuatro operaciones previstas para PrestaShop.
- **Integraciones:** fuentes en contexto de SKU y prioridad BUSQUEDA; tablas de ejecuciones,
  cabecera de lote y errores por registro. La falta de historial se distingue de cero errores.
- **Administración:** tabla de usuarios con identidad de la sesión claramente delimitada;
  matriz de permisos derivada de la política vigente del servidor; parámetros consultables
  desde unidades, listas y marcas reales; panel de datos de marca para PDF.
- **Importación:** mapeo efectivo de encabezados antes de validar, arrastrar y soltar archivos,
  detalle de errores y descarga de errores. Se retiran JSON e idempotencia del flujo principal.
- **IA:** comparación actual/propuesta y evidencia del archivo, decisiones locales por
  candidato y confirmación antes de aplicar. Edición y comparación de borradores comerciales
  locales; no se simula aprobación o guardado comercial durable.

La revisión adicional del 23 de octubre de las cinco pantallas del menú se detalla
en [FIVE_SCREEN_REVIEW_2026-10-23.md](FIVE_SCREEN_REVIEW_2026-10-23.md).

## Cobertura por pantalla

| Referencia | Pantalla                 | Resultado de revisión                                                                               |
| ---------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| 3          | Acceso                   | Estructura y marcas conservadas.                                                                    |
| 4          | Inicio                   | Indicadores y actividad basados en datos actuales.                                                  |
| 5          | Productos                | Catálogo compacto; exportación de fichas PDF masiva pendiente.                                      |
| 6          | Ficha                    | Identidad, datos base y edición inline conservadas; resumen de conflictos pendiente.                |
| 7          | Enriquecimiento          | Edición operativa; motivo y envío a aprobación necesitan flujo durable.                             |
| 8          | Categorías               | Árbol y administración existentes; alta/reorganización no habilitadas.                              |
| 9          | Plantillas               | Selector, BUSQUEDA, herencia consultiva, ocho filtros y matriz específica (#9).                     |
| 10         | Aplicaciones             | Barra compacta y tabla del diseño con edición, filtros, importación y exportación.                  |
| 11         | Código unificador        | Tabla por SKU, pestañas Homólogos/OEM y detalle del grupo.                                          |
| 12         | Identificadores por SKU  | Contexto, identificadores, atributos de identificación y relaciones reales.                         |
| 13         | Documentos               | Tabla/contexto, leyenda, requisitos reales por plantilla y carga ZIP lateral.                       |
| 14         | Importaciones            | Historial y resultados existentes.                                                                  |
| 15         | Nueva importación        | Mapeo y arrastre funcionales, sin campos técnicos en el flujo principal.                            |
| 16         | Resultado de importación | Detalle por fila y descarga de errores incorporados.                                                |
| 17         | Búsqueda inteligente     | Consulta real; retirados indicadores genéricos de Calidad alrededor del buscador.                   |
| 18         | Extracción IA            | Comparación, evidencia y selección humana antes de aplicar.                                         |
| 19         | Descripción comercial    | Borrador editable y comparación; aprobación durable pendiente.                                      |
| 20         | Calidad                  | Pantalla específica con cinco indicadores y requisitos reales.                                      |
| 21         | Duplicados               | Estructura conservada; motor de alertas y comparación pendientes.                                   |
| 22         | Bandeja                  | Estructura conservada; solicitudes y decisiones durables pendientes.                                |
| 23         | Fuentes                  | Matriz de prioridad y datos de categorías existentes.                                               |
| 24         | Conflictos               | Sin candidatos ficticios; decisiones persistidas pendientes.                                        |
| 25         | Publicación por canal    | Secciones y selección persistida por plantilla incorporadas.                                        |
| 26         | PrestaShop               | Operaciones y vista de consumo; conexión pendiente.                                                 |
| 27         | Migración de imágenes    | Consulta en contexto y tabla de lote; conexión pendiente.                                           |
| 28         | Fuentes externas         | Tarjetas por prioridad y tabla contextual de candidatos.                                            |
| 29         | Monitor                  | Ejecuciones recientes y conectores; historial externo no disponible.                                |
| 30         | Lote AX                  | Cabecera y errores por registro; consulta de lotes externos no disponible.                          |
| 31         | Usuarios                 | Tabla y métricas delimitadas; directorio y mantenimiento no disponibles.                            |
| 32         | Roles                    | Matriz real de permisos; sin simulador ni cambios de autorización.                                  |
| 33         | Auditoría                | Historial real directo; retirado panel genérico interpuesto.                                        |
| 34         | Reportes                 | Estructura 3 + 4 + 8 y reportes consultables/exportables.                                           |
| 35         | Búsquedas                | Telemetría no disponible, sin cifras ilustrativas.                                                  |
| 36         | Parámetros               | Catálogos específicos y valores actuales; mantenimiento adicional pendiente.                        |
| 37         | Catálogos PDF            | Carga PDF, mantenimiento, recuperación y enlaces con vencimiento/revocación implementados el 23/10. |

## Datos y límites funcionales

QAS conserva los 105 productos de prueba cargados aditivamente. No se vuelven a ejecutar
la carga ni el SQL de arranque. No se crean fotografías, PDFs, aprobaciones, conflictos,
consultas, ejecuciones o eventos de auditoría para reproducir cantidades del prototipo.

Completitud no equivale a publicación aprobada. La interfaz diferencia requisitos
incompletos, requisitos completos y condiciones del canal todavía sin evaluar. Las acciones
dependientes de conectores, directorio empresarial, flujo de aprobación y compartición pública
permanecen sin habilitar; la semejanza visual no acredita su implementación.

La única migración nueva es `0022_template_publication_selection.sql`: agrega un booleano
por asignación de atributo a plantilla, con valor inicial `true`. No modifica migraciones
aplicadas, requisitos de completitud, datos de producto ni credenciales.

## Validación

Se ejecutan `pnpm verify`, la suite de integración contra PostgreSQL aislado y comprobaciones
visuales autenticadas de las rutas. Las capturas y registros de esta ejecución se guardan fuera
del repositorio, en `outputs/screen-review-2026-10-22/`. El despliegue usa el flujo protegido
de CI y promoción a QAS.
