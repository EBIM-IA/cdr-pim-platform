# CDR PIM — Integración Sismetic / Dynamics AX · QAS (MOCK TEMPORAL)

> **QAS ONLY · TEMPORARY PUBLIC INTEGRATION MOCK.** No es la conectividad final de AX ni un
> entorno productivo. Sirve para que Sismetic certifique el contrato v1.1 (TLS, Bearer, JSON,
> respuestas) con Postman, curl o código .NET/X++.

## Endpoint

|              |                                                                         |
| ------------ | ----------------------------------------------------------------------- |
| Base URL     | `https://ax-api-cdr-pim-qas.esupplier.net`                              |
| Endpoint     | `POST /api/v1/productos/sincronizar`                                    |
| URL completa | `https://ax-api-cdr-pim-qas.esupplier.net/api/v1/productos/sincronizar` |
| TLS          | Certificado público (ACM), TLS 1.2 o superior                           |
| Auth         | `Authorization: Bearer <token>` — token estático temporal de QAS        |

Es la **única** ruta publicada en este host. Cualquier otra ruta o método responde `404`
desde el balanceador, sin llegar a la API.

### Headers

```
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json
X-Correlation-Id: <opcional, máx. 200 caracteres>
```

Si `X-Correlation-Id` falta, la API genera uno. Siempre se devuelve en el header
`X-Correlation-Id` y en el cuerpo (`correlationId`). Cítelo en cualquier consulta de soporte.

### Ejemplo curl (sin token real)

```bash
export AX_TOKEN='...'   # entregado por canal seguro; nunca lo pegue en tickets, chats ni correos

curl -sS -i https://ax-api-cdr-pim-qas.esupplier.net/api/v1/productos/sincronizar \
  -H "Authorization: Bearer ${AX_TOKEN}" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H 'X-Correlation-Id: sismetic-prueba-0001' \
  --data-binary @- <<'JSON'
{
  "idLote": "AX-20260928-000001",
  "fechaEnvio": "2026-09-28T15:30:00Z",
  "sistemaOrigen": "SISMETIC_AX",
  "productos": [
    {
      "codigoArticulo": "000123",
      "codigoProveedor": "PRV-001",
      "codigoUnificador": "UNI-6205",
      "codigoLinea": "RODAMIENTOS",
      "tipoAplicacion": "AUTOMOTRIZ",
      "marca": "SKF",
      "fechaModificacion": "2026-09-28T15:00:00Z"
    }
  ]
}
JSON
```

## Contrato del request

| Campo                           | Tipo   | Regla en este MOCK                                                                                                            |
| ------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `idLote`                        | string | Obligatorio, no vacío, máx. 128 caracteres (límite técnico; P-01 pendiente)                                                   |
| `fechaEnvio`                    | string | Obligatorio, fecha-hora ISO-8601 con `Z` u offset (`-05:00`)                                                                  |
| `sistemaOrigen`                 | string | Opcional                                                                                                                      |
| `productos`                     | array  | Obligatorio, mínimo 1 elemento. Sin máximo contractual aún (P-02)                                                             |
| `productos[].codigoArticulo`    | string | Obligatorio. **Debe ser string JSON**: un número se rechaza. Se conserva literal (ceros a la izquierda, mayúsculas, espacios) |
| `productos[].codigoProveedor`   | string | Obligatorio                                                                                                                   |
| `productos[].codigoUnificador`  | string | Opcional                                                                                                                      |
| `productos[].codigoLinea`       | string | Obligatorio                                                                                                                   |
| `productos[].tipoAplicacion`    | string | **Temporalmente opcional** (P-05). Su ausencia genera un warning en logs, no un rechazo                                       |
| `productos[].marca`             | string | **Temporalmente opcional**. Su ausencia genera un warning en logs                                                             |
| `productos[].fechaModificacion` | string | Opcional, fecha-hora ISO-8601                                                                                                 |

- Campos desconocidos (por ejemplo un futuro `atributosErp`) se **rechazan** con 400. Las
  extensiones del contrato serán explícitas.
- En los campos opcionales, `null` se acepta y se trata igual que ausente. La semántica
  definitiva de ausente / null / vacío (P-08) se decidirá en la fase con base de datos.
- **Límite técnico del body: 100 KB** (límite por defecto del parser JSON de la API). Por
  encima se responde `413`. No es el límite contractual P-02.

## Respuestas

### 202 Accepted

```json
{
  "idLote": "AX-20260928-000001",
  "estado": "RECIBIDO",
  "registrosRecibidos": 1,
  "fechaRecepcion": "2026-09-28T15:30:01.123Z",
  "correlationId": "sismetic-prueba-0001"
}
```

Headers: `X-CDR-QAS-Mock: true`, `Cache-Control: no-store`, `X-Correlation-Id`.

**`RECIBIDO` significa "la API validó el lote y entregó el evento a SQS".** No significa que
los productos se hayan guardado: en esta fase nada se persiste.

