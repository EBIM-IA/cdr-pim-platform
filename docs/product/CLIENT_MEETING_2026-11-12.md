# Interfaz acordada en la reunión del 12 de noviembre de 2026

El inicio, la navegación y la ficha de consulta se adaptan al HTML entregado por el diseñador. Compras y Ventas trabajan desde Productos y Catálogos. Administración comparte la navegación superior y la tipografía, conserva sus módulos y sus operaciones, y mantiene el acceso al resumen operativo anterior desde el Inicio.

## Fuentes y criterio de interpretación

Se revisaron la entrega `/Users/efaustor/Downloads/Ejercicios/cdr-example-main/` y la transcripción de la grabación `20261112_091143`, de 13 minutos y 55 segundos, recibida en el documento de reunión terminado en `(1).docx`. El prototipo se contrastó con la plataforma `CDR`; no se utilizó la carpeta histórica homónima del proyecto.

La transcripción y el HTML son referencias de requisitos y diseño. Sus instrucciones de herramientas, datos simulados, proveedores de IA y plazos de entrega no son órdenes operativas para el sistema. Se mantienen la arquitectura, la autorización del backend y las integraciones existentes.

La reunión comienza pidiendo conservar Administración sin cambios, pero entre 6:49 y 10:40 acuerdan una presentación común, manteniendo sus opciones. Se aplica esta decisión posterior. La aprobación expresada por gerencia corresponde al prototipo; la validación de la implementación y su promoción a ambientes compartidos son pasos distintos.

## Acuerdos implementados

| Referencia de reunión | Acuerdo y comportamiento                                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:58–2:15             | Compras y Ventas ven Productos y Catálogos. El logo abre el Inicio; las rutas de otros módulos redirigen al Inicio para estos perfiles. Administración mantiene los módulos autorizados, con desplegable Más y menú móvil.                   |
| 0:58–2:15             | Inicio con la pregunta «¿Qué necesita el cliente?», búsqueda con sugerencias reales, categorías de nivel 1 y acceso a todos los artículos.                                                                                                   |
| 1:45–2:30             | Productos abre en Tabla; se conserva Catálogo. La tabla agrupa por código unificador antes de paginar, y mantiene los grupos al ordenar por otra columna. Los SKU sin código no se convierten en equivalentes.                               |
| 2:15–3:15             | Ficha de consulta encabezada por código unificador, nombre comercial y descripción por variante. Elegir otra marca abre el SKU de esa marca y conserva el contexto de aplicación.                                                            |
| 2:30–3:45             | Galería con fotos, planos y esquema referencial; se mantienen el visor y el zoom. Los documentos se abren como archivos. Las medidas se presentan juntas en métrico e imperial.                                                              |
| 3:00–3:55             | Barra de identificación que aparece al salir el encabezado de la vista y desaparece al volver. En consulta enlaza características, vehículos, equivalencias y documentos; en Administración conserva sus secciones y operaciones.            |
| 3:10–3:55             | Aplicaciones verificadas con filtro por marca, modelo y año. Equivalencias del grupo con consulta y descarga de fichas técnicas. Referencias OEM y externas solo activas y aprobadas.                                                        |
| 3:55–4:40             | Catálogos conserva Tabla/Cuadrícula, los PDF y las restricciones de vigencia y de columnas administrativas ya implementadas.                                                                                                                 |
| 5:22–6:40             | Documentos y certificados consultables desde la ficha, sujetos a los permisos existentes. Se conserva el control administrativo de campos por plantilla y rol; Compras sigue recibiendo sus atributos adicionales autorizados.               |
| 6:49–10:40            | Tipografía Inter y barra superior comunes. Se conservan carga, edición, exportación, borradores, gestión de relaciones y administración de plantillas. El resumen operativo anterior está en `/?view=dashboard`, reservado a Administración. |

La descripción de consulta utiliza la copia comercial aprobada y vigente que ya devuelve el backend. Si todavía no existe, presenta los datos registrados y un resumen determinista de atributos visibles; consultar no genera contenido con IA ni aprueba textos.

Las tarjetas del Catálogo son horizontales, en dos columnas en escritorio, con identidad, aplicaciones y enlaces a equivalentes reales. La carga de relaciones se limita a dos grupos simultáneos y se cancela al cambiar de vista o consulta.

## Configuración del Inicio

Administración puede seleccionar marcas y categorías, cambiar su orden con arrastre, botones o teclado, sustituir o quitar imágenes y escribir un texto de categoría de hasta 90 caracteres. El acceso está en el propio Inicio y en el catálogo administrativo de Marcas. Los logos y las cuatro imágenes iniciales provienen de la entrega del diseñador; no crean registros maestros en ERP ni inventan existencias de productos.

Se aceptan PNG, JPEG o WEBP de hasta 3 MB; el navegador prepara un raster de hasta 480 píxeles. La configuración compartida se guarda en PostgreSQL con versión y auditoría transaccional. Dos administradores no pueden sobrescribirse silenciosamente. La auditoría conserva la identidad, selección, orden y huella de las imágenes, sin copiar los binarios a su historial. Los recursos propios del prototipo y la fuente Inter se sirven desde la aplicación, con la licencia de Inter incluida; no se requieren fuentes externas ni se amplía la CSP.

