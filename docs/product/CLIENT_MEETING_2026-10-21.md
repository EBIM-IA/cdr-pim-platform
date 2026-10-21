# Reunión semanal del 21 de octubre de 2026

Este documento registra las decisiones que afectan al producto y separa lo confirmado de las
alternativas que aún deben evaluarse. La transcripción automática y las capturas de Dynamics AX
son evidencia funcional, pero no sustituyen un contrato de integración aprobado.

## Identificación de los insumos

| Propiedad                        | Valor                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| Transcripción                    | `Reunión Semanal - PYP_000062 Catálogo Maestro con IA _ CASA DEL RULIMÁN 21-10-2023.docx` |
| SHA-256                          | `98d5980ed625ae6a0135eacde16836ce299e8164260038a9239af163a3a73cd7`                        |
| Fecha comunicada de la reunión   | 2026-10-21                                                                                |
| Evidencia complementaria         | Tres capturas de categorías y productos salidos de Dynamics AX                            |
| Documentación operativa recibida | Guía AWS Windows y dos revisiones de la guía de dominio GoDaddy                           |

El año `2023` forma parte del nombre recibido, pero la fecha comunicada y las capturas
corresponden al 21 de octubre de 2026. No se modifica el archivo original.

## Decisiones funcionales confirmadas

### Columnas reordenables

Las vistas tabulares del catálogo deben permitir que el usuario cambie el orden visual de las
columnas. Esta capacidad afecta la presentación, no el orden canónico del contrato, la plantilla
ni los datos persistidos del producto.

Se implementa en Productos, Aplicaciones, Código Unificador, Homólogos y OEM con estas reglas
reversibles:

- arrastre y botones accesibles para mover a izquierda o derecha;
- preferencia local por usuario autenticado y pantalla;
- el mismo orden en la tabla, las filas de edición y la exportación;
- selección, acciones y estado de guardado permanecen fijos;
- una acción explícita restaura el orden original;
- no cambia plantillas, contratos, importaciones ni datos de negocio.

La preferencia no se sincroniza entre navegadores o equipos. Si el cliente requiere esa
sincronización, se deberá acordar si se guarda por usuario, rol o categoría antes de agregar un
contrato de backend.

### RPA como evaluación

RPA se mantiene como una alternativa por evaluar para tareas de sistemas legados que no tengan
una interfaz estable. No es una integración aprobada ni una razón para sustituir el receptor REST
de AX, los importadores auditables o los adaptadores de dominio.

La evaluación debe medir al menos:

- disponibilidad de API, archivo o acceso directo antes de automatizar una pantalla;
- estabilidad de selectores y tolerancia a cambios de resolución o versión;
- identidad técnica, mínimo privilegio y tratamiento de credenciales;
- idempotencia, reintentos, trazabilidad y recuperación manual;
- volumen, frecuencia, ventana operativa y costo de soporte;
- evidencia de auditoría y conciliación con el PIM.

No se deben almacenar contraseñas en scripts, registrar información sensible ni permitir que un
robot escriba directamente en tablas del PIM.

La reunión separa tres evaluaciones y no autoriza su construcción todavía:

1. Un portal tipo Koyo, con autenticación, para consultar un código y extraer homólogos y OEM.
   No se observaron medidas en esa fuente.
2. Un portal que combina contenido web y catálogos PDF. El robot tendría que navegar, descargar
   documentos, reconocer cambios y extraer planos, medidas, aplicaciones, marcas/modelos,
   homólogos y OEM. El cliente debe entregar el glosario porque algunos encabezados no reflejan
   su significado de negocio; por ejemplo, una columna llamada `description` puede representar
   OEM.
3. El ejecutable de ContiTech como estudio y cotización separados, sujeto a viabilidad técnica,
   licencia, seguridad y compatibilidad con el entorno de ejecución.

Una propuesta posterior debe incluir monitor de ejecuciones, evidencia por lote, versión o hash
de cada PDF, política de retención, manejo de credenciales y un estado de intervención manual para
CAPTCHA o cambios de pantalla.

