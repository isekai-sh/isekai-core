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
import { PublisherMetricsCollector } from './publisher-metrics.js';
import { ErrorCategory } from './error-categorizer.js';

// Mock logger
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('publisher-metrics', () => {
  const mockRedis = {
    setex: vi.fn(),
    zadd: vi.fn(),
    zremrangebyscore: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    delete process.env.METRICS_ENABLED;
    delete process.env.METRICS_FLUSH_INTERVAL_MS;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const collector = new PublisherMetricsCollector(mockRedis as any);
      const metrics = collector.getMetrics();

      expect(metrics.totalJobs).toBe(0);
      expect(metrics.successfulJobs).toBe(0);
      expect(metrics.failedJobs).toBe(0);
      expect(metrics.retriedJobs).toBe(0);
      expect(metrics.successRate).toBe(0);
    });

    it('should start periodic flush when enabled', () => {
      const collector = new PublisherMetricsCollector(mockRedis as any);

      // Advance timer
      vi.advanceTimersByTime(60000); // 1 minute

      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should not start periodic flush when disabled', async () => {
      process.env.METRICS_ENABLED = 'false';
      const collector = new PublisherMetricsCollector(mockRedis as any);

      vi.advanceTimersByTime(60000);
      await vi.runAllTimersAsync();

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should work without Redis', () => {
      const collector = new PublisherMetricsCollector(null);
      expect(collector.getMetrics()).toBeDefined();
    });
  });

  describe('recordJobStart', () => {
    it('should record job start time', () => {
      const collector = new PublisherMetricsCollector(null);
      collector.recordJobStart('job-1', 'dev-123');

      // Internal state is tracked, no immediate metrics change
      const metrics = collector.getMetrics();
      expect(metrics.totalJobs).toBe(0); // Not counted until success/failure
    });

    it('should track multiple jobs', () => {
      const collector = new PublisherMetricsCollector(null);
      collector.recordJobStart('job-1', 'dev-123');
      collector.recordJobStart('job-2', 'dev-456');

      expect(collector).toBeDefined(); // Internal tracking works
    });
  });

  describe('recordJobSuccess', () => {
    it('should increment success count', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordJobStart('job-1', 'dev-123');
      collector.recordJobSuccess('job-1', 1000);

      const metrics = collector.getMetrics();
      expect(metrics.successfulJobs).toBe(1);
      expect(metrics.totalJobs).toBe(1);
      expect(metrics.successRate).toBe(100);
    });

    it('should record latency', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordJobSuccess('job-1', 500);
      collector.recordJobSuccess('job-2', 1000);
      collector.recordJobSuccess('job-3', 1500);

      const metrics = collector.getMetrics();
      expect(metrics.latency.p50).toBe(1000);
      expect(metrics.latency.avg).toBe(1000);
    });

    it('should keep only last 1000 latencies', () => {
      const collector = new PublisherMetricsCollector(null);

      // Record 1500 jobs
      for (let i = 0; i < 1500; i++) {
        collector.recordJobSuccess(`job-${i}`, 100);
      }

      const metrics = collector.getMetrics();
      expect(metrics.successfulJobs).toBe(1500);
      // Latency calculations should still work
      expect(metrics.latency.avg).toBe(100);
    });

    it('should work without prior recordJobStart', () => {
      const collector = new PublisherMetricsCollector(null);

      // Success without start record
      collector.recordJobSuccess('job-1', 100);

      const metrics = collector.getMetrics();
      expect(metrics.successfulJobs).toBe(1);
    });
  });

  describe('recordJobFailure', () => {
    it('should increment failure count', () => {
      const collector = new PublisherMetricsCollector(null);

      const error = { category: ErrorCategory.RATE_LIMIT, message: 'Too many requests' };
      collector.recordJobFailure('job-1', error, 2000);

      const metrics = collector.getMetrics();
      expect(metrics.failedJobs).toBe(1);
      expect(metrics.totalJobs).toBe(1);
      expect(metrics.successRate).toBe(0);
    });

    it('should track errors by category', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordJobFailure(
        'job-1',
        { category: ErrorCategory.RATE_LIMIT, message: '429' },
        100
      );
      collector.recordJobFailure(
        'job-2',
        { category: ErrorCategory.RATE_LIMIT, message: '429' },
        100
      );
      collector.recordJobFailure(
        'job-3',
        { category: ErrorCategory.NETWORK_ERROR, message: 'timeout' },
        100
      );

      const metrics = collector.getMetrics();
      expect(metrics.errorsByCategory[ErrorCategory.RATE_LIMIT]).toBe(2);
      expect(metrics.errorsByCategory[ErrorCategory.NETWORK_ERROR]).toBe(1);
    });

    it('should record failure latency', () => {
      const collector = new PublisherMetricsCollector(null);

      const error = { category: ErrorCategory.NETWORK_ERROR, message: 'timeout' };
      collector.recordJobFailure('job-1', error, 5000);

      const metrics = collector.getMetrics();
      expect(metrics.latency.max).toBe(5000);
    });

    it('should increment error count for existing category', () => {
      const collector = new PublisherMetricsCollector(null);

      const error = { category: ErrorCategory.AUTH_ERROR, message: 'Unauthorized' };
      collector.recordJobFailure('job-1', error, 100);
      collector.recordJobFailure('job-2', error, 100);

      const metrics = collector.getMetrics();
      expect(metrics.errorsByCategory[ErrorCategory.AUTH_ERROR]).toBe(2);
    });
  });

  describe('recordRateLimitHit', () => {
    it('should increment rate limit hit count', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordRateLimitHit('user-123', 5000);
      collector.recordRateLimitHit('user-456', 3000);

      const metrics = collector.getMetrics();
      expect(metrics.rateLimitHits).toBe(2);
    });
  });

  describe('recordCircuitBreakerOpen', () => {
    it('should increment circuit breaker open count', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordCircuitBreakerOpen();
      collector.recordCircuitBreakerOpen();

      const metrics = collector.getMetrics();
      expect(metrics.circuitBreakerOpenCount).toBe(2);
    });
  });

  describe('recordJobRetry', () => {
    it('should increment retry count', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordJobRetry('job-1');
      collector.recordJobRetry('job-1');
      collector.recordJobRetry('job-2');

      const metrics = collector.getMetrics();
      expect(metrics.retriedJobs).toBe(3);
    });
  });

  describe('recordStalledJob', () => {
    it('should not throw for stalled job record', () => {
      const collector = new PublisherMetricsCollector(null);

      expect(() => collector.recordStalledJob('job-1')).not.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('should calculate success rate correctly', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordJobSuccess('job-1', 100);
      collector.recordJobSuccess('job-2', 100);
      collector.recordJobSuccess('job-3', 100);
      collector.recordJobFailure(
        'job-4',
        { category: ErrorCategory.NETWORK_ERROR, message: 'fail' },
        100
      );

      const metrics = collector.getMetrics();
      expect(metrics.totalJobs).toBe(4);
      expect(metrics.successRate).toBe(75); // 3/4 = 75%
    });

    it('should round success rate to 2 decimals', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordJobSuccess('job-1', 100);
      collector.recordJobSuccess('job-2', 100);
      collector.recordJobFailure(
        'job-3',
        { category: ErrorCategory.NETWORK_ERROR, message: 'fail' },
        100
      );

      const metrics = collector.getMetrics();
      expect(metrics.successRate).toBe(66.67); // 2/3 rounded
    });

    it('should include time window and timestamp', () => {
      const collector = new PublisherMetricsCollector(null);
      const metrics = collector.getMetrics('5min');

      expect(metrics.timeWindow).toBe('5min');
      expect(metrics.collectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
    });

    it('should handle zero jobs', () => {
      const collector = new PublisherMetricsCollector(null);
      const metrics = collector.getMetrics();

      expect(metrics.successRate).toBe(0);
      expect(metrics.latency.p50).toBe(0);
      expect(metrics.latency.avg).toBe(0);
    });

    it('should use default time window', () => {
      const collector = new PublisherMetricsCollector(null);
      const metrics = collector.getMetrics();

      expect(metrics.timeWindow).toBe('5min');
    });
  });

  describe('calculateLatencyPercentiles', () => {
    it('should calculate correct percentiles', () => {
      const collector = new PublisherMetricsCollector(null);

      // Add known latencies
      for (let i = 1; i <= 100; i++) {
        collector.recordJobSuccess(`job-${i}`, i * 10); // 10, 20, 30, ..., 1000
      }

      const metrics = collector.getMetrics();
      expect(metrics.latency.p50).toBe(500); // Median
      expect(metrics.latency.p95).toBe(950); // 95th percentile
      expect(metrics.latency.p99).toBe(990); // 99th percentile
      expect(metrics.latency.max).toBe(1000);
      expect(metrics.latency.avg).toBe(505); // Average of 1..100 * 10
    });

    it('should return zeros for empty latencies', () => {
      const collector = new PublisherMetricsCollector(null);
      const metrics = collector.getMetrics();

      expect(metrics.latency.p50).toBe(0);
      expect(metrics.latency.p95).toBe(0);
      expect(metrics.latency.p99).toBe(0);
      expect(metrics.latency.max).toBe(0);
      expect(metrics.latency.avg).toBe(0);
    });

    it('should handle single latency value', () => {
      const collector = new PublisherMetricsCollector(null);
      collector.recordJobSuccess('job-1', 500);

      const metrics = collector.getMetrics();
      expect(metrics.latency.p50).toBe(500);
      expect(metrics.latency.p95).toBe(500);
      expect(metrics.latency.p99).toBe(500);
      expect(metrics.latency.max).toBe(500);
      expect(metrics.latency.avg).toBe(500);
    });

    it('should handle unsorted latencies correctly', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordJobSuccess('job-1', 1000);
      collector.recordJobSuccess('job-2', 100);
      collector.recordJobSuccess('job-3', 500);

      const metrics = collector.getMetrics();
      expect(metrics.latency.p50).toBe(500);
      expect(metrics.latency.max).toBe(1000);
    });
  });

  describe('exportPrometheusFormat', () => {
    it('should export metrics in Prometheus format', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordJobSuccess('job-1', 100);
      collector.recordJobSuccess('job-2', 200);
      collector.recordJobFailure(
        'job-3',
        { category: ErrorCategory.RATE_LIMIT, message: '429' },
        150
      );

      const output = collector.exportPrometheusFormat();

      expect(output).toContain('publisher_jobs_total 3');
      expect(output).toContain('publisher_jobs_success_total 2');
      expect(output).toContain('publisher_jobs_failed_total 1');
      expect(output).toContain('publisher_success_rate 66.67');
      expect(output).toContain('publisher_latency_ms{quantile="0.5"}');
      expect(output).toContain('publisher_latency_ms{quantile="0.95"}');
      expect(output).toContain('publisher_latency_ms{quantile="0.99"}');
      expect(output).toContain(`publisher_errors_total{category="${ErrorCategory.RATE_LIMIT}"} 1`);
    });

    it('should include rate limit and circuit breaker metrics', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordRateLimitHit('user-1', 1000);
      collector.recordCircuitBreakerOpen();

      const output = collector.exportPrometheusFormat();

      expect(output).toContain('publisher_rate_limit_hits_total 1');
      expect(output).toContain('publisher_circuit_breaker_opens_total 1');
    });

    it('should include HELP and TYPE comments', () => {
      const collector = new PublisherMetricsCollector(null);
      const output = collector.exportPrometheusFormat();

      expect(output).toContain('# HELP publisher_jobs_total');
      expect(output).toContain('# TYPE publisher_jobs_total counter');
      expect(output).toContain('# HELP publisher_success_rate');
      expect(output).toContain('# TYPE publisher_success_rate gauge');
      expect(output).toContain('# HELP publisher_latency_ms');
      expect(output).toContain('# TYPE publisher_latency_ms summary');
    });

    it('should end with newline', () => {
      const collector = new PublisherMetricsCollector(null);
      const output = collector.exportPrometheusFormat();

      expect(output.endsWith('\n')).toBe(true);
    });

    it('should handle multiple error categories', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordJobFailure(
        'job-1',
        { category: ErrorCategory.RATE_LIMIT, message: '429' },
        100
      );
      collector.recordJobFailure(
        'job-2',
        { category: ErrorCategory.NETWORK_ERROR, message: 'timeout' },
        100
      );

      const output = collector.exportPrometheusFormat();

      expect(output).toContain(`publisher_errors_total{category="${ErrorCategory.RATE_LIMIT}"} 1`);
      expect(output).toContain(
        `publisher_errors_total{category="${ErrorCategory.NETWORK_ERROR}"} 1`
      );
    });
  });

  describe('flushToRedis', () => {
    it('should persist metrics to Redis when triggered', () => {
      const collector = new PublisherMetricsCollector(mockRedis as any);

      collector.recordJobSuccess('job-1', 100);

      // Trigger flush via periodic timer (tested in constructor test)
      vi.advanceTimersByTime(60000);

      // The periodic flush will call setex
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should not flush when Redis unavailable', () => {
      const collector = new PublisherMetricsCollector(null);

      vi.advanceTimersByTime(60000);

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe('startPeriodicFlush', () => {
    it('should use custom flush interval', () => {
      process.env.METRICS_FLUSH_INTERVAL_MS = '30000';
      const collector = new PublisherMetricsCollector(mockRedis as any);

      vi.advanceTimersByTime(30000);

      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should use default interval when not configured', () => {
      const collector = new PublisherMetricsCollector(mockRedis as any);

      vi.advanceTimersByTime(60000);

      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });

  describe('stopPeriodicFlush', () => {
    it('should stop periodic flush', () => {
      const collector = new PublisherMetricsCollector(mockRedis as any);

      collector.stopPeriodicFlush();

      vi.advanceTimersByTime(60000);

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should handle multiple calls', () => {
      const collector = new PublisherMetricsCollector(mockRedis as any);

      collector.stopPeriodicFlush();
      collector.stopPeriodicFlush(); // Should not throw

      expect(collector).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordJobSuccess('job-1', 100);
      collector.recordJobFailure(
        'job-2',
        { category: ErrorCategory.NETWORK_ERROR, message: 'fail' },
        200
      );
      collector.recordRateLimitHit('user-1', 1000);
      collector.recordCircuitBreakerOpen();
      collector.recordJobRetry('job-1');

      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.totalJobs).toBe(0);
      expect(metrics.successfulJobs).toBe(0);
      expect(metrics.failedJobs).toBe(0);
      expect(metrics.retriedJobs).toBe(0);
      expect(metrics.rateLimitHits).toBe(0);
      expect(metrics.circuitBreakerOpenCount).toBe(0);
      expect(Object.keys(metrics.errorsByCategory).length).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should stop periodic flush and do final flush', async () => {
      const collector = new PublisherMetricsCollector(mockRedis as any);

      collector.recordJobSuccess('job-1', 100);

      await collector.shutdown();

      expect(mockRedis.setex).toHaveBeenCalled();

      // Further flushes should not happen
      vi.clearAllMocks();
      vi.advanceTimersByTime(60000);
      await vi.runAllTimersAsync();
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should handle shutdown without Redis', async () => {
      const collector = new PublisherMetricsCollector(null);

      await expect(collector.shutdown()).resolves.not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle mixed success and failure', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordJobSuccess('job-1', 100);
      collector.recordJobFailure(
        'job-2',
        { category: ErrorCategory.RATE_LIMIT, message: '429' },
        200
      );
      collector.recordJobSuccess('job-3', 150);

      const metrics = collector.getMetrics();
      expect(metrics.totalJobs).toBe(3);
      expect(metrics.successfulJobs).toBe(2);
      expect(metrics.failedJobs).toBe(1);
      expect(metrics.successRate).toBe(66.67);
    });

    it('should handle extreme latency values', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordJobSuccess('job-1', 1);
      collector.recordJobSuccess('job-2', 1000000); // 1 million ms

      const metrics = collector.getMetrics();
      expect(metrics.latency.max).toBe(1000000);
      expect(metrics.latency.avg).toBe(500001); // (1 + 1000000) / 2 = 500000.5, rounds to 500001
    });

    it('should handle all jobs failing', () => {
      const collector = new PublisherMetricsCollector(null);

      collector.recordJobFailure(
        'job-1',
        { category: ErrorCategory.NETWORK_ERROR, message: 'fail' },
        100
      );
      collector.recordJobFailure(
        'job-2',
        { category: ErrorCategory.NETWORK_ERROR, message: 'fail' },
        100
      );

      const metrics = collector.getMetrics();
      expect(metrics.successRate).toBe(0);
      expect(metrics.totalJobs).toBe(2);
    });

    it('should handle concurrent metric updates', () => {
      const collector = new PublisherMetricsCollector(null);

      // Simulate concurrent job completions
      collector.recordJobSuccess('job-1', 100);
      collector.recordJobSuccess('job-2', 200);
      collector.recordJobFailure(
        'job-3',
        { category: ErrorCategory.RATE_LIMIT, message: '429' },
        150
      );

      const metrics = collector.getMetrics();
      expect(metrics.totalJobs).toBe(3);
    });
  });
});
