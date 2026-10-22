# Sesión de coordinación del 19 de octubre de 2026

Este documento registra únicamente las decisiones funcionales que pueden sostenerse con la
transcripción entregada por el cliente. La grabación fue transcrita automáticamente con varios
fragmentos incompletos; por eso no se infieren nombres de atributos, valores ni reglas de
excepción que no estén confirmados.

## Identificación del insumo

| Propiedad                          | Valor                                                              |
| ---------------------------------- | ------------------------------------------------------------------ |
| Archivo                            | `Sesión de Coordinación _ CASA DE RULIMAN.docx`                    |
| SHA-256                            | `79e33f90e7f621ee74cd4a5fe76c42526244189217627e189055595323b4d6dd` |
| Fecha indicada en la transcripción | 2026-10-19                                                         |

## Decisiones confirmadas

1. Una categoría final puede tener varias plantillas o subtipos de plantilla.
2. Esos subtipos no crean categorías ni subcategorías artificiales.
3. Cada producto queda asociado a una sola plantilla activa dentro de su categoría.
4. La variante debe poder distinguirse mediante un atributo asociado a la categoría.
5. La configuración debe conservar los atributos y valores ya registrados al cambiar la
   plantilla; la nueva plantilla determina cuáles se muestran y validan.

Los puntos 1–3 ya están representados por `attribute_templates.variant_key` y
`product_template_assignments`. El flujo operativo añade una reasignación manual auditable para
que esa relación no dependa exclusivamente de los datos de demostración.

## Regla confirmada posteriormente

Las respuestas del 22 de octubre cerraron la regla principal: la categoría de tercer nivel de AX
determina la categoría final y su plantilla. Si la categoría no permite resolver una plantilla
activa, el producto queda en revisión. «No aplica» es sólo la representación de un atributo que no
pertenece a la plantilla del SKU. El detalle está en `CLIENT_RESPONSES_2026-10-22.md`.

## Criterios de aceptación del ajuste seguro

- La pantalla de categorías presenta todas las variantes activas, no sólo la primera.
- La ficha del SKU ofrece «Subtipo de plantilla» únicamente cuando su categoría tiene más de una
  variante activa.
- El backend rechaza plantillas inactivas, plantillas de otra categoría, variantes no visibles
  para los roles del actor y actualizaciones concurrentes.
- El cambio conserva valores existentes y genera una entrada de auditoría con la plantilla
  anterior y la nueva.
- Si el producto estaba publicado, conserva `published`; el cambio autorizado queda disponible de
  inmediato y el futuro adaptador del canal debe republicarlo automáticamente.
- La importación de una categoría con varias variantes exige un `templateId` explícito y lo
  conserva dentro del plan de confirmación; nunca intenta deducirlo por el nombre del archivo o
  por un valor no aprobado.
- Los lotes creados antes de este cambio conservan su idempotencia y se confirman contra la
  asignación vigente del producto, sin elegir una variante por heurística.
- No se ejecuta una selección automática basada en valores no confirmados.
