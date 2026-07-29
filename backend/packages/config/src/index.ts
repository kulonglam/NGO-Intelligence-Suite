import { z } from 'zod';

/**
 * Boot-time config validation. Reading process.env outside a schema is forbidden
 * by engineering standards (35 §35.4.1) — services load config once via loadConfig.
 */
export const baseServiceSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  SERVICE_NAME: z.string().min(1),
  PORT: z.coerce.number().int().positive(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z
    .string()
    // App role must NOT be a superuser — superusers bypass FORCE RLS.
    .default('postgres://ngois_app:ngois_app_dev@127.0.0.1:5433/ngois'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  JWT_ISSUER: z.string().default('https://auth.local.ngointelligence.io'),
  JWT_AUDIENCE: z.string().default('ngois-api'),
  JWT_SECRET: z.string().min(32).default('dev-only-change-me-ngois-jwt-secret!!'),
});

export type BaseServiceConfig = z.infer<typeof baseServiceSchema>;

export function loadConfig<T extends z.ZodTypeAny>(
  schema: T,
  env: NodeJS.ProcessEnv = process.env,
): z.infer<T> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    console.error(JSON.stringify({ level: 'error', msg: 'Invalid configuration', detail }));
    process.exit(78); // EX_CONFIG
  }
  return parsed.data;
}
