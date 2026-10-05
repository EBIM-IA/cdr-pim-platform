import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  API_PREFIX,
  AX_SYNC_PATH,
  apiErrorSchema,
  axSyncAcceptedResponseSchema,
  axSyncRequestSchema,
} from '@cdr/contracts';
import { describe, expect, it } from 'vitest';

import { openApiSchema } from '../../src/shared/http/openapi';

/**
 * docs/integrations/ax/openapi-ax-v1.json is the static OpenAPI handed to Sismetic (Swagger
 * stays disabled in QAS). It is GENERATED from the same Zod schemas the API validates with;
 * this test fails when the committed file drifts from them.
 *
 *   UPDATE_AX_OPENAPI=1 pnpm --filter @cdr/api test -- ax-openapi-artifact
 *   pnpm exec prettier --write docs/integrations/ax/openapi-ax-v1.json
 */
const ARTIFACT = path.resolve(process.cwd(), '../../docs/integrations/ax/openapi-ax-v1.json');

const minimal = {
  idLote: 'AX-20260928-000001',
  fechaEnvio: '2026-09-28T15:30:00Z',
  sistemaOrigen: 'SISMETIC_AX',
  productos: [
    {
      codigoArticulo: '000123',
      codigoProveedor: 'PRV-001',
      codigoLinea: 'RODAMIENTOS',
      tipoAplicacion: 'AUTOMOTRIZ',
      marca: 'SKF',
    },
  ],
};

const error = (code: string, message: string, details?: Record<string, unknown>) => ({
  error: {
    code,
    message,
    ...(details ? { details } : {}),
    correlationId: '6f1c2a54-3b1e-4c47-9d0e-2a7f5b8c9d10',
    timestamp: '2026-09-28T15:30:01.000Z',
    path: `${API_PREFIX}${AX_SYNC_PATH}`,
  },
});

const errorResponse = (description: string, examples: Record<string, unknown>) => ({
  description,
  headers: { 'X-Correlation-Id': { $ref: '#/components/headers/CorrelationId' } },
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ApiError' },
      examples: Object.fromEntries(Object.entries(examples).map(([k, value]) => [k, { value }])),
    },
  },
});

