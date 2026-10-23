# Catálogos PDF: carga y compartición

Completa el pendiente de Catálogos (#37), solicitado por el cliente después de la
revisión visual. Usa el formulario y la tabla del prototipo como referencia.

## Uso

Admin y Compras pueden cargar, editar, reemplazar el PDF, eliminar y restaurar un
catálogo. Los demás roles del módulo pueden consultarlo, descargarlo y generar o
revocar enlaces. El servidor verifica capacidades en todas las operaciones.

El PDF admite hasta 50 MiB; se validan extensión, MIME y firma `%PDF-`. El título
es obligatorio (120 caracteres), la descripción admite 1000 y la nota del enlace 80. La vigencia comienza en una fecha obligatoria; la fecha final es opcional e
incluye todo ese día UTC. Solo se comparten catálogos vigentes.

Los enlaces duran 1, 3 o 7 días; 1, 3 o 6 meses; o no vencen por plazo. Aun sin
vencimiento, dejan de funcionar si se revocan, se elimina el catálogo o termina
su vigencia. Reemplazar el PDF conserva los enlaces y sirve el archivo actual.
La baja es recuperable desde Mostrar → Eliminados. Restaurar no revive enlaces.

La dirección del enlace se muestra una sola vez al generarlo y debe copiarse
antes de cerrar el panel. El historial conserva plazo, nota, actor, fechas,
visitas y estado; permite revocar sin recuperar el token original. Las visitas
cuentan resoluciones de la página pública, no descargas ni usuarios únicos.

Los filtros y la exportación Excel incluyen todas las páginas del conjunto
consultado. No se almacenan PDFs, filas ni tokens en localStorage o IndexedDB.

## Persistencia y seguridad

La migración aditiva `0023_product_catalogs.sql` crea dos tablas PostgreSQL;
las anteriores y la semilla de productos no se modifican. Los binarios usan el
puerto de almacenamiento ya configurado: S3 privado en QAS y memoria en local.
Las escrituras de metadatos y auditoría se confirman en la misma transacción.
Las versiones optimistas evitan sobrescribir una edición concurrente.

El token aleatorio de 256 bits se almacena únicamente como SHA-256. La URL usa
`/shared/catalogs#TOKEN`; el fragmento no llega al servidor ni a sus logs. Los
dos POST públicos `shared/resolve` y `shared/file` reciben el token por JSON,
sin cookies ni autorización humana, y verifican estado en cada acceso. El resto
del sistema mantiene autenticación. El BFF valida origen, contenido, límites y
respuesta PDF; conserva cabeceras de seguridad y `no-store`.

Como en product-assets, no se incorpora un motor antimalware ni un proceso de
purga/reconciliación de objetos. Los binarios anteriores quedan privados para
recuperación; esta entrega no los destruye. El almacenamiento en memoria local
no sobrevive al reinicio del API; QAS usa el almacenamiento persistente existente.

## Verificación

Las pruebas cubren permisos, cargas multipart, fechas, PDF inválido/tamaño,
concurrencia, auditoría atómica, reemplazo manteniendo enlaces, paginación más
allá de 100 filas, expiración, revocación y restauración sin reactivar enlaces.
La validación en navegador usa PDFs rotulados de prueba y comprueba carga,
edición, lectura pública y recuperación. El despliegue QAS aplica la migración
mediante la promoción normal del repositorio.
