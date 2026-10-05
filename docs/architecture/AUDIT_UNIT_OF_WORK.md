# Unidad de trabajo para auditoría

## Invariante

Toda mutación de datos de negocio debe confirmar en **una misma transacción PostgreSQL**:

1. la modificación del agregado (por ejemplo, valores de atributos);
2. una fila inmutable en `audit_entries`; y
3. una fila en `audit_change_items` por cada campo modificado.

No es válido llamar primero a `repository.save()` y después a `AuditPort.record()` usando
transacciones independientes. Una caída entre ambas llamadas dejaría un cambio sin historia.

## Patrón de implementación

El adaptador de escritura del agregado debe exponer una operación de unidad de trabajo y
recibir todos los datos de auditoría, no construirlos a partir de estado global. La operación
abre `database.transaction`, bloquea o actualiza la fila del agregado y utiliza la **misma**
instancia `transaction` para insertar el evento y sus elementos de cambio.

```ts
await database.transaction(async (transaction) => {
  const before = await attributes.lockCurrentValues(transaction, productId, fieldNames);
  await attributes.saveValues(transaction, productId, values);
  await audit.recordWithin(
    transaction,
    createAuditEntry({
      resourceType: 'product',
      resourceId: productId,
      actorId: actor.id,
      source,
      correlationId,
      occurredAt,
      changes: diff(before, values),
    }),
  );
});
```

`recordWithin` será una operación de infraestructura, deliberadamente fuera del puerto de
dominio público. Esto evita filtrar tipos Drizzle hacia casos de uso y hace imposible que un
caso de uso simule atomicidad con dos conexiones.

El `PostgresAuditAdapter.record()` actual mantiene compatibilidad con casos de uso existentes
y garantiza atomicidad entre `audit_entries` y `audit_change_items`. Las nuevas escrituras de
atributos deben implementar el patrón anterior antes de exponerse por HTTP. Como medida
transitoria, cualquier caso de uso que todavía llame a `record()` por separado debe quedar
identificado para migración; no debe copiarse ese patrón a código nuevo.

## Vigencia del valor anterior

`audit_change_items.previous_value_valid_from` contiene el instante del cambio anterior del
mismo `resource_type + resource_id + field_name`. Para evitar carreras, la escritura del
agregado debe serializar mutaciones concurrentes del mismo producto (bloqueo `FOR UPDATE` o
control de versión optimista) dentro de la unidad de trabajo.

## Datos sensibles

La auditoría nunca almacena contraseñas, tokens, secretos ni archivos completos importados.
Para atributos configurados como sensibles, el historial conserva el hecho del cambio y los
valores solo se entregan a actores con `attributes:sensitive:read`; el filtrado debe realizarse
en el backend, no únicamente ocultando columnas en la interfaz.
