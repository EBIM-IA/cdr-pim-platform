# Plantillas de cliente PIM(2)

Este documento registra el insumo usado para generar el manifiesto determinista del catálogo
local y de pruebas. El archivo Excel no forma parte del runtime ni se almacena en este
repositorio. El runtime consume
[`client-template-manifest.json`](../../apps/api/src/database/client-template-manifest.json).

## Identificación del insumo

| Propiedad                            | Valor                                                              |
| ------------------------------------ | ------------------------------------------------------------------ |
| Archivo                              | `PLANTILLAS PIM(2).xlsx`                                           |
| SHA-256                              | `5c6e9503c6c294530af16e80fe183d434876eb59b597899a4fcb9c8caad47af7` |
| Fecha interna de creación            | `2026-09-03T19:24:00Z`                                             |
| Fecha interna de modificación        | `2026-10-19T16:03:02Z`                                             |
| Hojas totales                        | 60                                                                 |
| Hojas de plantilla                   | 52                                                                 |
| Ejemplos de producto                 | 97                                                                 |
| Definiciones de atributo resultantes | 294                                                                |

El hash es la identidad efectiva de esta versión. Las fechas provienen de las propiedades
internas del documento y no sustituyen la validación del hash.

## Taxonomía y variantes

`CATEGORIAS-BUSQUEDA` define una jerarquía de tres niveles. El generador materializa todos los
nodos y deduplica cada ruta completa:

| Nivel               |   Nodos |
| ------------------- | ------: |
| Categoría principal |      15 |
| Segundo nivel       |      78 |
| Tercer nivel u hoja |     258 |
| **Total**           | **351** |

De las 258 hojas, 44 tienen plantilla definida. Esas hojas contienen 52 variantes porque las
categorías 22, 23 y 42 se subdividen en `22.x`, `23.x` y `42.x`. Las subdivisiones no crean
categorías sintéticas.

- `categoryNumber` conserva el número base de la categoría, por ejemplo `22`.
- `variantKey` conserva el número completo de la plantilla, por ejemplo `22.1`.
- Las plantillas sin subdivisión usan el mismo valor en ambos campos.
- `categoryPath`, `parentSlug` y `level` preservan la jerarquía.
- `templateVariants` existe únicamente en hojas de tercer nivel.
- El slug de plantilla es único por variante: `<slug-hoja>--<variant-key>`.
- En el seed local se activan las 44 hojas definidas y sus ancestros: 78 nodos activos.
  Las ramas sin una plantilla descendiente permanecen inactivas.

## Reglas de generación

El generador aplica estas reglas sin corregir silenciosamente la fuente:

1. Detecta el encabezado de cada plantilla por `Código de Articulo - CDR` y conserva las filas
   de ejemplo con SKU y código unificador.
2. Interpreta la metadata de campo, obligatoriedad, autoridad de fuente, replicabilidad,
   inclusión en ficha técnica y permisos por rol.
3. Conserva las tres columnas base de categoría, tipo de aplicación, marca y los demás campos
   base nuevos de PIM(2).
4. Normaliza `SI` y `S` a `true`; `NO` y `N` a `false`.
5. Convierte números y medidas solo cuando la declaración y los valores lo permiten. No inventa
   una unidad ausente o ambigua.
6. Ignora columnas sin encabezado, guiones usados como vacío y marcadores rotos de Excel como
   `#VALUE!`, `#REF!` y `#DIV/0!`.
7. Ignora prioridades de fuente fuera de 1–4 o repetidas y registra el problema como diagnóstico.
8. Reconoce los activos `FT`, `MSDS`, `CERT`, `FOTO` y `PLANO` por carácter o etiqueta.
9. Conserva los campos adicionales de aplicaciones: tipo de carrocería, combustible, tracción,
   cilindraje, años, área, subárea, estado, SKU asociados y fuente.
10. Conserva el estado, los SKU asociados y la fuente en OEM y homólogos. También preserva la
    tabla de código unificador como una relación auxiliar.

La implementación está en
[`generate-client-template-manifest.py`](../../scripts/generate-client-template-manifest.py) y
el contrato runtime en
[`client-template-manifest.ts`](../../apps/api/src/database/client-template-manifest.ts).

## Hojas auxiliares

| Hoja                            | Tratamiento                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `CATEGORIAS-BUSQUEDA`           | Fuente de la jerarquía, aplicación, prioridades, número de plantilla y observaciones. |
| `APLICACIONES`                  | Se importa en `relations.applications`; contiene una relación de ejemplo.             |
| `HOMOLOGOS`                     | Se importa en `relations.homologs`; contiene tres relaciones.                         |
| `OEM`                           | Se importa en `relations.oem`; contiene tres relaciones.                              |
| `CODIGO UNIFICADOR`             | No es una plantilla. Sus nueve filas se conservan en `relations.unifiedCodes`.        |
| `REPORTE ATRIBUTOS`             | Reporte excluido del manifiesto runtime.                                              |
| `REPORTE-GENERAL(RESULTADOS)`   | Reporte excluido del manifiesto runtime.                                              |
| `REPORTE-RESULTADOS DE PERIODO` | Reporte excluido del manifiesto runtime.                                              |

