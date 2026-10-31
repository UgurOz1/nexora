import { validateEnv } from './env';

const validEnv = {
  NODE_ENV: 'test',
  API_PORT: '4000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5433/db',
  REDIS_URL: 'redis://localhost:6380',
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
});
