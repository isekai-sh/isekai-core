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

import RedisStore from 'connect-redis';
import connectPgSimple from 'connect-pg-simple';
import { Redis } from 'ioredis';
import session from 'express-session';
import { Pool } from 'pg';

const PgSession = connectPgSimple(session);

// Timeout for Redis connection attempt
const REDIS_CONNECT_TIMEOUT_MS = 5000;

/**
 * Creates a session store with automatic Redis detection and PostgreSQL fallback
 *
 * Priority:
 * 1. Manual override via SESSION_STORE env var
 * 2. Auto-detect Redis (with timeout)
 * 3. Fallback to PostgreSQL
 */
export async function createSessionStore(): Promise<session.Store> {
  const manualOverride = process.env.SESSION_STORE?.toLowerCase();

  // Manual override to PostgreSQL
  if (manualOverride === 'postgres' || manualOverride === 'postgresql') {
    return createPostgresStore();
  }

  // Manual override to Redis
  if (manualOverride === 'redis') {
    const redisStore = await tryRedisStore();
    if (redisStore) {
      return redisStore;
    }
    return createPostgresStore();
  }

  // Auto-detect: Try Redis first
  const redisStore = await tryRedisStore();
  if (redisStore) {
    return redisStore;
  }

  // Fallback to PostgreSQL
  return createPostgresStore();
}

/**
 * Attempts to create a Redis session store
 * Returns null if connection fails or times out
 */
async function tryRedisStore(): Promise<session.Store | null> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  try {
    // Create Redis client
    const redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required for connect-redis
      enableReadyCheck: true,
      lazyConnect: true, // Don't auto-connect, we'll do it manually with timeout
      tls: redisUrl.startsWith('rediss://')
        ? {
            rejectUnauthorized: false, // Accept self-signed certificates
          }
        : undefined,
    });

    // Attempt connection with timeout
    const connectPromise = redisClient.connect();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Redis connection timeout')), REDIS_CONNECT_TIMEOUT_MS)
    );

    await Promise.race([connectPromise, timeoutPromise]);

    // Add error handler for runtime errors
    redisClient.on('error', (err) => {
      console.error('[SessionStore] Error:', err.message);
    });

    // Create and return Redis store
    // Note: connect-redis v7 expects TTL in seconds
    const store = new RedisStore({
      client: redisClient,
      prefix: 'sess:', // Session key prefix in Redis
      ttl: 60 * 60 * 24 * 7, // 7 days in seconds (matches cookie maxAge)
    });

    // Set env var for health checks
    process.env.SESSION_STORE_TYPE = 'redis';

    return store;
  } catch (error) {
    return null;
  }
}

/**
 * Creates a PostgreSQL session store using the existing database connection
 */
function createPostgresStore(): session.Store {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for session storage');
  }

  // Create a new pool specifically for sessions
  // (Alternative: could reuse the pool from db/index.ts, but separate is cleaner)
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  // Add error handler
  pool.on('error', (err) => {
    console.error('[SessionStore] Error:', err.message);
  });

  // Create store with auto-table creation
  const store = new PgSession({
    pool,
    tableName: 'session', // Default table name
    createTableIfMissing: true, // Auto-create sessions table
    ttl: 60 * 60 * 24 * 7, // 7 days (matches cookie maxAge)
  });

  // Set env var for health checks
  process.env.SESSION_STORE_TYPE = 'postgres';

  return store;
}

/**
 * Gracefully close session store connections
 * Call this during app shutdown
 */
export async function closeSessionStore(store: session.Store): Promise<void> {
  // Check if it's a Redis store
  if ('client' in store && store.client && typeof (store.client as any).quit === 'function') {
    await (store.client as Redis).quit();
  }

  // Check if it's a Postgres store
  if ('pool' in store && store.pool && typeof (store.pool as any).end === 'function') {
    await (store.pool as Pool).end();
  }
}
