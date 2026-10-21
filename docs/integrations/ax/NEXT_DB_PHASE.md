# AX → PIM — decisiones pendientes para aplicar los datos al catálogo

## Resuelto

- Dirección: AX/Sismetic envía y el PIM recibe; no hay escritura PIM → AX.
- Recepción duradera: lote y registros se guardan antes del `202`.
- Idempotencia técnica: mismo `idLote` + mismo hash devuelve el recibo existente; contenido
  distinto responde `409`.
- Estado de recepción: `GET /api/v1/productos/sincronizaciones/{idLote}`.

## Aún no debe codificarse sin respuesta del cliente

| #   | Regla                               | Pregunta funcional pendiente                                                                                  |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Identidad del producto              | ¿`codigoArticulo` es el SKU, un identificador ERP o ambos?                                                    |
| 2   | Nombre obligatorio                  | AX no envía nombre y `products.name` es obligatorio. ¿Qué estado/nombre inicial se usa?                       |
| 3   | Procedencia y prioridad por campo   | Cuando AX y una edición humana tienen valores distintos, ¿cuál prevalece para cada campo?                     |
| 4   | Ausente / `null` / vacío            | ¿Ausente significa no modificar? ¿`null` o `""` borran el valor o son inválidos?                              |
| 5   | Mensajes antiguos                   | ¿Se ignora un registro cuya `fechaModificacion` sea anterior a la última aplicada? ¿Qué ocurre si no la trae? |
| 6   | Campos de plantilla                 | ¿Cómo se asignan línea, aplicación, marca y futuros `atributosErp` a categorías/plantillas?                   |
| 7   | Resultado por producto              | Catálogo de estados y errores: creado, actualizado, sin cambios, antiguo, rechazado, conflicto.               |
| 8   | Tamaño y frecuencia                 | Máximo de productos/bytes por lote, frecuencia normal y ventana de reintentos.                                |
| 9   | Seguridad y conectividad productiva | Identidad M2M definitiva, VPN/ALB interno, origen de red permitido y rotación de credenciales.                |

Hasta cerrar estas reglas, el procesador de catálogo debe permanecer desacoplado del buzón.
Esto evita que una recepción válida sobrescriba datos enriquecidos con una política inventada.
