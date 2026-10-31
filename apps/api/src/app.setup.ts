import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import cookieParser from 'cookie-parser';

// Everything that changes how requests are handled. Shared by main.ts and the e2e tests so
// the tests exercise the same routing, parsing and validation as production.
export function configureApp(app: INestApplication): void {
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
