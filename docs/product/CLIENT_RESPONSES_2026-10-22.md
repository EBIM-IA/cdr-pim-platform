# Decisiones funcionales confirmadas el 22 de octubre de 2026

Este registro traduce las respuestas del cliente a reglas implementables. Cuando una respuesta
no define todavía el dato técnico necesario para automatizar el flujo, se conserva esa separación
para no inventar una política de negocio.

## Plantillas y categoría

- El PIM no crea productos: AX envía cada SKU con su categoría.
- La categoría de tercer nivel de AX determina la categoría final y, por tanto, la plantilla
  aplicable. El contrato AX admite `categoriaNivel3` sin romper los consumidores existentes.
- Cada categoría tiene su propia plantilla. Si la categoría no existe, está inactiva o no permite
  resolver una única plantilla activa, el producto queda en `in_review`; nunca se asigna una
  plantilla general ni se elige una por semejanza.
- La IA analiza únicamente los atributos de la plantilla de la categoría resuelta. Cada resultado
  debe identificar el atributo por su nombre visible y su clave técnica; no puede crear atributos
  fuera de la plantilla.
- Una reasignación manual sólo puede escoger otra variante activa de la misma categoría, conserva
  los valores existentes y queda auditada.

## Autoridad y conflictos de fuente

- Los campos enviados por AX son de autoridad ERP y deben mantener el valor de AX.
- Las correcciones humanas se limitan a atributos de enriquecimiento PIM que AX no administra.
- Si AX y un archivo Excel entregan valores distintos para el mismo campo gobernado, el producto
  pasa a `in_review`. El sistema debe conservar ambos candidatos y un administrador selecciona el
  valor correcto. No se resuelve mediante una prioridad silenciosa.

La bandeja persistente de candidatos por fuente y su comando de resolución siguen pendientes del
procesador AX → catálogo; el receptor actual sólo guarda el lote de forma durable. Esta regla queda
cerrada funcionalmente, pero no autoriza aplicar lotes al catálogo sin completar dicho modelo.

## Publicación

- Cambiar la plantilla de un producto publicado no lo devuelve a revisión: el cambio ya fue
  realizado por un usuario autorizado dentro del PIM.
- El SKU conserva el estado `published`, vuelve a evaluarse con la nueva plantilla y la versión
  vigente queda disponible para los consumidores del PIM. Cuando se conecte un canal externo, el
  mismo evento de cambio deberá disparar su republicación automática.

## Significado de «No aplica»

«No aplica» no es un campo de las plantillas. Es un estado visual de la tabla dinámica: indica que
el atributo de esa columna no pertenece a la plantilla asignada al SKU. Se presenta con una celda
tramada y no cuenta como dato faltante. Una celda rosada significa, en cambio, que el atributo sí
aplica, es obligatorio y todavía no tiene valor.

## Roles y presentación

- `COMPRAS` y `VENTAS` sólo acceden a Productos, Aplicaciones, Código Unificador y Homólogos,
  Documentos y Catálogos.
- `VENTAS` no ve descripción, plantilla ni estado/completitud en la tabla de productos, ni estado
  o completitud en la ficha.
- Todo rol no administrador deja de ver el indicador y filtro de completitud.
- La política se aplica mediante capacidades del backend y la interfaz consume esas capacidades;
  ocultar el menú no es el mecanismo de autorización.
- La interfaz utiliza la pila tipográfica `Aptos Narrow` a 11 pt, con alternativas compatibles si
  el equipo cliente no tiene instalada la fuente propietaria.
