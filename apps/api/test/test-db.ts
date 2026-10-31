import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Local runs read DATABASE_URL from the repo-root .env; CI provides it as an environment variable.
// Variables that are already set win over the file.
const envFile = resolve(__dirname, '../../../.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

// Integration tests never touch the development database: they get their own.
export const TEST_DATABASE = 'nexora_test';

export function databaseUrl(database: string): string {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error('DATABASE_URL is not set');
  }
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}
