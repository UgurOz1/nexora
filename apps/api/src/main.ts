import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { completePathParameters, configureApp, openApiConfig } from './app.setup';
import type { Env } from './config/env';

async function bootstrap() {
  // bufferLogs: startup logs are held until the pino logger is ready, so every line has one format.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  configureApp(app);
  app.enableShutdownHooks();

  SwaggerModule.setup('api/docs', app, () =>
    completePathParameters(SwaggerModule.createDocument(app, openApiConfig())),
  );

  await app.listen(config.get('API_PORT', { infer: true }));
}
void bootstrap();
