import type { IncomingMessage } from 'node:http';

import { API_PREFIX } from '@cdr/contracts';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Installs the production request-body ceilings.
 *
 * Kept outside `main.ts` so bootstrap tests exercise the same parsers instead of Nest's
 * permissive test default. Import previews alone receive the larger limit.
 */
export function configureBodyParsers(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: '2mb', type: isImportPreviewJson });
  app.useBodyParser('json', {
    limit: '100kb',
    type: (request) => isJson(request) && !isImportPreview(request),
  });
  app.useBodyParser('urlencoded', { extended: true, limit: '100kb' });
}

function isImportPreviewJson(request: IncomingMessage): boolean {
  return isJson(request) && isImportPreview(request);
}

function isImportPreview(request: IncomingMessage): boolean {
  return request.url?.split('?', 1)[0] === `${API_PREFIX}/imports/preview`;
}

function isJson(request: IncomingMessage): boolean {
  return (request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json');
}