export function buildAxOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'CDR PIM — Integración Sismetic / Dynamics AX (QAS MOCK TEMPORAL)',
      version: '1.1.0-qas-mock',
      description: [
        'Contrato AX → PIM v1.1, endpoint público TEMPORAL de QAS para certificar el contrato.',
        '',
        'MOCK QAS: el lote se valida y se entrega a SQS; un worker lo registra y confirma.',
        'NO hay persistencia en base de datos, NO hay upsert de productos, NO hay GET de estado',
        'y NO hay garantía de idempotencia: reenviar el mismo idLote devuelve 202 otra vez.',
        'estado=RECIBIDO significa "la API validó el lote y entregó el evento a SQS", no que',
        'los productos se hayan guardado.',
        '',
        'Límite técnico del body: 100 KB (límite por defecto del parser JSON de la API). No es',
        'el límite contractual P-02, aún pendiente.',
        '',
        'La conectividad final de AX será Site-to-Site VPN + ALB interno. Este host público no es',
        'la ruta de producción. Un servidor AX sin salida a Internet no puede alcanzarlo.',
      ].join('\n'),
    },
    servers: [
      { url: 'https://ax-api-cdr-pim-qas.esupplier.net', description: 'QAS — temporal, público' },
    ],
    security: [{ bearerAuth: [] }],
    paths: {
      [`${API_PREFIX}${AX_SYNC_PATH}`]: {
        post: {
          operationId: 'sincronizarProductos',
          summary: 'Recibir un lote de productos AX (MOCK QAS: validado y encolado, no persistido)',
          parameters: [
            {
              name: 'X-Correlation-Id',
              in: 'header',
              required: false,
              description:
                'Opcional (máx. 200 caracteres). Si falta, la API genera uno. Se devuelve en la respuesta.',
              schema: { type: 'string', maxLength: 200 },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AxSyncRequest' },
                examples: {
                  loteMinimo: { summary: 'Lote mínimo (1 producto)', value: minimal },
                  dosProductos: {
                    summary: 'Lote de 2 productos con fechaModificacion',
                    value: {
                      ...minimal,
                      idLote: 'AX-20260928-000002',
                      productos: [
                        {
                          ...minimal.productos[0],
                          codigoUnificador: 'UNI-6205',
                          fechaModificacion: '2026-09-28T15:00:00Z',
                        },
                        {
                          codigoArticulo: '000456',
                          codigoProveedor: 'PRV-002',
                          codigoLinea: 'SELLOS',
                          tipoAplicacion: 'INDUSTRIAL',
                          marca: 'NTN',
                          fechaModificacion: '2026-09-28T10:00:00-05:00',
                        },
                      ],
                    },
                  },
                  ceroIzquierda: {
                    summary: 'codigoArticulo con ceros a la izquierda (se conserva literal)',
                    value: {
                      ...minimal,
                      idLote: 'AX-20260928-000003',
                      productos: [{ ...minimal.productos[0], codigoArticulo: '0000789' }],
                    },
                  },
                  sinTipoAplicacionNiMarca: {
                    summary:
                      'tipoAplicacion y marca ausentes (aceptado temporalmente con warning, P-05)',
                    value: {
                      ...minimal,
                      idLote: 'AX-20260928-000004',
                      productos: [
                        {
                          codigoArticulo: '000123',
                          codigoProveedor: 'PRV-001',
                          codigoLinea: 'RODAMIENTOS',
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '202': {
              description:
                'Lote validado y entregado a SQS. NO significa que los productos se hayan persistido.',
              headers: {
                'X-Correlation-Id': { $ref: '#/components/headers/CorrelationId' },
                'X-CDR-QAS-Mock': {
                  description: 'Siempre "true" en este endpoint temporal.',
                  schema: { type: 'string', enum: ['true'] },
                },
                'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } },
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AxSyncAcceptedResponse' },
                  example: {
                    idLote: 'AX-20260928-000001',
                    estado: 'RECIBIDO',
                    registrosRecibidos: 1,
                    fechaRecepcion: '2026-09-28T15:30:01.123Z',
                    correlationId: '6f1c2a54-3b1e-4c47-9d0e-2a7f5b8c9d10',
                  },
                },
              },
            },
            '400': errorResponse(
              'JSON mal formado (BAD_REQUEST) o cuerpo que no cumple el contrato (VALIDATION_FAILED).',
              {
                esquemaInvalido: error('VALIDATION_FAILED', 'Invalid body', {
                  issues: [
                    {
                      path: 'productos.0.codigoArticulo',
                      message: 'Expected string, received number',
                    },
                  ],
                }),
                jsonMalFormado: error(
                  'BAD_REQUEST',
                  "Expected ',' or '}' after property value in JSON at position 20",
                ),
              },
            ),
            '401': errorResponse(
              'Bearer ausente o incorrecto. Un JWT de usuario humano también es rechazado.',
              {
                sinToken: error('UNAUTHORIZED', 'Missing bearer token'),
                tokenIncorrecto: error('UNAUTHORIZED', 'Invalid integration token'),
              },
            ),
            '413': errorResponse('El body supera el límite técnico actual (100 KB).', {
              demasiadoGrande: error('PAYLOAD_TOO_LARGE', 'Request body exceeds the size limit', {
                limitBytes: 102400,
              }),
            }),
            '429': errorResponse(
              'Límite operativo temporal de QAS superado (30 solicitudes/min por IP). Respetar Retry-After.',
              {
                limite: error('TOO_MANY_REQUESTS', 'ThrottlerException: Too Many Requests'),
              },
            ),
            '503': errorResponse(
              'No se pudo entregar el evento a SQS. El lote NO fue recibido: reintentar.',
              {
                colaNoDisponible: error(
                  'DEPENDENCY_UNAVAILABLE',
                  'Dependency unavailable: sqs:sendMessage',
                  { dependency: 'sqs:sendMessage' },
                ),
              },
            ),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Token estático TEMPORAL de QAS entregado por canal seguro. No es un login de usuario.',
        },
      },
      headers: {
        CorrelationId: {
          description: 'Identificador de correlación de la solicitud.',
          schema: { type: 'string' },
        },
      },
      schemas: {
        AxSyncRequest: openApiSchema(axSyncRequestSchema),
        AxSyncAcceptedResponse: openApiSchema(axSyncAcceptedResponseSchema),
        ApiError: openApiSchema(apiErrorSchema),
      },
    },
  };
}

describe('AX OpenAPI artifact', () => {
  it('matches the schemas the API validates with', async () => {
    const generated = buildAxOpenApiDocument();
    if (process.env.UPDATE_AX_OPENAPI === '1') {
      await writeFile(ARTIFACT, `${JSON.stringify(generated, null, 2)}\n`);
    }
    const committed = JSON.parse(await readFile(ARTIFACT, 'utf8')) as unknown;
    expect(committed).toEqual(generated);
  });
});
