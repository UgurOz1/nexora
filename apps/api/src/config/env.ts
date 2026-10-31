import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Env vars are always strings; coerce turns "3001" into 3001.
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  // Signs access tokens. Long and random; a short secret can be brute-forced offline from any token.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // Links in emails point to the web app, which then calls the API.
  APP_URL: z.url().default('http://localhost:3000'),
  // 127.0.0.1, not "localhost": nodemailer does its own DNS lookup, and some networks resolve
  // "localhost" to the machine's LAN address, where Mailpit is not listening.
  SMTP_HOST: z.string().default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  MAIL_FROM: z.string().default('NEXORA <no-reply@nexora.test>'),
});

export type Env = z.infer<typeof envSchema>;

// Called once by ConfigModule at startup with the raw values from .env and process.env.
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  return result.data;
}
