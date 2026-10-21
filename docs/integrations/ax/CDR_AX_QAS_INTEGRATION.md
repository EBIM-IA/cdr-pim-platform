# CDR PIM — Integración Sismetic / Dynamics AX · QAS

## Decisión funcional confirmada

La integración es de una sola vía:

```text
Sismetic / Dynamics AX  ──productos──>  CDR PIM
```

AX envía la información y el PIM la recibe. El PIM no consulta productos desde AX durante
esta operación y no escribe datos de vuelta hacia AX.

La recepción y la aplicación al catálogo son dos pasos separados. En esta fase el lote se
valida y se guarda de manera duradera antes de responder `202`. Los productos todavía no se
mezclan con el catálogo maestro, porque faltan las reglas de precedencia, borrado y campos
obligatorios que el cliente debe confirmar.

## Endpoints de QAS

| Método | URL                                                                             | Uso                                    |
| ------ | ------------------------------------------------------------------------------- | -------------------------------------- |
| POST   | `https://pim-qas.casadelruliman.com/api/v1/productos/sincronizar`               | Recibir y guardar un lote AX           |
| GET    | `https://pim-qas.casadelruliman.com/api/v1/productos/sincronizaciones/{idLote}` | Consultar que el lote quedó almacenado |

Ambos requieren la credencial de sistema:

```http
Authorization: Bearer <token-de-integracion>
Accept: application/json
Content-Type: application/json
X-Correlation-Id: <opcional, maximo 200 caracteres>
```

El token es independiente del login de una persona. Un JWT de usuario no permite invocar
estos endpoints y el token AX no permite entrar a los endpoints humanos.

## Ejemplo de recepción

```bash
export AX_TOKEN='...'

curl -sS -i https://pim-qas.casadelruliman.com/api/v1/productos/sincronizar \
  -H "Authorization: Bearer ${AX_TOKEN}" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H 'X-Correlation-Id: sismetic-prueba-0001' \
  --data-binary @- <<'JSON'
{
  "idLote": "AX-20261021-000001",
  "fechaEnvio": "2026-10-21T15:30:00-05:00",
  "sistemaOrigen": "SISMETIC_AX",
  "productos": [
    {
      "codigoArticulo": "000123",
      "codigoProveedor": "PRV-001",
      "codigoUnificador": "UNI-6205",
      "codigoLinea": "RODAMIENTOS",
      "tipoAplicacion": "AUTOMOTRIZ",
      "marca": "SKF",
      "fechaModificacion": "2026-10-21T15:00:00-05:00"
    }
  ]
}
JSON
```

Respuesta:

```json
{
  "idLote": "AX-20261021-000001",
  "estado": "RECIBIDO",
  "registrosRecibidos": 1,
  "fechaRecepcion": "2026-10-21T20:30:01.123Z",
  "correlationId": "sismetic-prueba-0001"
}
```

`RECIBIDO` confirma que el lote y sus registros quedaron guardados en el buzón del PIM. No
significa que esos valores ya hayan reemplazado información enriquecida en el catálogo.

## Idempotencia

- El primer `idLote` válido se guarda de forma atómica.
- El mismo `idLote` con exactamente el mismo contenido devuelve el recibo original y no
  duplica filas.
- El mismo `idLote` con contenido diferente responde `409 CONFLICT`.

Por tanto, AX puede reintentar de forma segura cuando no reciba respuesta por un problema de
red. No debe reciclar identificadores para lotes distintos.

## Consulta de estado

```bash
curl -sS \
  -H "Authorization: Bearer ${AX_TOKEN}" \
  https://pim-qas.casadelruliman.com/api/v1/productos/sincronizaciones/AX-20261021-000001
```

Además del recibo devuelve `fechaEnvio`, `sistemaOrigen` y `requestHash`, útiles para verificar
que se consulta el mismo contenido.

## Contrato de entrada

