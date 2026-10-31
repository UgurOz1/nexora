// Must be the FIRST import of generate-openapi.ts. ConfigModule.forRoot() validates the environment
// while app.module.ts is being loaded, so placeholders have to exist before that file is imported;
// assignments written in the script's own body would run too late (imports are evaluated first).
//
// Nothing connects to a database here; the values only have to pass validation. Real values
// (a developer's .env, CI's service containers) take precedence.
process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'openapi-generation-only-secret-0123456789';
process.env.NODE_ENV ??= 'test';
