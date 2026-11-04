import { databaseUrl, TEST_DATABASE } from './test-db';

// Runs in every test worker before the app is imported. Process variables take precedence over
// .env, so the app talks to the test database even when .env points at the development one.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl(TEST_DATABASE);
process.env.JWT_ACCESS_SECRET = 'e2e-secret-e2e-secret-e2e-secret-0123456789';
// Google credentials from a developer's .env must not leak into the tests.
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';
// Each test run uses its own queue names in Redis, so it never touches (or is touched by) the
// jobs of a developer's running app. The recurring-task job must not tick by itself in tests.
process.env.QUEUE_PREFIX = `nexora-test-${Date.now().toString(36)}-${process.pid}`;
process.env.QUEUE_SCHEDULER_ENABLED = 'false';
// The rate limits would trip over the many sign-ins the tests make from one address. The rate
// limit tests switch the limiter on for themselves.
process.env.RATE_LIMIT_ENABLED = 'false';
