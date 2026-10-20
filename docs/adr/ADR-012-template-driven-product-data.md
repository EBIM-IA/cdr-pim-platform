# ADR-012 — Datos de producto gobernados por plantillas versionadas

**Status:** Accepted
**Date:** 2026-10-05

## Context

La revisión de prototipo del 2 de octubre de 2026 confirmó que el catálogo debe presentar
una vista general y vistas por categoría, buscar por atributos y permitir edición e
importación masiva por categoría. Las categorías no comparten el mismo conjunto de campos,
por lo que una tabla física o una pantalla codificada por categoría duplicaría lógica y
dificultaría incorporar las plantillas finales del cliente.

## Decision

1. Categorías, plantillas, versiones, definiciones de atributos, asignaciones y valores de
   producto se persisten como conceptos separados.
2. La asignación plantilla-atributo gobierna obligatoriedad, orden, replicabilidad,
   vigencia, búsqueda y autoridad de fuente.
3. Un atributo se desactiva; no se elimina físicamente. Sus valores históricos y auditoría
   se conservan.
4. El backend publica el esquema de columnas autorizado y la UI construye las tablas desde
   ese esquema.
5. La vista general es principalmente de consulta. La edición tabular se realiza dentro de
   una categoría y usa concurrencia optimista.
6. Las importaciones descargan y validan una plantilla por categoría, se previsualizan antes
   de confirmar y registran resultado por fila con idempotencia.
7. Los campos sincronizados por ERP declaran esa autoridad de fuente y no admiten una
   edición manual ordinaria.

## Consequences

- Añadir una categoría o una versión de plantilla no requiere desplegar otra pantalla.
- Los filtros deben ser tipados y validados; el cliente nunca proporciona nombres SQL.
- Las escrituras de valores y su auditoría pertenecen a una misma transacción.
- La búsqueda general puede necesitar una proyección o índice materializado si las métricas
  reales muestran que el modelo normalizado no cumple los tiempos esperados.

## Pending inputs

- Plantillas y diccionario definitivos del cliente.
- Autoridad, conflictos y compatibilidad de versiones para la propagación automática.
- Tipo y vocabulario de `frecuencia` proveniente del ERP.
- Política de atomicidad cuando una importación contiene filas inválidas.