## Evidencia observada en Dynamics AX

Las capturas muestran los siguientes campos y comportamientos. Son nombres de pantalla, no un
payload aprobado:

| Campo observado                   | Tratamiento esperado antes de mapearlo                               |
| --------------------------------- | -------------------------------------------------------------------- |
| Código de artículo CDR            | String; debe conservar ceros a la izquierda                          |
| Código de proveedor               | String; puede contener espacios, guiones y sufijos                   |
| Código unificador                 | Relaciona productos; no reemplaza la identidad del SKU               |
| Marca de artículo                 | Candidato a `products.brand`, sujeto a catálogo y precedencia        |
| Fecha de creación y modificación  | Metadata de AX; no debe reemplazar las fechas internas del PIM       |
| Código de aduana                  | Identificador de origen pendiente de tipificación                    |
| Descripción                       | Pendiente separar nombre comercial, descripción y texto compuesto AX |
| Medidas                           | Dependen de la plantilla y no forman un atributo global único        |
| Frecuencia                        | Ya existe como definición ERP en el manifiesto del cliente           |
| Homólogo y código OEM             | Deben alimentar relaciones, no campos escalares del producto         |
| Observación o información técnica | Ya existe como definición ERP; falta aprobar la precedencia          |

El árbol observado contiene dos raíces de contexto, `ADQUISICIONES` y `MERCADERÍAS`, sobre
familias que ya aparecen en el manifiesto PIM. El cliente debe confirmar si esas raíces se
descartan, se guardan sólo como ruta de origen o forman parte de la taxonomía visible. No se crean
categorías nuevas por inferencia.

## Impacto en la integración AX

El contrato hospedado v1.1 sigue vigente sin cambios. Su validación estricta es deliberada: evita
aceptar campos cuyo significado o autoridad no estén acordados. Las capturas amplían el inventario
de candidatos, pero no definen JSON, obligatoriedad, límites, valores nulos ni reglas de borrado.

Una futura ampliación debe publicarse como versión nueva y cubrir:

1. nombres y tipos exactos de los campos enviados por AX;
2. correspondencia con SKU, identificadores, atributos de plantilla y relaciones;
3. significado de campo ausente, `null`, vacío y valor `Ninguno`;
4. precedencia frente a cambios manuales o importaciones;
5. descarte de mensajes antiguos mediante la fecha de modificación;
6. resultado por registro y compatibilidad con lotes v1.1 ya almacenados.

## Documentación operativa

- La guía de GoDaddy fechada el 16 de octubre de 2026 reemplaza a la versión del 14 de octubre.
  La versión anterior debe archivarse para evitar dos procedimientos vigentes.
- La guía AWS del 12 de octubre conserva el procedimiento inicial, pero su sección de nuevas
  versiones quedó desactualizada: cada merge a `main` publica las tres imágenes y promueve
  automáticamente ese mismo SHA a QAS, migraciones incluidas.
- PRD continúa siendo una promoción manual protegida por revisión.
- La activación del receptor AX requiere configuración y secreto en el repositorio de
  infraestructura; ningún token real pertenece en este repositorio ni en estas notas.

## Trabajo que permanece pendiente de confirmación

1. Si el orden de columnas debe sincronizarse entre navegadores o equipos.
2. Portales, accesos de prueba, glosario y volúmenes para cotizar por separado los dos RPA web.
3. Instalador, licencia y entorno autorizado para estudiar ContiTech sin comprometer QAS.
4. Dirección, payload, autenticación y finalidad del web service mencionado para el proveedor
   RPA; no se debe asumir que es el mismo contrato de AX.
5. Contrato formal con el conjunto completo de campos AX.
6. Mapeo de código de aduana, descripción, medidas y fechas de origen.
7. Tratamiento de las raíces `ADQUISICIONES` y `MERCADERÍAS`.
8. Identidad M2M, red permitida, rotación de credenciales y VPN para producción.
