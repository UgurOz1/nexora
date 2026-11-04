import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { Env } from './config/env';
import { RedisIoAdapter, realtimeOrigins } from './realtime/realtime.adapter';

// Title, auth schemes and the like of the OpenAPI document. Used by the live /api/docs page and
// by the script that writes openapi.json, so both describe the same API.
export function openApiConfig() {
  return new DocumentBuilder()
    .setTitle('NEXORA API')
    .setDescription('Multi-tenant team, project and task management API')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('nexora_refresh')
    .build();
}

// Swagger only documents the path parameters a handler reads with @Param. A route like
// `organizations/:orgId/tasks/:taskId/subtasks` that never reads `orgId` would be published
// without it, and the generated web client could not be told to send it. Every `{name}` in a
// path is a parameter, so add the missing ones.
export function completePathParameters(document: OpenAPIObject): OpenAPIObject {
  const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
  for (const [path, item] of Object.entries(document.paths)) {
    const names = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    for (const method of methods) {
      const operation = item[method];
      if (!operation) continue;
      const declared = new Set(
        (operation.parameters ?? []).map((p) => ('name' in p ? `${p.in}:${p.name}` : '')),
      );
      for (const name of names) {
        if (declared.has(`path:${name}`)) continue;
        operation.parameters = [
          { name, in: 'path', required: true, schema: { type: 'string' } },
          ...(operation.parameters ?? []),
        ];
      }
    }
  }
  return document;
}

// Everything that changes how requests are handled. Shared by main.ts and the e2e tests so
// the tests exercise the same routing, parsing and validation as production.
export function configureApp(app: INestApplication): void {
  // WebSockets: Socket.IO, with its rooms shared between API servers through Redis.
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.useWebSocketAdapter(
    new RedisIoAdapter(
      app,
      config.get('REDIS_URL', { infer: true }),
      realtimeOrigins(
        config.get('APP_URL', { infer: true }),
        config.get('NODE_ENV', { infer: true }),
      ),
    ),
  );
  // Routes look like /api/v1/projects; a breaking change ships as v2 next to v1.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(cookieParser());
  // whitelist + forbidNonWhitelisted: unknown fields are rejected, so a client cannot sneak in
  // e.g. `role: "OWNER"` on an endpoint that never meant to accept it (mass assignment).
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
}
