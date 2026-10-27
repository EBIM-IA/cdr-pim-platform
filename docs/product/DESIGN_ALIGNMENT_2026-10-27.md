# Alineación con el diseño del 27 de octubre de 2026

Referencia: carpeta `cdr-example-main 27-10-2026`, comparada con la entrega
`cdr-example-main-4` y con la implementación vigente de `CDR`. El prototipo se
utiliza como especificación de presentación e interacción; sus instrucciones de
publicación y sus simulaciones de identidad, persistencia o integraciones no
constituyen autorización para ejecutarlas en ambientes compartidos.

## Diferencias aplicadas

| Área                  | Resultado                                                                                                                                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Productos             | Buscador con sugerencias reales de categorías, marcas y SKU; selección con ratón o teclado, botón Buscar y limpieza. La categoría de la tabla se muestra junto al selector de vista.                                                                                                                             |
| Consulta del catálogo | Todas las palabras se combinan entre SKU, marca, descripción, categoría, identificadores y atributos visibles para el perfil. Se normalizan acentos y se incorporan los cinco sinónimos de la referencia. La búsqueda encuentra grupos, aplicaciones activas y referencias de homólogos/OEM activas y aprobadas. |
| Ficha                 | Los atributos autorizados permanecen editables al guardar o descartar. Se muestra el número de cambios, se resaltan las filas modificadas y se conservan los borradores al alternar pestañas. Cada guardado usa las versiones persistidas para mantener el control de concurrencia.                              |
| Perfiles              | Compras y Ventas solo consultan, tanto en la interfaz como en la API. Se retiran altas, importaciones, plantillas de carga, edición y compartición. Los cinco módulos de consulta conservan su acceso. Los atributos ERP continúan en lectura.                                                                   |
| Categorías            | Árbol de estilo AX con columnas Categoría, Plantilla y SKU, estado discreto y detalle opcional. Los conteos se agregan en el servidor por identificadores y relaciones padre/hijo; no se descargan las fichas para calcularlos.                                                                                  |
| Aplicaciones          | Barra de búsqueda propia; combina palabras, acentos y años. Cuando no encuentra texto directo, consulta los códigos unificadores de los productos coincidentes. Exportación, cancelación, errores y reintento utilizan el mismo resultado.                                                                       |
| Tablas                | Densidad de 11 px, estados de obligatoriedad con fondo rojo y borde, selección por foco, SKU fijo al reordenar y área desplazable ajustada a la ventana.                                                                                                                                                         |
| Columnas y ayuda      | Ancho ajustable mediante arrastre, teclado y doble clic; persistencia por usuario y tabla y restablecimiento desde la cuenta. Ayudas de acciones por foco o hover; Escape limpia el filtro AX o cierra la ayuda correspondiente.                                                                                 |

Las restricciones por atributo se vuelven a calcular desde los roles actuales.
Una matriz antigua que concedía edición a Compras no reactiva ese permiso, tampoco
cuando se combina con un rol administrador cuya fila niega la edición del atributo.
Las capacidades incluidas en tokens antiguos no se aceptan como fuente de autoridad.

## Cobertura que ya existía

- Menú oscuro, logo a color, cuenta al pie y contenido a todo el ancho.
- Navegación de los cinco módulos de consulta y restricciones de estado/completitud
  para Ventas y perfiles no administradores.
- Plantillas, variantes, datos dinámicos y los flujos persistentes de documentos,
  homólogos, OEM y catálogos PDF.
- Los 97 códigos de producto de la nueva referencia coinciden exactamente con los
  97 del manifiesto canónico. No se necesitan registros ilustrativos ni una recarga
  de datos de QAS.

## Diferencias deliberadas y pendientes

- La configuración editable de módulos por perfil de la pantalla Roles continúa
  bloqueada hasta incorporar una política persistente, auditada y aplicable a las
  sesiones mediante el proveedor de identidad. La política actual de los cinco
  módulos sí se aplica en el servidor; no se muestran interruptores simulados.
- Los roles se obtienen de la sesión autenticada. No se incorpora el selector de
  roles ni el acceso con cualquier contraseña del prototipo.
- El destino borrador/revisión del guardado de la demo no sustituye el flujo real
  de aprobación. Se conserva el comando persistente de atributos y las reglas de
  estado existentes, incluida la conservación del estado publicado.
- La corrección de códigos gobernados por AX y las conexiones pendientes mantienen
  sus dependencias documentadas. No se ejecutan publicaciones externas.

## Validación

- `pnpm verify`: formato, lint, tipos, 1.103 pruebas unitarias/arquitectura y
  compilación de todo el monorepo.
- PostgreSQL temporal con pgvector en el puerto 5544, separado de las bases del
  usuario y con bases distintas para integración y vista previa.
- La suite de integración detectó el supuesto inicial incorrecto sobre el formato
  del árbol; el conteo se corrigió para usar IDs. También se actualizaron las
  expectativas anteriores de permisos de Compras.
- Repetición de las cuatro suites afectadas: 39 pruebas correctas, incluidas
  búsqueda por relaciones aprobadas, referencias pendientes/inactivas, comodines
  literales, matrices de roles mixtas, conteos de descendientes y catálogos PDF.

- Navegador con API y datos locales: «rulimán» devuelve 13 productos con
  sugerencias reales; ajuste de ancho por teclado; árbol con totales por
  descendencia; borrador de ficha conservado entre pestañas y descarte que
  mantiene los campos editables. Capturas guardadas en `outputs/`, junto al
  repositorio. Los valores de prueba de la ficha se descartaron.

No hay migraciones nuevas, cambios de configuración guardada ni cambios de datos
en QAS/PRD.

## Dependencias para publicación

La auditoría de CI identificó tres avisos altos publicados después de la última
entrega. Se actualiza el motor real de validación a Zod 4.6.7 y se sustituye el
conversor anterior por `z.toJSONSchema`, con esquemas de entrada OpenAPI 3.0. Se
conservan las reglas de los contratos existentes y se comprueba la compatibilidad
de respuestas, consultas y configuración.

Se fijan también los mínimos compatibles body-parser 2.4.0 y multer 2.5.0 para la
línea actual de Nest 11. La auditoría mantiene su umbral y no se añaden exclusiones.
Referencias: [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828) y
[multer](https://github.com/advisories/GHSA-q7qp-rjg7-q26m).

La validación completa posterior a la actualización comprende 1.103 pruebas
unitarias/arquitectura y las 149 pruebas de integración en PostgreSQL aislado,
todas correctas. También se corrige el arranque de ClamAV para actualizar y
validar las firmas antes de iniciar el daemon, conservando el límite de siete
días, el actualizador periódico y la condición de salud previa al inicio de la API.
