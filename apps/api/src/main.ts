import 'reflect-metadata';

import { API_PREFIX } from '@cdr/contracts';
import { type ApiEnv, parseCorsOrigins } from '@cdr/config';
import { type Logger, sanitizeLogText } from '@cdr/shared';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';

import { AppModule } from './app.module';
import { API_ENV, LOGGER } from './shared/tokens';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Nest's own console logger is replaced by our structured logger; keep only the
    // messages that matter before ours is available.
    logger: ['error', 'warn'],
    bufferLogs: true,
  });

  const env = app.get<ApiEnv>(API_ENV);
  const logger = app.get<Logger>(LOGGER);

  app.disable('x-powered-by');
  if (env.TRUST_PROXY_HOPS > 0) {
    // Required for reliable client-IP throttling behind the single trusted ALB hop.
    app.set('trust proxy', env.TRUST_PROXY_HOPS);
  }

  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    if (env.APP_ENV === 'qas' || env.APP_ENV === 'prd') {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    next();
  });

  app.setGlobalPrefix(API_PREFIX);

  app.enableCors({
    origin: parseCorsOrigins(env.CORS_ORIGINS),
    credentials: true,
    // Correlation id must survive the browser round trip in both directions.
    exposedHeaders: ['x-correlation-id'],
  });

  // Lets ECS drain a task: in-flight requests finish and the DB pool closes cleanly.
  app.enableShutdownHooks();

  if (env.SWAGGER_ENABLED) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Casa del Rulimán — PIM API')
        .setDescription('Catálogo Maestro de Productos. Schemas are generated from @cdr/contracts.')
        .setVersion(env.APP_VERSION)
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, document);
  }

  const listenHost = env.APP_ENV === 'qas' || env.APP_ENV === 'prd' ? '0.0.0.0' : '127.0.0.1';
  await app.listen(env.PORT, listenHost);

  logger.info('API started', {
    port: env.PORT,
    host: listenHost,
    environment: env.APP_ENV,
    version: env.APP_VERSION,
    aiProvider: env.AI_PROVIDER,
    queueDriver: env.QUEUE_DRIVER,
    storageDriver: env.STORAGE_DRIVER,
    swagger: env.SWAGGER_ENABLED ? `${API_PREFIX}/docs` : 'disabled',
  });
}

bootstrap().catch((error: unknown) => {
  // The logger may not exist yet (a bad DATABASE_URL fails before DI completes), so this
  // one place writes to stderr directly. Configuration errors name variables, never values.
  const summary =
    error instanceof Error
      ? `${error.name}: ${sanitizeLogText(error.message)}`
      : 'Unknown bootstrap error';
  console.error('Fatal error during API bootstrap:', summary);
  process.exit(1);
});