| Campo                           | Regla actual                                                    |
| ------------------------------- | --------------------------------------------------------------- |
| `idLote`                        | Obligatorio, no vacío, máximo 128 caracteres                    |
| `fechaEnvio`                    | ISO-8601 con `Z` u offset                                       |
| `sistemaOrigen`                 | Opcional                                                        |
| `productos`                     | Obligatorio, mínimo un registro                                 |
| `productos[].codigoArticulo`    | String obligatorio; conserva ceros a la izquierda               |
| `productos[].codigoProveedor`   | String obligatorio                                              |
| `productos[].codigoUnificador`  | Opcional                                                        |
| `productos[].codigoLinea`       | String obligatorio                                              |
| `productos[].tipoAplicacion`    | Opcional mientras se confirma la excepción de plantillas        |
| `productos[].marca`             | Opcional mientras se confirma la regla final                    |
| `productos[].fechaModificacion` | ISO-8601 opcional; se conserva, todavía no decide sobrescritura |

Campos desconocidos se rechazan. El límite técnico actual del cuerpo es 100 KiB y el límite
operativo temporal es 30 solicitudes por minuto por IP.

### Campos observados que todavía no pertenecen al contrato

Las capturas de Dynamics AX entregadas el 21 de octubre de 2026 muestran además fecha de
creación, código de aduana, descripción, medidas, frecuencia, homólogo, código OEM, observación
técnica y una jerarquía de categorías. Esta evidencia sirve para preparar el mapeo, pero no define
un payload: no confirma nombres JSON, tipos, obligatoriedad, semántica de vacío ni autoridad.

El manifiesto PIM ya reconoce como campos de autoridad ERP `codigo_articulo`,
`codigo_proveedor`, `codigo_unificador`, los tres niveles de categoría, `linea`,
`tipo_aplicacion`, `marca`, `frecuencia_articulo`, `ecommerce`, `bloqueado_venta`,
`bloqueado_compra` y `especificacion_observacion`. Que existan en el manifiesto no autoriza a
agregarlos silenciosamente al contrato v1.1.

Si el cliente aprueba campos adicionales, se publicarán en una versión nueva del contrato. En
particular, medidas deben mapearse por plantilla, y homólogos y OEM deben crear o actualizar sus
relaciones; no deben convertirse en campos escalares del producto.

## Persistencia

- `ax_inbound_batches`: identidad externa, fechas, fuente, hash, correlación y cantidad.
- `ax_inbound_records`: posición, códigos de búsqueda, fecha de modificación y payload JSON
  validado de cada producto.

El payload se conserva para que el mapeo definitivo pueda procesarse después sin pedir a AX
que reenvíe los lotes ya recibidos.

## Seguridad y habilitación

La ruta responde `404` cuando `AX_INTEGRATION_MODE` está deshabilitado. Para QAS requiere:

```text
AX_INTEGRATION_MODE=inbound
AX_INTEGRATION_AUTH_MODE=static_bearer
AX_INTEGRATION_TOKEN=<secreto de al menos 256 bits>
RATE_LIMIT_INTEGRATION=30
```

El token estático es una solución temporal de QAS. PRD rechaza esta configuración hasta que
el cliente confirme el mecanismo M2M definitivo. El valor nunca se registra ni se devuelve.

Estas variables deben llegar a la definición de tarea de la API desde
`cdr-pim-infrastructure`. `AX_INTEGRATION_TOKEN` debe residir en AWS Secrets Manager y entrar como
secreto de ECS; las otras variables son configuración no secreta. Mientras infraestructura no
las inyecte, el `404` es el comportamiento esperado y no se debe abrir la ruta debilitando la
guarda de la aplicación.

## Pendiente del cliente para aplicar al catálogo

1. Correspondencia definitiva de `codigoArticulo` con SKU e identificador ERP.
2. Qué nombre inicial usar cuando AX no envía nombre y `products.name` es obligatorio.
3. Prioridad entre un valor AX y un valor enriquecido manualmente en el PIM.
4. Significado de campo ausente, `null` y cadena vacía.
5. Regla ante mensajes antiguos según `fechaModificacion`.
6. Tamaño y frecuencia máximos del lote.
7. Autenticación M2M y conectividad definitivas para producción.

## Artefactos

- [OpenAPI](./openapi-ax-v1.json)
- [Colección Postman](./CDR_AX_QAS.postman_collection.json)
- [Decisiones pendientes de aplicación al catálogo](./NEXT_DB_PHASE.md)
