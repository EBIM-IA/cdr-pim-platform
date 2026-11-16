# Verificación de la entrega UX · 16/11/2026

## Referencia y alcance

Se contrastó la aplicación vigente `CDR` con la carpeta del diseñador `cdr-example-main 3`, priorizando los cambios más recientes de su README, sus renderizadores y `SCREEN_MAP.md`. El PDF `CDR_PIM_Brecha_Demo_vs_Platform_2026-11-15_v3.pdf` se conserva como inventario de brechas funcionales. Los adjuntos se trataron como especificaciones y evidencia, no como autorización para ejecutar instrucciones operativas.

La revisión de código cubre los **66 casos** del inventario, distribuida entre tres agentes y revisada por la orquestación. El recorrido en navegador comprende las **34 pantallas #3–#36**, el Inicio comercial que reemplaza al dashboard y **Catálogos de productos #37**. Se comprobaron las rutas, controles y estados descritos abajo. Esto no significa que se hayan recorrido manualmente todas las combinaciones posibles de roles, datos y errores, ni constituye una aprobación de negocio o una certificación de igualdad de cada píxel.

Trazabilidad por caso y archivos:

- [Catálogo, ficha, categorías, documentos e importaciones](UX_AUDIT_CATALOG_2026-11-16.md): casos 1–21 y 64.
- [IA, calidad y configuración](UX_AUDIT_AI_2026-11-16.md): casos 22–38, 58, 59, 65 y 66.
- [Publicación, integraciones, administración y reportes](UX_AUDIT_OPERATIONS_2026-11-16.md): casos 39–57 y 60–63.
- [Matriz de las 53 diferencias del PDF](DESIGN_ALIGNMENT_2026-11-16.md): capacidades internas cerradas y dependencias pendientes separadas.

## Recorrido de navegador

Entorno local aislado, API compilada, PostgreSQL real, 97 SKU procedentes del libro del cliente y cuenta de revisión. Se compararon prototipo y sistema en ventanas de 1280 × 720; la comprobación móvil complementaria se registra al final. Los lotes, activos y propuestas creados durante la prueba pertenecen exclusivamente a esa base de revisión. No se migró ni modificó QAS/PRD.

