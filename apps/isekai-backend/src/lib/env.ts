/*
 * Copyright (C) 2025 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { z } from "zod";

const envSchema = z.object({
  // Database & Cache
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // DeviantArt OAuth
  DEVIANTART_CLIENT_ID: z.string().min(1, "DEVIANTART_CLIENT_ID is required"),
  DEVIANTART_CLIENT_SECRET: z
    .string()
    .min(1, "DEVIANTART_CLIENT_SECRET is required"),
  DEVIANTART_REDIRECT_URI: z
    .string()
    .url("DEVIANTART_REDIRECT_URI must be a valid URL"),

  // S3-Compatible Storage (supports AWS S3, Cloudflare R2, MinIO, etc.)
  S3_ENDPOINT: z.string().optional(), // Optional for AWS S3
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().min(1, "S3_ACCESS_KEY_ID is required"),
  S3_SECRET_ACCESS_KEY: z.string().min(1, "S3_SECRET_ACCESS_KEY is required"),
  S3_BUCKET_NAME: z.string().min(1, "S3_BUCKET_NAME is required"),
  S3_PUBLIC_URL: z.string().url("S3_PUBLIC_URL must be a valid URL"),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),


  // Security
  SESSION_SECRET: z.string().min(1, "SESSION_SECRET is required"),
  COOKIE_DOMAIN: z.string().optional(),
  SESSION_MAX_AGE_DAYS: z.coerce.number().int().positive().default(7),
  REFRESH_TOKEN_EXPIRY_DAYS: z.coerce.number().int().positive().default(90),

  // Application
  FRONTEND_URL: z.string().url("FRONTEND_URL must be a valid URL"),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Optional Configuration
  SESSION_STORE: z.enum(["redis", "postgres"]).optional(),
  ENCRYPTION_KEY: z
    .string()
    .length(64, "ENCRYPTION_KEY must be 64 characters (32 bytes hex)")
    .optional(),

  // Cache Configuration
  CACHE_ENABLED: z.coerce.boolean().default(true),
  CACHE_DEFAULT_TTL: z.coerce.number().int().positive().default(300),
  CACHE_STALE_TTL: z.coerce.number().int().positive().default(7200),

  // Circuit Breaker
  CIRCUIT_BREAKER_ENABLED: z.coerce.boolean().default(true),
  CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().positive().default(3),
  CIRCUIT_BREAKER_OPEN_DURATION_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(300000),
  CIRCUIT_BREAKER_PERSIST_TO_REDIS: z.coerce.boolean().default(true),

  // Publisher Worker
  PUBLISHER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  PUBLISHER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(7),
  PUBLISHER_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(600000),
  PUBLISHER_STALE_CHECK_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60000),
  PUBLISHER_MAX_STALLED_COUNT: z.coerce.number().int().positive().default(2),
  PUBLISHER_LIMITER_MAX: z.coerce.number().int().positive().default(2),

  // Rate Limiter
  RATE_LIMITER_ENABLED: z.coerce.boolean().default(true),
  RATE_LIMITER_BASE_DELAY_MS: z.coerce.number().int().positive().default(3000),
  RATE_LIMITER_MAX_DELAY_MS: z.coerce.number().int().positive().default(300000),
  RATE_LIMITER_JITTER_PERCENT: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .default(20),
  RATE_LIMITER_SUCCESS_DECREASE_FACTOR: z.coerce
    .number()
    .positive()
    .default(0.9),
  RATE_LIMITER_FAILURE_INCREASE_FACTOR: z.coerce
    .number()
    .positive()
    .default(2.0),

  // Metrics
  METRICS_ENABLED: z.coerce.boolean().default(true),
  METRICS_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Optional Features
  DISABLE_RATE_LIMIT: z.coerce.boolean().optional(),
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  ENABLE_ALERTS: z.coerce.boolean().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("Environment Variable Validation Failed");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("\nMissing or invalid environment variables:\n");

    const errors = result.error.flatten();

    // Show field-specific errors
    for (const [field, messages] of Object.entries(errors.fieldErrors)) {
      if (messages && messages.length > 0) {
        console.error(`  ${field}:`);
        messages.forEach((msg) => console.error(`    - ${msg}`));
      }
    }

    // Show form-level errors if any
    if (errors.formErrors.length > 0) {
      console.error("\nGeneral errors:");
      errors.formErrors.forEach((msg) => console.error(`  - ${msg}`));
    }

    console.error("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("Please check your .env file and ensure all required");
    console.error("environment variables are set correctly.");
    console.error("See apps/isekai-backend/.env.example for reference.");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
