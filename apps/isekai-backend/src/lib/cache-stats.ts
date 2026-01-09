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

/**
 * Cache Statistics Tracker
 *
 * Tracks cache performance metrics for monitoring and optimization
 * - Cache hits vs misses per namespace
 * - Cache errors
 * - Stale cache serves
 * - 429 rate limit errors
 */

export interface CacheMetrics {
  hits: number;
  misses: number;
  errors: number;
  staleServes: number;
  rateLimitErrors: number;
  totalRequests: number;
  hitRate: number;
}

export interface DetailedCacheStats {
  overall: CacheMetrics;
  byNamespace: Record<string, CacheMetrics>;
  coalescedRequests: number;
  startTime: Date;
  uptime: number;
}

/**
 * Cache Statistics Manager
 */
export class CacheStats {
  private static metrics = {
    hits: new Map<string, number>(),
    misses: new Map<string, number>(),
    errors: new Map<string, number>(),
    staleServes: new Map<string, number>(),
    rateLimitErrors: new Map<string, number>(),
    coalescedRequests: 0,
  };

  private static startTime = new Date();

  /**
   * Record a cache hit
   */
  static recordHit(namespace: string): void {
    const current = this.metrics.hits.get(namespace) || 0;
    this.metrics.hits.set(namespace, current + 1);
  }

  /**
   * Record a cache miss
   */
  static recordMiss(namespace: string): void {
    const current = this.metrics.misses.get(namespace) || 0;
    this.metrics.misses.set(namespace, current + 1);
  }

  /**
   * Record a cache error
   */
  static recordError(namespace: string): void {
    const current = this.metrics.errors.get(namespace) || 0;
    this.metrics.errors.set(namespace, current + 1);
  }

  /**
   * Record a stale cache serve (429 fallback)
   */
  static recordStaleServe(namespace: string): void {
    const current = this.metrics.staleServes.get(namespace) || 0;
    this.metrics.staleServes.set(namespace, current + 1);
  }

  /**
   * Record a rate limit error (429)
   */
  static recordRateLimitError(namespace: string): void {
    const current = this.metrics.rateLimitErrors.get(namespace) || 0;
    this.metrics.rateLimitErrors.set(namespace, current + 1);
  }

  /**
   * Record a coalesced request (duplicate request avoided)
   */
  static recordCoalescedRequest(): void {
    this.metrics.coalescedRequests++;
  }

  /**
   * Get metrics for a specific namespace
   */
  static getNamespaceMetrics(namespace: string): CacheMetrics {
    const hits = this.metrics.hits.get(namespace) || 0;
    const misses = this.metrics.misses.get(namespace) || 0;
    const errors = this.metrics.errors.get(namespace) || 0;
    const staleServes = this.metrics.staleServes.get(namespace) || 0;
    const rateLimitErrors = this.metrics.rateLimitErrors.get(namespace) || 0;
    const totalRequests = hits + misses;
    const hitRate = totalRequests > 0 ? hits / totalRequests : 0;

    return {
      hits,
      misses,
      errors,
      staleServes,
      rateLimitErrors,
      totalRequests,
      hitRate,
    };
  }

  /**
   * Get overall cache statistics
   */
  static getOverallMetrics(): CacheMetrics {
    let totalHits = 0;
    let totalMisses = 0;
    let totalErrors = 0;
    let totalStaleServes = 0;
    let totalRateLimitErrors = 0;

    // Sum all namespaces
    for (const hits of this.metrics.hits.values()) {
      totalHits += hits;
    }
    for (const misses of this.metrics.misses.values()) {
      totalMisses += misses;
    }
    for (const errors of this.metrics.errors.values()) {
      totalErrors += errors;
    }
    for (const staleServes of this.metrics.staleServes.values()) {
      totalStaleServes += staleServes;
    }
    for (const rateLimitErrors of this.metrics.rateLimitErrors.values()) {
      totalRateLimitErrors += rateLimitErrors;
    }

    const totalRequests = totalHits + totalMisses;
    const hitRate = totalRequests > 0 ? totalHits / totalRequests : 0;

    return {
      hits: totalHits,
      misses: totalMisses,
      errors: totalErrors,
      staleServes: totalStaleServes,
      rateLimitErrors: totalRateLimitErrors,
      totalRequests,
      hitRate,
    };
  }

  /**
   * Get detailed statistics for all namespaces
   */
  static getDetailedStats(): DetailedCacheStats {
    const overall = this.getOverallMetrics();
    const byNamespace: Record<string, CacheMetrics> = {};

    // Get all unique namespaces
    const namespaces = new Set<string>();
    for (const namespace of this.metrics.hits.keys()) {
      namespaces.add(namespace);
    }
    for (const namespace of this.metrics.misses.keys()) {
      namespaces.add(namespace);
    }

    // Calculate metrics for each namespace
    for (const namespace of namespaces) {
      byNamespace[namespace] = this.getNamespaceMetrics(namespace);
    }

    const uptime = Date.now() - this.startTime.getTime();

    return {
      overall,
      byNamespace,
      coalescedRequests: this.metrics.coalescedRequests,
      startTime: this.startTime,
      uptime,
    };
  }

  /**
   * Get stats as JSON (for API endpoint)
   */
  static toJSON(): Record<string, any> {
    const stats = this.getDetailedStats();
    return {
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
      startTime: stats.startTime.toISOString(),
      uptimeSeconds: Math.floor(stats.uptime / 1000),
    };
  }

  /**
   * Reset all statistics
   * Useful for testing or starting fresh
   */
  static reset(): void {
    this.metrics.hits.clear();
    this.metrics.misses.clear();
    this.metrics.errors.clear();
    this.metrics.staleServes.clear();
    this.metrics.rateLimitErrors.clear();
    this.metrics.coalescedRequests = 0;
    this.startTime = new Date();
  }

  /**
   * Log summary statistics to console
   */
  static logSummary(): void {
    const stats = this.getDetailedStats();
    console.log('\n=== Cache Statistics ===');
    console.log(`Overall Hit Rate: ${(stats.overall.hitRate * 100).toFixed(2)}%`);
    console.log(`Total Requests: ${stats.overall.totalRequests}`);
    console.log(`Cache Hits: ${stats.overall.hits}`);
    console.log(`Cache Misses: ${stats.overall.misses}`);
    console.log(`Stale Serves: ${stats.overall.staleServes}`);
    console.log(`Rate Limit Errors: ${stats.overall.rateLimitErrors}`);
    console.log(`Coalesced Requests: ${stats.coalescedRequests}`);
    console.log(`Uptime: ${Math.floor(stats.uptime / 1000)}s`);

    if (Object.keys(stats.byNamespace).length > 0) {
      console.log('\nBy Namespace:');
      for (const [namespace, metrics] of Object.entries(stats.byNamespace)) {
        console.log(
          `  ${namespace}: ${(metrics.hitRate * 100).toFixed(2)}% hit rate (${
            metrics.hits
          }/${metrics.totalRequests})`
        );
      }
    }
    console.log('=======================\n');
  }
}
