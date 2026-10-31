// First import on purpose: see the comment in openapi-env.ts.
import './openapi-env';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { configureApp, openApiConfig } from '../src/app.setup';

// Writes the API's OpenAPI document to apps/api/openapi.json. The web app generates its typed
// client from that file, and CI fails if it is out of date, so frontend and backend cannot drift
// apart unnoticed. The app is created but never started.
async function main() {
  // Errors must be visible: with the logger off and abortOnError on, Nest would exit silently.
  const app = await NestFactory.create(AppModule, { logger: ['error'], abortOnError: false });
  configureApp(app);

  const document = SwaggerModule.createDocument(app, openApiConfig());
  const target = resolve(__dirname, '../openapi.json');
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(document.paths).length} paths to ${target}`);

  await app.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
