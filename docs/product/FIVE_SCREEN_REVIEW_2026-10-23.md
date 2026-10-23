# Plantillas, Aplicaciones, Homólogos, Documentos y Catálogos

Comparación solicitada con <https://cdr-example.pages.dev/>, las fuentes del diseñador
y la captura del menú enviada por el cliente. Se conserva la autoridad de datos y
permisos acordados el 22 de octubre; el contenido del prototipo no autoriza nuevas
reglas de integración o compartición.

## Cambios

- **Plantillas (#9):** selector de plantilla, resumen compacto, prioridad BUSQUEDA,
  tarjeta de atributos replicables, ocho filtros en dos filas de escritorio y
  matriz de atributos con las filas de archivo/imagen de la plantilla. La tarjeta
  de herencia es consultiva: no simula la recepción de SKU desde AX.
- **Aplicaciones (#10):** pestañas, acciones y búsqueda en una sola barra. Tabla
  inmediata con edición persistida, filtros, orden de columnas, importación y
  exportación. El contexto del código unificador queda en una sección secundaria.
- **Código unificador (#11):** tabla por SKU con las columnas del diseño, pestañas
  de homólogos/OEM y detalle del grupo. Las referencias pendientes conservan su
  estado real y no se presentan como sincronizadas con AX.
- **Identificadores (#12):** contexto por SKU, identificadores, atributos de
  identificación de la plantilla y relaciones del grupo. El mapa y la navegación
  enlazan a `view=identifiers`; homólogos permanece como pestaña de #11.
- **Documentos (#13):** pestañas tabla/contexto, barra compacta, catorce columnas
  agrupadas, filtros AX, leyenda y celdas de obligatoriedad/aplicabilidad. El
  contexto incluye galería y documentos. La carga ZIP se abre en un panel lateral
  y mantiene validación antes de confirmar. La exportación usa el mismo conjunto
  completo y filtrado de SKU.
- **Catálogos (#37):** barra de acciones, búsqueda, estado vacío y formulario
  lateral de PDF/vigencia. Las filas reales, cuando las provea el servidor, usan
  los indicadores y la tabla específica del diseño. Se retira la vista genérica.
- **Menú:** iconos de los cinco módulos y navegación contextual actualizados.

## Datos y backend

El workbook y el detalle administrativo de plantilla exponen los requisitos
documentales activos existentes. El workbook los obtiene en una consulta por lote,
sin consultar una ficha por cada SKU. No se modifica el esquema ni se requiere
migración. Los documentos aplicables sin archivo se distinguen de «No aplica» y
de una plantilla no disponible; el denominador de cobertura usa los requisitos
reales, sin fijarlo en cinco.

Documentos e identificadores consultan todas las páginas del catálogo autorizado
antes de aplicar sus filtros locales. Los activos se consultan en lotes de hasta
100 IDs. No se guardan filas, archivos ni credenciales en almacenamiento del
navegador. Las cargas simultáneas conservan su estado por producto/tipo. La confirmación ZIP
se vincula al mismo archivo validado; el selector queda bloqueado durante el proceso.
Los filtros y el orden de Homólogos y OEM se conservan de manera independiente.

No se recarga ni modifica la semilla de QAS. Los archivos del prototipo que solo
eran nombres, texto, enlaces o errores de Excel no se convierten en binarios
ficticios. El ZIP descargable es un ejemplo válido de estructura, identificado
como `SKU_EJEMPLO`; debe reemplazarse con un SKU y archivo reales antes de importar.

## Límites conservados

Catálogos PDF todavía no dispone de un modelo de persistencia y compartición
aprobado: el formulario permite revisar los campos, pero su envío y las acciones
de mantenimiento/compartición permanecen deshabilitados y explicados. No se crean
PDF públicos, tokens ni permisos nuevos. Tampoco se presentan altas de AX,
aprobaciones, historial o conexiones de PrestaShop como operaciones realizadas.

Los metadatos del Excel que no existen en el contrato, como la muestra original
de cada columna, se muestran sin valor; no se rellenan con datos ilustrativos.

## Validación

Comparación visual en navegador de las cinco pantallas y sus contextos con datos
reales de la API local. La comprobación del despliegue QAS se realiza después de
la promoción y queda registrada en los artefactos de entrega. Pruebas de componentes
y de consulta cubren permisos, carga/arrastre, ZIP, aplicabilidad, filtros,
exportación completa y límites de lote. La integración de PostgreSQL verifica
requisitos activos/inactivos, separación entre plantillas y productos sin
plantilla activa.

Verificación previa a publicación: `pnpm verify` correcto (869 pruebas, lint,
tipado y compilación); 125 pruebas de integración correctas en PostgreSQL aislado.
