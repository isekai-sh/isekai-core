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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PublisherMetricsCollector } from './publisher-metrics';
import { ErrorCategory } from './error-categorizer';
import { createRedisMock } from '../test-helpers/redis-mock';

describe('PublisherMetricsCollector', () => {
  let redis: any;
  let collector: PublisherMetricsCollector;
  let originalEnv: NodeJS.ProcessEnv;

  function createSpiedRedisMock() {
    const mock = createRedisMock();
    // Wrap methods with spies
    const spied = {
      ...mock,
      setex: vi.fn((...args) => mock.setex(...args)),
      zadd: vi.fn((...args) => mock.zadd(...args)),
      zremrangebyscore: vi.fn((...args) => mock.zremrangebyscore(...args)),
      flushdb: vi.fn((...args) => mock.flushdb(...args)),
    };
    return spied;
  }

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv, METRICS_ENABLED: 'false' }; // Disable periodic flush
    redis = createSpiedRedisMock();
    redis.flushdb();
    collector = new PublisherMetricsCollector(redis);
  });

  afterEach(async () => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    await collector.shutdown();
  });

  describe('Constructor', () => {
    it('should initialize with default values', () => {
      expect(collector).toBeDefined();
    });

    it('should work without Redis', async () => {
      const noRedisCollector = new PublisherMetricsCollector(null);
      expect(noRedisCollector).toBeDefined();
      await noRedisCollector.shutdown();
    });
  });

  describe('Job Tracking', () => {
    it('should record successful job', () => {
      collector.recordJobStart('job-1', 'dev-1');
      collector.recordJobSuccess('job-1', 100);

      const metrics = collector.getMetrics();
      expect(metrics.successfulJobs).toBe(1);
      expect(metrics.totalJobs).toBe(1);
      expect(metrics.successRate).toBe(100);
    });

    it('should record failed job', () => {
      collector.recordJobStart('job-1', 'dev-1');

      const error = { category: ErrorCategory.RATE_LIMIT, message: 'Rate limited' } as any;
      collector.recordJobFailure('job-1', error, 100);

      const metrics = collector.getMetrics();
      expect(metrics.failedJobs).toBe(1);
      expect(metrics.totalJobs).toBe(1);
      expect(metrics.successRate).toBe(0);
    });

    it('should track latencies from multiple jobs', () => {
      collector.recordJobStart('job-1', 'dev-1');
      collector.recordJobSuccess('job-1', 100);

      collector.recordJobStart('job-2', 'dev-2');
      collector.recordJobSuccess('job-2', 200);

      const metrics = collector.getMetrics();
      expect(metrics.latency.avg).toBeGreaterThan(0);
      expect(metrics.latency.p50).toBeGreaterThan(0);
    });
  });

  describe('Rate Limit Tracking', () => {
    it('should record rate limit hits', () => {
      collector.recordRateLimitHit('user-1', 5000);
      collector.recordRateLimitHit('user-2', 3000);

      const metrics = collector.getMetrics();
      expect(metrics.rateLimitHits).toBe(2);
    });
  });

  describe('Circuit Breaker Tracking', () => {
    it('should record circuit breaker opens', () => {
      collector.recordCircuitBreakerOpen();

      const metrics = collector.getMetrics();
      expect(metrics.circuitBreakerOpenCount).toBe(1);
    });
  });

  describe('Error Distribution', () => {
    it('should track errors by category', () => {
      collector.recordJobStart('job-1', 'dev-1');
      collector.recordJobFailure('job-1', {
        category: ErrorCategory.RATE_LIMIT,
        message: 'Test'
      } as any, 50);

      collector.recordJobStart('job-2', 'dev-2');
      collector.recordJobFailure('job-2', {
        category: ErrorCategory.RATE_LIMIT,
        message: 'Test'
      } as any, 60);

      collector.recordJobStart('job-3', 'dev-3');
      collector.recordJobFailure('job-3', {
        category: ErrorCategory.NETWORK,
        message: 'Test'
      } as any, 70);

      const metrics = collector.getMetrics();
      expect(metrics.errorsByCategory[ErrorCategory.RATE_LIMIT]).toBe(2);
      expect(metrics.errorsByCategory[ErrorCategory.NETWORK]).toBe(1);
    });
  });

  describe('Latency Percentiles', () => {
    it('should calculate percentiles correctly', () => {
      for (let i = 1; i <= 100; i++) {
        collector.recordJobStart(`job-${i}`, `dev-${i}`);
        collector.recordJobSuccess(`job-${i}`, i * 10);
      }

      const metrics = collector.getMetrics();
      expect(metrics.latency.p50).toBeGreaterThan(0);
      expect(metrics.latency.p95).toBeGreaterThan(metrics.latency.p50);
      expect(metrics.latency.p99).toBeGreaterThan(metrics.latency.p95);
      expect(metrics.latency.max).toBeGreaterThanOrEqual(metrics.latency.p99);
    });

    it('should handle single job', () => {
      collector.recordJobStart('job-1', 'dev-1');
      collector.recordJobSuccess('job-1', 100);

      const metrics = collector.getMetrics();
      expect(metrics.latency.p50).toBe(100);
      expect(metrics.latency.avg).toBe(100);
    });

    it('should return 0 for empty dataset', () => {
      const metrics = collector.getMetrics();
      expect(metrics.latency.p50).toBe(0);
      expect(metrics.latency.avg).toBe(0);
    });
  });

  describe('Success Rate', () => {
    it('should calculate success rate correctly', () => {
      collector.recordJobStart('job-1', 'dev-1');
      collector.recordJobSuccess('job-1', 100);

      collector.recordJobStart('job-2', 'dev-2');
      collector.recordJobSuccess('job-2', 100);

      collector.recordJobStart('job-3', 'dev-3');
      collector.recordJobFailure('job-3', { category: ErrorCategory.UNKNOWN } as any, 100);

      const metrics = collector.getMetrics();
      expect(metrics.successRate).toBeCloseTo(66.67, 1);
    });

    it('should return 0 when no jobs completed', () => {
      const metrics = collector.getMetrics();
      expect(metrics.successRate).toBe(0);
    });
  });

  describe('getMetrics', () => {
    it('should return complete metrics structure', () => {
      const metrics = collector.getMetrics();

      expect(metrics).toHaveProperty('totalJobs');
      expect(metrics).toHaveProperty('successfulJobs');
      expect(metrics).toHaveProperty('failedJobs');
      expect(metrics).toHaveProperty('retriedJobs');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('latency');
      expect(metrics).toHaveProperty('errorsByCategory');
      expect(metrics).toHaveProperty('rateLimitHits');
      expect(metrics).toHaveProperty('circuitBreakerOpenCount');
      expect(metrics).toHaveProperty('timeWindow');
      expect(metrics).toHaveProperty('collectedAt');
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      collector.recordJobStart('job-1', 'dev-1');
      collector.recordJobSuccess('job-1', 100);
      collector.recordRateLimitHit('user-1', 5000);

      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.totalJobs).toBe(0);
      expect(metrics.successfulJobs).toBe(0);
      expect(metrics.rateLimitHits).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should stop periodic flush', async () => {
      await collector.shutdown();
      // Should not throw
    });

    it('should perform final flush to Redis on shutdown', async () => {
      process.env.METRICS_ENABLED = 'true';
      const redisWithFlush = createSpiedRedisMock();
      const collectorWithFlush = new PublisherMetricsCollector(redisWithFlush);

      collectorWithFlush.recordJobStart('job-1', 'dev-1');
      collectorWithFlush.recordJobSuccess('job-1', 100);

      await collectorWithFlush.shutdown();

      // Verify flush was called
      expect(redisWithFlush.setex).toHaveBeenCalled();
    });

    it('should handle shutdown without Redis', async () => {
      const noRedisCollector = new PublisherMetricsCollector(null);
      await noRedisCollector.shutdown();
      // Should not throw
    });
  });

  describe('Job Retry', () => {
    it('should record job retries', () => {
      collector.recordJobRetry('job-1');
      collector.recordJobRetry('job-2');

      const metrics = collector.getMetrics();
      expect(metrics.retriedJobs).toBe(2);
    });
  });

  describe('Stalled Job', () => {
    it('should handle recording stalled jobs', () => {
      // Currently a no-op, but should not throw
      collector.recordStalledJob('job-1');
      expect(() => collector.recordStalledJob('job-2')).not.toThrow();
    });
  });

  describe('Latency Array Trimming', () => {
    it('should trim latencies array when exceeding 1000 entries (success)', () => {
      // Record more than 1000 successful jobs
      for (let i = 1; i <= 1005; i++) {
        collector.recordJobStart(`job-${i}`, `dev-${i}`);
        collector.recordJobSuccess(`job-${i}`, i);
      }

      const metrics = collector.getMetrics();
      // Should only keep last 1000 latencies
      expect(metrics.totalJobs).toBe(1005);
      expect(metrics.latency.p50).toBeGreaterThan(0);
    });

    it('should trim latencies array when exceeding 1000 entries (failure)', () => {
      // Record more than 1000 failed jobs
      for (let i = 1; i <= 1005; i++) {
        collector.recordJobStart(`job-${i}`, `dev-${i}`);
        collector.recordJobFailure(`job-${i}`, {
          category: ErrorCategory.NETWORK_ERROR,
          message: 'Test error'
        } as any, i);
      }

      const metrics = collector.getMetrics();
      expect(metrics.failedJobs).toBe(1005);
      expect(metrics.latency.p50).toBeGreaterThan(0);
    });

    it('should keep latencies under 1000 entries', () => {
      for (let i = 1; i <= 500; i++) {
        collector.recordJobStart(`job-${i}`, `dev-${i}`);
        collector.recordJobSuccess(`job-${i}`, i * 10);
      }

      const metrics = collector.getMetrics();
      expect(metrics.successfulJobs).toBe(500);
    });
  });

  describe('Prometheus Export', () => {
    it('should export metrics in Prometheus format', () => {
      collector.recordJobStart('job-1', 'dev-1');
      collector.recordJobSuccess('job-1', 100);

      collector.recordJobStart('job-2', 'dev-2');
      collector.recordJobFailure('job-2', {
        category: ErrorCategory.RATE_LIMIT,
        message: 'Rate limited'
      } as any, 150);

      collector.recordRateLimitHit('user-1', 5000);
      collector.recordCircuitBreakerOpen();

      const prometheus = collector.exportPrometheusFormat();

      expect(prometheus).toContain('# HELP publisher_jobs_total');
      expect(prometheus).toContain('# TYPE publisher_jobs_total counter');
      expect(prometheus).toContain('publisher_jobs_total 2');

      expect(prometheus).toContain('# HELP publisher_jobs_success_total');
      expect(prometheus).toContain('publisher_jobs_success_total 1');

      expect(prometheus).toContain('# HELP publisher_jobs_failed_total');
      expect(prometheus).toContain('publisher_jobs_failed_total 1');

      expect(prometheus).toContain('# HELP publisher_success_rate');
      expect(prometheus).toContain('# TYPE publisher_success_rate gauge');

      expect(prometheus).toContain('# HELP publisher_latency_ms');
      expect(prometheus).toContain('# TYPE publisher_latency_ms summary');
      expect(prometheus).toContain('publisher_latency_ms{quantile="0.5"}');
      expect(prometheus).toContain('publisher_latency_ms{quantile="0.95"}');
      expect(prometheus).toContain('publisher_latency_ms{quantile="0.99"}');
      expect(prometheus).toContain('publisher_latency_ms_sum');
      expect(prometheus).toContain('publisher_latency_ms_count');

      expect(prometheus).toContain('# HELP publisher_rate_limit_hits_total');
      expect(prometheus).toContain('publisher_rate_limit_hits_total 1');

      expect(prometheus).toContain('# HELP publisher_circuit_breaker_opens_total');
      expect(prometheus).toContain('publisher_circuit_breaker_opens_total 1');

      expect(prometheus).toContain('publisher_errors_total{category="RATE_LIMIT"} 1');
    });

    it('should export empty metrics in Prometheus format', () => {
      const prometheus = collector.exportPrometheusFormat();

      expect(prometheus).toContain('publisher_jobs_total 0');
      expect(prometheus).toContain('publisher_jobs_success_total 0');
      expect(prometheus).toContain('publisher_jobs_failed_total 0');
      expect(prometheus).toContain('publisher_rate_limit_hits_total 0');
      expect(prometheus).toContain('publisher_circuit_breaker_opens_total 0');
    });

    it('should include multiple error categories in Prometheus export', () => {
      collector.recordJobStart('job-1', 'dev-1');
      collector.recordJobFailure('job-1', {
        category: ErrorCategory.NETWORK_ERROR,
        message: 'Network error'
      } as any, 100);

      collector.recordJobStart('job-2', 'dev-2');
      collector.recordJobFailure('job-2', {
        category: ErrorCategory.RATE_LIMIT,
        message: 'Rate limited'
      } as any, 100);

      collector.recordJobStart('job-3', 'dev-3');
      collector.recordJobFailure('job-3', {
        category: ErrorCategory.VALIDATION_ERROR,
        message: 'Validation error'
      } as any, 100);

      const prometheus = collector.exportPrometheusFormat();

      expect(prometheus).toContain('publisher_errors_total{category="NETWORK_ERROR"} 1');
      expect(prometheus).toContain('publisher_errors_total{category="RATE_LIMIT"} 1');
      expect(prometheus).toContain('publisher_errors_total{category="VALIDATION_ERROR"} 1');
    });
  });

  describe('Time Window', () => {
    it('should accept custom time window parameter', () => {
      collector.recordJobStart('job-1', 'dev-1');
      collector.recordJobSuccess('job-1', 100);

      const metrics = collector.getMetrics('10min');
      expect(metrics.timeWindow).toBe('10min');
    });

    it('should use default time window when not specified', () => {
      const metrics = collector.getMetrics();
      expect(metrics.timeWindow).toBe('5min');
    });

    it('should include collectedAt timestamp', () => {
      const metrics = collector.getMetrics();
      expect(metrics.collectedAt).toBeDefined();
      expect(new Date(metrics.collectedAt)).toBeInstanceOf(Date);
    });
  });

  describe('Redis Persistence', () => {
    it('should flush metrics to Redis', async () => {
      process.env.METRICS_ENABLED = 'true';
      const redisClient = createSpiedRedisMock();
      const metricsCollector = new PublisherMetricsCollector(redisClient);

      metricsCollector.recordJobStart('job-1', 'dev-1');
      metricsCollector.recordJobSuccess('job-1', 100);

      // Trigger flush
      await metricsCollector.shutdown();

      expect(redisClient.setex).toHaveBeenCalled();
      expect(redisClient.zadd).toHaveBeenCalled();
      expect(redisClient.zremrangebyscore).toHaveBeenCalled();
    });

    it('should not flush when Redis is null', async () => {
      process.env.METRICS_ENABLED = 'true';
      const metricsCollector = new PublisherMetricsCollector(null);

      metricsCollector.recordJobStart('job-1', 'dev-1');
      metricsCollector.recordJobSuccess('job-1', 100);

      // Should not throw
      await metricsCollector.shutdown();
    });

    it('should handle Redis flush errors gracefully', async () => {
      process.env.METRICS_ENABLED = 'true';
      const redisClient = createSpiedRedisMock();
      redisClient.setex.mockRejectedValue(new Error('Redis error'));

      const metricsCollector = new PublisherMetricsCollector(redisClient);
      metricsCollector.recordJobStart('job-1', 'dev-1');
      metricsCollector.recordJobSuccess('job-1', 100);

      // Should not throw on flush error
      await expect(metricsCollector.shutdown()).resolves.not.toThrow();
    });

    it('should trim old timeline entries from Redis', async () => {
      process.env.METRICS_ENABLED = 'true';
      const redisClient = createSpiedRedisMock();
      const metricsCollector = new PublisherMetricsCollector(redisClient);

      metricsCollector.recordJobStart('job-1', 'dev-1');
      metricsCollector.recordJobSuccess('job-1', 100);

      await metricsCollector.shutdown();

      // Verify zremrangebyscore was called to clean old entries
      expect(redisClient.zremrangebyscore).toHaveBeenCalledWith(
        'metrics:publisher:timeline',
        0,
        expect.any(Number)
      );
    });
  });

  describe('Periodic Flush', () => {
    it('should start periodic flush when metrics enabled', async () => {
      vi.useFakeTimers();
      process.env.METRICS_ENABLED = 'true';
      process.env.METRICS_FLUSH_INTERVAL_MS = '5000';

      const redisClient = createSpiedRedisMock();
      const metricsCollector = new PublisherMetricsCollector(redisClient);

      metricsCollector.recordJobStart('job-1', 'dev-1');
      metricsCollector.recordJobSuccess('job-1', 100);

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(5000);

      // Should have flushed
      expect(redisClient.setex).toHaveBeenCalled();

      metricsCollector.stopPeriodicFlush();
      await metricsCollector.shutdown();
      vi.useRealTimers();
    });

    it('should not start periodic flush when metrics disabled', () => {
      process.env.METRICS_ENABLED = 'false';
      const redisClient = createSpiedRedisMock();
      const metricsCollector = new PublisherMetricsCollector(redisClient);

      // stopPeriodicFlush should handle null flushInterval
      metricsCollector.stopPeriodicFlush();
      expect(() => metricsCollector.stopPeriodicFlush()).not.toThrow();
    });

    it('should not start periodic flush when METRICS_ENABLED is 0', () => {
      process.env.METRICS_ENABLED = '0';
      const redisClient = createSpiedRedisMock();
      const metricsCollector = new PublisherMetricsCollector(redisClient);

      metricsCollector.stopPeriodicFlush();
      expect(() => metricsCollector.stopPeriodicFlush()).not.toThrow();
    });

    it('should use default flush interval when not specified', async () => {
      vi.useFakeTimers();
      process.env.METRICS_ENABLED = 'true';
      delete process.env.METRICS_FLUSH_INTERVAL_MS;

      const redisClient = createSpiedRedisMock();
      const metricsCollector = new PublisherMetricsCollector(redisClient);

      metricsCollector.recordJobStart('job-1', 'dev-1');
      metricsCollector.recordJobSuccess('job-1', 100);

      // Fast-forward to default 60000ms
      await vi.advanceTimersByTimeAsync(60000);

      expect(redisClient.setex).toHaveBeenCalled();

      metricsCollector.stopPeriodicFlush();
      await metricsCollector.shutdown();
      vi.useRealTimers();
    });
  });

  describe('Edge Cases', () => {
    it('should handle recording success for non-existent job', () => {
      collector.recordJobSuccess('non-existent-job', 100);

      const metrics = collector.getMetrics();
      expect(metrics.successfulJobs).toBe(1);
      expect(metrics.latency.avg).toBe(100);
    });

    it('should handle recording failure for non-existent job', () => {
      collector.recordJobFailure('non-existent-job', {
        category: ErrorCategory.UNKNOWN,
        message: 'Test'
      } as any, 100);

      const metrics = collector.getMetrics();
      expect(metrics.failedJobs).toBe(1);
    });

    it('should increment error count for existing category', () => {
      collector.recordJobStart('job-1', 'dev-1');
      collector.recordJobFailure('job-1', {
        category: ErrorCategory.NETWORK_ERROR,
        message: 'First error'
      } as any, 100);

      collector.recordJobStart('job-2', 'dev-2');
      collector.recordJobFailure('job-2', {
        category: ErrorCategory.NETWORK_ERROR,
        message: 'Second error'
      } as any, 150);

      const metrics = collector.getMetrics();
      expect(metrics.errorsByCategory[ErrorCategory.NETWORK_ERROR]).toBe(2);
    });

    it('should handle zero totalJobs for Prometheus sum calculation', () => {
      const prometheus = collector.exportPrometheusFormat();
      expect(prometheus).toContain('publisher_latency_ms_sum 0');
      expect(prometheus).toContain('publisher_latency_ms_count 0');
    });

    it('should calculate correct latency sum in Prometheus', () => {
      collector.recordJobStart('job-1', 'dev-1');
      collector.recordJobSuccess('job-1', 100);

      collector.recordJobStart('job-2', 'dev-2');
      collector.recordJobSuccess('job-2', 200);

      const metrics = collector.getMetrics();
      const expectedSum = metrics.latency.avg * metrics.totalJobs;

      const prometheus = collector.exportPrometheusFormat();
      expect(prometheus).toContain(`publisher_latency_ms_sum ${expectedSum}`);
      expect(prometheus).toContain('publisher_latency_ms_count 2');
    });
  });

  describe('Percentile Calculations', () => {
    it('should handle percentile calculation with single value', () => {
      collector.recordJobStart('job-1', 'dev-1');
      collector.recordJobSuccess('job-1', 250);

      const metrics = collector.getMetrics();
      expect(metrics.latency.p50).toBe(250);
      expect(metrics.latency.p95).toBe(250);
      expect(metrics.latency.p99).toBe(250);
      expect(metrics.latency.max).toBe(250);
      expect(metrics.latency.avg).toBe(250);
    });

    it('should handle percentile calculation with two values', () => {
      collector.recordJobStart('job-1', 'dev-1');
      collector.recordJobSuccess('job-1', 100);

      collector.recordJobStart('job-2', 'dev-2');
      collector.recordJobSuccess('job-2', 200);

      const metrics = collector.getMetrics();
      expect(metrics.latency.p50).toBeGreaterThan(0);
      expect(metrics.latency.max).toBe(200);
    });

    it('should calculate percentiles for large dataset', () => {
      // Create a dataset with known distribution
      for (let i = 1; i <= 1000; i++) {
        collector.recordJobStart(`job-${i}`, `dev-${i}`);
        collector.recordJobSuccess(`job-${i}`, i);
      }

      const metrics = collector.getMetrics();
      expect(metrics.latency.p50).toBeGreaterThan(400);
      expect(metrics.latency.p50).toBeLessThan(600);
      expect(metrics.latency.p95).toBeGreaterThan(900);
      expect(metrics.latency.p99).toBeGreaterThan(980);
      expect(metrics.latency.max).toBe(1000);
    });
  });

  describe('Error Distribution', () => {
    it('should return empty object when no errors', () => {
      collector.recordJobStart('job-1', 'dev-1');
      collector.recordJobSuccess('job-1', 100);

      const metrics = collector.getMetrics();
      expect(metrics.errorsByCategory).toEqual({});
    });

    it('should track multiple different error categories', () => {
      const categories = [
        ErrorCategory.NETWORK_ERROR,
        ErrorCategory.RATE_LIMIT,
        ErrorCategory.VALIDATION_ERROR,
        ErrorCategory.AUTH_ERROR,
        ErrorCategory.UNKNOWN
      ];

      categories.forEach((category, index) => {
        collector.recordJobStart(`job-${index}`, `dev-${index}`);
        collector.recordJobFailure(`job-${index}`, {
          category,
          message: 'Test error'
        } as any, 100);
      });

      const metrics = collector.getMetrics();
      expect(Object.keys(metrics.errorsByCategory).length).toBe(5);
      categories.forEach(category => {
        expect(metrics.errorsByCategory[category]).toBe(1);
      });
    });
  });
});
