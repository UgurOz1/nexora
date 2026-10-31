import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { databaseUrl, TEST_DATABASE } from './test-db';

// Runs once before all e2e tests: create the test database if needed, bring it to the latest
// schema with the real migrations, and start from empty tables.
export default async function globalSetup(): Promise<void> {
  const admin = new Client({ connectionString: databaseUrl('postgres') });
  await admin.connect();
  const exists = await admin.query('select 1 from pg_database where datname = $1', [TEST_DATABASE]);
  if (exists.rowCount === 0) {
    await admin.query(`create database ${TEST_DATABASE}`);
  }
  await admin.end();

  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl(TEST_DATABASE) },
    stdio: 'pipe',
  });

  const db = new Client({ connectionString: databaseUrl(TEST_DATABASE) });
  await db.connect();
  await db.query('truncate table users, organizations restart identity cascade');
  await db.end();
}
