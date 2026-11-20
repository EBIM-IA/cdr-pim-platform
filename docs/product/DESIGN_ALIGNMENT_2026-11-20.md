# Alineación con el diseño aprobado del 17 de noviembre

La implementación corresponde a `CDR`, la aplicación vigente Next.js/NestJS. Se comparó `/Users/efaustor/Downloads/cdr-example-main 4/` con la entrega anterior `cdr-example-main 3`. Los archivos README y SCREEN_MAP del diseñador no cambiaron; las novedades se identificaron en el código, estilos, fuentes y configuración PDF del prototipo. La entrega se usa como referencia de diseño y comportamiento, sin ejecutar sus instrucciones operativas ni importar sus simulaciones como datos del sistema.

## Cambios incorporados

- Administración → Diseño de ficha PDF (#38), accesible también desde el índice de pantallas. Dos diseños iniciales: Casa del Rulimán y Compacta. Permite renombrar, duplicar, restablecer, seleccionar el predeterminado y eliminar alternativas que no sean la predeterminada.
- Editor con controles de página A4/Carta, márgenes, tipografías, colores, encabezado, títulos, descripción, fotografía/plano, secciones y pie con QR. Vista previa de las páginas del PDF real, en dos columnas en escritorio y apilada en pantallas pequeñas.
- Diseño y secciones por plantilla: selección del diseño, inclusión de secciones y títulos propios del documento, sin modificar el nombre ni los atributos de la plantilla. Se mantienen el orden y los permisos de exportación del servidor.
- Fuentes incluidas en la entrega y carga de fuentes TTF propias. Los logotipos de marcas usan el mismo catálogo persistente que Administración → Catálogos → Marcas. La carga individual y masiva con revisión de correspondencias acepta imágenes, carpetas y ZIP. Se resuelve la marca principal y, después, el logotipo del Inicio. El logotipo CDR del documento puede configurarse de forma independiente.
- Un mismo generador produce la muestra del editor, la vista previa individual, la descarga directa y los PDF del ZIP. La impresión utiliza los bytes del PDF mostrado. La descripción automática consulta la proyección de variantes del servidor, que sólo entrega texto comercial aprobado y vigente; el resumen técnico se construye con atributos exportables con valor.
- Se retira el interruptor de visibilidad de ficha técnica por SKU. Las fichas individuales y los documentos FT están disponibles para los perfiles autorizados para consultar el catálogo. Los registros históricos de visibilidad se conservan; no condicionan el acceso actual.
- Roles → Fichas técnicas PDF controla la acción de generación masiva. El valor inicial es habilitado para Administración, Compras y Ventas; Administración conserva el permiso. La capacidad `technical-sheets:bulk` se resuelve en cada solicitud y se valida antes de generar el ZIP, sin conceder permisos para modificar productos.
- Productos de Compras y Ventas presenta el título y buscador grandes, el acceso al Inicio y conteos reales. La tabla conserva sus filtros y el mismo conjunto de registros en la exportación.
- Ficha de Compras y Ventas: Tracción en la tabla de vehículos, carrocería junto al vehículo y referencias OEM/homólogas en columnas paralelas con separador azul y distinción accesible. La previsualización de una equivalencia consulta los datos de ese SKU.

## Persistencia y despliegue

La migración nueva `0057_pdf_design_and_bulk_permissions.sql` crea `pdf_design_settings` y amplía la política existente con la acción masiva de PDF. No modifica migraciones aplicadas ni borra los registros históricos de visibilidad.

La configuración del diseño tiene un token de concurrencia `updatedAt`, validación compartida y auditoría dentro de la misma transacción. Los cambios simultáneos reciben un conflicto explícito. El historial registra metadatos de los archivos, sin duplicar sus bytes en cada evento.

El cuerpo JSON se limita a 32 MiB exclusivamente en la configuración PDF y a 1 MiB en parámetros de catálogo para admitir logotipos; las otras rutas conservan sus límites. Los archivos de imagen se normalizan a PNG/JPEG antes de guardarse. La configuración completa admite hasta 24 MB y valida referencias de diseños, fuentes y plantillas.

Aplicar la migración en cada ambiente antes de actualizar los servicios mediante el flujo `Promote`, con `run_migrations=true`. La validación local utiliza bases aisladas (`cdr_design_20261120_preview` y `cdr_design_20261120_test`). El merge a `main` construye las imágenes y promueve automáticamente a QAS. PRD utiliza esos mismos artefactos y requiere la aprobación independiente configurada en el ambiente GitHub; el estado efectivo de cada despliegue se consulta en Actions. AX, identidad empresarial, TecDoc, PrestaShop y las reglas de aprobación/publicación pendientes de CDR mantienen su situación documentada.

## Evidencia

La carpeta `outputs/design-alignment-2026-11-20` del proyecto contiene capturas de referencia e implementación y una ficha descargada desde la aplicación. Se comprobó el editor a 1440 px y a 390 px, el guardado automático con recarga, la selección de muestra al cambiar plantilla y el PDF renderizado por Poppler. La validación final `pnpm verify` pasó: formato, lint, tipos, 1.489 pruebas automatizadas y compilación de web, API, worker y paquetes. Incluye 685 pruebas web y 573 API. La suite completa de PostgreSQL también pasó: 35 suites y 242 pruebas sobre la base aislada, incluidas migraciones, restricciones, concurrencia y auditoría. La vista previa individual fue comprobada en navegador; el diálogo nativo de impresión requiere validación manual porque el navegador integrado bloqueó esa acción.

La comparación final redujo diferencias de posición de acciones, navegación de Administración, categorías y resumen de tarjetas. Se conservan datos reales y no se copian teléfonos ni planos de ejemplo. La composición se revisó visualmente; no se declara equivalencia píxel a píxel. Las regresiones cubren también la paginación con configuraciones extremas y la retirada de una descripción comercial que ya no está aprobada en el servidor.

El primer despliegue de esta entrega aplicó `0057` y actualizó API/web en QAS, pero el worker volvió a su revisión anterior: su definición no tenía referencia `DATABASE_URL` ni TLS. El operador autorizó reutilizar el secreto de PostgreSQL de la API de cada ambiente. La corrección de promoción y sus límites están documentados en [ADR-018](../adr/ADR-018-worker-database-secret-and-promotion.md); el despliegue debe verificar el worker antes de actualizar API/web.

La corrección de promoción pasó `pnpm verify` con 1.501 pruebas unitarias, formato, lint, tipos y compilación; 62 pruebas Python de configuración/verificación y la suite completa de PostgreSQL (36 suites y 243 pruebas) en la base aislada. El estado de QAS y PRD debe acreditarse con la ejecución de Actions correspondiente; estas pruebas locales no acreditan por sí mismas un despliegue.