Además de los tres reportes, se excluyen del runtime el archivo Excel, sus formatos, vínculos y
columnas sin encabezado. Los marcadores rotos se registran como advertencias, pero no se
materializan como valores. `CODIGO UNIFICADOR` se excluye del conjunto de plantillas, no del
conjunto de relaciones auxiliares.

## Diagnósticos de origen

El manifiesto contiene 69 diagnósticos: 69 advertencias y 0 errores. Una advertencia conserva la
evidencia y permite generar; no equivale a una aprobación funcional del dato.

| Severidad | Registros | Resultado                                                         |
| --------- | --------: | ----------------------------------------------------------------- |
| `warning` |        69 | La generación continúa y conserva ubicación y detalle disponible. |
| `error`   |         0 | No hubo una condición que impidiera generar este manifiesto.      |

| Código                              | Advertencias | Evidencia agregada                                                      |
| ----------------------------------- | -----------: | ----------------------------------------------------------------------- |
| `BROKEN_MARKER_IGNORED`             |           16 | 16 marcadores rotos ignorados en las hojas que alimentan el manifiesto. |
| `DUPLICATE_CATEGORY_PATH`           |            2 | Dos rutas completas repetidas y consolidadas.                           |
| `FIELD_METADATA_INCOMPLETE`         |           17 | 30 campos afectados en 17 plantillas.                                   |
| `INVALID_SOURCE_PRIORITY`           |            1 | `TECDOC=22` en la fila 2; se excluyó por estar fuera de 1–4.            |
| `SOURCE_OBSERVATION`                |            4 | Observaciones sobre variantes o renombres que requieren revisión.       |
| `TEMPLATE_CATEGORY_NAME_DIFFERENCE` |           19 | Diferencias entre nombre de hoja y hoja taxonómica; no se autocorrigen. |
| `UNLABELED_COLUMNS_IGNORED`         |            9 | 150 columnas con contenido sin encabezado ignoradas.                    |
| `UNMAPPED_TAXONOMY_CATEGORIES`      |            1 | Advertencia agregada para 214 hojas taxonómicas sin plantilla.          |

Los diagnósticos cubren las hojas que participan en la generación. Los reportes excluidos no se
usan para derivar atributos, productos ni relaciones runtime.

## Confirmaciones pendientes del cliente

1. **Metadatos incompletos.** Hay 30 campos en 17 plantillas sin tipo o sin condición de
   obligatoriedad. El generador conserva la evidencia disponible y los trata como texto u
   opcionales cuando no puede demostrar otra cosa. El cliente debe confirmar tipo,
   obligatoriedad y autoridad de fuente.
2. **Unidad en `10. CRUCETA`.** `Longitud Total [m]` tiene el valor de ejemplo `81.75`, igual que
   `Longitud Lock-Up [mm]`. La celda de obligatoriedad también está vacía. El manifiesto conserva
   `longitud_total_m` como número sin unidad y no convierte el valor. El cliente debe confirmar si
   `[m]` es correcto o si debe ser `[mm]`, y si el campo es obligatorio.
3. **Rutas duplicadas.** Se consolidan `COMPONENTES Y ACCESORIOS / ACCESORIOS / VINCHA DE
RETENCION` de las filas 10 y 11, y `HERRAMIENTAS / HERRAMIENTA MANUAL / PISTOLA NEUMATICA` de
   las filas 95 y 98. El cliente debe confirmar si son duplicados reales o categorías distintas
   que necesitan otra clave o nombre.
4. **Estados OEM y homólogos.** Ambas hojas usan `REVISIÓN`, `ACTIVO` e `INACTIVO`. El manifiesto
   preserva el texto, pero el seed local actualmente crea las seis relaciones como activas y
   aprobadas.
   Antes de usar esta regla fuera de datos locales o de prueba, el cliente debe confirmar el mapeo
   a `active` y `approvalStatus`, en especial para `REVISIÓN` e `INACTIVO`.

## Regeneración y validación

Instalar Python 3 con `openpyxl`. Desde la raíz del repositorio:

```bash
python3 scripts/generate-client-template-manifest.py \
  '../PLANTILLAS PIM(2).xlsx'
```

El comando actualiza
`apps/api/src/database/client-template-manifest.json`. Después, ejecutar:

```bash
python3 -m unittest scripts/test_generate_client_template_manifest.py
pnpm --filter @cdr/api typecheck
pnpm --filter @cdr/api exec vitest run --config vitest.config.ts \
  src/database/demo-seed.spec.ts
```

Verificaciones manuales obligatorias:

1. Comparar el SHA-256 del archivo con `source.sha256` del manifiesto.
2. Confirmar 60 hojas, 52 plantillas, 97 ejemplos, 351 nodos de categoría y 69 diagnósticos.
3. Revisar el diff del JSON, especialmente `categories`, `templates`, `definitions`, `relations`
   y `diagnostics`.
4. No ejecutar el seed hasta resolver cualquier error de integridad. Las advertencias requieren
   evaluación según las decisiones pendientes anteriores.

El manifiesto contiene datos del cliente. No debe publicarse ni copiarse a artefactos públicos sin
autorización explícita.
