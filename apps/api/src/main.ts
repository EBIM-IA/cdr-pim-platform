import 'reflect-metadata';

import { API_PREFIX } from '@cdr/contracts';
import { type ApiEnv, parseCorsOrigins } from '@cdr/config';
import type { Logger } from '@cdr/shared';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { API_ENV, LOGGER } from './shared/tokens';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Nest's own console logger is replaced by our structured logger; keep only the
    // messages that matter before ours is available.
    logger: ['error', 'warn'],
    bufferLogs: true,
  });

  const env = app.get<ApiEnv>(API_ENV);
  const logger = app.get<Logger>(LOGGER);

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

  await app.listen(env.PORT, '0.0.0.0');

  logger.info('API started', {
    port: env.PORT,
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
  console.error('Fatal error during API bootstrap:', error);
  process.exit(1);
});
