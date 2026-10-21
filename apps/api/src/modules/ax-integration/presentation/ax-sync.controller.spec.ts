import { HTTP_CODE_METADATA, PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type {
  GetAxBatchStatusUseCase,
  ReceiveAxBatchUseCase,
} from '../application/receive-ax-batch.use-case';
import { AxSyncController } from './ax-sync.controller';

const batch = {
  idLote: 'AX-1',
  fechaEnvio: '2026-09-28T15:30:00Z',
  productos: [{ codigoArticulo: '0001', codigoProveedor: 'P', codigoLinea: 'L' }],
};

describe('AxSyncController', () => {
  it('exposes exactly POST /productos/sincronizar with 202', () => {
    const handler = AxSyncController.prototype.sincronizar;
    expect(Reflect.getMetadata(PATH_METADATA, AxSyncController)).toBe('productos');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('sincronizar');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(202);
  });

  it('returns the use case result after checking it against the contract', async () => {
    const accepted = {
      idLote: 'AX-1',
      estado: 'RECIBIDO',
      registrosRecibidos: 1,
      fechaRecepcion: '2026-09-28T15:30:01.000Z',
      correlationId: 'c-1',
    };
    const execute = vi.fn().mockResolvedValue(accepted);
    const controller = controllerWith({ execute } as unknown as ReceiveAxBatchUseCase);

    await expect(controller.sincronizar(batch)).resolves.toEqual(accepted);
    expect(execute).toHaveBeenCalledWith(batch);
  });

  it('refuses to answer with a non-contractual body', async () => {
    const execute = vi.fn().mockResolvedValue({ idLote: 'AX-1', estado: 'PROCESADO' });
    const controller = controllerWith({ execute } as unknown as ReceiveAxBatchUseCase);
    await expect(controller.sincronizar(batch)).rejects.toThrow();
  });
});

function controllerWith(receive: ReceiveAxBatchUseCase): AxSyncController {
  return new AxSyncController(receive, {
    execute: () => Promise.reject(new Error('not used')),
  } as unknown as GetAxBatchStatusUseCase);
}