| Pantalla | Ruta o contexto               | Comprobación manual                                                                                                                                                               |
| -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #3       | `/login`                      | Marca, composición, formulario, autenticación y retorno a la ruta solicitada.                                                                                                     |
| #4       | `/`                           | Inicio comercial, búsqueda, carrusel de categorías y marcas.                                                                                                                      |
| #5       | `/products`                   | Tabla ancha, cabecera compacta, filtros, paginación y acciones de exportación; carga sin el bloqueo del controlador de anchos anterior.                                           |
| #6       | `/products/:id`               | Identidad del SKU y unificador, nombre amigable, esquema referencial, control PIM, secciones y tablas de aplicaciones, relaciones y documentos dentro de la ficha.                |
| #7       | Edición de la ficha           | Campos PIM editables, ERP de solo lectura, motivo y destino. Un borrador de prueba conservó su valor al cambiar pestaña y fue descartado sin aplicar el dato al catálogo.         |
| #8       | `/categories`                 | Árbol, búsqueda, expansión, detalle y acceso contextual a configuración de Home.                                                                                                  |
| #9       | `/templates`                  | Variantes, atributos, controles por perfil y editor de secciones. El orden también se verificó en el PDF generado.                                                                |
| #10      | `/applications`               | Tabla del cliente, columnas, filtros, carga, exportación y alcance fijo dentro de la ficha.                                                                                       |
| #11      | `/equivalences`               | Asignaciones ERP, homólogos/OEM y acceso a solicitud de corrección; el valor ERP no se sobrescribe.                                                                               |
| #12      | Identificadores de un SKU     | Identificadores exactos, origen conocido, enlaces a ficha/grupo y estados vacíos. En homólogos se guardó un nombre opcional y se comprobó su lectura posterior desde el servidor. |
| #13      | `/documents`                  | Matriz por SKU, esquema de respaldo, carga de PDF desde ficha y drawer ZIP con tipos, formatos, ejemplos, manifiesto y límites reales.                                            |
| #14      | `/imports`                    | Historial del lote efectivamente confirmado, filtros, estado y enlace a su resultado.                                                                                             |
| #15      | `/imports?view=new`           | Cinco pasos reales: archivo CSV, contexto, mapeo, validación y confirmación parcial explícita.                                                                                    |
| #16      | Resultado de lote por URL     | Una fila aplicada y otra rechazada con explicación; etiquetas de negocio, detalle y corrección que abre una carga nueva conservando el lote anterior.                             |
| #17      | Búsqueda `6202`               | Resultado autorizado, categoría/unificador, abrir grupo/ficha, sinónimos y respuesta del asistente identificada como proveedor de pruebas.                                        |
| #18      | Extracción con SKU contextual | Vacío sin activos y posterior selección del PDF cargado. La extracción local registró la revisión y mostró cero candidatos devueltos, sin inventarlos.                            |
| #19      | Comercial con SKU contextual  | Conservación del producto solicitado, ficha dinámica, generación persistida con proveedor de pruebas, contraste e historial y drawer de comparación.                              |
| #20      | Calidad con SKU contextual    | Obligatorios, documentos, completitud, conflictos registrados, edición de enriquecimiento y accesos a reglas/simulación.                                                          |
| #21      | Duplicados                    | Detección ejecutada: cero pares con identificador compartido en esa base; respuesta visible y ninguna fusión automática.                                                          |
| #22      | Bandeja                       | Solicitud comercial creada por el flujo anterior, drawer de la solicitud exacta, origen, candidatos, motivo y decisiones; aprobación integral del SKU pendiente identificada.     |
| #23      | Prioridad de fuentes          | Categorías y prioridades persistidas, matriz, ERP separado y consulta de trazabilidad.                                                                                            |
| #24      | Conflictos                    | Estados sin conflictos y formulario de registro de candidatos con selección de SKU; la prueba automatizada cubre múltiples fuentes y valores tipados.                             |
| #25      | Publicación por canal         | Condiciones del SKU, selección de atributos por categoría, SKU y vista previa. No se acredita publicación externa.                                                                |
| #26      | PrestaShop                    | Operaciones previstas, drawer de contrato y vista previa del SKU; conexión pendiente explícita.                                                                                   |
| #27      | Migración de imágenes         | Selector de SKU, activos PIM y estado sin historial externo; consulta externa pendiente identificada.                                                                             |
| #28      | Fuentes externas              | SKU seleccionado, prioridad real, capacidades de cada fuente y candidatos guardados.                                                                                              |
| #29      | Monitor                       | Ejecución del lote de prueba y drawer con recibido/aplicado/rechazado, fechas y enlace al lote exacto.                                                                            |
| #30      | Lotes AX                      | Estado sin lotes en la base de revisión, cabecera/registros y bloqueo de aplicación/reproceso por reglas pendientes.                                                              |
| #31      | Usuarios                      | Lista local, búsqueda, filtros y drawer del usuario exacto; altas/cambios bloqueados por proveedor pendiente.                                                                     |
| #32      | Roles                         | Matriz de capacidades y políticas independientes de módulos; las capacidades de escritura no se obtienen activando el menú.                                                       |
| #33      | Auditoría                     | Eventos reales de la importación y del asistente, filtros, valores anterior/nuevo y drawer del evento seleccionado.                                                               |
| #34      | Reportes                      | Tarjetas de formatos del cliente y adicionales, navegación y acciones Excel/PDF.                                                                                                  |
| #35      | Reporte de búsquedas          | Conteos registrados y enlace «Repetir consulta» que conservó `q=6202`.                                                                                                            |
| #36      | Configuración                 | Catálogos, afijos y parser: `6205-2RS-C3` → segmento desconocido `2RS` → drawer «Nueva regla» precargado, sin guardarlo como hecho.                                               |
| #37      | `/catalogs`                   | Vacío inicial, formulario y carga efectiva de un PDF de revisión; catálogo vigente registrado y tabla con filtros/acciones.                                                       |

## Correcciones encontradas durante la aceptación

