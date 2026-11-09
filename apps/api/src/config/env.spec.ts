import { validateEnv } from './env';

const validEnv = {
  NODE_ENV: 'test',
  API_PORT: '4000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5433/db',
  REDIS_URL: 'redis://localhost:6380',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  S3_ACCESS_KEY_ID: 'access-key',
  S3_SECRET_ACCESS_KEY: 'secret-key',
};

describe('validateEnv', () => {
  it('parses valid values and coerces the port to a number', () => {
    const env = validateEnv(validEnv);
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('test');
  });

  it('applies defaults for optional values', () => {
    const { NODE_ENV, API_PORT, ...required } = validEnv;
    const env = validateEnv(required);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3001);
  });

  it('treats empty Google credentials as not configured', () => {
    const env = validateEnv({ ...validEnv, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });

  it('fails when DATABASE_URL is missing', () => {
    const { DATABASE_URL, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('fails when the port is not a number', () => {
    expect(() => validateEnv({ ...validEnv, API_PORT: 'abc' })).toThrow(/API_PORT/);
  });

  it('reports every invalid variable at once', () => {
    expect(() => validateEnv({ ...validEnv, DATABASE_URL: 'x', REDIS_URL: 'y' })).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL/,
    );
  });

  it('has no built-in storage keys: a secret never has a default value', () => {
    const { S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, ...without } = validEnv;
    expect(() => validateEnv(without)).toThrow(/S3_ACCESS_KEY_ID/);
    expect(() => validateEnv({ ...validEnv, S3_SECRET_ACCESS_KEY: '' })).toThrow(
      /S3_SECRET_ACCESS_KEY/,
    );
  });

  it('leaves the metrics endpoint off by default and refuses a short metrics token', () => {
    expect(validateEnv(validEnv).METRICS_TOKEN).toBeUndefined();
    expect(validateEnv({ ...validEnv, METRICS_TOKEN: '' }).METRICS_TOKEN).toBeUndefined();
    expect(() => validateEnv({ ...validEnv, METRICS_TOKEN: 'short' })).toThrow(/METRICS_TOKEN/);
    expect(validateEnv(validEnv).ANALYTICS_CACHE_TTL_SECONDS).toBe(300);
  });
});
