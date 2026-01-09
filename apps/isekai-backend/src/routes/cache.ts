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
import { CacheStats } from '../lib/cache-stats.js';
import { CircuitBreaker } from '../lib/circuit-breaker.js';
import { RedisClientManager } from '../lib/redis-client.js';
import { RedisCache } from '../lib/redis-cache.js';

const router = Router();

/**
 * GET /cache/stats - Get detailed cache statistics
 * Returns comprehensive cache performance metrics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = CacheStats.getDetailedStats();
    const circuitStatuses = CircuitBreaker.getAllStatuses();

    res.json({
      timestamp: new Date().toISOString(),
      uptime: Math.floor(stats.uptime / 1000),
      startTime: stats.startTime.toISOString(),
      redis: {
        available: RedisClientManager.isAvailable(),
        status: RedisClientManager.getStatus(),
        latency: await RedisClientManager.getLatency(),
      },
      overall: {
        ...stats.overall,
        hitRate: `${(stats.overall.hitRate * 100).toFixed(2)}%`,
      },
      byNamespace: Object.entries(stats.byNamespace).reduce(
        (acc, [namespace, metrics]) => {
          acc[namespace] = {
            ...metrics,
            hitRate: `${(metrics.hitRate * 100).toFixed(2)}%`,
          };
          return acc;
        },
        {} as Record<string, any>
      ),
      coalescedRequests: stats.coalescedRequests,
      circuitBreaker: {
        enabled: CircuitBreaker.isEnabled(),
        failureThreshold: CircuitBreaker.getFailureThreshold(),
        circuits: circuitStatuses,
      },
    });
  } catch (error) {
    console.error('Cache stats error:', error);
    res.status(500).json({ error: 'Failed to fetch cache statistics' });
  }
});

/**
 * POST /cache/reset - Reset cache statistics
 * Admin endpoint to reset all cache metrics
 */
router.post('/reset', (req, res) => {
  try {
    CacheStats.reset();
    res.json({
      success: true,
      message: 'Cache statistics reset successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cache reset error:', error);
    res.status(500).json({ error: 'Failed to reset cache statistics' });
  }
});

/**
 * POST /cache/invalidate - Invalidate cache by pattern
 * Admin endpoint to manually invalidate cache entries
 *
 * Body: { pattern: string }
 * Example: { pattern: "isekai:v1:browse:user:123:*" }
 */
router.post('/invalidate', async (req, res) => {
  try {
    const { pattern } = req.body;

    if (!pattern || typeof pattern !== 'string') {
      return res.status(400).json({ error: 'Pattern is required' });
    }

    const deletedCount = await RedisCache.invalidate(pattern);

    res.json({
      success: true,
      deletedCount,
      pattern,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cache invalidate error:', error);
    res.status(500).json({ error: 'Failed to invalidate cache' });
  }
});

/**
 * POST /cache/circuit-breaker/reset - Reset a specific circuit breaker
 * Admin endpoint to manually reset a circuit breaker
 *
 * Body: { key: string }
 * Example: { key: "browse:tags" }
 */
router.post('/circuit-breaker/reset', (req, res) => {
  try {
    const { key } = req.body;

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Circuit key is required' });
    }

    CircuitBreaker.reset(key);

    res.json({
      success: true,
      message: `Circuit breaker for "${key}" reset successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Circuit breaker reset error:', error);
    res.status(500).json({ error: 'Failed to reset circuit breaker' });
  }
});

/**
 * POST /cache/circuit-breaker/reset-all - Reset all circuit breakers
 * Admin endpoint to reset all circuit breakers
 */
router.post('/circuit-breaker/reset-all', (req, res) => {
  try {
    CircuitBreaker.resetAll();

    res.json({
      success: true,
      message: 'All circuit breakers reset successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Circuit breaker reset all error:', error);
    res.status(500).json({ error: 'Failed to reset circuit breakers' });
  }
});

/**
 * GET /cache/summary - Log cache summary to console and return
 * Admin endpoint for quick overview
 */
router.get('/summary', (req, res) => {
  try {
    CacheStats.logSummary();
    const stats = CacheStats.getDetailedStats();

    res.json({
      timestamp: new Date().toISOString(),
      summary: {
        hitRate: `${(stats.overall.hitRate * 100).toFixed(2)}%`,
        totalRequests: stats.overall.totalRequests,
        hits: stats.overall.hits,
        misses: stats.overall.misses,
        staleServes: stats.overall.staleServes,
        rateLimitErrors: stats.overall.rateLimitErrors,
        coalescedRequests: stats.coalescedRequests,
        uptime: `${Math.floor(stats.uptime / 1000)}s`,
      },
    });
  } catch (error) {
    console.error('Cache summary error:', error);
    res.status(500).json({ error: 'Failed to fetch cache summary' });
  }
});

export { router as cacheRouter };
