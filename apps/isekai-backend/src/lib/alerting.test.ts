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

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('alerting', () => {
  const originalEnv = process.env;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.ENABLE_ALERTS;
    delete process.env.ALERT_WEBHOOK_URL;

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Reset modules to reinitialize AlertManager with new env vars
    await vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe('AlertManager', () => {
    describe('when alerts are disabled', () => {
      it('should log critical alert to console when disabled', async () => {
        process.env.ENABLE_ALERTS = 'false';
        const { AlertManager } = await import('./alerting.js');

        await AlertManager.critical('Test Critical', 'This is a critical alert');

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Alert] CRITICAL: Test Critical - This is a critical alert')
        );
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should log warning alert to console when disabled', async () => {
        process.env.ENABLE_ALERTS = 'false';
        const { AlertManager } = await import('./alerting.js');

        await AlertManager.warning('Test Warning', 'This is a warning alert');

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Alert] WARNING: Test Warning - This is a warning alert')
        );
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should log info alert to console when disabled', async () => {
        process.env.ENABLE_ALERTS = 'false';
        const { AlertManager } = await import('./alerting.js');

        await AlertManager.info('Test Info', 'This is an info alert');

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Alert] INFO: Test Info - This is an info alert')
        );
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });

    describe('when alerts are enabled but webhook URL is not configured', () => {
      it('should log error when webhook URL is missing', async () => {
        process.env.ENABLE_ALERTS = 'true';
        const { AlertManager } = await import('./alerting.js');

        await AlertManager.critical('Test', 'Message');

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Alert] Alert webhook URL not configured, skipping alert'
        );
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });

    describe('when alerts are enabled with webhook URL', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({ ok: true, statusText: 'OK' });
      });

      it('should send critical alert with correct payload', async () => {
        process.env.ENABLE_ALERTS = 'true';
        process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
        const { AlertManager } = await import('./alerting.js');

        await AlertManager.critical('Critical Title', 'Critical message', {
          key1: 'value1',
          key2: 123,
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'https://hooks.example.com/webhook',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: expect.any(String),
          })
        );

        const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(payload.username).toBe('Isekai Alerts');
        expect(payload.embeds[0].title).toBe('🚨 Critical Title');
        expect(payload.embeds[0].description).toBe('Critical message');
        expect(payload.embeds[0].color).toBe(0xff0000); // Red
        expect(payload.embeds[0].fields).toHaveLength(2);
        expect(payload.embeds[0].fields[0]).toEqual({
          name: 'key1',
          value: 'value1',
          inline: true,
        });
      });

      it('should send warning alert with correct payload', async () => {
        process.env.ENABLE_ALERTS = 'true';
        process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
        const { AlertManager } = await import('./alerting.js');

        await AlertManager.warning('Warning Title', 'Warning message');

        const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(payload.embeds[0].title).toBe('⚠️ Warning Title');
        expect(payload.embeds[0].color).toBe(0xffa500); // Orange
      });

      it('should send info alert with correct payload', async () => {
        process.env.ENABLE_ALERTS = 'true';
        process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
        const { AlertManager } = await import('./alerting.js');

        await AlertManager.info('Info Title', 'Info message');

        const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(payload.embeds[0].title).toBe('ℹ️ Info Title');
        expect(payload.embeds[0].color).toBe(0x0099ff); // Blue
      });

      it('should include timestamp in payload', async () => {
        process.env.ENABLE_ALERTS = 'true';
        process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
        const { AlertManager } = await import('./alerting.js');

        await AlertManager.critical('Test', 'Message');

        const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(payload.embeds[0].timestamp).toBeDefined();
        expect(new Date(payload.embeds[0].timestamp)).toBeInstanceOf(Date);
      });

      it('should handle alerts without context', async () => {
        process.env.ENABLE_ALERTS = 'true';
        process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
        const { AlertManager } = await import('./alerting.js');

        await AlertManager.critical('Test', 'Message');

        const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(payload.embeds[0].fields).toEqual([]);
      });

      it('should log error when webhook request fails', async () => {
        process.env.ENABLE_ALERTS = 'true';
        process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
        mockFetch.mockResolvedValue({ ok: false, statusText: 'Bad Request' });
        const { AlertManager } = await import('./alerting.js');

        await AlertManager.critical('Test', 'Message');

        expect(consoleErrorSpy).toHaveBeenCalledWith('[Alert] Failed to send alert: Bad Request');
      });

      it('should handle fetch errors gracefully', async () => {
        process.env.ENABLE_ALERTS = 'true';
        process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
        mockFetch.mockRejectedValue(new Error('Network error'));
        const { AlertManager } = await import('./alerting.js');

        await AlertManager.critical('Test', 'Message');

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Alert] Error sending alert:',
          expect.any(Error)
        );
      });
    });
  });

  describe('PublisherAlerts', () => {
    beforeEach(() => {
      process.env.ENABLE_ALERTS = 'true';
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
      mockFetch.mockResolvedValue({ ok: true, statusText: 'OK' });
    });

    it('should send stuck job alert', async () => {
      const { PublisherAlerts } = await import('./alerting.js');

      await PublisherAlerts.stuckJob('dev-123', 'testuser', 'Test Deviation', 900000);

      expect(mockFetch).toHaveBeenCalled();
      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.embeds[0].title).toContain('Deviation Stuck in Publishing');
      expect(payload.embeds[0].description).toContain('15 minutes');
      expect(payload.embeds[0].color).toBe(0xff0000); // Critical
    });

    it('should send high cleanup failure rate alert', async () => {
      const { PublisherAlerts } = await import('./alerting.js');

      await PublisherAlerts.highCleanupFailureRate(0.25, 100, 25);

      expect(mockFetch).toHaveBeenCalled();
      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.embeds[0].title).toContain('High R2 Cleanup Failure Rate');
      expect(payload.embeds[0].description).toContain('25%');
      expect(payload.embeds[0].description).toContain('25/100 failed');
      expect(payload.embeds[0].color).toBe(0xff0000); // Critical
    });

    it('should send circuit breaker open alert', async () => {
      const { PublisherAlerts } = await import('./alerting.js');

      await PublisherAlerts.circuitBreakerOpen('user-123', 'testuser', 600000);

      expect(mockFetch).toHaveBeenCalled();
      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.embeds[0].title).toContain('Circuit Breaker Open');
      expect(payload.embeds[0].description).toContain('10 minutes');
      expect(payload.embeds[0].color).toBe(0xffa500); // Warning
    });

    it('should send high token refresh failure rate alert', async () => {
      const { PublisherAlerts } = await import('./alerting.js');

      await PublisherAlerts.highTokenRefreshFailureRate(0.15);

      expect(mockFetch).toHaveBeenCalled();
      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.embeds[0].title).toContain('High Token Refresh Failure Rate');
      expect(payload.embeds[0].description).toContain('15%');
      expect(payload.embeds[0].color).toBe(0xffa500); // Warning
    });

    it('should send high queue depth alert', async () => {
      const { PublisherAlerts } = await import('./alerting.js');

      await PublisherAlerts.highQueueDepth('deviation-publisher', 500);

      expect(mockFetch).toHaveBeenCalled();
      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.embeds[0].title).toContain('High Queue Depth');
      expect(payload.embeds[0].description).toContain('deviation-publisher');
      expect(payload.embeds[0].description).toContain('500');
      expect(payload.embeds[0].color).toBe(0x0099ff); // Info
    });

    it('should send high stuck job recovery rate alert', async () => {
      const { PublisherAlerts } = await import('./alerting.js');

      await PublisherAlerts.highStuckJobRecoveryRate(0.08, 50, 4);

      expect(mockFetch).toHaveBeenCalled();
      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.embeds[0].title).toContain('High Stuck Job Recovery Rate');
      expect(payload.embeds[0].description).toContain('8%');
      expect(payload.embeds[0].description).toContain('4/50');
      expect(payload.embeds[0].color).toBe(0xffa500); // Warning
    });
  });

  describe('AlertSeverity enum', () => {
    it('should have correct severity values', async () => {
      const { AlertSeverity } = await import('./alerting.js');

      expect(AlertSeverity.CRITICAL).toBe('critical');
      expect(AlertSeverity.WARNING).toBe('warning');
      expect(AlertSeverity.INFO).toBe('info');
    });
  });
});
