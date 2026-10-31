import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { configureApp, openApiConfig } from '../src/app.setup';

// Writes the API's OpenAPI document to apps/api/openapi.json. The web app generates its typed
// client from that file, and CI fails if it is out of date, so frontend and backend cannot drift
// apart unnoticed.
//
// The app is created but never started: nothing connects to a database here. The variables only
// have to pass validation, so harmless placeholders are used when none are set.
process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'openapi-generation-only-secret-0123456789';
process.env.NODE_ENV ??= 'test';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);

  const document = SwaggerModule.createDocument(app, openApiConfig());
  const target = resolve(__dirname, '../openapi.json');
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(document.paths).length} paths to ${target}`);

  await app.close();
  process.exit(0);
}

void main();