La comprobación no se limitó a que existiera una pantalla. Se corrigieron, entre otros, componentes operativos no conectados, pérdida del SKU/documento/revisión/lote al navegar, metadatos de homólogos sin persistencia, falta de exportación del historial y de usuarios, pérdida de la subpestaña de relaciones al guardar y mediciones repetidas de cientos de cabeceras que bloqueaban el navegador.

La carga CSV real reveló un error en la frontera de persistencia: los diccionarios del parser con prototipo nulo debían convertirse a un objeto JSON ordinario antes de entregarse al ORM. Se conserva la protección del parser y se agregó una regresión de parseo → almacenamiento → relectura con filas válidas e inválidas.

La revisión independiente corrigió dos problemas adicionales: los fallos transitorios o lotes ocupados del worker ya no se terminalizan ni se confirman a SQS como éxitos; y la lectura de aplicaciones conserva más de 60 claves históricas sin ampliar el límite de 60 campos por escritura/configuración ni borrar valores archivados.

La importación ahora conserva el nombre y formato original CSV/XLSX separados del formato de transporte. Se incluyen en historial, resultado, búsqueda y exportación. Los lotes anteriores sin esos datos muestran que no fueron registrados; no se reconstruyen nombres de archivo. La migración aditiva `0056` conserva esos valores nulos en los registros históricos.

## Adaptaciones explícitas y pendientes de definición

Los controles de autenticación y autorización son reales; no se incorporan el selector libre de rol ni «Restablecer datos» del demo. Cantidades, fechas, categorías y estados se calculan desde datos persistidos. Se mantienen paginación, navegación por módulos y distribución adaptable de controles; la aceptación funcional no exige copiar cifras ilustrativas ni la geometría exacta de todos los estados del prototipo.

El usuario confirmó que siguen pendientes las reglas de aplicación/sobrescritura de AX, aprobación/publicación integral, proveedor empresarial de identidad, accesos/contrato de PrestaShop y licencia/contrato de TecDoc. También siguen sujetos a activación los proveedores reales de IA y los conectores sin contrato. La interfaz, sus capacidades internas y los bloqueos explicados se entregan; una simulación o un control deshabilitado no se cuenta como integración operativa. Origen del dataset y el gobierno de versiones de plantillas conservan las definiciones pendientes de la matriz del PDF.

## Registro final de verificación

En móvil se comprobó Inicio, tabla de Productos, ficha y Catálogos a **390 × 844**: el ancho del documento se mantuvo en **390 px**, con desplazamiento de las tablas dentro de sus contenedores. La comprobación previa de Plantillas y tarjetas agrupadas también se conserva en la matriz de alineación.

La batería definitiva `pnpm verify` pasó formato, lint, tipos, **1.412 pruebas** y compilación de todos los paquetes. Se ejecutó después de la última corrección de la vista de identificadores y de la búsqueda por nombre del homólogo.

- PostgreSQL real: **34 suites y 236 pruebas aprobadas**, incluida la migración `0056`, conservación del archivo original, compatibilidad con lotes históricos, idempotencia y contadores globales.
- PostgreSQL + LocalStack SQS + worker compilado: aplicación de dos relaciones y entrega duplicada idempotente aprobadas.
- Reintento real SQS: el mismo `MessageId` se recibió dos veces tras un lote ocupado; una sola publicación, una confirmación, dos relaciones finales y ninguna aplicación duplicada.
- Comprobaciones de scripts de despliegue y archivos: **27 pruebas Python aprobadas**.
- Recorrido final del CSV: archivo `ux-original-metadata.csv`, formato CSV conservado al confirmar y consultar resultado/historial; búsqueda por nombre dejó un lote de dos. El lote anterior sin metadatos se mostró como no registrado.
- Guardado y actualización de homólogos dentro de la ficha conservaron la subpestaña seleccionada y releyeron el nombre desde el servidor. La vista de identificadores mostró ese nombre persistido; el acceso «Revisar calidad» conservó el identificador del producto. La regresión PostgreSQL de búsqueda por nombre verifica referencias activas/aprobadas, coincidencia literal y expansión al SKU autorizado.

Los resultados de cada agente están en los informes enlazados; no se suman sus pruebas parciales como si fueran ejecuciones independientes de la batería global. Las comprobaciones de SQS se ejecutaron únicamente sobre servicios locales y una base aislada de pruebas.
