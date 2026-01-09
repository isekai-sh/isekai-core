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
 * Publisher Metrics Collector
 *
 * Tracks comprehensive metrics for the publisher worker including:
 * - Success/failure rates
 * - Latency percentiles
 * - Error distribution
 * - Queue health
 * - Rate limit hits
 */

import type { Redis } from 'ioredis';
import { ErrorCategory } from './error-categorizer.js';
import type { CategorizedError } from './error-categorizer.js';

export interface PublisherMetrics {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  retriedJobs: number;
  successRate: number;

  latency: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
    avg: number;
  };

  errorsByCategory: Record<string, number>;
  rateLimitHits: number;
  circuitBreakerOpenCount: number;

  queueMetrics?: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };

  timeWindow: string;
  collectedAt: string;
}

interface JobRecord {
  jobId: string;
  deviationId: string;
  startTime: number;
  endTime?: number;
  latencyMs?: number;
  success?: boolean;
  errorCategory?: ErrorCategory;
}

/**
 * Publisher Metrics Collector
 *
 * Collects and aggregates metrics for publisher worker performance
 */
export class PublisherMetricsCollector {
  private redis: Redis | null;
  private jobRecords: Map<string, JobRecord>;
  private latencies: number[];
  private errorCounts: Map<ErrorCategory, number>;
  private successCount: number;
  private failureCount: number;
  private retryCount: number;
  private rateLimitHitCount: number;
  private circuitBreakerOpenCount: number;
  private flushInterval: NodeJS.Timeout | null;

  constructor(redis: Redis | null) {
    this.redis = redis;
    this.jobRecords = new Map();
    this.latencies = [];
    this.errorCounts = new Map();
    this.successCount = 0;
    this.failureCount = 0;
    this.retryCount = 0;
    this.rateLimitHitCount = 0;
    this.circuitBreakerOpenCount = 0;
    this.flushInterval = null;

    // Start periodic flush to Redis if enabled
    if (this.isEnabled()) {
      this.startPeriodicFlush();
    }
  }

  /**
   * Record job start
   */
  recordJobStart(jobId: string, deviationId: string): void {
    this.jobRecords.set(jobId, {
      jobId,
      deviationId,
      startTime: Date.now(),
    });
  }