### Errores

Todos usan el mismo sobre:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Invalid body",
    "details": {
      "issues": [
        { "path": "productos.0.codigoArticulo", "message": "Expected string, received number" }
      ]
    },
    "correlationId": "…",
    "timestamp": "2026-09-28T15:30:01.000Z",
    "path": "/api/v1/productos/sincronizar"
  }
}
```

| HTTP | `code`                   | Cuándo                                                                       |
| ---- | ------------------------ | ---------------------------------------------------------------------------- |
| 400  | `BAD_REQUEST`            | JSON mal formado                                                             |
| 400  | `VALIDATION_FAILED`      | El JSON no cumple el contrato (`details.issues` indica campo y motivo)       |
| 401  | `UNAUTHORIZED`           | Bearer ausente o incorrecto (un JWT de usuario también se rechaza)           |
| 404  | —                        | Cualquier otra ruta o método (respuesta fija del balanceador)                |
| 413  | `PAYLOAD_TOO_LARGE`      | Body mayor que 100 KB                                                        |
| 429  | `TOO_MANY_REQUESTS`      | Límite operativo temporal superado; respetar `Retry-After`                   |
| 503  | `DEPENDENCY_UNAVAILABLE` | No se pudo entregar el evento a SQS: el lote **no** fue recibido, reintentar |

El catálogo funcional de errores por producto (AX-xxx) llegará con la fase de base de datos.

**Límite operativo temporal de QAS** (`TEMPORARY_QAS_OPERATIONAL_LIMIT`): 30 solicitudes por
minuto por IP de origen. Es una protección contra abuso, no la cifra contractual P-10.

## Limitaciones de esta fase

- **QAS MOCK**: entorno de pruebas, no producción.
- **Sin persistencia de productos**: ningún producto se crea ni se modifica.
- **Sin upsert** todavía.
- **Sin idempotencia** (`IDEMPOTENCY_NOT_IMPLEMENTED_YET`): reenviar el mismo `idLote`
  devuelve `202` otra vez y genera otro evento. No hay deduplicación.
- **Sin GET de estado** (`STATUS_ENDPOINT=PENDING_DB_PHASE`):
  `GET /api/v1/productos/sincronizaciones/{idLote}` no existe aún (P-07).
- **Sin control stale** por `fechaModificacion` (P-03).
- **Sin VPN**: este host público es temporal. **Un servidor AX real sin salida a Internet no
  puede alcanzar esta URL.** La prueba extremo a extremo desde el AX real requerirá la VPN.
- **No es producción**: PRD no tiene ni tendrá este modo; la configuración de PRD lo rechaza.

## Qué ocurre con un lote aceptado

```
Sismetic ──HTTPS──▶ ALB público QAS (solo POST /api/v1/productos/sincronizar)
                     └─▶ API: Bearer · validación v1.1 · correlationId
                          └─▶ SQS: evento AX_BATCH_RECEIVED (solo metadatos, sin productos)
                               └─▶ Worker: registra "AX batch mock processed" y confirma (ACK)
```

El evento lleva `idLote`, `sistemaOrigen`, `registrosRecibidos`, `fechaEnvio`,
`fechaRecepcion` y `requestHash` (SHA-256 del request normalizado, solo trazabilidad técnica,
no garantía de idempotencia). Nunca lleva productos, token ni headers.

## Futuro

El mismo contrato y la misma ruta pasarán detrás de **Site-to-Site VPN + ALB interno**
(ADR-008 a enmendar). El host público temporal se retirará entonces. Las decisiones con base
de datos se listan en [NEXT_DB_PHASE.md](./NEXT_DB_PHASE.md).

## Artefactos

- OpenAPI estático: [openapi-ax-v1.json](./openapi-ax-v1.json) (Swagger sigue deshabilitado en QAS)
- Postman: [CDR_AX_QAS.postman_collection.json](./CDR_AX_QAS.postman_collection.json),
  variables `baseUrl` y `accessToken`. **Nunca** exporte la colección con el token real.

## Operación (equipo CDR PIM)

- Secreto: `cdr-pim-qas/ax-integration-token` (Secrets Manager, us-east-1), inyectado en la
  API por ECS secrets. Lo genera `cdr-pim-infrastructure/scripts/bootstrap-ax-integration-token.sh qas`.
- Recuperarlo **localmente** para entregarlo por canal seguro (no lo pegue en terminales compartidas ni logs):
  `aws secretsmanager get-secret-value --secret-id cdr-pim-qas/ax-integration-token --query SecretString --output text --profile ebim-cdr --region us-east-1`
- Logs: `/ecs/cdr-pim-qas/api` (`AX batch received`) y `/ecs/cdr-pim-qas/worker`
  (`AX batch mock processed`), filtrando por `correlationId`.
- Apagado: `enable_ax_public_qas_mock = false` en `cdr-pim-infrastructure` (plan revisado) retira
  el ALB público, su DNS y su certificado sin tocar el frontend.
