# Imágenes del ecommerce desde Narviz

Narviz habilitó la consulta y descarga de las fotos existentes en el ecommerce para la carga inicial al PIM. La guía del 25 de noviembre de 2026 define una API HTTPS de lectura por SKU o lote. Antes del cambio de origen, CDR y el ecommerce conciliarán los SKU, la cantidad y el orden de las imágenes, sus reemplazos y las referencias sin correspondencia. El ecommerce podrá pasar a consumir los activos del PIM cuando ambos equipos confirmen la transición.

## Activación por ambiente

1. Configurar `ECOMMERCE_IMAGES_BASE_URL=https://casadelruliman.ec/pim-bridge/v1` en la API del ambiente autorizado.
2. Inyectar `ECOMMERCE_IMAGES_TOKEN` desde el almacén de secretos del ambiente. En ECS se referencia por ARN en el contenedor API. Narviz entrega el valor por un canal seguro separado. Las dos variables deben configurarse juntas.
3. Aplicar las migraciones `0058_narviz_product_photos.sql` y `0059_narviz_request_budget.sql` por el mecanismo habitual. La pantalla Integraciones refleja si el conector está configurado. La disponibilidad y autenticación se verifican con `GET /api/v1/assets/ecommerce/health`, que comprueba `GET /health` en Narviz.

Narviz asigna 120 unidades por minuto, una por SKU, descarga o verificación de salud. Cada lote acepta de 1 a 100 SKU y las descargas admiten un máximo de dos simultáneas. Se aplica un límite de 30 000 000 bytes por imagen. Las instancias de API que comparten PostgreSQL coordinan la cuota, las descargas simultáneas y la espera por `Retry-After`. Usar una credencial dedicada a cada ambiente para respetar los límites del proveedor. Con la cuota completa, un lote de 100 SKU deja 20 unidades dentro de la misma ventana. Importar una foto nueva consume una unidad para confirmar los metadatos y otra para descargarla.

## Consulta y carga

- Abrir **Publicación → Migración de Imágenes PrestaShop** y seleccionar el producto de destino en el PIM. El SKU inicial de consulta es el del producto. Cuando las referencias difieran, ingresar el SKU del ecommerce exacto y verificar su correspondencia con el producto antes de confirmar la importación. Conservar las mayúsculas, minúsculas y ceros iniciales.
- Para consultar varias referencias juntas, usar **Añadir SKU al lote** con cada producto de destino. Revisar los resultados por SKU. Un error individual de Narviz puede coexistir con resultados válidos del mismo lote.
- Elegir **Todas las disponibles** para consultar las imágenes resueltas por Narviz o **Solo fotografías propias** para consultar las fotos propias del SKU. El resultado identifica el orden del proveedor y la portada. Un SKU existente puede tener una galería vacía.
- Seleccionar las fotos que se quieran importar. El backend las descarga y verifica el tipo MIME, la longitud y el SHA-256 que informa Narviz. Los activos de tipo FOTO admiten JPEG, PNG y WebP. Las fotos importadas se añaden a la galería. Los archivos ya presentes se reconocen por su contenido y la galería existente conserva sus fotos.
- Revisar el historial de importación y los resultados de cada selección. Los filtros del proveedor por marca, categoría y fecha de cambio mencionados en el relevamiento quedan sujetos a una ampliación de su contrato. La implementación consulta los SKU indicados por el operador.

Las rutas internas están bajo `/api/v1/assets/ecommerce`. La consulta usa `POST /lookup` para devolver un resultado por referencia y la importación usa `POST /import` para confirmar cada imagen por identificador y SHA-256. El historial de `GET /history` muestra hasta 100 importaciones recientes, incluidas las entradas de fotos eliminadas. PIM autoriza las operaciones mediante las capacidades de catálogo y publicación. Importar requiere además editar el catálogo.

## Validación con la credencial del ambiente

1. Comprobar que la verificación de salud autentica al backend ante Narviz. Consultar `CDR-0000003991` en modo resuelto y comparar orden, portada y cantidad con el catálogo vigente. El ejemplo de la guía devolvía nueve imágenes.
2. Comprobar MIME, tamaño y SHA-256 durante la descarga de una imagen de esa consulta mediante el backend. El navegador recibe los activos guardados desde el PIM.
3. Consultar el lote de ejemplo de Narviz con `CDR-0000003991`, `CDR-0000003369`, `00577` y `NVZ-PIM-NONEXISTENT-20261125`. Comprobar tres resultados válidos y el error individual `PRODUCT_NOT_FOUND` del proveedor, que el PIM presenta como un SKU no disponible. Verificar que los resultados siguen el orden de entrada y que preservan los SKU repetidos.
4. En un producto de prueba con correspondencia confirmada, importar una foto, comprobar el historial y repetir la operación. La segunda ejecución debe reconocer la foto existente. Verificar en Imágenes y documentos que los activos previos siguen disponibles.
5. Ante una incidencia, registrar operación, estado HTTP, fecha, SKU y `correlationId` cuando esté disponible. Compartir esos datos con soporte mediante el canal acordado. Mantener `Authorization` y el token dentro del backend.

Cuando Narviz responde `429`, observar `Retry-After`. Para fallos temporales `503`, reintentar con espera progresiva. Revisar credencial y permisos ante `401` o `403`, parámetros ante `400`, correspondencias ante `404` o `409`, y metadatos de la imagen ante `412`.
