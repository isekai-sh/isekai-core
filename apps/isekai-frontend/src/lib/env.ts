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

import { z } from 'zod';

// NOTE: This file is kept for backwards compatibility with tests
// The application now uses runtime configuration from window.ISEKAI_CONFIG
// instead of build-time environment variables

const envSchema = z.object({
  // Optional - these are only used in test environment
  // Production uses window.ISEKAI_CONFIG loaded from /config.js
  VITE_API_URL: z.string().default('/api'),
  VITE_DEVIANTART_CLIENT_ID: z.string().default(''),
  VITE_S3_PUBLIC_URL: z.string().default('http://localhost:9000/isekai-uploads'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  // For test environment compatibility
  const result = envSchema.safeParse(import.meta.env);

  if (!result.success) {
    console.warn('Environment validation warning (tests only):', result.error);
    // Return defaults instead of throwing
    return {
      VITE_API_URL: '/api',
      VITE_DEVIANTART_CLIENT_ID: '',
      VITE_S3_PUBLIC_URL: 'http://localhost:9000/isekai-uploads',
    };
  }

  return result.data;
}

export const env = validateEnv();
