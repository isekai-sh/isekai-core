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

import { Router } from 'express';
import { RedisClientManager } from '../lib/redis-client.js';
import { CacheStats } from '../lib/cache-stats.js';
import { CircuitBreaker } from '../lib/circuit-breaker.js';

const router = Router();

/**
 * GET /health - Health check endpoint
 * Returns system health information including Redis status and cache statistics
 */
router.get('/', async (req, res) => {
  try {
    // Check Redis availability and latency
    const redisAvailable = RedisClientManager.isAvailable();
    const redisStatus = RedisClientManager.getStatus();
    let redisLatency: number | null = null;

    if (redisAvailable) {
      redisLatency = await RedisClientManager.getLatency();
    }

    // Get cache statistics
    const cacheStats = CacheStats.getDetailedStats();

    // Get circuit breaker statuses
    const circuitStatuses = CircuitBreaker.getAllStatuses();
    const openCircuits = Object.values(circuitStatuses).filter(
      (status) => status.state === 'OPEN'
    ).length;

    // Determine overall health status
    let status = 'healthy';
    const issues: string[] = [];

    if (!redisAvailable) {
      status = 'degraded';
      issues.push('Redis unavailable - caching disabled');
    }

    if (redisLatency && redisLatency > 100) {
      status = 'degraded';
      issues.push(`Redis latency high (${redisLatency}ms)`);
    }

    if (openCircuits > 0) {
      status = 'degraded';
      issues.push(`${openCircuits} circuit breaker(s) open`);
    }

    // Response
    res.json({
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(cacheStats.uptime / 1000),
      issues: issues.length > 0 ? issues : undefined,
      redis: {
        available: redisAvailable,
        status: redisStatus,
        latency: redisLatency,
      },
      cache: {
        hitRate: `${(cacheStats.overall.hitRate * 100).toFixed(2)}%`,
        totalRequests: cacheStats.overall.totalRequests,
        hits: cacheStats.overall.hits,
        misses: cacheStats.overall.misses,
        staleServes: cacheStats.overall.staleServes,
        rateLimitErrors: cacheStats.overall.rateLimitErrors,
        coalescedRequests: cacheStats.coalescedRequests,
      },
      circuitBreaker: {
        enabled: CircuitBreaker.isEnabled(),
        openCircuits,
      },
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

export { router as healthRouter };