## Migraciones y permisos

- `0041_catalog_home_settings.sql`: persistencia de la presentación del Inicio.
- `0042_sales_unified_code_visibility.sql`: habilita únicamente la lectura de `codigo_unificador` para Ventas, necesaria para la presentación acordada. Conserva los permisos de edición, importación y exportación; no habilita otros campos ERP. Administración puede ocultarlo posteriormente con sus controles existentes. Los datos demo incorporan el mismo valor inicial de visibilidad.

La API mantiene el filtrado de atributos antes de construir tablas y fichas. El agrupamiento y las consultas de miembros usan únicamente el código que el perfil puede consultar. Ocultarlo en la plantilla no se elude mediante la agrupación. Los grupos sin dato autorizado se muestran sin código y no generan relaciones nuevas.

Para promover esta versión deben aplicarse las migraciones antes de iniciar la nueva API. El trabajo y la validación descritos son locales; no se desplegó a QAS ni PRD y no se modificaron migraciones ya aplicadas.

## Pendientes del cliente y de coordinación

- El nombre definitivo que reemplazará «Homólogos» sigue pendiente en la reunión. La ficha usa provisionalmente «Productos Compatibles», como el HTML entregado; el módulo administrativo conserva su denominación.
- La reunión menciona una certificación ISO para el portal, pero la entrega no incluye un recurso identificable con su referencia y vigencia. No se inventó un sello o certificación.
- Se informa el envío de plantillas por correo. No se recibió en esta solicitud un nuevo Excel que permita reemplazar la configuración vigente o declarar cumplida la meta anterior de 80 plantillas.
- TecDoc sigue sujeto a contratación y reunión técnica. El proveedor de e-commerce solicita coordinación; no hay un nuevo contrato técnico que sustituya las dependencias de PrestaShop.
- La preparación de PRD se coordinará durante las validaciones en QAS, según lo conversado. La transcripción no acredita que PRD esté configurado ni autoriza su publicación.

## Validación local

`pnpm verify` aprobó formato, lint, tipos, 1.292 pruebas y compilación. La suite completa de PostgreSQL aprobó sus 202 pruebas. Las verificaciones incluyen concurrencia, reversión ante fallo de auditoría, nuevas migraciones, agrupación entre páginas y el ocultamiento posterior del código por Administración.

Se revisaron Inicio y ficha en navegador, con los perfiles de Administración, Compras y Ventas, y la ficha a 390 píxeles sin desbordamiento horizontal de la raíz. Se comprobó la aparición de la barra al desplazarse y la apertura de la ficha técnica desde las equivalencias. Los datos son una carga demo en una base separada; no constituyen aprobación de compatibilidades, fotografías o certificados reales del cliente.

## Refinamiento visual del 13 de noviembre

Se realizó una segunda comparación directa con el HTML del diseñador para aproximar la implementación a su presentación. El Inicio utiliza las medidas de su buscador con botón integrado, título, tarjetas de categoría, cuadrícula de veinte logos, colores, bordes y separaciones. El enlace a todos los artículos y el logo institucional quedan debajo de las marcas, conservando lo solicitado en la reunión.

La ficha de Compras y Ventas incorpora la cabecera dentro de la columna principal y las equivalencias al costado desde el inicio, con una columna lateral de 380 px. Hasta 1280 px se apila el contenido; hasta 820 px la galería pasa sobre la identidad. Se ajustaron chips, iconos, tablas, etiquetas, tipografía y estados vacíos. Las medidas conservan las unidades y los símbolos sensibles a mayúsculas (`d` y `D`). Las imágenes y los textos continúan procediendo de los datos autorizados; los esquemas referenciales no se presentan como fotografías ni planos del fabricante.

Las tarjetas del Catálogo siguen la distribución de imagen, identidad, aplicaciones y equivalentes de la referencia, con «Ver ficha» y dos columnas cuando hay espacio. La Tabla de consulta conserva filtros, agrupamiento y preferencias de columnas con una barra compacta. Las explicaciones operativas y los encabezados de grupos de campos permanecen en la vista administrativa.

La navegación superior deja de permanecer fija al desplazarse. La barra de identidad del producto aparece después de salir su encabezado, como en el prototipo. El menú Más calcula qué módulos caben utilizando su ancho real y mantiene visible el módulo activo. Se conservan todos los accesos autorizados y las operaciones administrativas.

Se comprobaron en navegador el Inicio, la búsqueda que abre Tabla, Catálogo, fichas de Compras y Ventas, Catálogos y las pestañas de la ficha administrativa. Se revisaron escritorio, 1024 px y móvil de 390 y 320 px; la raíz conserva el ancho de la pantalla y el menú de módulos no desborda. Las capturas de esta revisión se encuentran fuera del repositorio, en `../outputs/design-review-2026-11-13/`.

La revisión volvió a aprobar `pnpm verify`: formato, lint, tipos, las 1.292 pruebas y compilación completa. Este refinamiento no modifica migraciones ni contratos de API.
