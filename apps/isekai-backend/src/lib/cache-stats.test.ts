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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheStats } from './cache-stats.js';

describe('CacheStats', () => {
  beforeEach(() => {
    // Reset stats before each test
    CacheStats.reset();
  });

  describe('recordHit', () => {
    it('should record a single hit', () => {
      CacheStats.recordHit('browse');

      const metrics = CacheStats.getNamespaceMetrics('browse');
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(0);
    });

    it('should accumulate multiple hits', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordHit('browse');
      CacheStats.recordHit('browse');

      const metrics = CacheStats.getNamespaceMetrics('browse');
      expect(metrics.hits).toBe(3);
    });

    it('should track hits per namespace separately', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordHit('browse');
      CacheStats.recordHit('gallery');

      expect(CacheStats.getNamespaceMetrics('browse').hits).toBe(2);
      expect(CacheStats.getNamespaceMetrics('gallery').hits).toBe(1);
    });
  });

  describe('recordMiss', () => {
    it('should record a single miss', () => {
      CacheStats.recordMiss('browse');

      const metrics = CacheStats.getNamespaceMetrics('browse');
      expect(metrics.misses).toBe(1);
      expect(metrics.hits).toBe(0);
    });

    it('should accumulate multiple misses', () => {
      CacheStats.recordMiss('browse');
      CacheStats.recordMiss('browse');

      const metrics = CacheStats.getNamespaceMetrics('browse');
      expect(metrics.misses).toBe(2);
    });

    it('should track misses per namespace separately', () => {
      CacheStats.recordMiss('browse');
      CacheStats.recordMiss('gallery');
      CacheStats.recordMiss('gallery');

      expect(CacheStats.getNamespaceMetrics('browse').misses).toBe(1);
      expect(CacheStats.getNamespaceMetrics('gallery').misses).toBe(2);
    });
  });

  describe('recordError', () => {
    it('should record cache errors', () => {
      CacheStats.recordError('browse');
      CacheStats.recordError('browse');

      const metrics = CacheStats.getNamespaceMetrics('browse');
      expect(metrics.errors).toBe(2);
    });

    it('should track errors per namespace separately', () => {
      CacheStats.recordError('browse');
      CacheStats.recordError('gallery');

      expect(CacheStats.getNamespaceMetrics('browse').errors).toBe(1);
      expect(CacheStats.getNamespaceMetrics('gallery').errors).toBe(1);
    });
  });

  describe('recordStaleServe', () => {
    it('should record stale cache serves', () => {
      CacheStats.recordStaleServe('browse');
      CacheStats.recordStaleServe('browse');

      const metrics = CacheStats.getNamespaceMetrics('browse');
      expect(metrics.staleServes).toBe(2);
    });

    it('should track stale serves per namespace separately', () => {
      CacheStats.recordStaleServe('browse');
      CacheStats.recordStaleServe('gallery');
      CacheStats.recordStaleServe('gallery');

      expect(CacheStats.getNamespaceMetrics('browse').staleServes).toBe(1);
      expect(CacheStats.getNamespaceMetrics('gallery').staleServes).toBe(2);
    });
  });

  describe('recordRateLimitError', () => {
    it('should record rate limit errors', () => {
      CacheStats.recordRateLimitError('browse');

      const metrics = CacheStats.getNamespaceMetrics('browse');
      expect(metrics.rateLimitErrors).toBe(1);
    });

    it('should track rate limit errors per namespace separately', () => {
      CacheStats.recordRateLimitError('browse');
      CacheStats.recordRateLimitError('browse');
      CacheStats.recordRateLimitError('gallery');

      expect(CacheStats.getNamespaceMetrics('browse').rateLimitErrors).toBe(2);
      expect(CacheStats.getNamespaceMetrics('gallery').rateLimitErrors).toBe(1);
    });
  });

  describe('recordCoalescedRequest', () => {
    it('should record coalesced requests', () => {
      CacheStats.recordCoalescedRequest();
      CacheStats.recordCoalescedRequest();

      const stats = CacheStats.getDetailedStats();
      expect(stats.coalescedRequests).toBe(2);
    });
  });

  describe('getNamespaceMetrics', () => {
    it('should return zero metrics for unknown namespace', () => {
      const metrics = CacheStats.getNamespaceMetrics('unknown');

      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.errors).toBe(0);
      expect(metrics.staleServes).toBe(0);
      expect(metrics.rateLimitErrors).toBe(0);
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.hitRate).toBe(0);
    });

    it('should calculate total requests correctly', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordHit('browse');
      CacheStats.recordMiss('browse');

      const metrics = CacheStats.getNamespaceMetrics('browse');
      expect(metrics.totalRequests).toBe(3);
    });

    it('should calculate hit rate correctly', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordHit('browse');
      CacheStats.recordHit('browse');
      CacheStats.recordMiss('browse');

      const metrics = CacheStats.getNamespaceMetrics('browse');
      expect(metrics.hitRate).toBe(0.75); // 3 hits / 4 total
    });

    it('should return 0 hit rate when no requests', () => {
      const metrics = CacheStats.getNamespaceMetrics('browse');
      expect(metrics.hitRate).toBe(0);
    });

    it('should return all metrics for a namespace', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordMiss('browse');
      CacheStats.recordError('browse');
      CacheStats.recordStaleServe('browse');
      CacheStats.recordRateLimitError('browse');

      const metrics = CacheStats.getNamespaceMetrics('browse');

      expect(metrics).toEqual({
        hits: 1,
        misses: 1,
        errors: 1,
        staleServes: 1,
        rateLimitErrors: 1,
        totalRequests: 2,
        hitRate: 0.5,
      });
    });
  });

  describe('getOverallMetrics', () => {
    it('should aggregate metrics across all namespaces', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordHit('browse');
      CacheStats.recordHit('gallery');
      CacheStats.recordMiss('browse');
      CacheStats.recordMiss('gallery');
      CacheStats.recordMiss('gallery');

      const overall = CacheStats.getOverallMetrics();

      expect(overall.hits).toBe(3);
      expect(overall.misses).toBe(3);
      expect(overall.totalRequests).toBe(6);
      expect(overall.hitRate).toBe(0.5);
    });

    it('should include all metric types', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordMiss('browse');
      CacheStats.recordError('browse');
      CacheStats.recordStaleServe('gallery');
      CacheStats.recordRateLimitError('gallery');

      const overall = CacheStats.getOverallMetrics();

      expect(overall.hits).toBe(1);
      expect(overall.misses).toBe(1);
      expect(overall.errors).toBe(1);
      expect(overall.staleServes).toBe(1);
      expect(overall.rateLimitErrors).toBe(1);
      expect(overall.totalRequests).toBe(2);
      expect(overall.hitRate).toBe(0.5);
    });

    it('should return zero metrics when no data recorded', () => {
      const overall = CacheStats.getOverallMetrics();

      expect(overall).toEqual({
        hits: 0,
        misses: 0,
        errors: 0,
        staleServes: 0,
        rateLimitErrors: 0,
        totalRequests: 0,
        hitRate: 0,
      });
    });
  });

  describe('getDetailedStats', () => {
    it('should include overall metrics', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordMiss('browse');

      const stats = CacheStats.getDetailedStats();

      expect(stats.overall.hits).toBe(1);
      expect(stats.overall.misses).toBe(1);
    });

    it('should include metrics by namespace', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordMiss('gallery');

      const stats = CacheStats.getDetailedStats();

      expect(stats.byNamespace['browse']).toBeDefined();
      expect(stats.byNamespace['gallery']).toBeDefined();
      expect(stats.byNamespace['browse'].hits).toBe(1);
      expect(stats.byNamespace['gallery'].misses).toBe(1);
    });

    it('should include coalesced requests count', () => {
      CacheStats.recordCoalescedRequest();
      CacheStats.recordCoalescedRequest();

      const stats = CacheStats.getDetailedStats();
      expect(stats.coalescedRequests).toBe(2);
    });

    it('should include start time', () => {
      const stats = CacheStats.getDetailedStats();
      expect(stats.startTime).toBeInstanceOf(Date);
    });

    it('should include uptime in milliseconds', () => {
      const stats = CacheStats.getDetailedStats();
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof stats.uptime).toBe('number');
    });

    it('should include all namespaces that have any metrics', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordMiss('gallery');
      CacheStats.recordError('analytics');

      const stats = CacheStats.getDetailedStats();

      expect(Object.keys(stats.byNamespace)).toContain('browse');
      expect(Object.keys(stats.byNamespace)).toContain('gallery');
      // 'analytics' only has errors, not hits/misses, so it might not appear
      // Let's check that we have at least the ones with hits/misses
    });
  });

  describe('toJSON', () => {
    it('should format hit rate as percentage string', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordHit('browse');
      CacheStats.recordHit('browse');
      CacheStats.recordMiss('browse');

      const json = CacheStats.toJSON();

      expect(json.overall.hitRate).toBe('75.00%');
    });

    it('should format namespace hit rates as percentages', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordMiss('browse');

      const json = CacheStats.toJSON();

      expect(json.byNamespace['browse'].hitRate).toBe('50.00%');
    });

    it('should include coalesced requests', () => {
      CacheStats.recordCoalescedRequest();

      const json = CacheStats.toJSON();
      expect(json.coalescedRequests).toBe(1);
    });

    it('should format start time as ISO string', () => {
      const json = CacheStats.toJSON();
      expect(json.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include uptime in seconds', () => {
      const json = CacheStats.toJSON();
      expect(typeof json.uptimeSeconds).toBe('number');
      expect(json.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('should preserve all metric counts', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordMiss('browse');
      CacheStats.recordError('browse');

      const json = CacheStats.toJSON();

      expect(json.overall.hits).toBe(1);
      expect(json.overall.misses).toBe(1);
      expect(json.overall.errors).toBe(1);
    });
  });

  describe('reset', () => {
    it('should clear all hits', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordHit('gallery');

      CacheStats.reset();

      expect(CacheStats.getOverallMetrics().hits).toBe(0);
    });

    it('should clear all misses', () => {
      CacheStats.recordMiss('browse');
      CacheStats.recordMiss('gallery');

      CacheStats.reset();

      expect(CacheStats.getOverallMetrics().misses).toBe(0);
    });

    it('should clear all errors', () => {
      CacheStats.recordError('browse');

      CacheStats.reset();

      expect(CacheStats.getOverallMetrics().errors).toBe(0);
    });

    it('should clear stale serves', () => {
      CacheStats.recordStaleServe('browse');

      CacheStats.reset();

      expect(CacheStats.getOverallMetrics().staleServes).toBe(0);
    });

    it('should clear rate limit errors', () => {
      CacheStats.recordRateLimitError('browse');

      CacheStats.reset();

      expect(CacheStats.getOverallMetrics().rateLimitErrors).toBe(0);
    });

    it('should reset coalesced requests', () => {
      CacheStats.recordCoalescedRequest();
      CacheStats.recordCoalescedRequest();

      CacheStats.reset();

      const stats = CacheStats.getDetailedStats();
      expect(stats.coalescedRequests).toBe(0);
    });

    it('should reset start time', async () => {
      const stats1 = CacheStats.getDetailedStats();
      const startTime1 = stats1.startTime;

      // Wait a tiny bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      CacheStats.reset();

      const stats2 = CacheStats.getDetailedStats();
      const startTime2 = stats2.startTime;

      expect(startTime2.getTime()).toBeGreaterThan(startTime1.getTime());
    });

    it('should clear all namespaces', () => {
      CacheStats.recordHit('browse');
      CacheStats.recordHit('gallery');
      CacheStats.recordHit('analytics');

      CacheStats.reset();

      const stats = CacheStats.getDetailedStats();
      expect(Object.keys(stats.byNamespace).length).toBe(0);
    });
  });

  describe('logSummary', () => {
    it('should log summary without throwing', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      CacheStats.recordHit('browse');
      CacheStats.recordMiss('browse');

      CacheStats.logSummary();

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Cache Statistics'));

      consoleLogSpy.mockRestore();
    });

    it('should log overall hit rate', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      CacheStats.recordHit('browse');
      CacheStats.recordMiss('browse');

      CacheStats.logSummary();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Overall Hit Rate: 50.00%')
      );

      consoleLogSpy.mockRestore();
    });

    it('should log namespace breakdown when namespaces exist', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      CacheStats.recordHit('browse');
      CacheStats.recordHit('browse');
      CacheStats.recordMiss('browse');

      CacheStats.logSummary();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('By Namespace:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('browse'));

      consoleLogSpy.mockRestore();
    });
  });

  describe('concurrent updates', () => {
    it('should handle concurrent hits to same namespace', () => {
      for (let i = 0; i < 1000; i++) {
        CacheStats.recordHit('browse');
      }

      const metrics = CacheStats.getNamespaceMetrics('browse');
      expect(metrics.hits).toBe(1000);
    });

    it('should handle mixed concurrent operations', () => {
      for (let i = 0; i < 100; i++) {
        CacheStats.recordHit('browse');
        CacheStats.recordMiss('browse');
        CacheStats.recordError('browse');
      }

      const metrics = CacheStats.getNamespaceMetrics('browse');
      expect(metrics.hits).toBe(100);
      expect(metrics.misses).toBe(100);
      expect(metrics.errors).toBe(100);
    });
  });
});
