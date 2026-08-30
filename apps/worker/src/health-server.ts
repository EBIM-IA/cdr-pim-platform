import { createServer, type Server } from 'node:http';

import type { Logger } from '@cdr/shared';

export interface WorkerHealthState {
  readonly isRunning: () => boolean;
  readonly metrics: () => Record<string, number>;
  readonly service: string;
  readonly version: string;
}

/**
 * Minimal HTTP health endpoint for the worker.
 *
 * A worker has no inbound traffic, so it carries no web framework — but ECS still needs a
 * container health check, and operators still need a way to see the queue metrics. A bare
 * `node:http` server is the whole dependency budget this deserves.
 *
 * `/health/ready` reports the *polling loop*, not the queue: a worker that cannot reach SQS
 * should keep retrying, not be killed and restarted by the scheduler.
 */
export function startHealthServer(port: number, state: WorkerHealthState, logger: Logger): Server {
  const startedAt = Date.now();

  const server = createServer((request, response) => {
    const url = request.url ?? '/';
    response.setHeader('content-type', 'application/json');

    if (url.startsWith('/health/live')) {
      response.writeHead(200).end(
        JSON.stringify({
          status: 'ok',
          service: state.service,
          version: state.version,
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        }),
      );
      return;
    }

    if (url.startsWith('/health/ready')) {
      const running = state.isRunning();
      response.writeHead(running ? 200 : 503).end(
        JSON.stringify({
          status: running ? 'up' : 'down',
          checks: [{ name: 'consumer-loop', status: running ? 'up' : 'down' }],
          metrics: state.metrics(),
        }),
      );
      return;
    }

    response
      .writeHead(404)
      .end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info('Worker health server listening', { port });
  });

  return server;
}