  /**
   * Record job success
   */
  recordJobSuccess(jobId: string, latencyMs: number): void {
    const record = this.jobRecords.get(jobId);
    if (record) {
      record.endTime = Date.now();
      record.latencyMs = latencyMs;
      record.success = true;
    }

    this.successCount++;
    this.latencies.push(latencyMs);

    // Keep only recent latencies (last 1000)
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }
  }

  /**
   * Record job failure
   */
  recordJobFailure(jobId: string, error: CategorizedError, latencyMs: number): void {
    const record = this.jobRecords.get(jobId);
    if (record) {
      record.endTime = Date.now();
      record.latencyMs = latencyMs;
      record.success = false;
      record.errorCategory = error.category;
    }

    this.failureCount++;
    this.latencies.push(latencyMs);

    // Track error by category
    const currentCount = this.errorCounts.get(error.category) || 0;
    this.errorCounts.set(error.category, currentCount + 1);

    // Keep only recent latencies
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }
  }

  /**
   * Record rate limit hit
   */
  recordRateLimitHit(userId: string, waitMs: number): void {
    this.rateLimitHitCount++;
  }

  /**
   * Record circuit breaker state change to open
   */
  recordCircuitBreakerOpen(): void {
    this.circuitBreakerOpenCount++;
  }

  /**
   * Record job retry
   */
  recordJobRetry(jobId: string): void {
    this.retryCount++;
  }

  /**
   * Record stalled job
   */
  recordStalledJob(jobId: string): void {
    // Could add dedicated stalled job tracking if needed
  }

  /**
   * Get current metrics
   */
  getMetrics(timeWindow: string = '5min'): PublisherMetrics {
    const totalJobs = this.successCount + this.failureCount;
    const successRate = totalJobs > 0 ? this.successCount / totalJobs : 0;

    return {
      totalJobs,
      successfulJobs: this.successCount,
      failedJobs: this.failureCount,
      retriedJobs: this.retryCount,
      successRate: Math.round(successRate * 10000) / 100, // Percentage with 2 decimals

      latency: this.calculateLatencyPercentiles(),

      errorsByCategory: this.getErrorDistribution(),
      rateLimitHits: this.rateLimitHitCount,
      circuitBreakerOpenCount: this.circuitBreakerOpenCount,

      timeWindow,
      collectedAt: new Date().toISOString(),
    };
  }

  /**
   * Calculate latency percentiles
   */
  private calculateLatencyPercentiles(): PublisherMetrics['latency'] {
    if (this.latencies.length === 0) {
      return {
        p50: 0,
        p95: 0,
        p99: 0,
        max: 0,
        avg: 0,
      };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);

    return {
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
      max: sorted[sorted.length - 1],
      avg: Math.round(sum / sorted.length),
    };
  }

  /**
   * Calculate percentile value
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;

    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get error distribution
   */
  private getErrorDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const [category, count] of this.errorCounts.entries()) {
      distribution[category] = count;
    }

    return distribution;
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusFormat(): string {
    const metrics = this.getMetrics();
    const lines: string[] = [];

    // Total jobs
    lines.push('# HELP publisher_jobs_total Total number of publisher jobs');
    lines.push('# TYPE publisher_jobs_total counter');
    lines.push(`publisher_jobs_total ${metrics.totalJobs}`);

    // Success counter
    lines.push('# HELP publisher_jobs_success_total Total number of successful jobs');
    lines.push('# TYPE publisher_jobs_success_total counter');
    lines.push(`publisher_jobs_success_total ${metrics.successfulJobs}`);

    // Failure counter
    lines.push('# HELP publisher_jobs_failed_total Total number of failed jobs');
    lines.push('# TYPE publisher_jobs_failed_total counter');
    lines.push(`publisher_jobs_failed_total ${metrics.failedJobs}`);

    // Success rate gauge
    lines.push('# HELP publisher_success_rate Current success rate percentage');
    lines.push('# TYPE publisher_success_rate gauge');
    lines.push(`publisher_success_rate ${metrics.successRate}`);

    // Latency histogram
    lines.push('# HELP publisher_latency_ms Job latency in milliseconds');
    lines.push('# TYPE publisher_latency_ms summary');
    lines.push(`publisher_latency_ms{quantile="0.5"} ${metrics.latency.p50}`);
    lines.push(`publisher_latency_ms{quantile="0.95"} ${metrics.latency.p95}`);
    lines.push(`publisher_latency_ms{quantile="0.99"} ${metrics.latency.p99}`);
    lines.push(`publisher_latency_ms_sum ${metrics.latency.avg * metrics.totalJobs}`);
    lines.push(`publisher_latency_ms_count ${metrics.totalJobs}`);

    // Rate limit hits
    lines.push('# HELP publisher_rate_limit_hits_total Total rate limit hits');
    lines.push('# TYPE publisher_rate_limit_hits_total counter');
    lines.push(`publisher_rate_limit_hits_total ${metrics.rateLimitHits}`);

    // Circuit breaker opens
    lines.push('# HELP publisher_circuit_breaker_opens_total Circuit breaker open count');
    lines.push('# TYPE publisher_circuit_breaker_opens_total counter');
    lines.push(`publisher_circuit_breaker_opens_total ${metrics.circuitBreakerOpenCount}`);

    // Errors by category
    for (const [category, count] of Object.entries(metrics.errorsByCategory)) {
      lines.push(`publisher_errors_total{category="${category}"} ${count}`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Flush metrics to Redis
   */
  private async flushToRedis(): Promise<void> {
    if (!this.redis) return;

    try {
      const metrics = this.getMetrics('1min');
      const timestamp = Date.now();
      const key = `metrics:publisher:1min:${timestamp}`;

      await this.redis.setex(key, 3600, JSON.stringify(metrics)); // 1 hour TTL

      // Also store in a sorted set for time-series queries
      await this.redis.zadd('metrics:publisher:timeline', timestamp, key);

      // Trim old entries (keep last 24 hours)
      const oneDayAgo = timestamp - 24 * 60 * 60 * 1000;
      await this.redis.zremrangebyscore('metrics:publisher:timeline', 0, oneDayAgo);
    } catch (error) {
      console.error('[Metrics] Failed to flush to Redis:', error);
    }
  }

  /**
   * Start periodic flush to Redis
   */
  private startPeriodicFlush(): void {
    const intervalMs = parseInt(process.env.METRICS_FLUSH_INTERVAL_MS || '60000');

    this.flushInterval = setInterval(() => {
      this.flushToRedis();
    }, intervalMs);
  }

  /**
   * Stop periodic flush
   */
  stopPeriodicFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.jobRecords.clear();
    this.latencies = [];
    this.errorCounts.clear();
    this.successCount = 0;
    this.failureCount = 0;
    this.retryCount = 0;
    this.rateLimitHitCount = 0;
    this.circuitBreakerOpenCount = 0;
  }

  /**
   * Check if metrics collection is enabled
   */
  private isEnabled(): boolean {
    const enabled = process.env.METRICS_ENABLED?.toLowerCase();
    return enabled !== 'false' && enabled !== '0';
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    this.stopPeriodicFlush();

    // Final flush before shutdown
    if (this.redis) {
      await this.flushToRedis();
    }
  }
}
