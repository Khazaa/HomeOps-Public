import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().default('postgres://homeops:homeops@localhost:5432/homeops'),
  APP_ORIGIN: z.string().url().default('http://localhost:5173').transform(value => new URL(value).origin),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  MASTER_KEY: z.string().min(43, 'MASTER_KEY must be a base64url encoded 32-byte key'),
  GUAC_TOKEN_KEY: z.string().min(32), GUACD_HOST: z.string().default('127.0.0.1'),
  GUACD_PORT: z.coerce.number().int().default(4822), ADMIN_USERNAME: z.string().min(3).default('admin'),
  ADMIN_INITIAL_PASSWORD: z.preprocess(v=>v===''?undefined:v,z.string().min(12).optional()),
  TRUST_PROXY: z.enum(['true','false']).default('false').transform(v=>v==='true'),
  COOKIE_SECURE: z.enum(['true','false']).default('true').transform(v=>v==='true')
});
export type AppConfig = z.infer<typeof schema>;
export const loadConfig = (env = process.env): AppConfig => schema.parse(env);
