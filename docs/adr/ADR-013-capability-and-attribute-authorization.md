# ADR-013 — Autorización por capacidades y visibilidad de atributos

**Status:** Accepted
**Date:** 2026-10-05

## Context

La revisión de prototipo del 2 de octubre de 2026 definió tres perfiles de negocio:
Administrador, Compras y Ventas. Compras y Ventas no forman una jerarquía: cada perfil
necesita menús, secciones y atributos diferentes. Ocultar columnas solamente en el navegador
expondría información sensible a través del API, búsquedas, exportaciones o auditoría.

## Decision

1. Los perfiles efectivos son `ADMINISTRADOR`, `COMPRAS` y `VENTAS`.
2. La autorización se evalúa mediante capacidades, no mediante un rango jerárquico.
3. El acceso a menús y operaciones se configura como capacidades del perfil.
4. La asignación de un atributo a una plantilla define por perfil si puede verlo, editarlo,
   importarlo o exportarlo.
5. El backend aplica la política antes de consultar, filtrar, mutar o serializar valores.
   La UI representa el resultado autorizado, pero no constituye el límite de seguridad.
6. PDF, importaciones, exportaciones y auditoría aplican la misma política de atributos.
7. Administrador conserva todas las capacidades operativas.

## Consequences

- Los guards basados en un único `requiredRole` deben evolucionar hacia capacidades.
- Los contratos de esquema dinámico solo incluyen columnas visibles para el actor.
- No se puede buscar por un atributo que el actor no puede conocer.
- La auditoría puede contener valores sensibles y requiere una capacidad explícita de
  consulta y exportación.

## Pending inputs

- Matriz final de menús, secciones, atributos y operaciones para Compras y Ventas.
- Proveedor empresarial de identidad y mapeo de sus grupos hacia los tres perfiles.
- Política de retención y exportación de auditoría.
