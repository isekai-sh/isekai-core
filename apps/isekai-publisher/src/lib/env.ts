import { z } from 'zod';

const envSchema = z.object({
  // Database & Cache
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // DeviantArt OAuth
  DEVIANTART_CLIENT_ID: z.string().min(1, 'DEVIANTART_CLIENT_ID is required'),
  DEVIANTART_CLIENT_SECRET: z.string().min(1, 'DEVIANTART_CLIENT_SECRET is required'),

  // S3-Compatible Storage (MinIO, Cloudflare R2, AWS S3, etc.)
  S3_ENDPOINT: z.string().optional(), // Optional for AWS S3
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z.string().min(1, 'S3_ACCESS_KEY_ID is required'),
  S3_SECRET_ACCESS_KEY: z.string().min(1, 'S3_SECRET_ACCESS_KEY is required'),
  S3_BUCKET_NAME: z.string().min(1, 'S3_BUCKET_NAME is required'),
  S3_PUBLIC_URL: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),

  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Health Check
  HEALTH_CHECK_PORT: z.coerce.number().int().positive().default(4001),
  HEALTH_CHECK_ENABLED: z.coerce.boolean().default(true),

  // Publisher Worker
  PUBLISHER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  PUBLISHER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(7),
  PUBLISHER_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(1200000),
  PUBLISHER_STALE_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
  PUBLISHER_MAX_STALLED_COUNT: z.coerce.number().int().positive().default(2),
  PUBLISHER_LIMITER_MAX: z.coerce.number().int().positive().default(2),

  // Rate Limiter
  RATE_LIMITER_ENABLED: z.coerce.boolean().default(true),
  RATE_LIMITER_BASE_DELAY_MS: z.coerce.number().int().positive().default(3000),
  RATE_LIMITER_MAX_DELAY_MS: z.coerce.number().int().positive().default(300000),
  RATE_LIMITER_JITTER_PERCENT: z.coerce.number().int().min(0).max(100).default(20),
  RATE_LIMITER_SUCCESS_DECREASE_FACTOR: z.coerce.number().positive().default(0.9),
  RATE_LIMITER_FAILURE_INCREASE_FACTOR: z.coerce.number().positive().default(2.0),

  // Circuit Breaker
  CIRCUIT_BREAKER_ENABLED: z.coerce.boolean().default(true),
  CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().positive().default(3),
  CIRCUIT_BREAKER_OPEN_DURATION_MS: z.coerce.number().int().positive().default(300000),
  CIRCUIT_BREAKER_PERSIST_TO_REDIS: z.coerce.boolean().default(true),

  // Cache Configuration
  CACHE_ENABLED: z.coerce.boolean().default(true),
  CACHE_DEFAULT_TTL: z.coerce.number().int().positive().default(300),
  CACHE_STALE_TTL: z.coerce.number().int().positive().default(7200),

  // Metrics
  METRICS_ENABLED: z.coerce.boolean().default(true),
  METRICS_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Email (Optional)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default('noreply@isekai.sh'),
  FRONTEND_URL: z.string().url().default('https://isekai.sh'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Environment Variable Validation Failed');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('\nMissing or invalid environment variables:\n');

    const errors = result.error.flatten();

    // Show field-specific errors
    for (const [field, messages] of Object.entries(errors.fieldErrors)) {
      if (messages && messages.length > 0) {
        console.error(`  ${field}:`);
        messages.forEach(msg => console.error(`    - ${msg}`));
      }
    }

    // Show form-level errors if any
    if (errors.formErrors.length > 0) {
      console.error('\nGeneral errors:');
      errors.formErrors.forEach(msg => console.error(`  - ${msg}`));
    }

    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Please check your .env file and ensure all required');
    console.error('environment variables are set correctly.');
    console.error('See apps/isekai-publisher/.env.example for reference.');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
