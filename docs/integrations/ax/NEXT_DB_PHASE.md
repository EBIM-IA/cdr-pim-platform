# AX → PIM — decisiones para la fase con base de datos (NEXT_DB_PHASE)

> **Sin implementación.** Este documento lista lo que el MOCK QAS deliberadamente NO decidió.
> Nada de esto está codificado hoy: no hay migraciones, tablas, upsert ni escritura de
> productos. Se revisará con el developer antes de escribir código.

Estado de partida: `POST /api/v1/productos/sincronizar` valida el contrato v1.1, publica
`AX_BATCH_RECEIVED` (solo metadatos) y el worker lo registra y confirma. Contexto completo:
`AX_PIM_BACKEND_CURRENT_STATE.md` (auditoría 2026-10-05).

| #   | Decisión                         | Opciones / preguntas                                                                                                                                                                                                                                       | Dependencia contractual               |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | **codigoArticulo**               | A. `products.sku` · B. identifier `erp_item_id` · C. ambos con invariante. `sku` hoy se normaliza (upper/trim, ≤64) y `erp_item_id` es literal (≤120): pueden divergir para el mismo código. Reconciliar productos manuales o de seed con el mismo código. | P-04 (longitud, mayúsculas, espacios) |
| 2   | **name NOT NULL (Q-13)**         | El payload AX no trae nombre. ¿Relajar el constraint, placeholder explícito, o "producto ERP pendiente de enriquecer" fuera de `products`?                                                                                                                 | Q-13 (nueva)                          |
| 3   | **product_erp_data vs columnas** | Tabla 1:1 `product_erp_data` (codigo_proveedor, codigo_linea, tipo_aplicacion, marca_erp, erp_modified_at, erp_last_batch_id, erp_synced_at, estado ERP) o columnas en `products`.                                                                         | P-04, P-09                            |
| 4   | **integration_batches**          | id, id_lote, sistema_origen, fecha_envio, fecha_recepcion, correlation_id, estado, contadores, request_hash, cliente M2M, intentos. Unicidad (`sistema_origen`, `id_lote`).                                                                                | P-01, P-07                            |
| 5   | **integration_batch_items**      | Posición, codigo_articulo, payload normalizado, fecha_modificacion, resultado (CREATED/UPDATED/UNCHANGED/ACCEPTED_WITH_WARNINGS/REJECTED/STALE), códigos de error. Hace de _claim-check_: SQS llevaría solo el id del lote.                                | P-02, P-07                            |
| 6   | **Idempotencia**                 | Hoy NO existe (`ax-batch-received:<idLote>` no se persiste). ¿Mismo idLote + mismo hash = 202 con el estado previo? ¿Mismo idLote + hash distinto = 409? ¿Unicidad por sistemaOrigen?                                                                      | P-01                                  |
| 7   | **Stale**                        | Comparar `fechaModificacion` entrante con la última aplicada por SKU. Precisión, zona horaria, empates; regla si falta la fecha (¿`fechaEnvio`?). La cola es standard (sin orden).                                                                         | P-03                                  |
| 8   | **Ausente / null / vacío**       | Hoy el mock acepta `null` en opcionales y lo trata como ausente, sin efecto. ¿Ausente = no tocar? ¿null = borrar? ¿"" = borrar o inválido? ¿Puede AX borrar un valor?                                                                                      | P-08                                  |
| 9   | **Procedencia por campo**        | Registrar fuente (AX / edición humana / import) y fecha por campo para no pisar enriquecimiento manual.                                                                                                                                                    | —                                     |
| 10  | **Conflictos**                   | `product_source_conflicts`: campo, valor actual+fuente, valor entrante+fuente, estado, resolutor. ¿Qué gana: AX o la edición del PIM, por campo?                                                                                                           | P-05, P-08                            |
| 11  | **Acceso a DB del worker**       | Extraer `packages/database` (cliente Drizzle + tablas compartidas), `DATABASE_URL` para el worker (secret opt-in en infra `worker_secret_names`), SG worker→RDS ya existe. Hoy el worker NO tiene DB y el mock no la usa.                                  | —                                     |
| 12  | **GET de estado**                | `GET /api/v1/productos/sincronizaciones/{idLote}` leyendo `integration_batches`/`items`. Hoy NO expuesto (`STATUS_ENDPOINT=PENDING_DB_PHASE`); un estado en memoria inventaría resultados que se pierden entre tasks.                                      | P-07                                  |

## También pendiente (no DB)

- **Auth M2M definitiva** (P-06): el Bearer estático es QAS-only y PRD lo rechaza en configuración.
- **Límites** (P-02, P-10): tamaño de lote y bytes; rate limit contractual. Hoy: body 100 KB y
  30 req/min/IP como límite operativo temporal.
- **Catálogo de errores por producto** (AX-xxx) y respuesta parcial.
- **Conectividad** (P-12): Site-to-Site VPN + ALB interno en subredes de ingreso dedicadas;
  enmendar ADR-008 (hoy la VPN solo enruta a las subredes del worker). Retirar el ALB público.
- **atributosErp** (P-11): hoy se rechaza como campo desconocido.
